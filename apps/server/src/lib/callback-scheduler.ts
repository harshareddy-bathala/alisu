const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000  // UTC+5:30

function toIST(d: Date): Date {
  return new Date(d.getTime() + IST_OFFSET_MS)
}

const DAYS  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmt12(ist: Date): string {
  const h = ist.getUTCHours()
  const m = ist.getUTCMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12  = h % 12 || 12
  const mm   = m.toString().padStart(2, '0')
  const day  = DAYS[ist.getUTCDay()]
  const date = ist.getUTCDate()
  const mon  = MONTHS[ist.getUTCMonth()]
  return `${h12}:${mm} ${ampm} on ${day}, ${date} ${mon}`
}

function nextBusinessDayAt10am(from: Date): Date {
  const d = new Date(from)
  d.setUTCDate(d.getUTCDate() + 1)
  d.setUTCHours(10, 0, 0, 0)
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return d
}

/**
 * Returns a human-readable IST callback time string such as
 * "2:00 PM on Tuesday, 6 May".
 *
 * Logic (all times IST):
 *   Mon-Fri 09:00-14:00 → within 4 hours (same day)
 *   Mon-Fri 14:00-18:00 → next business day 10:00
 *   Weekends / after 18:00 → next business day 10:00
 */
export function getCallbackTime(): string {
  const ist = toIST(new Date())
  const hour = ist.getUTCHours()
  const day  = ist.getUTCDay()

  const isWeekday = day >= 1 && day <= 5

  if (isWeekday && hour >= 9 && hour < 14) {
    const cb = new Date(ist.getTime() + 4 * 60 * 60 * 1000)
    return fmt12(cb)
  }

  return fmt12(nextBusinessDayAt10am(ist))
}

/**
 * Generates a natural-language callback message in the citizen's language.
 */
export function callbackReply(
  language: 'kn' | 'hi' | 'en',
  department: string,
  callbackTime: string
): string {
  switch (language) {
    case 'kn':
      return `ಈ ಸಮಯದಲ್ಲಿ ${department} ಇಲಾಖೆ ಏಜೆಂಟ್ ಲಭ್ಯವಿಲ್ಲ. ನಿಮ್ಮ ಕಂಪ್ಲೇಂಟ್ ನೋಂದಾಯಿಸಲಾಗಿದೆ. ${callbackTime} ರ ವೇಳೆಗೆ ಏಜೆಂಟ್ ನಿಮ್ಮನ್ನು ಕರೆ ಮಾಡುತ್ತಾರೆ.`
    case 'hi':
      return `अभी ${department} विभाग के एजेंट उपलब्ध नहीं हैं। आपकी शिकायत दर्ज कर ली गई है। ${callbackTime} तक एजेंट आपसे संपर्क करेंगे।`
    default:
      return `${department} department agents are not available right now. Your complaint has been noted. An agent will call you by ${callbackTime}.`
  }
}
