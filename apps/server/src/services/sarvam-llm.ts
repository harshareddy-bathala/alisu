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
  /** True when the citizen's request is outside 1092's civic-helpline scope
   *  (food, weather, jokes, abuse, random chat). The server counts these and
   *  forces a hangup after a couple of off-topic turns. */
  isOffTopic?: boolean
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
  // Strip a closed <think>...</think> block if present, otherwise strip from
  // an unclosed `<think>` to end-of-string (truncated reasoning that ran out
  // of tokens). What's left should contain the JSON object.
  let searchIn = raw
  const thinkEnd = searchIn.lastIndexOf('</think>')
  if (thinkEnd !== -1) {
    searchIn = searchIn.slice(thinkEnd + 8)
  } else {
    const thinkStart = searchIn.indexOf('<think>')
    if (thinkStart !== -1) searchIn = searchIn.slice(0, thinkStart) + searchIn.slice(thinkStart).replace(/<think>[\s\S]*$/, '')
  }
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

EXPLICIT LANGUAGE REQUESTS (override the primary-language rule):
- If the citizen explicitly asks you to speak in a specific language (e.g. "speak in Tamil", "ಹಿಂದಿಯಲ್ಲಿ ಮಾತಾಡಿ", "Tamil-la pesunga", "हिंदी में बोलिए"), switch to THAT language on the very next reply and stay there. Set "language" to the requested code. This overrides the call's primary language.
- If the citizen says they don't understand you ("I don't understand", "ಅರ್ಥವಾಗ್ತಿಲ್ಲ", "samajh nahi aaya", "puriyala"), DO NOT keep repeating in the same language. Instead, ask them which language they are comfortable in — and ask the question in their LAST detected language plus a short English fallback. Example reply: "ಯಾವ ಭಾಷೆಯಲ್ಲಿ ಮಾತಾಡೋಣ? Hindi, Tamil, Telugu, English — please tell me." Once they answer, switch to that language for the rest of the call.

RESOLVE COMMON ISSUES IN-CALL (don't always escalate to a human/department):
Many citizen queries can be answered directly by you without filing a complaint. Treat the call as a chance to actually help, not just route paperwork. Common cases you can resolve in-call:
  - Power outage inquiries: tell them BESCOM helpline 1912, suggest checking the local trip switch first, mention typical restoration times.
  - Water shortage: tell them BWSSB helpline 1916, check whether it is a known scheduled supply day.
  - Garbage / road / drainage / streetlight (BBMP): give the BBMP Sahaaya helpline 1533 and the area-specific ward office contact if relevant. Ask if they want a complaint filed for tracking, or if helpline contact alone is enough.
  - Property tax / Khata / RTC inquiries: point them to bbmp.gov.in or the sub-registrar office.
  - Lost items / minor disputes: explain that 100 / nearest police station handles it; only file via 1092 if it is an emergency.
  - Generic "how do I…" questions: answer directly with the right department / helpline / website.
For any case you can fully resolve in-call: give the helpful info, briefly confirm they got what they needed, then ask "Is there anything else?" — set conversationStep="close" and shouldClose=true if they say no. Don't fabricate a complaint just to fill paperwork.
Only proceed to gather → confirm → resolve (formal complaint filing) when:
  - The citizen explicitly wants a complaint filed, OR
  - The issue is ongoing/unresolved and needs department follow-up (e.g. pothole that's been there for weeks), OR
  - The issue is a critical emergency.
When you resolve in-call WITHOUT filing a complaint, set conversationStep="close", complaintData=null, and shouldClose=true after the citizen confirms they're satisfied.

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

SCOPE OF 1092 — what counts as a real complaint vs. off-topic:

  IN-SCOPE (file or guide — NEVER mark off-topic):
  Any genuine civic / public-welfare concern in Karnataka, including but not limited to:
    - The named departments: BBMP (roads, garbage, drainage, streetlights, parks), Police (crime, theft, accident, harassment), Revenue (land, property, RTC, khata), Electricity (BESCOM — outage, meter, billing), Water (BWSSB — supply, leak, sewage), Health (hospital, ambulance, dengue, public health), Fire, Labour (wages, workplace safety), Transport (KSRTC, RTO, traffic).
    - Anything else civic that doesn't neatly fit a named department — file under "Other" so a human officer can route it. Examples:
        * stray-animal menace, dead animal removal
        * unauthorised / illegal construction, encroachment
        * noise pollution, late-night nuisance
        * public hygiene, open drains, mosquito breeding
        * school / education / mid-day-meal complaints
        * senior-citizen welfare, women's safety (non-emergency)
        * ration / PDS, pension delays
        * tree falling, dangerous trees, fallen branches
        * any "I have a problem with…" that sounds genuine even if you're not 100% sure of the department
    For an in-scope item where you're unsure of department, set "department": "Other" and STILL gather → confirm → resolve a real complaint with complaintData populated. Better to file under "Other" for human review than to reject a real concern.

  OFF-TOPIC (these are the ONLY things that trigger isOffTopic):
    - Food / restaurants / "where to eat"
    - Weather, news, cricket, movies, entertainment trivia
    - "Tell me a joke", "who are you", random chat, AI-personality questions
    - Abuse, slurs, gibberish, made-up phrases ("ನುವ್ವೇ ತಿನ್ನು ಬಾಯ್")
    - "I have no problem" / "no issue" with nothing to follow up on
    - Anything clearly NOT a civic / government / public-welfare concern.

  How to handle OFF-TOPIC:
    - set "isOffTopic": true, "department": "Other", "complaintData": null, "conversationStep": "gather"
    - reply with one short sentence reminding them this is the Karnataka 1092 helpline and asking if they have a civic issue. Kannada example: "ಇದು ಕರ್ನಾಟಕ ಸರ್ಕಾರದ 1092 ಸಹಾಯವಾಣಿ. ನಿಮಗೆ ಯಾವುದಾದರೂ ನಾಗರಿಕ ಸಮಸ್ಯೆ ಇದೆಯಾ?"
    - When irrelevantCount >= 2 AND the new turn is STILL off-topic, also set "shouldHangup": true and say a brief goodbye. Kannada: "ಧನ್ಯವಾದಗಳು. ಹೆಲ್ಪ್‌ಲೈನ್ ಮುಚ್ಚುತ್ತಿದ್ದೇವೆ. ಶುಭ ದಿನ."
    - NEVER answer off-topic queries with helpful info (no restaurant tips, no jokes, no weather). Always redirect.
  When in doubt between "vague civic issue" and "off-topic": treat as civic and ask one clarifying question. Only mark isOffTopic when you're confident the citizen is NOT raising a public-welfare matter.

DEPARTMENTS: BBMP (roads/footpath/garbage/drainage/streetlights/parks),
  Police (crime/theft/accident/harassment), Revenue (land/property/RTC/khata),
  Electricity (power outage/meter/billing — BESCOM), Water (supply/borewell/sewage — BWSSB),
  Health (hospital/ambulance/doctor/public health), Fire (fire emergency),
  Labour (wages/workplace), Transport (KSRTC/RTO/traffic),
  Other (any genuine civic concern that doesn't fit above — stray animals, illegal construction, noise, schools, ration/PDS, pensions, tree fall, etc. Use this freely for real complaints; humans will route them.)

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
  "reply": "1-3 sentence spoken response in citizen's language",
  "language": "kn|hi|en|ta|te|ml|bn|mr|gu|pa|od",
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
  "isOffTopic": false,
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
${ctx.detectedLanguage ? `- citizen's primary language: ${ctx.detectedLanguage} — you MUST respond in this language for this entire call. Place names or proper nouns in another language (e.g. an English address inside a Tamil sentence) are NOT a language switch — keep replying in the primary language.` : ''}
${ctx.complaintId ? `- complaintId already assigned: ${ctx.complaintId} (use this in replies, not {COMPLAINT_ID})` : ''}
${ctx.department ? `- detected department: ${ctx.department}` : ''}`

  const messages = [
    { role: 'system' as const, content: systemWithContext },
    ...trimmed.map(m => ({
      role: m.speaker === 'user' ? 'user' as const : 'assistant' as const,
      content: m.text
    }))
  ]

  // Log the latest user input that's about to be sent, so you can paste it here.
  const lastUser = trimmed.filter(m => m.speaker === 'user').slice(-1)[0]
  console.log('────────────────────────────────────────')
  console.log(`[LLM IN] step=${ctx.conversationStep} lang=${ctx.detectedLanguage || '?'} turns=${trimmed.length}`)
  if (lastUser) console.log(`[LLM IN] user: "${lastUser.text}"`)

  // First attempt — sarvam-m is a reasoning model; on the "starter" tier the
  // hard ceiling is 2048 tokens. We use 2000 to leave headroom; if the model
  // still runs out mid-think the retry below kicks in with a JSON-only nudge.
  let parsed = await callSarvamReply(messages, 2000)
  if (parsed) {
    logOut('first', parsed)
    return parsed
  }

  // Retry — append the JSON-only nudge to the existing SYSTEM message instead
  // of adding a second one (Sarvam rejects multiple system messages with
  // "System message must appear only once, at the beginning of the conversation!").
  console.warn('[LLM] retrying with JSON-only nudge')
  const nudgedSystem =
    systemWithContext +
    '\n\nFINAL INSTRUCTION: Output ONLY the JSON object on this turn. Do NOT think out loud, do NOT use <think> tags, start your response with `{` and end with `}`.'
  const retryMessages = [
    { role: 'system' as const, content: nudgedSystem },
    ...messages.slice(1),
  ]
  parsed = await callSarvamReply(retryMessages, 1200)
  if (parsed) {
    logOut('retry', parsed)
    return parsed
  }

  console.error('[LLM] both attempts failed — falling back to apology')
  return fallbackForLanguage(ctx.detectedLanguage)
}

function logOut(tag: string, parsed: AlisuReply): void {
  console.log(`[LLM OUT/${tag}] step=${parsed.conversationStep} lang=${parsed.language} dept=${parsed.department} urgency=${parsed.urgency}`)
  console.log(`[LLM OUT/${tag}] reply: "${parsed.reply}"`)
  if (parsed.complaintData) console.log('[LLM OUT/' + tag + '] complaint:', JSON.stringify(parsed.complaintData))
}

async function callSarvamReply(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  maxTokens: number,
): Promise<AlisuReply | null> {
  try {
    const res = await sarvamFetch('https://api.sarvam.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'api-subscription-key': process.env.SARVAM_API_KEY || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'sarvam-m', messages, max_tokens: maxTokens, temperature: 0.2 }),
    })

    if (!res.ok) {
      console.error('[LLM] getAlisuReply error:', res.status, await res.text())
      return null
    }

    const data = await res.json()
    const raw: string = data.choices?.[0]?.message?.content || ''
    const jsonStr = extractJsonString(raw)
    if (!jsonStr) {
      console.error('[LLM] no JSON in response (raw, first 400 chars):', raw.slice(0, 400))
      return null
    }
    try {
      return JSON.parse(jsonStr) as AlisuReply
    } catch (err) {
      console.error('[LLM] JSON parse failed:', (err as Error).message, '| extracted:', jsonStr.slice(0, 300))
      return null
    }
  } catch (err) {
    console.error('[LLM] getAlisuReply failed:', err)
    return null
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
