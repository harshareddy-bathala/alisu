import { mulaw as MuLaw } from 'alawmulaw'
import { WaveFile } from 'wavefile'

// ── Existing helpers ──────────────────────────────────────────────────────────

export function muLawChunksToWavBuffer(chunks: Buffer[]): Buffer {
  const combined = Buffer.concat(chunks)
  const pcmData = MuLaw.decode(combined)
  const wav = new WaveFile()
  wav.fromScratch(1, 8000, '16', pcmData)
  return Buffer.from(wav.toBuffer())
}

export function pcm16ChunksToWavBuffer(chunks: Buffer[], sampleRate = 8000): Buffer {
  const combined = Buffer.concat(chunks)
  const pcmData = new Int16Array(
    combined.buffer,
    combined.byteOffset,
    Math.floor(combined.byteLength / Int16Array.BYTES_PER_ELEMENT)
  )
  const wav = new WaveFile()
  wav.fromScratch(1, sampleRate, '16', pcmData)
  return Buffer.from(wav.toBuffer())
}

export function isChunkMeaningful(chunks: Buffer[]): boolean {
  return chunks.reduce((sum, c) => sum + c.length, 0) >= 3200
}

// ── New resampling helpers ────────────────────────────────────────────────────

/**
 * Linear interpolation upsample from 8kHz to 16kHz.
 * Used when receiving mulaw 8kHz from Twilio/Exotel before sending to SarvamASR.
 */
export function upsample8kTo16k(pcm8k: Int16Array): Int16Array {
  const out = new Int16Array(pcm8k.length * 2)
  for (let i = 0; i < pcm8k.length; i++) {
    out[i * 2] = pcm8k[i]
    out[i * 2 + 1] = i < pcm8k.length - 1
      ? Math.round((pcm8k[i] + pcm8k[i + 1]) / 2)
      : pcm8k[i]
  }
  return out
}

/**
 * Downsample PCM16 from 16kHz to 8kHz by averaging adjacent samples.
 * Used when sending Alisu's TTS audio (16kHz) back to Twilio/Exotel.
 */
export function downsample16kTo8k(pcm16k: Int16Array): Int16Array {
  const out = new Int16Array(Math.floor(pcm16k.length / 2))
  for (let i = 0; i < out.length; i++) {
    out[i] = Math.round((pcm16k[i * 2] + pcm16k[i * 2 + 1]) / 2)
  }
  return out
}

/**
 * Convert a WAV buffer (PCM16 16kHz from synthesizeSpeech) to mulaw 8kHz Buffer.
 * The returned buffer is raw mulaw bytes, ready to base64-encode for Twilio/Exotel.
 *
 * WAV header is always 44 bytes for standard PCM WAV files (as produced by wavefile).
 */
export function pcm16WavToMulaw8k(wavBuffer: Buffer): Buffer {
  const WAV_HEADER_BYTES = 44
  if (wavBuffer.length <= WAV_HEADER_BYTES) return Buffer.alloc(0)

  const pcm16k = new Int16Array(
    wavBuffer.buffer,
    wavBuffer.byteOffset + WAV_HEADER_BYTES,
    Math.floor((wavBuffer.length - WAV_HEADER_BYTES) / 2)
  )

  const pcm8k  = downsample16kTo8k(pcm16k)
  const mulaw  = MuLaw.encode(pcm8k)
  return Buffer.from(mulaw.buffer, mulaw.byteOffset, mulaw.byteLength)
}
