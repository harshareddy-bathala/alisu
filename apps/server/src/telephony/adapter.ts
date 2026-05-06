export interface TelephonyAdapter {
  // Called when a new inbound call arrives.
  // Returns whatever the telephony provider needs as HTTP response.
  handleIncomingCall(callSid: string, callerNumber: string): string

  // Inject audio into a live call.
  // audioBase64 is raw PCM audio encoded as base64.
  sendAudioToCall(callSid: string, audioBase64: string): Promise<void>

  // Transfer call to a real phone number.
  transferCall(callSid: string, toNumber: string): Promise<void>

  // End the call cleanly.
  hangup(callSid: string): Promise<void>

  // Parse incoming WebSocket message from provider.
  parseStreamMessage(raw: string): TelephonyEvent

  // Build the response to send back over WebSocket.
  buildAudioResponse(audioBase64: string, callSid: string): string
}

export interface TelephonyEvent {
  event: 'connected' | 'start' | 'media' | 'stop' | 'dtmf' | 'audio_config' | 'unknown'
  callSid: string
  audioBase64?: string
  payload?: any
}
