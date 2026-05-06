# Alisu — Demo Script (5 Minutes)

## Stage Setup (Do Before Presenting)

- [ ] Dashboard open on laptop at `http://localhost:5173`, mirrored to projector
- [ ] Server running (`cd apps/server && npm run dev`)
- [ ] **Connected** green dot visible in header
- [ ] Browser mic permission already granted (test once, don't grant during demo)
- [ ] Laptop speakers ON and volume at ~70%
- [ ] TEST controls at bottom-left — confirm collapsed (just the yellow ● TEST button)
- [ ] Complaints tab empty (fresh server restart if needed)
- [ ] If Twilio: one phone set to DEPT_BBMP number and on silent → sound on for demo moment

---

## Timing Overview

| Segment | Duration | Cumulative |
|---------|----------|-----------|
| Opening — problem statement | 0:30 | 0:30 |
| Scenario 1 — Kannada road complaint | 1:30 | 2:00 |
| Scenario 2 — Distressed caller | 0:30 | 2:30 |
| Scenario 3 — Human transfer | 1:00 | 3:30 |
| Translation demo | 0:30 | 4:00 |
| Closing — complaints audit trail | 0:30 | 4:30 |
| Buffer / Q&A handoff | 0:30 | 5:00 |

---

## Script

### Opening — 30 seconds

> "The 1092 helpline receives thousands of calls daily. But most citizens speak Kannada, Hindi, or their mother tongue — and the agents who pick up often don't. Complaints get lost in translation. Issues go unrecorded. Accountability disappears.
>
> Alisu fixes that. It's a voice AI that listens in any language, understands the complaint, confirms it back, and gives every citizen a reference number — in real time. Let me show you."

---

### Scenario 1 — Voice Complaint in Kannada — 90 seconds

**Action:** Click **● TEST** → **Simulate Call**

The full-screen voice overlay appears. Alisu's breathing orb pulses as it plays the Kannada greeting from the laptop speakers.

> *[Wait for greeting to finish — you'll hear "ನಮಸ್ಕಾರ! ನಾನು ಅಲಿಸು..."]*

**Speak into mic, normal conversational pace:**
> "Nanna mane hatra, Koramangala 5th block alli, doddha halla ide. Auto kuda hogtilla."

**Point to dashboard while Alisu responds:**
> "Watch the transcript build in real time. Language detected: Kannada. Silence detection fired, ASR transcribed."

*Alisu responds, asking for confirmation or filing the complaint.*

**If Alisu asks a follow-up:** Answer it.

**When Alisu confirms the complaint, say:**
> "houdu" (yes)

**Point to Complaints tab:**
> "Complaint card appeared — ALU-YYYYMMDD-XXXX. Department: BBMP. Priority: Medium. The citizen heard a reference number. The agent sees it in the dashboard."

---

### Scenario 2 — Distressed Caller — 30 seconds

**Action:** Click **● TEST** → **End Call** → **Simulate Call** again

**Speak with urgency:**
> "Emergency! Nanna mane alli beetha! Help me!"

**Point to dashboard:**
> "Sentiment: Distressed. Priority: Critical. Red. Alisu detects panic immediately and offers human connection — no gather loop, no 3-step form. It knows when to skip the process."

---

### Scenario 3 — Human Transfer — 60 seconds

**Action:** End call → Start new call

**Speak a normal complaint first, then:**
> "Nana manuShyaru jothe maatanaaDabeku"

*Alisu responds: "ನಿಮ್ಮನ್ನು ಸಂಬಂಧಿತ ಇಲಾಖೆ ಏಜೆಂಟ್‌ಗೆ ಸಂಪರ್ಕಿಸುತ್ತಿದ್ದೇನೆ."*

**If Twilio is connected and DEPT phone is in the room:**
> "And now — the phone in this room rings. That's the actual department getting connected. One environment variable."

**If Twilio not connected:**
> "In production, one environment variable — a phone number — triggers a real conference call to the department. For the demo we're in browser mode, so the complaint is noted and an agent will call back."

---

### Translation Demo — 30 seconds

**Action:** End call → Click **Complaints** tab → Open a complaint → Look at the transcript panel

> "Every call is transcribed and translated side by side. Kannada on the left, English on the right — automatically. Change the language..."

**Change dropdown to Hindi:**
> "...now it's Hindi. Human agents can read every call in their own language. Nothing is lost in translation."

---

### Closing — 30 seconds

**Action:** Show Complaints tab with filed cards

> "Every call is auditable. Every complaint is traceable. Human agents review, update status, add resolution notes. The citizen's reference number links directly back to this record.
>
> Alisu doesn't replace the 1092 helpline. It makes every call count."

---

## Backup Plan

If the live demo fails (mic permission, network, server crash):

1. **Pre-recorded video:** Record a 2-minute screen recording of a full Kannada complaint call with the overlay, transcript, and complaint card appearing. Keep it at `demo-backup.mp4` on the desktop.
2. **Static screenshots:** Complaint card, dual-column transcript, call overlay — in a slide backup.
3. **Explain the architecture** using the ASCII diagram from README.md if all else fails.

---

## 6 Questions the Jury Will Ask

**Q1: How does it handle background noise / bad audio quality?**
> Sarvam's `saaras:v3` is trained on Indian telephony audio — it handles noise, accents, and low-bitrate mulaw 8kHz well. The RMS silence detection threshold (0.015) is tuned for real-world audio, not studio quality.

**Q2: What happens if the citizen interrupts Alisu mid-sentence?**
> The server sets status to `speaking` while playing audio. ASR still receives audio but `processUserUtterance` returns early. After Alisu finishes (timed estimate), the system resumes listening. Interruption handling is a planned improvement.

**Q3: How is data privacy handled?**
> All data stays on-premise (in-memory on your server, or your own PostgreSQL). Audio is sent to Sarvam's API for processing — same as any cloud ASR service. No audio is stored after transcription. Complaint data is only on your server.

**Q4: Can it handle multiple simultaneous calls?**
> Yes — each WebSocket connection gets its own `SarvamStreamingASR` instance, own call state in `callStore`, and own conversation history. The dashboard renders all live call cards simultaneously.

**Q5: How does it scale to real call volumes?**
> Currently in-memory — for production, replace `callStore` and `complaintStore` with PostgreSQL (the interface is already abstracted). Add a Redis pub/sub layer for the WebSocket broadcast to scale horizontally.

**Q6: Why Sarvam over OpenAI / Google?**
> Sarvam is purpose-built for Indian languages — `saaras:v3` handles Kannada code-switching, Indian accents, and low-quality telephony audio that general models struggle with. `bulbul:v3` produces natural-sounding Indian voices. It's the difference between "AI speaking" and actual Kannada.

---

*Alisu — Karnataka 1092 · AI for Bharat 2025*
