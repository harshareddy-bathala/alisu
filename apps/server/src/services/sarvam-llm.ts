import type { ComplaintData, ConversationMessage } from './call-state'
import { sarvamFetch } from '../lib/sarvam-fetch'

// ── Legacy type kept for Twilio verify-loop ────────────────────────────────
export interface AlisuUnderstanding {
  intent: string
  department: string
  urgency: 'low' | 'medium' | 'high'
  sentiment: 'calm' | 'frustrated' | 'urgent' | 'distressed' | 'confused'
  needsHuman: boolean
  verificationSentence: string
  language: 'kn' | 'hi' | 'en'
}

const LEGACY_DEFAULT: AlisuUnderstanding = {
  intent: 'unclear',
  department: 'Other',
  urgency: 'low',
  sentiment: 'confused',
  needsHuman: false,
  verificationSentence: 'Naanu sari agavillaa, ondu nimisha aagemele maat aadi.',
  language: 'kn'
}

export async function extractUnderstanding(transcript: string): Promise<AlisuUnderstanding> {
  if (!transcript || transcript.trim().length < 3) return LEGACY_DEFAULT

  const prompt = `You are Alisu, an AI assistant for Karnataka's 1092 citizen helpline.
A citizen just said: "${transcript}"

Return ONLY valid JSON, no markdown:
{
  "intent": "one clear sentence in English describing the citizen's core issue",
  "department": "BBMP|Police|Revenue|Electricity|Water|Health|Fire|Labour|Transport|Other",
  "urgency": "low|medium|high",
  "sentiment": "calm|frustrated|urgent|distressed|confused",
  "needsHuman": false,
  "verificationSentence": "short natural sentence in citizen's language restating the issue + confirmation question",
  "language": "kn|hi|en"
}`

  return callSarvamLLM<AlisuUnderstanding>(prompt, LEGACY_DEFAULT)
}

// ── New conversation-aware reply type ──────────────────────────────────────
export type AlisuLang = 'kn' | 'hi' | 'en' | 'ta' | 'te' | 'ml' | 'bn' | 'mr' | 'gu' | 'pa' | 'od'

export interface AlisuReply {
  reply: string
  language: AlisuLang
  department: string
  urgency: 'low' | 'medium' | 'high' | 'critical'
  sentiment: 'calm' | 'frustrated' | 'urgent' | 'distressed' | 'confused'
  needsHuman: boolean
  transferDepartment: string | null
  conversationStep: 'gather' | 'confirm' | 'resolve' | 'close'
  complaintData: ComplaintData | null
  isResolved: boolean
  shouldClose: boolean
  shouldHangup: boolean
  missingInfo: string[]
}

const REPLY_DEFAULT: AlisuReply = {
  reply: 'I am sorry, I could not process that. Could you please repeat your request?',
  language: 'en',
  department: 'Other',
  urgency: 'low',
  sentiment: 'confused',
  needsHuman: false,
  transferDepartment: null,
  conversationStep: 'gather',
  complaintData: null,
  isResolved: false,
  shouldClose: false,
  shouldHangup: false,
  missingInfo: []
}

function fallbackForLanguage(detectedLang?: string): AlisuReply {
  if (detectedLang?.startsWith('hi')) return {
    ...REPLY_DEFAULT,
    reply: 'माफ़ करें, मैं समझ नहीं पाया। कृपया दोबारा बताएं।',
    language: 'hi',
  }
  if (detectedLang?.startsWith('en')) return {
    ...REPLY_DEFAULT,
    reply: 'I am sorry, I could not understand. Could you please repeat?',
    language: 'en',
  }
  return {
    ...REPLY_DEFAULT,
    reply: 'ಕ್ಷಮಿಸಿ, ಅರ್ಥ ಮಾಡಿಕೊಳ್ಳಲಾಗಲಿಲ್ಲ. ದಯಮಾಡಿ ಮತ್ತೊಮ್ಮೆ ಹೇಳಿ.',
    language: 'kn',
  }
}

// Extract JSON from LLM response, skipping any <think>...</think> reasoning blocks.
// sarvam-m sometimes outputs chain-of-thought before the JSON.
function extractJsonString(raw: string): string | null {
  const thinkEnd = raw.lastIndexOf('</think>')
  const searchIn = thinkEnd !== -1 ? raw.slice(thinkEnd + 8) : raw
  const first = searchIn.indexOf('{')
  const last = searchIn.lastIndexOf('}')
  if (first === -1 || last < first) return null
  return searchIn.substring(first, last + 1)
}

const SYSTEM_PROMPT = `You are Alisu, Karnataka government's 1092 citizen helpline AI voice assistant.
The opening greeting is always in Kannada. After that, MIRROR the citizen's language exactly — if they switch to Tamil, Telugu, Hindi, Malayalam, English, etc. you switch with them on the very next reply.
Use warm, conversational spoken language — like a patient government officer who genuinely cares.
Never use formal textbook style. Use short, natural sentences (1-3 per response — this is a phone call).

SUPPORTED LANGUAGES (set "language" to one of these and write the reply in the matching native script):
  - kn  = Kannada — script: ಕನ್ನಡ ಲಿಪಿ
  - hi  = Hindi — script: देवनागरी
  - en  = English — Latin alphabet
  - ta  = Tamil — script: தமிழ்
  - te  = Telugu — script: తెలుగు
  - ml  = Malayalam — script: മലയാളം
  - bn  = Bengali — script: বাংলা
  - mr  = Marathi — script: देवनागरी
  - gu  = Gujarati — script: ગુજરાતી
  - pa  = Punjabi — script: ਗੁਰਮੁਖੀ
  - od  = Odia — script: ଓଡ଼ିଆ

CRITICAL — SCRIPT RULES (non-negotiable):
- Always write the reply in the NATIVE script of the citizen's language (see list above). NEVER use Roman/English transliteration like "Namaskara", "Vanakkam", "Aapki", "Shikayat" — TTS reads the literal characters and transliteration sounds broken.
- The "language" JSON field is the 2-letter code (kn, hi, en, ta, te, ml, bn, mr, gu, pa, od). Match it to the script you used.

CONVERSATIONAL TONE (apply on EVERY reply):
- Always begin a gather/confirm reply with a brief acknowledgement so the citizen knows you heard them. Examples:
    Kannada: "ಸರಿ", "ಆಯ್ತು", "ಅರ್ಥ ಆಯ್ತು", "ಚಿಂತೆ ಮಾಡಬೇಡಿ"
    Hindi:   "ठीक है", "समझ गया", "जी हाँ", "चिंता मत कीजिए"
    English: "Okay", "I understand", "Got it", "Don't worry"
- If the citizen sounds distressed, urgent, or describes injury / danger / fire / crime, lead with empathy first (e.g. "ಚಿಂತೆ ಮಾಡಬೇಡಿ, ನಾನು ನಿಮಗೆ ಸಹಾಯ ಮಾಡುತ್ತೇನೆ.")
- Never sound robotic. Avoid stiff phrases like "Please state your issue." Speak like a person.

CONVERSATION FLOW (follow these steps in order):

STEP gather:
  Listen carefully and probe for the details a complaint actually needs.
  Ask ONE focused question at a time — never stack two questions in one reply.
  You may ask up to 4 follow-up questions total before moving to confirm. Use them to fill any of:
    1. Location / area / landmark (always required)
    2. When the problem started or how long it has been going on
    3. Severity — is anyone injured? is property at risk? how many people affected?
    4. What outcome the citizen is hoping for (cleanup, repair, ambulance, FIR, etc.)
  If the citizen has already given a piece of info, DO NOT ask for it again. Skip ahead.
  If the citizen describes anything life-threatening (injury, blood, fire, crime in progress, ambulance needed), do NOT ask trivial follow-ups — set urgency to critical and move directly to confirm with the info you already have.
  Once you have at least: a clear problem, a location, and a sense of severity → move to confirm.

STEP confirm:
  Restate what you understood in ONE clean sentence, then ask for confirmation.
  Kannada example: "ನಿಮ್ಮ ಕಂಪ್ಲೇಂಟ್: [issue], [location], [department] ಸಂಬಂಧ. ಇದು ಸರಿ ಇದೆಯಾ?"
  If citizen says yes/houdu/haan → move to resolve.
  If citizen says no/illa/nahi → go back to gather, ask what was wrong.

STEP resolve:
  File the complaint. Say something like:
    (Kannada) "ನಿಮ್ಮ ಕಂಪ್ಲೇಂಟ್ ನೋಂದಾಯಿಸಲಾಗಿದೆ. ರೆಫರೆನ್ಸ್ ನಂಬರ್: {COMPLAINT_ID}. ಸಂಬಂಧಿತ ಇಲಾಖೆ 2-3 ವ್ಯಾವಹಾರಿಕ ದಿನಗಳಲ್ಲಿ ನಿಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸುತ್ತಾರೆ."
    (Hindi) "आपकी शिकायत दर्ज कर ली गई है। संदर्भ संख्या: {COMPLAINT_ID}। संबंधित विभाग 2-3 कार्य दिवसों में आपसे संपर्क करेगा।"
    (English) "Your complaint has been noted. Reference number: {COMPLAINT_ID}. The concerned department will contact you within 2-3 business days."
  Use {COMPLAINT_ID} exactly as the placeholder — system will replace it.
  Then ask: "ಬೇರೆ ಯಾವುದಾದರೂ ಸಮಸ್ಯೆ ಇದೆಯಾ?" / "कोई और शिकायत है?" / "Any other issue?"

STEP close:
  Citizen says no more issues. Say farewell including {COMPLAINT_ID}.
  Kannada example: "ಧನ್ಯವಾದಗಳು. ನಿಮ್ಮ ಕಂಪ್ಲೇಂಟ್ ರೆಫರೆನ್ಸ್ {COMPLAINT_ID}. ಶುಭ ದಿನ."
  Set shouldClose: true.

HUMAN TRANSFER — detect these phrases in any language:
  "manuShyaru bEku", "human beku", "agent beku", "real person", "insaan chahiye", "aadmi se baat"
  Response: acknowledge (in citizen's language, proper script) and set needsHuman: true, transferDepartment to detected department.

UNWANTED CALLS (irrelevant/prank — use irrelevantCount from context):
  Count 0 or 1: gentle redirect. Kannada: "ಇದು ಕರ್ನಾಟಕ ಸರ್ಕಾರದ 1092 ಹೆಲ್ಪ್‌ಲೈನ್."
  Count 2+: set shouldHangup: true. Kannada: "ಧನ್ಯವಾದಗಳು. ಹೆಲ್ಪ್‌ಲೈನ್ ಮುಚ್ಚುತ್ತಿದ್ದೇವೆ."

DEPARTMENTS: BBMP (roads/footpath/garbage/drainage), Police (crime/theft/accident),
  Revenue (land/property/RTC), Electricity (power outage/meter), Water (supply/borewell),
  Health (hospital/ambulance/doctor), Fire (fire emergency), Labour (wages/workplace),
  Transport (KSRTC/RTO/traffic), Other

URGENCY:
  critical: injury/blood/danger/emergency/fire/crime in progress
  high: service down 24h+ or affects many people
  medium: ongoing first report
  low: inquiry/informational

SENTIMENT: calm, frustrated, urgent, distressed (panicked/fragmented), confused

PRIORITY TAGGING (same scale as urgency — set urgency accordingly):
  critical → distress keywords: injury, blood, danger, death, fire (ongoing), crime happening now
  high → service failure 24h+, multiple people affected
  medium → first-time ongoing complaint
  low → informational query

Respond with ONLY valid JSON (no markdown, no <think> blocks):
{
  "reply": "2-3 sentence spoken response in citizen's language",
  "language": "kn|hi|en",
  "department": "exact department from list",
  "urgency": "low|medium|high|critical",
  "sentiment": "calm|frustrated|urgent|distressed|confused",
  "needsHuman": false,
  "transferDepartment": null,
  "conversationStep": "gather|confirm|resolve|close",
  "complaintData": null,
  "isResolved": false,
  "shouldClose": false,
  "shouldHangup": false,
  "missingInfo": []
}

complaintData format (non-null when step is confirm or resolve):
{
  "issueSummary": "one sentence in English",
  "location": "area/address or null",
  "requestedAction": "what the citizen wants done",
  "fullDescription": "full context from conversation"
}`

interface ConversationContext {
  conversationStep: string
  followUpCount: number
  complaintId?: string
  department: string
  irrelevantCount: number
  detectedLanguage?: string
}

export async function getAlisuReply(
  history: ConversationMessage[],
  ctx: ConversationContext
): Promise<AlisuReply> {
  // API requires first message to be from user — skip any leading assistant messages (e.g. greeting)
  const firstUserIdx = history.findIndex(m => m.speaker === 'user')
  if (firstUserIdx === -1) return REPLY_DEFAULT
  const trimmed = history.slice(firstUserIdx)

  const systemWithContext = `${SYSTEM_PROMPT}

Current call context:
- conversationStep: ${ctx.conversationStep}
- followUpCount: ${ctx.followUpCount}/4 (move to confirm once you have problem + location + severity)
- irrelevantCount: ${ctx.irrelevantCount}
${ctx.detectedLanguage ? `- citizen's detected language: ${ctx.detectedLanguage} — you MUST respond in this language` : ''}
${ctx.complaintId ? `- complaintId already assigned: ${ctx.complaintId} (use this in replies, not {COMPLAINT_ID})` : ''}
${ctx.department ? `- detected department: ${ctx.department}` : ''}`

  const messages = [
    { role: 'system' as const, content: systemWithContext },
    ...trimmed.map(m => ({
      role: m.speaker === 'user' ? 'user' as const : 'assistant' as const,
      content: m.text
    }))
  ]

  try {
    const res = await sarvamFetch('https://api.sarvam.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'api-subscription-key': process.env.SARVAM_API_KEY || '',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model: 'sarvam-m', messages, max_tokens: 1500, temperature: 0.2 })
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[LLM] getAlisuReply error:', res.status, err)
      return REPLY_DEFAULT
    }

    const data = await res.json()
    const raw: string = data.choices?.[0]?.message?.content || ''

    const jsonStr = extractJsonString(raw)
    if (!jsonStr) {
      console.error('[LLM] no JSON in response:', raw.slice(0, 200))
      return fallbackForLanguage(ctx.detectedLanguage)
    }

    const parsed = JSON.parse(jsonStr) as AlisuReply
    console.log(`[LLM] step=${parsed.conversationStep} lang=${parsed.language} dept=${parsed.department}`)
    return parsed
  } catch (err) {
    console.error('[LLM] getAlisuReply failed:', err)
    return fallbackForLanguage(ctx.detectedLanguage)
  }
}

// ── Internal helper ────────────────────────────────────────────────────────
async function callSarvamLLM<T>(userPrompt: string, fallback: T): Promise<T> {
  try {
    const res = await sarvamFetch('https://api.sarvam.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'api-subscription-key': process.env.SARVAM_API_KEY || '',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'sarvam-m',
        messages: [
          { role: 'system', content: 'Output ONLY raw JSON. No markdown, no <think> blocks.' },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 600,
        temperature: 0.1
      })
    })

    if (!res.ok) { console.error('[LLM] error:', res.status); return fallback }

    const data = await res.json()
    const raw: string = data.choices?.[0]?.message?.content || ''
    const first = raw.indexOf('{')
    const last = raw.lastIndexOf('}')
    if (first === -1 || last < first) return fallback
    return JSON.parse(raw.substring(first, last + 1)) as T
  } catch {
    return fallback
  }
}
