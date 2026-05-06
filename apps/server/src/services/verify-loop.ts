import twilio from 'twilio'
import { callStore } from './call-state'
import { extractUnderstanding } from './sarvam-llm'
import { synthesizeSpeech } from './sarvam-tts'
import { broadcastCallUpdate } from './broadcast'
import { transferTwiml, verifyTwiml } from '../lib/twilio-twiml'
import { getDepartmentNumber } from './departments'

function twilioClient() {
  return twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
}

function isLocalCall(callSid: string): boolean {
  return callSid.startsWith('TEST_') || callSid.startsWith('local_') || process.env.TELEPHONY_PROVIDER === 'local'
}

export async function runVerifyLoop(
  callSid: string,
  transcript: string
): Promise<void> {
  console.log(`[VERIFY] Starting verify loop for ${callSid}`)

  const understanding = await extractUnderstanding(transcript)

  callStore.update(callSid, {
    ...understanding,
    status: 'verifying'
  })
  broadcastCallUpdate(callSid)

  if (understanding.sentiment === 'distressed' || understanding.needsHuman) {
    console.log('[VERIFY] Escalating immediately — distressed or human requested')
    await escalateToHuman(callSid, understanding.department)
    return
  }

  const langCode =
    understanding.language === 'kn' ? 'kn-IN' :
    understanding.language === 'hi' ? 'hi-IN' : 'en-IN'

  const fileName = await synthesizeSpeech(
    understanding.verificationSentence,
    langCode,
    callSid
  )

  if (!fileName) {
    await escalateToHuman(callSid, understanding.department)
    return
  }

  const audioUrl = `/api/audio/${fileName}`
  callStore.update(callSid, { audioPath: audioUrl })
  broadcastCallUpdate(callSid)

  if (isLocalCall(callSid)) {
    console.log(`[VERIFY] ${callSid} is a local/test call; skipping Twilio call update`)
    return
  }

  const absoluteAudioUrl = `${process.env.PUBLIC_URL}${audioUrl}`
  await twilioClient().calls(callSid).update({
    twiml: verifyTwiml(absoluteAudioUrl, process.env.PUBLIC_URL!, callSid, langCode)
  })
}

export async function escalateToHuman(
  callSid: string,
  department: string
): Promise<void> {
  const targetNumber = getDepartmentNumber(department) || process.env.DEPT_BBMP!
  const confName = `alisu-${callSid}`

  callStore.update(callSid, { status: 'transferred', department })
  broadcastCallUpdate(callSid)

  if (isLocalCall(callSid)) {
    console.log(`[TRANSFER] Local bypass: ${callSid} → ${department} at ${targetNumber}`)
    return
  }

  await twilioClient().calls(callSid).update({
    twiml: transferTwiml(confName)
  })

  await twilioClient().calls.create({
    to: targetNumber,
    from: process.env.TWILIO_NUMBER!,
    twiml: transferTwiml(confName)
  })

  console.log(`[TRANSFER] ${callSid} → ${department} at ${targetNumber}`)
}
