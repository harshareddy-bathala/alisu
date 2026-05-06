import { TelephonyAdapter, TelephonyEvent } from './adapter'

export class LocalAdapter implements TelephonyAdapter {
  handleIncomingCall(callSid: string, callerNumber: string): string {
    return JSON.stringify({ status: 'ok', callSid, callerNumber })
  }

  async sendAudioToCall(_callSid: string, _audioBase64: string): Promise<void> {
    // For local adapter, we could broadcast the audio to the frontend, 
    // but we can skip it for a simple dashboard bypass if not strictly required
    return Promise.resolve()
  }

  async transferCall(callSid: string, toNumber: string): Promise<void> {
    console.log(`[LOCAL ADAPTER] Transferring call ${callSid} to ${toNumber}`)
    return Promise.resolve()
  }

  async hangup(callSid: string): Promise<void> {
    console.log(`[LOCAL ADAPTER] Hanging up call ${callSid}`)
    return Promise.resolve()
  }

  parseStreamMessage(raw: string): TelephonyEvent {
    try {
      const msg = JSON.parse(raw)
      
      if (msg.event === 'start') {
        return { event: 'start', callSid: msg.callSid, payload: msg }
      }
      
      if (msg.event === 'media') {
        return {
          event: 'media',
          callSid: msg.callSid,
          audioBase64: msg.media.payload, // base64 encoded
          payload: msg
        }
      }
      
      if (msg.event === 'stop') {
        return { event: 'stop', callSid: msg.callSid, payload: msg }
      }
      
      return { event: 'unknown', callSid: msg.callSid || '', payload: msg }
    } catch (error) {
      return { event: 'unknown', callSid: '', payload: { raw, error } }
    }
  }

  buildAudioResponse(audioBase64: string, callSid: string): string {
    return JSON.stringify({
      event: 'media',
      callSid,
      media: { payload: audioBase64 }
    })
  }
}
