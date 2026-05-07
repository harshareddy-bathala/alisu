import fs from 'fs'
import path from 'path'
import { WaveFile } from 'wavefile'
import { callStore } from './call-state'
import { broadcastCallUpdate } from './broadcast'

// Directory for recordings — override with RECORDING_DIR env var
const RECORDING_DIR = process.env.RECORDING_DIR || '/tmp/alisu-recordings'

fs.mkdirSync(RECORDING_DIR, { recursive: true })

const TARGET_RATE = 16000

interface RecordingState {
  startedAt: Date
  chunks: Buffer[]   // mono PCM16 @ 16 kHz, both citizen and alisu interleaved in time
}

const buffers = new Map<string, RecordingState>()

export function startRecording(callSid: string): void {
  buffers.set(callSid, { startedAt: new Date(), chunks: [] })
  console.log(`[REC] Recording started: ${callSid}`)
}

export function writeChunk(callSid: string, pcmBuffer: Buffer): void {
  buffers.get(callSid)?.chunks.push(pcmBuffer)
}

/**
 * Append Alisu's TTS audio (a complete WAV buffer) to the recording.
 * Decodes the WAV header, extracts raw PCM samples, and resamples to 16 kHz
 * mono if needed so the saved file is a single coherent stream.
 */
export function writeAlisuAudio(callSid: string, wavBuffer: Buffer): void {
  const rec = buffers.get(callSid)
  if (!rec) return
  try {
    const wav = new WaveFile()
    wav.fromBuffer(wavBuffer)
    // Force PCM16 mono at TARGET_RATE so it merges cleanly with citizen audio.
    const fmt = wav.fmt as { sampleRate: number; numChannels: number }
    const srcRate = fmt.sampleRate
    const channels = fmt.numChannels
    if ((wav.bitDepth || '') !== '16') wav.toBitDepth('16')

    let samples = wav.getSamples(false, Int16Array) as unknown as Int16Array | Int16Array[]
    // Mix down to mono if stereo
    if (channels > 1 && Array.isArray(samples)) {
      const left  = samples[0]
      const right = samples[1]
      const mono  = new Int16Array(left.length)
      for (let i = 0; i < left.length; i++) mono[i] = ((left[i] + right[i]) / 2) | 0
      samples = mono
    }
    if (Array.isArray(samples)) samples = samples[0]
    const mono = samples as Int16Array

    // Linear resample to TARGET_RATE if Sarvam returned a different rate.
    let final = mono
    if (srcRate !== TARGET_RATE) {
      const ratio = srcRate / TARGET_RATE
      const outLen = Math.floor(mono.length / ratio)
      const out = new Int16Array(outLen)
      for (let i = 0; i < outLen; i++) out[i] = mono[Math.floor(i * ratio)] || 0
      final = out
    }

    rec.chunks.push(Buffer.from(final.buffer, final.byteOffset, final.byteLength))
  } catch (err) {
    console.warn('[REC] writeAlisuAudio failed (skipping):', (err as Error).message)
  }
}

/**
 * Flush all buffered PCM chunks to a WAV file, store path in callStore.
 * Filename embeds the call's start timestamp so recordings sort by call time.
 * File mtime is set to call end so OS-level "modified" matches the real call.
 * Fires on call end — non-blocking (wrapped in setImmediate).
 */
export function finishRecording(callSid: string): void {
  const rec = buffers.get(callSid)
  buffers.delete(callSid)

  if (!rec || rec.chunks.length === 0) return

  setImmediate(() => {
    try {
      const combined = Buffer.concat(rec.chunks)
      const totalSamples = combined.length / 2

      if (totalSamples < 4800) {
        // Less than 150ms — skip, probably noise
        return
      }

      const samples = new Int16Array(combined.buffer, combined.byteOffset, totalSamples)
      const wav = new WaveFile()
      wav.fromScratch(1, TARGET_RATE, '16', Array.from(samples))

      // YYYYMMDD-HHmmss prefix so files sort by real-world call time.
      const ts = formatStamp(rec.startedAt)
      const fileName = `${ts}_${callSid}.wav`
      const filePath = path.join(RECORDING_DIR, fileName)
      fs.writeFileSync(filePath, Buffer.from(wav.toBuffer()))

      // Stamp file mtime to call end and atime to call start so OS metadata
      // reflects when the call actually happened.
      const endedAt = new Date()
      try { fs.utimesSync(filePath, rec.startedAt, endedAt) } catch { /* ignore */ }

      callStore.update(callSid, { recordingPath: filePath })
      broadcastCallUpdate(callSid)
      console.log(`[REC] Saved: ${filePath} (${(combined.length / 1024).toFixed(0)} KB)`)
    } catch (err) {
      console.error('[REC] finishRecording error:', err)
    }
  })
}

function formatStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

export function getRecordingPath(callSid: string): string | null {
  const state = callStore.get(callSid)
  return (state as any)?.recordingPath ?? null
}
