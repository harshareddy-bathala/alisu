import twilio from 'twilio'
import { TelephonyAdapter, TelephonyEvent } from './adapter'

const outboundAudioQueue = new Map<string, string[]>()
const streamToCallSid = new Map<string, string>()

export function getOutboundAudioQueue(): Map<string, string[]> {
  return outboundAudioQueue
}

export class TwilioAdapter implements TelephonyAdapter {
  private readonly client: ReturnType<typeof twilio>

  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly phoneNumber: string,
    private readonly publicUrl: string,
    private readonly mediaStreamPath = '/media-stream'
  ) {
    this.client = twilio(this.accountSid, this.authToken)
  }

  handleIncomingCall(_callSid: string, _callerNumber: string): string {
    const streamHost = this.publicUrl
      .replace(/^https?:\/\//, '')
      .replace(/\/+$/, '')

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${streamHost}${this.mediaStreamPath}"/>
  </Connect>
</Response>`
  }

  async sendAudioToCall(callSid: string, audioBase64: string): Promise<void> {
    const pending = outboundAudioQueue.get(callSid) || []
    pending.push(audioBase64)
    outboundAudioQueue.set(callSid, pending)
  }

  async transferCall(callSid: string, toNumber: string): Promise<void> {
    const confName = `alisu-${callSid}`
    const conferenceTwiml = `<Response><Dial><Conference>${confName}</Conference></Dial></Response>`

    await this.client.calls(callSid).update({
      twiml: conferenceTwiml
    })

    await this.client.calls.create({
      to: toNumber,
      from: this.phoneNumber,
      twiml: conferenceTwiml
    })
  }

  async hangup(callSid: string): Promise<void> {
    await this.client.calls(callSid).update({ status: 'completed' })
  }

  parseStreamMessage(raw: string): TelephonyEvent {
    let msg: any

    try {
      msg = JSON.parse(raw)
    } catch (error) {
      return { event: 'unknown', callSid: '', payload: { raw, error } }
    }

    if (msg.event === 'connected') {
      return { event: 'connected', callSid: '', payload: msg }
    }

    if (msg.event === 'start') {
      const callSid = msg.start?.callSid || ''
      const streamSid = msg.start?.streamSid || ''

      if (callSid && streamSid) {
        streamToCallSid.set(streamSid, callSid)
      }

      return { event: 'start', callSid, payload: msg.start }
    }

    if (msg.event === 'media') {
      return {
        event: 'media',
        callSid: msg.streamSid || '',
        audioBase64: msg.media?.payload,
        payload: msg
      }
    }

    if (msg.event === 'stop') {
      const callSid =
        msg.stop?.callSid ||
        streamToCallSid.get(msg.stop?.streamSid || '') ||
        ''

      return { event: 'stop', callSid, payload: msg }
    }

    if (msg.event === 'dtmf') {
      return {
        event: 'dtmf',
        callSid: msg.streamSid || '',
        payload: msg
      }
    }

    return { event: 'unknown', callSid: '', payload: msg }
  }

  buildAudioResponse(audioBase64: string, callSid: string): string {
    return JSON.stringify({
      event: 'media',
      streamSid: callSid,
      media: { payload: audioBase64 }
    })
  }
}
