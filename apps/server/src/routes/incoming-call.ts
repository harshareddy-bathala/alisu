import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { broadcastCallUpdate } from '../services/broadcast'
import { callStore } from '../services/call-state'
import { telephony } from '../telephony'

interface IncomingCallBody {
  From?: string
  CallSid?: string
}

export async function incomingCallRoute(fastify: FastifyInstance) {
  // Twilio Console: set the Voice webhook to POST {PUBLIC_URL}/incoming-call.
  fastify.post(
    '/incoming-call',
    async (req: FastifyRequest<{ Body: IncomingCallBody }>, reply: FastifyReply) => {
      const callerNumber = req.body?.From || ''
      const callSid = req.body?.CallSid || ''

      callStore.create(callSid, callerNumber)
      broadcastCallUpdate(callSid)
      console.log(`[CALL] New call from ${callerNumber} - SID: ${callSid}`)

      const response = telephony.handleIncomingCall(callSid, callerNumber)
      reply.type('text/xml').send(response)
    }
  )
}
