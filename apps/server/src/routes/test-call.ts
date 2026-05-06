import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { broadcastCallUpdate } from '../services/broadcast'
import { callStore } from '../services/call-state'
import { runVerifyLoop } from '../services/verify-loop'

interface SimulateTranscriptBody {
  callSid: string
  transcript: string
}

interface SimulateEndBody {
  callSid: string
}

export async function testCallRoute(fastify: FastifyInstance) {
  const registerRoutes = (prefix: '/test' | '/api/test') => {
    fastify.post(`${prefix}/simulate-call`, async () => {
      const callSid = `TEST_${Date.now()}`

      callStore.create(callSid, '+91TEST')
      broadcastCallUpdate(callSid)

      return {
        callSid,
        message: 'Test call created'
      }
    })

    fastify.post(
      `${prefix}/simulate-transcript`,
      async (
        req: FastifyRequest<{ Body: SimulateTranscriptBody }>,
        reply: FastifyReply
      ) => {
        const { callSid, transcript } = req.body || {}

        if (!callSid || !transcript) {
          reply.code(400)
          return { ok: false, error: 'callSid and transcript are required' }
        }

        callStore.update(callSid, {
          transcript,
          lastChunk: transcript,
          status: 'verifying'
        })
        broadcastCallUpdate(callSid)

        await runVerifyLoop(callSid, transcript)
        broadcastCallUpdate(callSid)

        return { ok: true }
      }
    )

    fastify.post(
      `${prefix}/simulate-end`,
      async (
        req: FastifyRequest<{ Body: SimulateEndBody }>,
        reply: FastifyReply
      ) => {
        const { callSid } = req.body || {}

        if (!callSid) {
          reply.code(400)
          return { ok: false, error: 'callSid is required' }
        }

        callStore.update(callSid, { status: 'ended' })
        broadcastCallUpdate(callSid)

        return { ok: true }
      }
    )
  }

  registerRoutes('/test')
  registerRoutes('/api/test')
}
