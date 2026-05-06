# Alisu — Claude Code Build Prompts (Corrected)
# Paste one prompt at a time into Claude Code. Verify each works before next.

---

## PROMPT 1 — Full audit

Read the entire codebase in apps/server/src/ and apps/dashboard/src/ thoroughly.

Report:
- Every file and what it currently does
- What is fully implemented vs stub
- All TypeScript errors and broken imports
- Missing npm dependencies
- What currently works end to end

Then fix all TypeScript errors without adding new features.
Run npm run dev in apps/server and report the exact startup output.

---

## PROMPT 2 — Fix audio pipeline (the root cause of no Alisu response)

The system transcribes user speech correctly but Alisu never responds.
Fix the complete audio round-trip.

PART A — Audio capture fixes in apps/dashboard/src/lib/audio-engine.ts:

AudioContext must be at 48000Hz (browser native).
Add a downsample function converting Float32 48kHz to 16kHz by averaging.
In ScriptProcessor onaudioprocess:
  - Downsample from 48000 to 16000
  - Convert to Int16 PCM
  - Send over WebSocket as binary ArrayBuffer
  - Also calculate RMS of the chunk and send as JSON: { type: 'amplitude', value: 0-1 }
Only send audio when isCapturing is true.
On call start, send: { type: 'audio_config', sampleRate: 16000, channels: 1 }

PART B — Silence detection in apps/server/src/services/sarvam-asr.ts:

Remove any fixed setTimeout buffer entirely.
Implement RMS-based silence detection:
  - SILENCE_THRESHOLD: 0.015
  - SILENCE_DURATION: 800ms of silence after speech fires transcription
  - MIN_SPEECH: 300ms minimum before firing
  - MAX_SPEECH: 8000ms force-fire
  - After firing, clear buffer and restart — this loop must continue forever
Sarvam ASR call: model saaras:v3, language_code unknown, mode transcribe
Response has both transcript and language_code — capture both, pass language back to callStore

PART C — Greeting on connect in apps/server/src/services/conversation-engine.ts:

In startCall(), immediately after creating call state:
  1. Set status to speaking
  2. Call synthesizeSpeech with the greeting text in Kannada
  3. Send { type: 'audio_meta', text: greetingText, language: 'kn', isGreeting: true } over socket
  4. Send the raw WAV Buffer as binary over the same socket
  5. Calculate estimated duration: word count times 380ms plus 600ms buffer
  6. After that duration, send { type: 'resume_listening' } and set status to listening

Greeting text: "Namaskara! Naanu Alisu, Karnataka 1092 helpline ninda. Nimma hesaru mattu nimma samasye heLi, naanu sahaya maaduttene."

PART D — Response pipeline in conversation-engine.ts processUserUtterance():

After getting LLM response:
  1. Add Alisu reply to transcript
  2. Call synthesizeSpeech with reply text and detected language
  3. If TTS returns null: send { type: 'text_only', text: reply } — call continues
  4. If TTS returns buffer: send audio_meta then binary buffer
  5. After estimated duration send resume_listening
  6. Update status to listening, broadcast to dashboard

PART E — Browser audio playback in apps/dashboard/src/lib/call-socket.ts:

On receiving JSON message with type audio_meta: store pendingMeta, pause mic capture
On receiving next binary ArrayBuffer: this is the audio
  - Create AudioContext if needed
  - Call decodeAudioData on the ArrayBuffer
  - Create BufferSourceNode, connect to destination, start
  - On source.onended: do nothing here — wait for resume_listening from server
On receiving { type: resume_listening }: resume mic capture, set status to listening
On receiving { type: text_only' }: show text in UI, resume listening immediately

---

## PROMPT 3 — Alisu conversation intelligence

Build the complete intelligent conversation behavior.

THE CONVERSATION FLOW Alisu must follow:

Step 1 GREET: "Namaskara! Naanu Alisu, Karnataka 1092 helpline ninda. Nimma hesaru mattu samasye heLi."

Step 2 GATHER: Listen to citizen. Extract what's present. Ask only for what's missing, one question at a time:
  - If location not mentioned: ask which area or address
  - If nature of issue unclear: ask to describe the problem
  - If urgency unclear from context: ask if this is urgent or ongoing
  Never ask more than 2 follow-up questions total.

Step 3 CONFIRM: Once enough info is gathered, Alisu restates what it understood:
  "Nimma complaint idu: [issue summary], [location], [department] sambandha. Idu sari ideyaa?"
  Wait for yes/no.
  If no: ask what was wrong and gather again.
  If yes: proceed to Step 4.

Step 4 RESOLVE OR NOTE:
  If issue can be informationally resolved (outage report, status check, simple query):
    Provide the information. Ask if that helps.
    Still note it as a completed interaction linked to call.
  
  If issue requires departmental action (road repair, water supply failure, etc.):
    Say: "Nimma complaint note maadiddene. Reference number: ALU-YYYYMMDD-XXXX.
    Sambandha department noduttaare mattu [2-3 business days] alli nimmannu samparke maaduttaare."
    Mark complaint priority based on urgency field.
    Save to database.

Step 5 CLOSE: "Bere yaavude samasye ideyaa?" (Do you have any other issue?)
  If yes: restart from Step 2 for new issue
  If no: "Dhanyavaadagalu. Nimma complaint reference ALU-XXXXXXXX. Have a good day."
  Close call gracefully.

HUMAN TRANSFER:
  If citizen says they want a human (detect: "manuShyaru bEku", "human beku", "agent beku", "real person"):
    Alisu: "Nimmannu sambandha department agent ge connect maaduttene."
    Check if TELEPHONY_PROVIDER is set and department number exists in env:
      If yes: trigger real call transfer via telephony adapter
      If no: say "Ippottige direct connection available illa. Nimma complaint note maadiddene,
              agent nimmannu [timeframe] alli call maaduttaare." Note complaint with HUMAN_REQUESTED flag.

UNWANTED CALLS (prank, wrong number, irrelevant):
  First exchange: "Idhu Karnataka sarkar 1092 helpline. Nimma sarkaari samasye bagge help maadabahudu."
  Second exchange: Same gentle redirect.
  Third exchange: "Dhanyavaadagalu. Helpline close maaduttene." End call.
  Log as IRRELEVANT status.

LLM SYSTEM PROMPT must include all of the above behavioral rules plus:
  - Always respond in the citizen's language (Kannada if they speak Kannada, Hindi if Hindi, English if English)
  - Use conversational spoken Kannada, not textbook formal
  - Maximum 2-3 sentences per response — this is a voice call
  - Track conversationStep: gather, confirm, resolve, close
  - Return JSON: reply, language, department, urgency (low/medium/high/critical),
    sentiment (calm/frustrated/urgent/distressed/confused), needsHuman, transferDepartment,
    conversationStep, complaintData (null or object with issueSummary, location,
    requestedAction, fullDescription), complaintId (null until confirmed),
    isResolved, shouldClose, shouldHangup (only for prank/wrong number after 3 exchanges),
    missingInfo (array of what still needs to be asked)

COMPLAINT ID GENERATION:
  Format: ALU-YYYYMMDD-XXXX where XXXX is crypto.randomInt(1000, 9999)
  Generate only once per complaint, when citizen confirms in Step 3
  Store in call state and include in all subsequent Alisu messages for that complaint

PRIORITY TAGGING:
  critical: mentions injury, blood, emergency, danger, fire, crime in progress
  high: service down more than 24 hours, affecting multiple people
  medium: ongoing issue, first report
  low: inquiry, informational, already partially resolved

---

## PROMPT 4 — Real-time translation panel

Add side-by-side real-time translation in the dashboard transcript view.

Each transcript entry currently shows the spoken text. Change this to show:
  Left column: original language text (what was spoken — Kannada, Hindi, or English)
  Right column: translated version in selected target language

Translation target language selector: dropdown with Kannada, Hindi, English — persists in localStorage.

When a new transcript entry arrives from the server:
  If the entry language matches the selected target: right column shows the same text, no API call needed
  If different: call Sarvam translate API to get translation, show loading shimmer then populate

Sarvam translate API:
  POST https://api.sarvam.ai/translate
  Header: api-subscription-key: SARVAM_API_KEY
  Body: { input: text, source_language_code: detected language, target_language_code: selected }
  Language codes: kn-IN for Kannada, hi-IN for Hindi, en-IN for English
  Response: { translated_text: string }

Translation happens for every entry in real time as it arrives during the call.
For entries in call history, translate on demand when user opens the call detail.

Layout in transcript panel:
  Header row: "Original ([detected language])" | Language selector dropdown
  Each entry bubble:
    Role indicator (Citizen / Alisu) + timestamp
    Original text on left half
    Vertical divider line
    Translated text on right half (or loading shimmer)
  Alisu entries are always in the citizen's language — translation shows English equivalent
  User entries may be Kannada — translation shows selected target language

This must work in real time during a live call without blocking the audio pipeline.
Run translate calls asynchronously — don't await them before showing original text.

---

## PROMPT 5 — Complaints and transcripts management pages

Build a complete complaints and transcripts management section in the dashboard.

COMPLAINTS PAGE — route /complaints or a tab in the main dashboard:

Header: "Complaints" with count badge and filter controls
Filters: status (All, Draft, Filed, In Progress, Resolved), priority (All, Critical, High, Medium, Low), department (All + each department name), date range
Search: searches issue summary and description text

Complaint card shows:
  Large complaint ID in monospace: ALU-20250516-7823
  Priority badge with color: critical=red pulsing, high=orange, medium=amber, low=gray
  Department badge
  Issue summary (one line)
  Location if available
  Citizen's spoken language
  Call timestamp and duration
  Status selector (editable inline)
  "View full transcript" link

Complaint detail slide-in panel (from right):
  Complaint ID + copy button
  All complaint fields editable: issue summary, full description, location, requested action
  Priority selector
  Status timeline: Draft → Filed → In Progress → Resolved with timestamps
  Linked call information: call SID, duration, timestamp
  Full transcript below (with translation panel — same as live call view)
  Resolve button: marks resolved, sets resolved_at, asks for resolution notes
  Delete button with confirmation

TRANSCRIPTS PAGE — route /transcripts or a tab:

Lists all calls ordered by most recent
Each row: call SID (shortened), timestamp, duration, language, department detected, sentiment, complaint ID if any, status
Click to expand: shows full dual-column transcript with translation
Delete button: soft-delete, asks confirmation
Export button: downloads transcript as formatted text file

REAL-TIME UPDATE:
When a live call ends and has a complaint, the complaint appears in the list immediately via WebSocket
Complaints page listens to a separate WebSocket event: COMPLAINT_CREATED with complaint data

DATABASE QUERIES needed:
  getComplaints(filters) — paginated, filtered
  getComplaintById(id) — with linked call and full transcript
  updateComplaint(id, fields) — any editable fields
  resolveComplaint(id, notes) — sets status and resolved_at
  deleteCall(callSid) — soft delete
  getTranscripts(filters) — paginated list of calls
  searchTranscripts(query) — full text search on transcript JSONB

---

## PROMPT 6 — Voice animation and UI refactor

Completely refactor the UI to be sleek, minimal, and premium.
Reference: Claude voice mode, ChatGPT voice mode, Perplexity voice.

DESIGN SYSTEM:
  Background: #080C14 (near-black with blue tint)
  Surface: #0F1520 (card backgrounds)
  Border: #1E2D40 (subtle borders)
  Text primary: #F0F4FF
  Text secondary: #6B7A99
  Accent Alisu: #5B6EF5 (indigo)
  Accent user: #10B981 (emerald)
  Accent alert: #EF4444 (red)
  Accent warning: #F59E0B (amber)
  Font: Geist (import from Google Fonts or use system fallback Geist, then Inter)
  Mono font: Geist Mono for IDs, transcripts, code

VOICE ANIMATION COMPONENT — VoiceAnimation.tsx — this is the centerpiece:

State can be: idle, user_speaking, alisu_speaking, processing, error

idle state:
  A single small circle (24px) with a subtle pulse animation (opacity 0.4 to 0.7, 3s ease)
  Color: text-secondary

user_speaking state:
  5 vertical bars in a row, each 4px wide, 8px gap between them
  Heights animate independently based on amplitude value (0-1) passed as prop
  Bar heights: min 20%, max 100% of 48px container
  Each bar uses a different animation-delay (0, 80, 160, 240, 320ms) for organic feel
  Color: accent-user (emerald)
  Transition: CSS transition height 80ms ease on each bar
  When amplitude prop changes, bars respond immediately

alisu_speaking state:
  A single circle, 80px diameter
  Background: radial gradient from accent-alisu to transparent
  Animation: scale pulses from 0.85 to 1.15 over 1.4s ease-in-out, infinite
  A second outer ring: 120px, border 1px accent-alisu at 30% opacity, scale 1 to 1.4, fade out, 2s infinite
  Blur: filter blur(0px) on inner, blur(4px) on outer ring
  This creates the breathing orb effect

processing state:
  Three dots in a row, each 8px
  Animation: each dot scales from 1 to 1.4 and back, staggered by 160ms
  Color: text-secondary

Transition between states: CSS transition on opacity 300ms, scale 300ms

CALL INTERFACE — full screen overlay when call is active:

Background: #080C14 at 98% opacity, backdrop-filter blur 20px
Layout: three sections top to bottom

TOP SECTION (20% height):
  Status text: current state in small caps, tracking-widest
  "LISTENING" in emerald, "PROCESSING" in amber, "ALISU IS SPEAKING" in indigo
  Fade in/out on state change with opacity transition

MIDDLE SECTION (50% height):
  VoiceAnimation component, centered, large
  Below it: detected language badge (KN / HI / EN) with small flag emoji

BOTTOM SECTION (30% height):
  Last 3 conversation bubbles, most recent at bottom
  User bubbles: right-aligned, background #1A2540, text white, border-radius 16px 16px 4px 16px
  Alisu bubbles: left-aligned, background #1A1F40 with left border 2px solid accent-alisu
  Each bubble fades in from bottom (translateY 20px to 0, opacity 0 to 1, 300ms)
  Bubbles are truncated to 2 lines with ellipsis if longer

BOTTOM BAR:
  Centered red circular end call button, 64px, phone-down icon
  Small text below: "Tap to end call"

MAIN DASHBOARD (when no active call):

Header bar:
  Left: "Alisu" in large weight, "1092 Helpline" in secondary
  Right: WebSocket status dot + label, "Start Call" button (only shows in test mode)

Stats row (4 cards, equal width):
  Active Calls, Completed Today, Complaints Filed, Avg Handle Time
  Each: large number, small label, subtle card background
  Numbers animate from 0 on mount

Main content: two-column layout on large screens
  Left (60%): Live calls grid + History/Transcripts tabs below
  Right (40%): Complaint detail panel (slides in when complaint selected)

Live call cards:
  Dark surface background, subtle border
  Top row: caller indicator, language badge, elapsed timer (ticking live)
  Status pill: LISTENING (emerald), PROCESSING (amber), SPEAKING (indigo), ESCALATED (red)
  Sentiment emoji + label: 😌 Calm, 😤 Frustrated, ⚡ Urgent, 🚨 Distressed
  Department badge
  Transcript section: scrolling, monospace, shows last 4 entries
  Priority badge if complaint exists
  Complaint ID in monospace if generated
  Footer: Transfer button, End Call button

ANIMATIONS:
  Page load: header fades in at 0ms, stats at 200ms, grid at 400ms (animation-delay)
  New call card: slides up from below with opacity 0 to 1, 400ms ease-out
  Status pill changes: cross-fade, 200ms
  Complaint ID appears: character-by-character typewriter using CSS steps()
  Stats numbers: count up animation using CSS custom property and @property
  Card removal: shrinks height to 0 with overflow hidden, 300ms

TEST CONTROLS PANEL (VITE_TEST_MODE=true):
  Fixed position, bottom-left, NOT top-left (keeps top-left clean)
  Small collapsed button by default: yellow dot + "TEST"
  Click to expand: shows Simulate Call, transcript input, Yes/No/End buttons
  Stays small and out of the way

---

## PROMPT 7 — Telephony readiness and multi-call

Ensure telephony is properly abstracted and system handles multiple simultaneous calls.

TWILIO ADAPTER — complete the implementation:

/incoming-call POST route:
  Uses telephony.handleIncomingCall() which returns TwiML
  TwiML opens a Media Stream WebSocket to wss://PUBLIC_URL/twilio-stream
  Saves call to callStore before returning TwiML

/twilio-stream WebSocket route:
  On message event start: extract callSid and streamSid, store mapping
  On message event media: extract base64 mulaw audio payload
    Decode base64 to Buffer
    Convert mulaw 8kHz to PCM16 16kHz using alawmulaw MuLaw.decode() then resample
    Pass PCM16 to the same SarvamStreamingASR as browser calls
  On message event stop: end call cleanly

Outbound audio (Alisu speaking to Twilio caller):
  Twilio Media Streams supports bidirectional audio
  When sending audio back: convert PCM16 16kHz to mulaw 8kHz, base64 encode
  Send JSON over same WebSocket: { event: "media", streamSid: streamSid, media: { payload: base64mulaw } }
  After audio, send mark event: { event: "mark", streamSid: streamSid, mark: { name: "response_end" } }

Transfer via Conference:
  escalateToHuman() creates a TwiML Conference room
  Puts citizen in conference, dials out to department number
  Dashboard shows TRANSFERRED status

EXOTEL ADAPTER STUB — complete all comments:
  Document exact Voicebot applet WebSocket message format
  Document audio format: PCM16, 8kHz, base64, 160-byte chunks (20ms at 8kHz)
  Document how to activate: email hello@exotel.com with Account SID
  All methods throw NotImplementedError with "Activate Exotel Voicebot applet first" message

MULTI-CALL HANDLING:
  Each WebSocket connection (browser or telephony) gets its own call SID
  Each call has its own SarvamStreamingASR instance
  Each call has its own conversation history in callStore
  broadcastCallUpdate sends only the changed call's data — not all calls
  Dashboard renders all live call cards simultaneously
  Test by creating 3 simultaneous test calls — verify independent state

DEPARTMENT ROUTING in departments.ts:
  Export typed array of department objects
  Each has: id, name, displayName, envVar, defaultNumber, description, keywords[]
  keywords help LLM classify correctly: ['road', 'pothole', 'garbage', 'footpath'] for BBMP
  getDepartmentNumber(name): reads from process.env using envVar, returns number or null
  If null and telephony not configured: return null (triggers "will call you back" message)

---

## PROMPT 8 — README, DEMO_SCRIPT, and final verification

Create README.md at repo root. Content must include:

1. Project name: Alisu — Verify Before You Serve
2. One-paragraph description of what Alisu does and the core problem it solves
3. Architecture diagram in ASCII showing three layers: Audio/Telephony, Intelligence, Dashboard
4. Complete call flow numbered steps from citizen speaking to complaint being noted
5. Conversation flow: Greet → Gather (ask only for missing info) → Confirm → Note/Resolve → Close
6. Sentiment behavior table: 5 states with what Alisu does differently for each
7. Complaint lifecycle: how ID is generated, what fields are stored, status progression
8. Translation feature: explain dual-column real-time transcript translation
9. Tech stack table: Frontend, Server, ASR, LLM, TTS, Database, Telephony
10. Prerequisites: Node 18+, Sarvam API key, ngrok, PostgreSQL optional
11. Complete environment variables table: variable name, description, required/optional
12. Installation steps: exact commands
13. Running in test mode: step by step using Test Controls panel — citizen speaks via browser mic, Alisu responds in voice, transcript shows with translation
14. Telephony connection: Twilio steps, Exotel steps (pending KYC)
15. Demo scenarios: 3 scenarios described as voice interactions, not typing
16. API reference table
17. How complaints are managed and verified by human agents
18. Deployment on DigitalOcean

Create DEMO_SCRIPT.md at repo root. Content must include:

Stage setup instructions:
  - Dashboard open on laptop, mirrored to screen
  - One phone set as DEPT_BBMP number in room
  - Test Controls collapsed at bottom-left
  - Browser mic permission already granted
  - Server running, green Connected dot visible

5-minute script with exact spoken words for presenter:

Opening (30 seconds): explain the misunderstanding problem, introduce Alisu

Scenario 1 — Voice complaint in Kannada (90 seconds):
  Click Start Call or use Test Controls to begin
  Presenter speaks into mic in Kannada: a road complaint with location
  Audience watches: Alisu greets in Kannada (audio plays from laptop speakers)
  Presenter speaks complaint naturally — fast, normal pace
  Dashboard shows: transcript building, language detected, silence detection fires
  Alisu asks follow-up for missing info (location or area)
  Presenter answers
  Alisu confirms: restates the issue, asks if correct
  Presenter says "houdu" (yes)
  Alisu: "Nimma complaint note maadiddene. Reference number ALU-..."
  Dashboard: complaint card appears with priority, ID, status Draft

Scenario 2 — Distressed caller (30 seconds):
  New test call
  Presenter speaks urgently with distress keywords
  Dashboard immediately shows Distressed sentiment, red
  Alisu offers human connection without the full gather loop

Scenario 3 — Human transfer (60 seconds):
  New test call, normal complaint
  Presenter says "nana manuShyaru jothe maatanaaDabeku"
  Alisu acknowledges and attempts transfer
  If phone in room rings: answer it — "This is the wow moment"
  If telephony not connected: Alisu says complaint noted, human will call back

Translation demo (30 seconds):
  Open complaints page or transcript view
  Show dual-column: Kannada original on left, English translation on right, real-time
  Change target language to Hindi — translation updates

Closing (30 seconds):
  Point to complaints page with notes and priorities
  "Every call is auditable. Every complaint is traceable. Human agents review and act."
  "One environment variable connects a real Indian phone number. Everything else stays identical."

Timing marks table for each moment
Backup plan: pre-recorded video if live demo fails
6 questions jury will ask with exact answers

Run complete integration test:
  1. Server starts with no TypeScript errors
  2. Dashboard loads, shows Connected
  3. Start a browser call — hear Alisu greet in Kannada within 3 seconds
  4. Speak a Kannada complaint — transcript appears, Alisu asks follow-up question
  5. Answer follow-up — Alisu confirms with restatement
  6. Say houdu — Alisu notes complaint, gives reference ID
  7. Complaint appears in complaints page with correct priority
  8. Say "do you have another" test — say no — call closes gracefully
  9. Call appears in transcripts page with dual-column translation
  10. Delete a transcript — confirm it disappears

Fix every step that fails. Log timing for each pipeline stage.