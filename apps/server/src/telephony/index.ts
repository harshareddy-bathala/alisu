import { TelephonyAdapter } from './adapter'
import { ExotelAdapter } from './exotel-adapter'
import { TwilioAdapter } from './twilio-adapter'
import { LocalAdapter } from './local-adapter'

export function createTelephonyAdapter(): TelephonyAdapter {
  const provider = process.env.TELEPHONY_PROVIDER || 'local'

  if (provider === 'local') {
    return new LocalAdapter()
  }

  if (provider === 'twilio') {
    return new TwilioAdapter(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!,
      process.env.TWILIO_NUMBER!,
      process.env.PUBLIC_URL!,
      '/media-stream'
    )
  }

  if (provider === 'exotel') {
    return new ExotelAdapter()
  }

  throw new Error(`Unknown provider: ${provider}`)
}

let adapter: TelephonyAdapter | null = null

function getTelephonyAdapter(): TelephonyAdapter {
  if (!adapter) {
    adapter = createTelephonyAdapter()
  }

  return adapter
}

export const telephony: TelephonyAdapter = {
  handleIncomingCall(callSid, callerNumber) {
    return getTelephonyAdapter().handleIncomingCall(callSid, callerNumber)
  },

  sendAudioToCall(callSid, audioBase64) {
    return getTelephonyAdapter().sendAudioToCall(callSid, audioBase64)
  },

  transferCall(callSid, toNumber) {
    return getTelephonyAdapter().transferCall(callSid, toNumber)
  },

  hangup(callSid) {
    return getTelephonyAdapter().hangup(callSid)
  },

  parseStreamMessage(raw) {
    return getTelephonyAdapter().parseStreamMessage(raw)
  },

  buildAudioResponse(audioBase64, callSid) {
    return getTelephonyAdapter().buildAudioResponse(audioBase64, callSid)
  }
}

export type { TelephonyAdapter, TelephonyEvent } from './adapter'
