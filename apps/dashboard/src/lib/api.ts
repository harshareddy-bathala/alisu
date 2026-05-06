const SECRET = import.meta.env.VITE_DASHBOARD_SECRET as string | undefined

/** Add to all fetch() calls that hit protected API routes. */
export const authHeaders = (): Record<string, string> =>
  SECRET ? { Authorization: `Bearer ${SECRET}` } : {}

/** WebSocket URL with token query param when secret is set. */
export function dashboardWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const base = `${protocol}//${window.location.host}/dashboard-ws`
  return SECRET ? `${base}?token=${encodeURIComponent(SECRET)}` : base
}
