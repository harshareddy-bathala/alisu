/**
 * Fetch wrapper for Sarvam AI APIs with automatic retry on 429 / 5xx.
 * Retries twice: 500ms then 1200ms delay.
 */
export async function sarvamFetch(url: string, opts: RequestInit, maxRetries = 2): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = attempt === 1 ? 500 : 1200
      console.log(`[HTTP] Retry ${attempt}/${maxRetries} in ${delay}ms — ${url}`)
      await new Promise(r => setTimeout(r, delay))
    }
    try {
      const res = await fetch(url, opts)
      if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) continue
      return res
    } catch (err) {
      if (attempt === maxRetries) throw err
    }
  }
  // Unreachable — loop always returns or throws
  throw new Error('sarvamFetch: max retries exceeded')
}
