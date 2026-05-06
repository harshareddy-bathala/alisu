import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import type { ConversationMessage } from './call-state'
import { callStore } from './call-state'
import { complaintStore } from './complaint-store'
import { getAlisuReply } from './sarvam-llm'
import { synthesizeSpeech, synthesizeSpeechToBuffer } from './sarvam-tts'
import { broadcastCallUpdate, broadcastComplaint } from './broadcast'
import { escalateToHuman } from './verify-loop'
import { getDepartmentNumber } from './departments'
import { getCallbackTime, callbackReply } from '../lib/callback-scheduler'
import { triggerASRReset } from './asr-registry'

const GREETING_TEXT =
  'ನಮಸ್ಕಾರ! ನಾನು ಅಲಿಸು, ಕರ್ನಾಟಕ 1092 ಹೆಲ್ಪ್‌ಲೈನ್ ನಿಂದ. ನಿಮ್ಮ ಸಮಸ್ಯೆ ಹೇಳಿ, ನಾನು ಸಹಾಯ ಮಾಡುತ್ತೇನೆ.'

// ── Greeting cache ────────────────────────────────────────────────────────────
// Persisted to disk so the cache survives server restarts.
const RECORDING_DIR = process.env.RECORDING_DIR || '/tmp/alisu-recordings'
const GREETING_CACHE_PATH = path.join(RECORDING_DIR, 'greeting-cache.wav')

let greetingWav: Buffer | null = null

export async function preloadGreeting(): Promise<void> {
  // Load from disk first — survives restarts, skips Sarvam API call
  if (fs.existsSync(GREETING_CACHE_PATH)) {
    greetingWav = fs.readFileSync(GREETING_CACHE_PATH)
    console.log('[GREETING] Loaded from disk cache — first call will be instant')
    return
  }

  try {
    const fileName = await synthesizeSpeech(GREETING_TEXT, 'kn-IN', 'greeting-cache')
    if (fileName) {
      greetingWav = fs.readFileSync(`/tmp/${fileName}`)
      // Persist so future restarts skip the API call
      fs.mkdirSync(RECORDING_DIR, { recursive: true })
      fs.writeFileSync(GREETING_CACHE_PATH, greetingWav)
      console.log('[GREETING] Pre-cached greeting TTS and saved to disk')
    }
  } catch (err) {
    console.warn('[GREETING] Pre-cache failed (non-fatal):', err)
  }
}

// ── Interrupt support ─────────────────────────────────────────────────────────
// Each speaking turn registers a resolve function here. Calling it skips the
// remaining playback wait so the next user turn can start immediately.
const interruptMap = new Map<string, () => void>()

export function interruptSpeech(callSid: string): void {
  interruptMap.get(callSid)?.()
}

function waitForSpeechEnd(callSid: string, durationMs: number): Promise<void> {
  return new Promise<void>(resolve => {
    const timer = setTimeout(() => {
      interruptMap.delete(callSid)
      resolve()
    }, durationMs)

    interruptMap.set(callSid, () => {
      clearTimeout(timer)
      interruptMap.delete(callSid)
      resolve()
    })
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function estimateDurationMs(text: string): number {
  return text.split(/\s+/).filter(Boolean).length * 380 + 600
}

// Map ASR language to a TTS-compatible code. Sarvam bulbul:v3 supports the full
// set of major Indian languages, so we let any of them through. The greeting is
// always Kannada (1092 is a Karnataka helpline) but if the citizen replies in any
// other Sarvam-supported language we mirror it back in the same language.
const SUPPORTED_LANGS = [
  'kn-IN', 'hi-IN', 'en-IN',
  'ta-IN', 'te-IN', 'ml-IN',
  'bn-IN', 'mr-IN', 'gu-IN',
  'pa-IN', 'od-IN',
] as const

function normalizeLanguage(asrLang: string, fallback: string): string {
  const l = (asrLang || '').toLowerCase()
  for (const code of SUPPORTED_LANGS) {
    if (l.startsWith(code.slice(0, 2))) return code
  }
  console.warn(`[LANG] Unsupported ASR language '${asrLang}' — using '${fallback || 'kn-IN'}'`)
  return fallback || 'kn-IN'
}

function socketSend(socket: any, data: object): void {
  if (socket.readyState === 1) socket.send(JSON.stringify(data))
}

function generateComplaintId(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const n = crypto.randomInt(1000, 9999)
  return `ALU-${y}${m}${d}-${n}`
}

function urgencyToPriority(u: string): 'critical' | 'high' | 'medium' | 'low' {
  if (u === 'critical') return 'critical'
  if (u === 'high') return 'high'
  if (u === 'medium') return 'medium'
  return 'low'
}

/**
 * Rewrite complaint IDs so TTS speaks each character individually:
 *   ALU-20250505-7823  →  A L U 2 0 2 5 0 5 0 5 7 8 2 3
 * Only applied to the TTS input — display text is unchanged.
 */
function transformForTTS(text: string): string {
  return text.replace(/ALU-(\d+)-(\d+)/g, (_match, p1, p2) =>
    ['A', 'L', 'U', ...p1.split(''), ...p2.split('')].join(' ')
  )
}

async function sendSpeech(
  socket: any,
  text: string,
  language: string,
  callSid: string,
  extra: Record<string, unknown> = {}
): Promise<number> {
  // language can already be a full BCP47 code (kn-IN, ta-IN…) from ASR or a
  // bare 2-letter code from the LLM. Normalize once and trust the result.
  const langCode = normalizeLanguage(language, 'kn-IN')

  const ttsText = transformForTTS(text)
  const buf = await synthesizeSpeechToBuffer(ttsText, langCode)

  if (!buf) {
    socketSend(socket, { type: 'text_only', text })
    return 0
  }

  socketSend(socket, { type: 'audio_meta', text, language, ...extra })
  socket.send(buf)
  return estimateDurationMs(text)
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function startCall(
  callSid: string,
  callerNumber: string,
  socket: any
): Promise<void> {
  callStore.create(callSid, callerNumber)
  callStore.update(callSid, { status: 'processing' })
  broadcastCallUpdate(callSid)

  const greetingMsg: ConversationMessage = {
    speaker: 'alisu',
    text: GREETING_TEXT,
    language: 'kn',
    timestamp: new Date(),
  }
  callStore.update(callSid, { conversationHistory: [greetingMsg] })

  // Use cached WAV if available — skips the TTS API call entirely
  let duration: number
  if (greetingWav) {
    socketSend(socket, { type: 'audio_meta', text: GREETING_TEXT, language: 'kn', isGreeting: true })
    socket.send(greetingWav)
    duration = estimateDurationMs(GREETING_TEXT)
  } else {
    duration = await sendSpeech(socket, GREETING_TEXT, 'kn', callSid, { isGreeting: true })
  }

  if (duration > 0) {
    callStore.update(callSid, { status: 'speaking' })
    broadcastCallUpdate(callSid)
    await waitForSpeechEnd(callSid, duration)
  }

  triggerASRReset(callSid)
  callStore.update(callSid, { status: 'active' })
  broadcastCallUpdate(callSid)
  socketSend(socket, { type: 'resume_listening' })
}

export async function processUserUtterance(
  callSid: string,
  utterance: string,
  language: string,
  socket: any
): Promise<void> {
  const state = callStore.get(callSid)
  if (!state || state.status !== 'active') return

  // Lock immediately to prevent concurrent ASR flushes; show processing state
  callStore.update(callSid, { status: 'processing' })

  // Clamp language to supported set — ASR can misidentify short utterances
  const lang = normalizeLanguage(language, state.language as string)

  // Add user utterance to conversation history
  const userMsg: ConversationMessage = {
    speaker: 'user',
    text: utterance,
    language: lang,
    timestamp: new Date(),
  }
  const history    = [...state.conversationHistory, userMsg]
  const transcript = `${state.transcript} ${utterance}`.trim()

  callStore.update(callSid, {
    transcript,
    lastChunk: utterance,
    language: lang as any,
    conversationHistory: history,
  })
  broadcastCallUpdate(callSid)

  // Tell the browser to show processing animation immediately
  socketSend(socket, { type: 'processing' })

  // Get Alisu's reply from LLM
  const alisuReply = await getAlisuReply(history, {
    conversationStep: state.conversationStep,
    followUpCount:    state.followUpCount,
    complaintId:      state.complaintId,
    department:       state.department,
    irrelevantCount:  state.irrelevantCount,
    detectedLanguage: lang,
  })

  // Resolve {COMPLAINT_ID} placeholder
  let replyText = alisuReply.reply
  if (replyText.includes('{COMPLAINT_ID}')) {
    if (state.complaintId) {
      replyText = replyText.replace(/\{COMPLAINT_ID\}/g, state.complaintId)
    } else if (alisuReply.conversationStep === 'resolve' && alisuReply.complaintData) {
      const newId = generateComplaintId()
      replyText = replyText.replace(/\{COMPLAINT_ID\}/g, newId)
      callStore.update(callSid, { complaintId: newId, complaintData: alisuReply.complaintData })

      const complaint = {
        id:              newId,
        callSid,
        status:          'filed' as const,
        priority:        urgencyToPriority(alisuReply.urgency),
        department:      alisuReply.department || state.department || 'Other',
        issueSummary:    alisuReply.complaintData.issueSummary,
        location:        alisuReply.complaintData.location,
        requestedAction: alisuReply.complaintData.requestedAction,
        fullDescription: alisuReply.complaintData.fullDescription,
        language:        alisuReply.language,
        callerNumber:    state.callerNumber,
        createdAt:       new Date(),
        statusHistory:   [{ status: 'filed', timestamp: new Date() }],
      }
      complaintStore.create(complaint)
      broadcastComplaint('COMPLAINT_CREATED', complaint)
    }
  }

  // Add Alisu reply to history
  const alisuMsg: ConversationMessage = {
    speaker:   'alisu',
    text:      replyText,
    language:  alisuReply.language,
    timestamp: new Date(),
  }

  callStore.update(callSid, {
    conversationHistory: [...history, alisuMsg],
    conversationStep:    alisuReply.conversationStep,
    followUpCount:       alisuReply.conversationStep === 'gather'
                           ? state.followUpCount + 1
                           : state.followUpCount,
    intent:        alisuReply.complaintData?.issueSummary || state.intent,
    department:    alisuReply.department || state.department,
    urgency:       alisuReply.urgency,
    sentiment:     alisuReply.sentiment,
    needsHuman:    alisuReply.needsHuman,
    priority:      urgencyToPriority(alisuReply.urgency),
    irrelevantCount: alisuReply.shouldHangup
                       ? state.irrelevantCount + 1
                       : state.irrelevantCount,
    isResolved:    alisuReply.isResolved,
    humanRequested: alisuReply.needsHuman || state.humanRequested,
    ...(alisuReply.complaintData && !state.complaintData
      ? { complaintData: alisuReply.complaintData }
      : {}),
  })
  broadcastCallUpdate(callSid)

  // ── Speak the reply ───────────────────────────────────────────────────────

  // Human transfer — check if we can actually connect before speaking
  if (alisuReply.needsHuman) {
    const dept = alisuReply.transferDepartment || alisuReply.department || state.department
    const deptNumber = getDepartmentNumber(dept)
    const canTransfer = process.env.TELEPHONY_PROVIDER !== 'local' && !!deptNumber

    let speakText = replyText
    let callbackTime: string | undefined

    if (!canTransfer) {
      callbackTime = getCallbackTime()
      speakText = callbackReply(alisuReply.language as 'kn' | 'hi' | 'en', dept, callbackTime)
      callStore.update(callSid, { callbackTime })
      // Also update the alisuMsg in history to reflect what was actually said
      callStore.update(callSid, {
        conversationHistory: [
          ...history,
          { ...alisuMsg, text: speakText },
        ],
      })
    }

    callStore.update(callSid, { status: 'speaking' })
    broadcastCallUpdate(callSid)
    const dur = await sendSpeech(socket, speakText, alisuReply.language, callSid)
    if (dur > 0) await waitForSpeechEnd(callSid, dur)

    if (canTransfer) {
      await escalateToHuman(callSid, dept)
    } else {
      callStore.update(callSid, { status: 'ended' })
      broadcastCallUpdate(callSid)
      socketSend(socket, { type: 'call_ended' })
    }
    return
  }

  // Prank / irrelevant hangup
  if (alisuReply.shouldHangup) {
    callStore.update(callSid, { status: 'speaking' })
    broadcastCallUpdate(callSid)
    const dur = await sendSpeech(socket, replyText, alisuReply.language, callSid)
    if (dur > 0) await waitForSpeechEnd(callSid, dur)
    callStore.update(callSid, { status: 'ended' })
    broadcastCallUpdate(callSid)
    socketSend(socket, { type: 'call_ended' })
    return
  }

  // Normal reply
  callStore.update(callSid, { status: 'speaking' })
  broadcastCallUpdate(callSid)
  const dur = await sendSpeech(socket, replyText, alisuReply.language, callSid)
  if (dur > 0) await waitForSpeechEnd(callSid, dur)

  if (alisuReply.shouldClose) {
    callStore.update(callSid, { status: 'ended' })
    broadcastCallUpdate(callSid)
    socketSend(socket, { type: 'call_ended' })
  } else {
    triggerASRReset(callSid)
    callStore.update(callSid, { status: 'active' })
    broadcastCallUpdate(callSid)
    socketSend(socket, { type: 'resume_listening' })
  }
}
