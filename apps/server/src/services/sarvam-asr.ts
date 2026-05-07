import { WaveFile } from 'wavefile'
import { sarvamFetch } from '../lib/sarvam-fetch'

export async function transcribeAudioRest(
  wavBuffer: Buffer,
  languageCode = 'unknown'
): Promise<{ text: string, language: string }> {
  try {
    const formData = new FormData()
    
    const audioBytes = new Uint8Array(wavBuffer)
    const blob = new Blob([audioBytes], { type: 'audio/wav' })

    formData.append('file', blob, 'audio.wav')
    formData.append('model', 'saaras:v3')
    formData.append('language_code', languageCode)
    formData.append('mode', 'transcribe')

    const response = await sarvamFetch('https://api.sarvam.ai/speech-to-text', {
      method: 'POST',
      headers: {
        'api-subscription-key': process.env.SARVAM_API_KEY || '',
      },
      body: formData,
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[ASR] Sarvam request failed: ${response.status} ${response.statusText} - ${errorText}`)
      return { text: '', language: '' }
    }

    const data = await response.json()
    return { text: data.transcript || '', language: data.language_code || '' }
  } catch (error) {
    console.error('[ASR] Failed to transcribe audio:', error)
    return { text: '', language: '' }
  }
}

const SAMPLE_RATE = 16000
// IMPORTANT: speech RMS in normal phone-call audio sits around 0.04–0.15.
// The dynamic threshold (max of floor and noiseFloor*SNR_RATIO) MUST stay
// below the bottom of that range, or the user's voice gets classified as noise.
const SILENCE_THRESHOLD      = 0.014  // hard RMS floor — quieter than this is always silence
const SILENCE_DURATION_MS    = 1400   // 1.4s pause to end utterance — fast enough for snappy turns, long enough for natural mid-thought beats
const MIN_SPEECH_DURATION_MS = 500    // discard chunks shorter than this (filters cough/click bursts)
const MAX_CHUNK_DURATION_MS  = 25000  // max utterance window — citizens often need 20s+ to describe a complex issue
const NOISE_FLOOR_ALPHA      = 0.992  // EMA over ambient
const SNR_RATIO              = 3.0    // speech must be 3× above adapted noise floor
const SPEECH_ONSET_FRAMES    = 3      // ~255ms of sustained signal — fast enough to catch the first word
const SPEECH_OFFSET_FRAMES   = 3      // 3 quiet frames (~255ms) before silence starts accumulating — keeps in-speech gaps from leaking through

export class SarvamStreamingASR {
  private speechBuffer: Buffer[] = []
  private silenceSamples = 0
  private isSpeaking = false
  private hasSpeech  = false
  private onsetFrames = 0            // consecutive above-threshold frames; must reach SPEECH_ONSET_FRAMES
  private offsetFrames = 0           // consecutive quiet frames; SPEECH_OFFSET_FRAMES required before silence-counting starts
  private noiseFloor = 0.005         // ambient RMS estimate, adapts upward with environment
  private readonly SILENCE_SAMPLES = (SAMPLE_RATE * SILENCE_DURATION_MS) / 1000
  private forcedFlushTimer: NodeJS.Timeout | null = null
  private deafUntil = 0
  private muted = false                    // hard gate — drops audio entirely while Alisu thinks/speaks
  private flushQueue = Promise.resolve()   // serialises concurrent Sarvam calls
  private onTranscript: (transcript: string, language: string) => void

  constructor(onTranscript: (transcript: string, language: string) => void) {
    this.onTranscript = onTranscript
  }

  private calculateRMS(buffer: Buffer): number {
    const samples = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2)
    let sum = 0
    for (let i = 0; i < samples.length; i++) {
      sum += (samples[i] / 32768) ** 2
    }
    return Math.sqrt(sum / samples.length)
  }

  private pcmToWav(pcmBuffer: Buffer, sampleRate: number): Buffer {
    const wav = new WaveFile()
    const samples = new Int16Array(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.length / 2)
    wav.fromScratch(1, sampleRate, '16', Array.from(samples))
    return Buffer.from(wav.toBuffer())
  }

  public reset(): void {
    this.speechBuffer = []
    this.silenceSamples = 0
    this.isSpeaking = false
    this.hasSpeech  = false
    this.onsetFrames = 0
    this.offsetFrames = 0
    // noiseFloor intentionally preserved — ambient estimate survives turn boundaries
    if (this.forcedFlushTimer) {
      clearTimeout(this.forcedFlushTimer)
      this.forcedFlushTimer = null
    }
    this.deafUntil = Date.now() + 700
  }

  // Hard gate. While muted, all incoming audio is dropped without affecting noiseFloor or buffers.
  public setMuted(muted: boolean): void {
    if (muted && !this.muted) {
      // Entering muted state — drop any pending speech that hasn't been flushed yet.
      this.speechBuffer = []
      this.silenceSamples = 0
      this.isSpeaking = false
      this.hasSpeech = false
      this.onsetFrames = 0
      this.offsetFrames = 0
      if (this.forcedFlushTimer) {
        clearTimeout(this.forcedFlushTimer)
        this.forcedFlushTimer = null
      }
    }
    this.muted = muted
  }

  public sendAudio(pcmBuffer: Buffer) {
    if (this.muted) return
    if (Date.now() < this.deafUntil) return

    const rms = this.calculateRMS(pcmBuffer)

    // ── Adaptive noise floor ────────────────────────────────────────────────
    // Track ambient slowly. Cap at 0.012 — anything louder than that we WILL
    // call speech, because typical speech RMS starts at ~0.04 and a higher
    // ambient cap pushes the dynamic threshold past speech and rejects it.
    if (!this.isSpeaking) {
      this.noiseFloor = this.noiseFloor * NOISE_FLOOR_ALPHA + rms * (1 - NOISE_FLOOR_ALPHA)
      this.noiseFloor = Math.max(0.002, Math.min(0.012, this.noiseFloor))
    }

    // Dynamic threshold: speech must be SNR_RATIO × above ambient (min = SILENCE_THRESHOLD)
    const dynamicThreshold = Math.max(SILENCE_THRESHOLD, this.noiseFloor * SNR_RATIO)
    const isSilence = rms < dynamicThreshold

    // Only buffer audio once we've actually entered onset OR are still inside speech.
    // Pre-onset buffering is bounded so we keep ~250ms of pre-roll for the first word.
    if (this.isSpeaking || this.onsetFrames > 0) {
      this.speechBuffer.push(pcmBuffer)
    } else if (!isSilence) {
      // Hold a tiny rolling pre-roll so the first frame of speech isn't clipped
      this.speechBuffer.push(pcmBuffer)
      if (this.speechBuffer.length > 3) this.speechBuffer.shift()
    }

    // Safety timer: only flush if actual speech was detected; otherwise discard silently
    if (!this.forcedFlushTimer) {
      this.forcedFlushTimer = setTimeout(() => {
        this.forcedFlushTimer = null
        if (this.hasSpeech) {
          this.flush()
        } else {
          // Background noise only — drop without calling Sarvam
          this.speechBuffer = []
          this.silenceSamples = 0
          console.log('[ASR] Forced-flush skipped — no speech detected (background noise)')
        }
      }, MAX_CHUNK_DURATION_MS)
    }

    if (!isSilence) {
      this.onsetFrames++
      this.offsetFrames = 0
      // Require SPEECH_ONSET_FRAMES consecutive above-threshold frames before declaring speech.
      // A single noise spike (fan, door knock) never reaches the threshold.
      if (this.onsetFrames >= SPEECH_ONSET_FRAMES) {
        this.isSpeaking = true
        this.hasSpeech  = true
      }
      this.silenceSamples = 0
    } else {
      this.onsetFrames = 0

      // Require a couple of consecutive quiet frames before we begin counting silence.
      // Single below-threshold dips (sibilant gaps, breath) shouldn't restart the timer.
      if (this.isSpeaking) {
        this.offsetFrames++
        if (this.offsetFrames >= SPEECH_OFFSET_FRAMES) {
          this.silenceSamples += pcmBuffer.length / 2
        }
        if (this.silenceSamples >= this.SILENCE_SAMPLES) {
          this.isSpeaking = false
          this.offsetFrames = 0
          if (this.forcedFlushTimer) {
            clearTimeout(this.forcedFlushTimer)
            this.forcedFlushTimer = null
          }
          this.flush()
        }
      }
    }
  }

  // Synchronous: captures buffer snapshot and enqueues async work.
  // The queue ensures only one Sarvam ASR call is in-flight at a time,
  // preventing 429 rate-limit errors from concurrent requests.
  private flush(): void {
    if (this.speechBuffer.length === 0) return

    const combined = Buffer.concat(this.speechBuffer)
    this.speechBuffer   = []
    this.silenceSamples = 0
    this.hasSpeech      = false

    this.flushQueue = this.flushQueue.then(async () => {
      const totalMs = (combined.length / 2 / SAMPLE_RATE) * 1000
      if (totalMs < MIN_SPEECH_DURATION_MS) {
        console.log('[ASR] Chunk too short, skipping:', Math.round(totalMs), 'ms')
        return
      }
      console.log('[ASR] Flushing', Math.round(totalMs), 'ms of speech to Sarvam')
      const wavBuffer = this.pcmToWav(combined, SAMPLE_RATE)
      const result    = await transcribeAudioRest(wavBuffer, 'unknown')
      if (result.text.trim()) {
        this.onTranscript(result.text, result.language)
      }
    })
  }
}

