import fs from 'fs'
import { sarvamFetch } from '../lib/sarvam-fetch'

const TTS_BODY = (text: string, languageCode: string) => JSON.stringify({
  inputs: [text],
  target_language_code: languageCode,
  speaker: 'kavya',
  model: 'bulbul:v3',
  enable_preprocessing: true,
  speech_sample_rate: 16000,
})

/** Returns raw WAV buffer — no disk I/O. Used for low-latency streaming. */
export async function synthesizeSpeechToBuffer(
  text: string,
  languageCode: string,
): Promise<Buffer | null> {
  try {
    const res = await sarvamFetch('https://api.sarvam.ai/text-to-speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': process.env.SARVAM_API_KEY || '',
      },
      body: TTS_BODY(text, languageCode),
    })
    if (!res.ok) { console.error('[TTS] error:', res.status, await res.text()); return null }
    const data = await res.json()
    const b64 = data.audios?.[0]
    if (!b64) { console.error('[TTS] no audio in response'); return null }
    return Buffer.from(b64, 'base64')
  } catch (err) {
    console.error('[TTS] synthesizeSpeechToBuffer failed:', err)
    return null
  }
}

export async function synthesizeSpeech(
  text: string,
  languageCode: string,
  callSid: string
): Promise<string> {
  const fileName = `verify-${callSid}-${Date.now()}.wav`
  const outputPath = `/tmp/${fileName}`

  try {
    const res = await sarvamFetch('https://api.sarvam.ai/text-to-speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': process.env.SARVAM_API_KEY || '',
      },
      body: TTS_BODY(text, languageCode),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[TTS] Sarvam TTS error:', res.status, err)
      return ''
    }

    const data = await res.json()
    const audioB64 = data.audios?.[0]
    if (!audioB64) {
      console.error('[TTS] No audio in response')
      return ''
    }

    fs.writeFileSync(outputPath, Buffer.from(audioB64, 'base64'))
    console.log('[TTS] Audio saved to', outputPath)
    return fileName
  } catch (err) {
    console.error('[TTS] synthesizeSpeech failed:', err)
    return ''
  }
}
