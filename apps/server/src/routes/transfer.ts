import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { callStore } from '../services/call-state'
import { escalateToHuman } from '../services/verify-loop'

export async function transferRoute(app: FastifyInstance, req: FastifyRequest, reply: FastifyReply) {
  try {
    const { callSid } = req.body as { callSid: string }

    if (!callSid) {
      return reply.status(400).send({ error: 'Missing callSid' })
    }

    const state = callStore.get(callSid)
    if (!state) {
      return reply.status(404).send({ error: 'Call not found' })
    }

    await escalateToHuman(callSid, state.department || 'General')

    return reply.send({ ok: true })
  } catch (error: any) {
    app.log.error(error)
    return reply.status(500).send({ error: error.message })
  }
}
