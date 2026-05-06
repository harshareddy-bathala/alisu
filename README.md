# Alisu — Verify Before You Serve

> AI voice assistant for Karnataka's 1092 citizen helpline — understands Kannada, Hindi & English, files complaints, routes to departments, and gives every citizen a reference number.

---

## What Alisu Does

Citizens call the Karnataka 1092 helpline and speak in their own language. Alisu listens, understands the issue, asks only for what's missing, restates what it heard for confirmation, files a complaint with a unique ID, and tells the citizen which department will follow up and when. Every call is transcribed, translated, and stored for human agent review. One environment variable connects a real Indian phone number — everything else stays identical.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  AUDIO / TELEPHONY LAYER                                        │
│                                                                 │
│  Browser (test)           Twilio / Exotel (prod)                │
│  AudioEngine 48kHz        mulaw 8kHz                           │
│  → downsample 16kHz       → MuLaw.decode → upsample 16kHz      │
│  → PCM16 binary WS        → PCM16 binary                       │
└──────────────────────┬──────────────────────────────────────────┘
                       │ PCM16 @ 16kHz
┌──────────────────────▼──────────────────────────────────────────┐
│  INTELLIGENCE LAYER                                             │
│                                                                 │
│  SarvamStreamingASR  ──── RMS silence detection (800ms)         │
│  saaras:v3                → transcript + language_code          │
│                                    │                            │
│  ConversationEngine  ◄─────────────┘                            │
│  5-step flow:              Greet → Gather → Confirm →           │
│  sarvam-m (LLM)            Note/Resolve → Close                 │
│                                    │                            │
│  SarvamTTS bulbul:v3  ◄────────────┘ reply in detected language │
│  → WAV PCM16 16kHz         ┌────────────────────────────────┐   │
│  → binary over WS ─────────► Browser AudioContext play      │   │
│  → mulaw 8kHz JSON ────────► Twilio media event             │   │
└──────────────────────┬──────────────────────────────────────────┘
                       │ WebSocket CALL_UPDATE / COMPLAINT_CREATED
┌──────────────────────▼──────────────────────────────────────────┐
│  DASHBOARD LAYER                                                │
│                                                                 │
│  React + Vite (dark UI)                                         │
│  Live Calls  │  Complaints  │  Transcripts                      │
│  VoiceAnimation  CallOverlay  TranscriptPanel (dual-column)     │
│  Real-time via /dashboard-ws WebSocket                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Complete Call Flow

1. **Citizen dials** 1092 → Twilio/Exotel webhook hits `POST /incoming-call`
2. **Server** creates call state, returns TwiML that opens a Media Stream WebSocket
3. **Twilio streams** mulaw 8kHz audio → server decodes → upsamples to PCM16 16kHz
4. **SarvamStreamingASR** buffers PCM chunks, detects silence (800ms after speech), fires REST call to `saaras:v3`
5. **ASR returns** transcript + `language_code` (kn-IN / hi-IN / en-IN)
6. **ConversationEngine** passes full history + context to `sarvam-m` LLM
7. **LLM returns** JSON: reply text in detected language (proper Unicode script), step, department, urgency, sentiment, complaintData
8. **SarvamTTS** `bulbul:v3` synthesizes speech → WAV PCM16 16kHz saved to `/tmp`
9. **Server** sends WAV → TwilioProxy converts to mulaw 8kHz → Twilio media event → citizen hears Alisu
10. **After estimated duration**, server sets status `active`, ASR resumes
11. **When citizen confirms**, complaint is filed: `complaintStore.create()` + `COMPLAINT_CREATED` broadcast
12. **Dashboard** receives WebSocket event, complaint card appears in real time

---

## Conversation Flow

```
GREET     Namaskara! I'm Alisu, Karnataka 1092 helpline. Tell me your issue.
  │
GATHER    Listen → extract what's present → ask only for what's missing
  │       Max 2 follow-up questions (location, nature of problem)
  │
CONFIRM   Restate: "ನಿಮ್ಮ ಕಂಪ್ಲೇಂಟ್: [issue], [location], [dept]. ಇದು ಸರಿ ಇದೆಯಾ?"
  │       Yes → resolve   No → gather again
  │
RESOLVE   "ನಿಮ್ಮ ಕಂಪ್ಲೇಂಟ್ ನೋಂದಾಯಿಸಲಾಗಿದೆ. ರೆಫರೆನ್ಸ್: ALU-20250505-7823."
  │       File complaint, ask if there's another issue
  │
CLOSE     "ಧನ್ಯವಾದಗಳು. ಶುಭ ದಿನ." — set shouldClose: true
```

**Human Transfer:** Citizen says "agent beku" / "manuShyaru bEku" / "insaan chahiye" → Alisu connects to department conference.

**Prank / Irrelevant:**
- Exchange 1–2: gentle redirect
- Exchange 3+: "Dhanyavaadagalu. Helpline close maaduttene." — hangup

---

## Sentiment Behavior

| Sentiment   | What Alisu Does Differently |
|-------------|----------------------------|
| calm        | Normal flow, 2-3 sentence responses |
| frustrated  | Shorter, more direct responses; skips small talk |
| urgent      | Skips gather loop if enough context; prioritizes filing |
| distressed  | Immediately offers human transfer; sets priority=critical |
| confused    | Asks simpler, one-question-at-a-time clarifications |

---

## Complaint Lifecycle

**ID Format:** `ALU-YYYYMMDD-XXXX` (generated once at confirm step, `crypto.randomInt(1000, 9999)`)

**Fields:** id, callSid, status, priority, department, issueSummary, location, requestedAction, fullDescription, language, callerNumber, createdAt, statusHistory

**Status progression:** `Draft` → `Filed` → `In Progress` → `Resolved`

**Priority tagging:**
- `critical` — injury, blood, fire in progress, crime happening now
- `high` — service down 24h+, multiple people affected
- `medium` — ongoing first report
- `low` — inquiry / informational

---

## Real-Time Translation

Every transcript entry shows **two columns simultaneously**:

| Original (Citizen's language) | Translated (Agent's chosen language) |
|-------------------------------|--------------------------------------|
| ರಸ್ತೆಯಲ್ಲಿ ದೊಡ್ಡ ಹಳ್ಳ ಇದೆ      | There is a large pothole on the road |

- Language selector (Kannada / Hindi / English) persists in `localStorage`
- Translation calls `POST /translate` → Sarvam translate API asynchronously — original text shows immediately
- If detected language = target language, no API call is made

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite 5, TypeScript, Tailwind CSS (dark theme) |
| Server | Fastify 4, TypeScript, Node 18+ |
| ASR | Sarvam `saaras:v3` (auto language detection) |
| LLM | Sarvam `sarvam-m` (conversation intelligence) |
| TTS | Sarvam `bulbul:v3` (multilingual, Indian voices) |
| Translation | Sarvam translate API |
| Telephony | Twilio Media Streams (Exotel stub ready) |
| Database | In-memory (Map) — PostgreSQL adapter ready |

---

## Prerequisites

- Node.js 18+
- Sarvam AI API key — [console.sarvam.ai](https://console.sarvam.ai)
- ngrok account + authtoken (for Twilio webhook tunnel)
- Twilio account (optional, for real phone calls)

---

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SARVAM_API_KEY` | Sarvam AI API key | **Yes** |
| `TELEPHONY_PROVIDER` | `local` (browser test) or `twilio` | **Yes** |
| `PORT` | Server port (default: 3000) | No |
| `PUBLIC_URL` | Public HTTPS URL (ngrok for dev) | Twilio only |
| `TWILIO_ACCOUNT_SID` | Twilio account SID | Twilio only |
| `TWILIO_AUTH_TOKEN` | Twilio auth token | Twilio only |
| `TWILIO_NUMBER` | Twilio phone number (+91…) | Twilio only |
| `NGROK_AUTHTOKEN` | ngrok auth token | Twilio dev only |
| `NGROK_DOMAIN` | Fixed ngrok domain (optional) | No |
| `DEPT_BBMP` | BBMP department phone number | No |
| `DEPT_POLICE` | Police department number | No |
| `DEPT_ELECTRICITY` | BESCOM number | No |
| `DEPT_WATER` | BWSSB number | No |
| `DEPT_REVENUE` | Revenue department number | No |
| `DEPT_HEALTH` | Health department number | No |
| `DEPT_FIRE` | Fire department number | No |
| `DEPT_LABOUR` | Labour department number | No |
| `DEPT_TRANSPORT` | Transport/RTO number | No |

---

## Installation

```bash
# Clone and install
git clone <repo>
cd alisu
npm install
cd apps/server && npm install
cd ../dashboard && npm install
cd ../..

# Configure
cp .env.example .env
# Fill in SARVAM_API_KEY and TELEPHONY_PROVIDER=local
```

---

## Running in Test Mode (Browser)

This uses your browser microphone — no phone or Twilio needed.

```bash
# Terminal 1 — Server
cd apps/server
npm run dev

# Terminal 2 — Dashboard
cd apps/dashboard
npm run dev
```

Open `http://localhost:5173`

1. You should see **Connected** (green dot) in the header
2. Click the **● TEST** button at bottom-left → **Simulate Call**
3. The full-screen voice overlay appears — speak naturally in Kannada, Hindi, or English
4. Alisu greets in Kannada, then responds in your language
5. State the issue, answer Alisu's follow-up, say "houdu" to confirm
6. Complaint card appears in the **Complaints** tab with reference ID
7. Click the complaint to view full transcript with side-by-side translation
8. Click **● TEST** → **End Call** or the red button in the overlay

---

## Connecting a Real Phone (Twilio)

```bash
# 1. Install ngrok and set authtoken
ngrok config add-authtoken <your-token>

# 2. Start server
cd apps/server && npm run dev

# 3. Expose it
ngrok http 3000

# 4. Update .env
PUBLIC_URL=https://xxxx.ngrok.io
TELEPHONY_PROVIDER=twilio
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_NUMBER=+91xxxxxxxxxx

# 5. Set Twilio webhook
# Console → Phone Numbers → your number → Voice → Webhook
# Method: POST, URL: https://xxxx.ngrok.io/incoming-call

# 6. Call your Twilio number
```

**Exotel:** Email `hello@exotel.com` with subject "Enable Voicebot/Stream Applet for Account SID: `<your-sid>`". Once enabled, set `TELEPHONY_PROVIDER=exotel` and configure the Stream applet in the Exotel flow builder to point to `wss://PUBLIC_URL/media-stream`.

---

## Demo Scenarios

### Scenario 1 — Road complaint in Kannada
Citizen speaks: "Nanna mane hatra doddha halla ide, auto kuda hogtilla" (There's a big pothole near my house, even autos can't pass)
- Alisu detects Kannada, asks for location
- Citizen says "Koramangala 5th block"
- Alisu confirms: "ಕೋರಮಂಗಲ 5ನೇ ಬ್�ಾಕ್‌ನಲ್ಲಿ ರಸ್ತೆ ಹಳ್ಳ. ಇದು ಸರಿ ಇದೆಯಾ?"
- Citizen says "houdu" → complaint filed → `ALU-YYYYMMDD-XXXX`
- Dashboard: BBMP complaint card appears, priority medium

### Scenario 2 — Distressed caller
Citizen speaks urgently: "Please help, mera ghar mein aag lag gayi" (Please help, my house is on fire)
- Alisu detects distress/critical urgency immediately
- Skips gather loop, offers human connection
- Priority: critical, sentiment: distressed — red on dashboard

### Scenario 3 — Human transfer request
Citizen: "Nana manuShyaru jothe maatanaaDabeku" (I want to talk to a person)
- Alisu acknowledges: "ನಿಮ್ಮನ್ನು ಸಂಬಂಧಿತ ಇಲಾಖೆ ಏಜೆಂಟ್‌ಗೆ ಸಂಪರ್ಕಿಸುತ್ತಿದ್ದೇನೆ."
- If `DEPT_*` number configured: real Twilio conference transfer
- If not: "ಏಜೆಂಟ್ ನಿಮ್ಮನ್ನು ಕರೆ ಮಾಡುತ್ತಾರೆ." — complaint noted with HUMAN_REQUESTED

---

## API Reference

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/incoming-call` | Twilio/Exotel webhook — returns TwiML |
| `WS` | `/media-stream` | Bidirectional audio stream (browser + telephony) |
| `WS` | `/dashboard-ws` | Real-time call/complaint updates to dashboard |
| `GET` | `/api/complaints` | List complaints (filters: status, priority, dept, search, dateFrom, dateTo) |
| `GET` | `/api/complaints/:id` | Single complaint |
| `PATCH` | `/api/complaints/:id` | Update complaint fields |
| `POST` | `/api/complaints/:id/resolve` | Mark resolved with notes |
| `DELETE` | `/api/complaints/:id` | Soft delete |
| `GET` | `/api/transcripts` | List all calls |
| `GET` | `/api/transcripts/:callSid` | Single call with full history |
| `DELETE` | `/api/transcripts/:callSid` | Soft delete |
| `GET` | `/api/transcripts/:callSid/export` | Download as .txt |
| `POST` | `/translate` | Proxy to Sarvam translate API |
| `GET` | `/health` | Health check |

---

## Complaint Management for Human Agents

1. Open **Complaints** tab → see all filed complaints sorted by recency
2. Filter by status, priority, department, date range, or search text
3. Click any card → detail panel slides in from the right
4. Edit issue summary, location, requested action, description inline → **Save Changes**
5. Move status: Draft → Filed → In Progress → Resolved (with optional notes)
6. View the full call transcript with side-by-side translation for audit
7. Delete if spam — soft delete, does not remove from server permanently

---

## Deployment on DigitalOcean

```bash
# 1. Create a Droplet — Ubuntu 22.04, 2GB RAM minimum
# 2. Install Node 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. Clone and build
git clone <repo> /opt/alisu && cd /opt/alisu
npm install && cd apps/server && npm install && cd ../dashboard && npm install
npm run build  # builds dashboard to dist/

# 4. Serve dashboard static files via nginx
# Configure nginx to proxy /api/* and /media-stream WS to :3000
# Serve dashboard dist/ for all other routes

# 5. Set environment variables in /opt/alisu/.env
# PUBLIC_URL=https://your-droplet-ip-or-domain
# TELEPHONY_PROVIDER=twilio

# 6. Run server with PM2
npm install -g pm2
cd /opt/alisu/apps/server
pm2 start "npm run start" --name alisu-server
pm2 save && pm2 startup

# 7. SSL via Let's Encrypt
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

*Built for AI for Bharat 2025 · Powered by Sarvam AI*
