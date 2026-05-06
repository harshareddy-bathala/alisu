import type { FastifyRequest, FastifyReply } from 'fastify'

// Paths that Twilio calls directly — never require auth
const OPEN_PREFIXES = [
  '/incoming-call',
  '/handle-confirm',
  '/media-stream',
  '/voice-token',
  '/health',
]

/**
 * Fastify preHandler that enforces DASHBOARD_SECRET when set.
 * Open paths (Twilio webhooks, health) are always allowed.
 * WebSocket upgrades pass the secret as ?token= query param.
 * All other requests pass it as Authorization: Bearer <secret>.
 */
export function authPreHandler(
  req: FastifyRequest,
  reply: FastifyReply,
  done: () => void
): void {
  const secret = process.env.DASHBOARD_SECRET
  if (!secret) return done()  // dev mode — no secret set

  const path = req.url.split('?')[0]
  if (OPEN_PREFIXES.some(p => path.startsWith(p))) return done()

  // WebSocket upgrades carry the token in query string
  const token = (req.query as Record<string, string>).token
  if (token && token === secret) return done()

  const auth = req.headers['authorization']
  if (auth === `Bearer ${secret}`) return done()

  reply.code(401).send({ error: 'Unauthorized' })
}
