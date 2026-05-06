import { TelephonyAdapter, TelephonyEvent } from './adapter'

// ────────────────────────────────────────────────────────────────────────────
// EXOTEL VOICEBOT APPLET — STUB ADAPTER
//
// ACTIVATION STEPS:
//   1. Log in to Exotel Dashboard → App Bazaar
//   2. The "Stream" / "Voicebot Applet" is NOT visible by default.
//      Email hello@exotel.com with subject:
//        "Enable Voicebot/Stream Applet for Account SID: <YOUR_EXOTEL_SID>"
//   3. Complete Exotel KYC if not already done (required for Voicebot access).
//   4. Once enabled, the Stream applet appears in App Bazaar → assign it to
//      your ExoPhone in the Exotel flow builder.
//   5. Set TELEPHONY_PROVIDER=exotel in .env and provide:
//        EXOTEL_SID, EXOTEL_API_KEY, EXOTEL_API_TOKEN, EXOTEL_NUMBER, PUBLIC_URL
//
// WEBSOCKET MESSAGE FORMAT (incoming from Exotel → server):
//   All events are JSON text frames over the WebSocket.
//
//   connected event — sent once on WebSocket open:
//     { "event": "connected", "protocol": "Call", "version": "1.0.0" }
//
//   start event — sent before first media frame:
//     {
//       "event": "start",
//       "sequenceNumber": "1",
//       "start": {
//         "streamSid": "<uuid>",
//         "callSid": "<exotel-call-sid>",
//         "accountSid": "<your-exotel-sid>",
//         "tracks": ["inbound"],
//         "customParameters": { "From": "<caller-number>" }
//       },
//       "streamSid": "<uuid>"
//     }
//
//   media event — audio chunks from caller:
//     {
//       "event": "media",
//       "sequenceNumber": "2",
//       "media": {
//         "track": "inbound",
//         "chunk": "1",
//         "timestamp": "5",
//         "payload": "<base64-encoded-pcm16>"
//       },
//       "streamSid": "<uuid>"
//     }
//
//   stop event — sent when call ends:
//     {
//       "event": "stop",
//       "sequenceNumber": "100",
//       "stop": { "accountSid": "...", "callSid": "..." },
//       "streamSid": "<uuid>"
//     }
//
// AUDIO FORMAT (bidirectional):
//   Encoding:    Linear PCM (raw), signed 16-bit little-endian
//   Sample rate: 8000 Hz (8kHz)
//   Channels:    1 (mono)
//   Encoding:    Base64 in JSON payload
//   Chunk size:  160 bytes raw = 80 samples = 10ms at 8kHz
//                (Exotel typically sends 160-byte chunks = 20ms at 8kHz)
//
//   INBOUND  (Exotel → server): PCM16 8kHz base64 in media.payload
//   OUTBOUND (server → Exotel): same format, same JSON structure as media event
//
//   Upsampling required: PCM16 8kHz → PCM16 16kHz before passing to SarvamASR
//   Downsampling required: PCM16 16kHz → PCM16 8kHz before sending back
//
// OUTBOUND AUDIO FORMAT (server → Exotel):
//   {
//     "event": "media",
//     "streamSid": "<uuid>",
//     "media": { "payload": "<base64-pcm16-8kHz>" }
//   }
//
// MARK EVENT (after sending audio):
//   {
//     "event": "mark",
//     "streamSid": "<uuid>",
//     "mark": { "name": "response_end" }
//   }
//
// REFERENCE: https://support.exotel.com/support/solutions/articles/3000108630
// ────────────────────────────────────────────────────────────────────────────

class NotImplementedError extends Error {
  constructor() {
    super('Activate Exotel Voicebot applet first — see exotel-adapter.ts for instructions')
    this.name = 'NotImplementedError'
  }
}

export class ExotelAdapter implements TelephonyAdapter {
  handleIncomingCall(_callSid: string, _callerNumber: string): string {
    throw new NotImplementedError()
  }

  async sendAudioToCall(_callSid: string, _audioBase64: string): Promise<void> {
    throw new NotImplementedError()
  }

  async transferCall(_callSid: string, _toNumber: string): Promise<void> {
    throw new NotImplementedError()
  }

  async hangup(_callSid: string): Promise<void> {
    throw new NotImplementedError()
  }

  parseStreamMessage(raw: string): TelephonyEvent {
    // Exotel message format is structurally identical to Twilio Media Streams.
    // Once activated, parse identically — swap adapter, not the parsing logic.
    let msg: any
    try { msg = JSON.parse(raw) } catch {
      return { event: 'unknown', callSid: '', payload: raw }
    }

    if (msg.event === 'connected') return { event: 'connected', callSid: '', payload: msg }

    if (msg.event === 'start') {
      return {
        event: 'start',
        callSid: msg.start?.callSid || '',
        payload: msg.start,
      }
    }

    if (msg.event === 'media') {
      return {
        event: 'media',
        callSid: msg.streamSid || '',
        audioBase64: msg.media?.payload,
        payload: msg,
      }
    }

    if (msg.event === 'stop') {
      return {
        event: 'stop',
        callSid: msg.stop?.callSid || msg.streamSid || '',
        payload: msg,
      }
    }

    return { event: 'unknown', callSid: '', payload: msg }
  }

  buildAudioResponse(_audioBase64: string, _callSid: string): string {
    throw new NotImplementedError()
  }
}
