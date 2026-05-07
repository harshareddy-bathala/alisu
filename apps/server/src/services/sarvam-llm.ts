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

const SYSTEM_PROMPT = `You are Alisu, Karnataka 1092 helpline AI voice assistant.
Greeting is Kannada; afterwards mirror the citizen's language. Stay in the call's primary language unless they explicitly request a switch.
Tone: warm, conversational, like a patient government officer. Short spoken sentences (1-2 per reply — this is a phone call). Never robotic.

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

SCRIPT RULES (non-negotiable):
- Write the reply in the NATIVE script of the language. NEVER Roman transliteration ("Namaskara", "Vanakkam") — TTS reads literally.
- "language" JSON field is the 2-letter code matching your script.

TONE on every reply:
- Open gather/confirm with a brief acknowledgement: "ಸರಿ" / "ಆಯ್ತು" (kn), "ठीक है" / "समझ गया" (hi), "Okay" / "Got it" (en).
- Distressed citizen → lead with empathy ("ಚಿಂತೆ ಮಾಡಬೇಡಿ").

EXPLICIT LANGUAGE REQUESTS:
- "speak in <lang>" / "<lang>-la pesunga" / "<lang>ಯಲ್ಲಿ ಮಾತಾಡಿ" → switch on next reply, set language code accordingly.
- "I don't understand" / "ಅರ್ಥವಾಗ್ತಿಲ್ಲ" / "samajh nahi aaya" → ask which language they're comfortable in (current language + brief English options), then switch.

RESOLVE IN-CALL when possible (don't always file paperwork):
Quick-info answers (give helpline + brief tip, then ask "anything else?", close if no):
  - Power: BESCOM 1912 — check trip switch first.
  - Water: BWSSB 1916 — may be scheduled supply day.
  - BBMP services: BBMP Sahaaya 1533.
  - Property tax/Khata: bbmp.gov.in / sub-registrar.
  - Police/lost items: 100 / local station; 1092 only for civic emergencies.
File a formal complaint (gather → confirm → resolve) only when: citizen explicitly asks, issue is ongoing/unresolved, OR critical emergency.
When resolving in-call without filing: set conversationStep="close", complaintData=null, shouldClose=true after citizen confirms satisfied.

CONVERSATION FLOW (follow these steps in order):

STEP gather:
  Probe details via ONE short question per reply. Required dimensions in order (skip any already given):
    1. Location / landmark
    2. Duration (how long ongoing)
    3. Severity / impact
    4. Requested action
  Up to 4 gather turns. Don't move to confirm with only problem+location.
  EMERGENCY (injury, fire, crime in progress, ambulance) → urgency=critical, jump to confirm.
  Move to confirm once you have: problem + location + (severity OR duration).

STEP confirm:
  One-sentence restatement + "ಇದು ಸರಿ ಇದೆಯಾ?" / "क्या यह सही है?" / "Is that right?".
  Yes → resolve. No → back to gather.

STEP resolve:
  File the complaint with {COMPLAINT_ID} placeholder (system replaces it).
  Kannada: "ನಿಮ್ಮ ಕಂಪ್ಲೇಂಟ್ ನೋಂದಾಯಿಸಲಾಗಿದೆ. ರೆಫರೆನ್ಸ್: {COMPLAINT_ID}. 2-3 ದಿನಗಳಲ್ಲಿ ಇಲಾಖೆ ಸಂಪರ್ಕಿಸುತ್ತದೆ."
  Hindi: "शिकायत दर्ज। संदर्भ: {COMPLAINT_ID}। 2-3 दिनों में विभाग संपर्क करेगा।"
  English: "Complaint filed. Reference: {COMPLAINT_ID}. Department will contact within 2-3 days."
  Then "ಬೇರೆ ಯಾವುದಾದರೂ ಸಮಸ್ಯೆ?" / "और कोई शिकायत?" / "Anything else?"

STEP close:
  Brief farewell with {COMPLAINT_ID}. shouldClose: true.

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

  // First attempt — minimal reasoning for snappy turns. Demo latency budget is
  // tight; we accept slightly less polished phrasing in exchange for sub-3s LLM.
  let parsed = await callSarvamReply(messages, 2048, { reasoning_effort: 'minimal' })
  if (parsed) {
    logOut('first', parsed)
    return parsed
  }

  // Retry 1 — append a strict JSON-only directive AND prefill an assistant
  // turn that opens a brace. Reasoning models that see `{` as their last
  // assistant turn typically continue the JSON instead of starting a new
  // <think> block.
  console.warn('[LLM] retry 1: prefilling JSON open brace')
  const directiveSystem =
    systemWithContext +
    '\n\nABSOLUTE FINAL RULE: Your next response is ONLY a JSON object. You MUST NOT write <think>. You MUST NOT write any prose. Continue from the `{` already provided.'
  const prefillMessages = [
    { role: 'system' as const, content: directiveSystem },
    ...messages.slice(1),
    { role: 'assistant' as const, content: '{' },
  ]
  parsed = await callSarvamReply(prefillMessages, 2048, { reasoning_effort: 'low' })
  if (parsed) {
    logOut('retry-prefill', parsed)
    return parsed
  }

  // Retry 2 — minimal, last-message-only call to a stripped prompt, designed
  // to fit in any token budget. We still try to honor language and step but
  // give up the rich behavior. This is the demo-saving safety net.
  console.warn('[LLM] retry 2: minimal prompt fallback')
  const minimal = buildMinimalPrompt(lastUser?.text || '', ctx)
  parsed = await callSarvamReply(minimal, 800, { reasoning_effort: 'low' })
  if (parsed) {
    logOut('retry-minimal', parsed)
    return parsed
  }

  console.error('[LLM] all attempts failed — falling back to apology')
  return fallbackForLanguage(ctx.detectedLanguage)
}

function buildMinimalPrompt(
  utterance: string,
  ctx: ConversationContext,
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const sys = `You are Alisu, Karnataka 1092 helpline. Reply in ${ctx.detectedLanguage || 'kn'} using its native script (no transliteration). Output ONLY this JSON, nothing else:
{"reply":"<short reply, 1 sentence>","language":"${(ctx.detectedLanguage || 'kn').slice(0, 2)}","department":"${ctx.department || 'Other'}","urgency":"low","sentiment":"calm","needsHuman":false,"transferDepartment":null,"conversationStep":"gather","complaintData":null,"isResolved":false,"shouldClose":false,"shouldHangup":false,"isOffTopic":false,"missingInfo":[]}`
  return [
    { role: 'system', content: sys },
    { role: 'user', content: utterance },
  ]
}

function logOut(tag: string, parsed: AlisuReply): void {
  console.log(`[LLM OUT/${tag}] step=${parsed.conversationStep} lang=${parsed.language} dept=${parsed.department} urgency=${parsed.urgency}`)
  console.log(`[LLM OUT/${tag}] reply: "${parsed.reply}"`)
  if (parsed.complaintData) console.log('[LLM OUT/' + tag + '] complaint:', JSON.stringify(parsed.complaintData))
}

async function callSarvamReply(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  maxTokens: number,
  extra: Record<string, unknown> = {},
): Promise<AlisuReply | null> {
  // Detect assistant-prefill so we can prepend the brace back onto the response
  // when extracting JSON. The model's reply continues from `{` but its returned
  // content starts AFTER the prefill, so we have to splice it back together.
  const lastMsg = messages[messages.length - 1]
  const prefill = lastMsg?.role === 'assistant' ? lastMsg.content : ''

  const body: Record<string, unknown> = {
    model: 'sarvam-m',
    messages,
    max_tokens: maxTokens,
    temperature: 0.15,
    ...extra,
  }

  try {
    const res = await sarvamFetch('https://api.sarvam.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'api-subscription-key': process.env.SARVAM_API_KEY || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const errText = await res.text()
      // If Sarvam rejects an unknown param like reasoning_effort, retry once
      // without the extras so we don't fail the whole turn.
      if (res.status === 400 && Object.keys(extra).length > 0 && /reasoning|param|unknown/i.test(errText)) {
        console.warn('[LLM] dropping extra params (Sarvam rejected):', errText.slice(0, 200))
        return callSarvamReply(messages, maxTokens, {})
      }
      console.error('[LLM] getAlisuReply error:', res.status, errText)
      return null
    }

    const data = await res.json()
    const raw: string = data.choices?.[0]?.message?.content || ''
    const stitched = prefill + raw
    const jsonStr = extractJsonString(stitched)
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
