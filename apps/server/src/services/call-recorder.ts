import fs from 'fs'
import path from 'path'
import { WaveFile } from 'wavefile'
import { callStore } from './call-state'
import { broadcastCallUpdate } from './broadcast'

// Directory for recordings — override with RECORDING_DIR env var
const RECORDING_DIR = process.env.RECORDING_DIR || '/tmp/alisu-recordings'

fs.mkdirSync(RECORDING_DIR, { recursive: true })

// Per-call PCM chunk buffers (16kHz, mono, PCM16)
const buffers = new Map<string, Buffer[]>()

export function startRecording(callSid: string): void {
  buffers.set(callSid, [])
  console.log(`[REC] Recording started: ${callSid}`)
}

export function writeChunk(callSid: string, pcmBuffer: Buffer): void {
  buffers.get(callSid)?.push(pcmBuffer)
}

/**
 * Flush all buffered PCM chunks to a WAV file, store path in callStore.
 * Fires on call end — non-blocking (wrapped in setImmediate).
 */
export function finishRecording(callSid: string): void {
  const chunks = buffers.get(callSid)
  buffers.delete(callSid)

  if (!chunks || chunks.length === 0) return

  setImmediate(() => {
    try {
      const combined = Buffer.concat(chunks)
      const totalSamples = combined.length / 2

      if (totalSamples < 4800) {
        // Less than 150ms — skip, probably noise
        return
      }

      const samples = new Int16Array(combined.buffer, combined.byteOffset, totalSamples)
      const wav = new WaveFile()
      wav.fromScratch(1, 16000, '16', Array.from(samples))

      const filePath = path.join(RECORDING_DIR, `${callSid}.wav`)
      fs.writeFileSync(filePath, Buffer.from(wav.toBuffer()))

      callStore.update(callSid, { recordingPath: filePath })
      broadcastCallUpdate(callSid)
      console.log(`[REC] Saved: ${filePath} (${(combined.length / 1024).toFixed(0)} KB)`)
    } catch (err) {
      console.error('[REC] finishRecording error:', err)
    }
  })
}

export function getRecordingPath(callSid: string): string | null {
  const state = callStore.get(callSid)
  return (state as any)?.recordingPath ?? null
}
