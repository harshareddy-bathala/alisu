import { FastifyInstance } from 'fastify'
import { broadcastCallUpdate } from '../services/broadcast'
import { callStore } from '../services/call-state'
import { SarvamStreamingASR } from '../services/sarvam-asr'
import { startCall, processUserUtterance, interruptSpeech } from '../services/conversation-engine'
import { startRecording, writeChunk, finishRecording } from '../services/call-recorder'
import { registerASRReset, unregisterASRReset } from '../services/asr-registry'
import { mulaw as MuLaw } from 'alawmulaw'
import { upsample8kTo16k, pcm16WavToMulaw8k } from '../lib/audio-convert'

function createTwilioProxy(realSocket: any, streamSid: string) {
  return {
    get readyState(): number { return realSocket.readyState as number },
    send(data: string | Buffer): void {
      if (!(data instanceof Buffer)) return
      if (realSocket.readyState !== 1) return
      const mulawBytes = pcm16WavToMulaw8k(data)
      if (mulawBytes.length === 0) return
      const b64 = mulawBytes.toString('base64')
      realSocket.send(JSON.stringify({ event: 'media', streamSid, media: { payload: b64 } }))
      realSocket.send(JSON.stringify({ event: 'mark', streamSid, mark: { name: 'response_end' } }))
    },
  }
}

export async function mediaStreamRoute(fastify: FastifyInstance) {
  fastify.get('/media-stream', { websocket: true }, (socket: any) => {
    let callSid      = ''
    let streamSid    = ''
    let callerNumber = ''
    let asr: SarvamStreamingASR | null = null

    // Utterance merge state — scoped to socket lifetime
    let utteranceParts: string[]            = []
    let utteranceLang                        = ''
    let mergeTimer: NodeJS.Timeout | null   = null

    const isLocal = process.env.TELEPHONY_PROVIDER === 'local'

    socket.on('message', async (raw: Buffer) => {
      // ── Binary frame: raw PCM16 from the browser ──────────────────────────
      if (raw[0] !== 0x7b) {
        asr?.sendAudio(raw)
        writeChunk(callSid, raw)  // record citizen's speech
        return
      }

      let msg: any
      try { msg = JSON.parse(raw.toString()) } catch { return }

      const eventType: string = msg.event || msg.type || ''

      if (eventType === 'connected') { console.log('[STREAM] WebSocket connected'); return }
      if (eventType === 'audio_config' || eventType === 'amplitude') return

      if (eventType === 'interrupt') { interruptSpeech(callSid); return }

      // ── start ─────────────────────────────────────────────────────────────
      if (eventType === 'start') {
        callSid      = msg.callSid || msg.start?.callSid || ''
        streamSid    = msg.start?.streamSid || msg.payload?.streamSid || ''
        callerNumber = msg.start?.customParameters?.From
                    || msg.payload?.customParameters?.From
                    || 'Unknown'

        console.log(`[STREAM] Call started: ${callSid} (${isLocal ? 'local' : 'telephony'})`)

        startRecording(callSid)

        const effectiveSocket = isLocal ? socket : createTwilioProxy(socket, streamSid)

        // Long merge window — gives a chance for the next ASR fragment to land
        // before we hand the utterance off to the LLM. Real callers pause 2–3s
        // mid-thought, and we don't want each pause to become its own turn.
        // Total worst case before LLM is called: SILENCE_DURATION_MS (2.5s) + this (2.2s) = 4.7s of silence.
        const MERGE_WINDOW_MS = 2200

        const flushUtterance = async () => {
          mergeTimer = null
          const full = utteranceParts.join(' ').trim()
          utteranceParts = []
          if (!full) return
          const s = callStore.get(callSid)
          if (!s || s.status !== 'active') return
          // Clear the live partial — the same text is about to land in conversationHistory.
          callStore.update(callSid, { partialUserText: '' })
          // Mute ASR for the entire LLM+TTS round-trip so any audio captured
          // while Alisu is thinking/speaking is dropped, never queued for the next turn.
          asr?.setMuted(true)
          try {
            await processUserUtterance(callSid, full, utteranceLang, effectiveSocket)
          } finally {
            asr?.setMuted(false)
          }
        }

        asr = new SarvamStreamingASR(async (transcript, language) => {
          if (!transcript.trim()) return
          const state = callStore.get(callSid)
          if (!state || state.status !== 'active') return
          utteranceParts.push(transcript.trim())
          utteranceLang = language
          // Push the partial transcript to the dashboard immediately so the
          // demonstrator sees the user's words within ~2s of speaking, instead
          // of waiting for the merge window + LLM round-trip.
          callStore.update(callSid, { partialUserText: utteranceParts.join(' ') })
          broadcastCallUpdate(callSid)
          if (mergeTimer) clearTimeout(mergeTimer)
          mergeTimer = setTimeout(flushUtterance, MERGE_WINDOW_MS)
        })

        registerASRReset(callSid, () => {
          if (mergeTimer) { clearTimeout(mergeTimer); mergeTimer = null }
          utteranceParts = []
          asr?.reset()
          asr?.setMuted(false)
        })

        await startCall(callSid, callerNumber, effectiveSocket)
        return
      }

      // ── media (Twilio/Exotel) ─────────────────────────────────────────────
      if (eventType === 'media') {
        if (isLocal || !asr) return
        const audioBase64 = msg.media?.payload
        if (!audioBase64) return
        const mulaw8k = Buffer.from(audioBase64, 'base64')
        const pcm8k   = MuLaw.decode(mulaw8k)
        const pcm16k  = upsample8kTo16k(pcm8k)
        const pcmBuf  = Buffer.from(pcm16k.buffer, pcm16k.byteOffset, pcm16k.byteLength)
        asr.sendAudio(pcmBuf)
        writeChunk(callSid, pcmBuf)  // record upsampled PCM
        return
      }

      // ── stop ──────────────────────────────────────────────────────────────
      if (eventType === 'stop') {
        const sid = msg.callSid || msg.stop?.callSid || callSid
        if (mergeTimer) { clearTimeout(mergeTimer); mergeTimer = null }
        utteranceParts = []
        callStore.update(sid, { status: 'ended', endedAt: new Date() } as any)
        broadcastCallUpdate(sid)
        finishRecording(sid)
        unregisterASRReset(sid)
        console.log(`[STREAM] Call ended: ${sid}`)
      }
    })

    socket.on('close', () => {
      if (callSid) {
        const state = callStore.get(callSid)
        if (state && !['ended', 'transferred'].includes(state.status)) {
          callStore.update(callSid, { status: 'ended', endedAt: new Date() } as any)
          broadcastCallUpdate(callSid)
        }
        finishRecording(callSid)
        unregisterASRReset(callSid)
      }
    })
  })
}
