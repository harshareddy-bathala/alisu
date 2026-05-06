import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { broadcastCallUpdate } from '../services/broadcast'
import { callStore } from '../services/call-state'
import { escalateToHuman, runVerifyLoop } from '../services/verify-loop'

interface HandleConfirmQuery {
  callSid?: string
  timeout?: string
}

function twiml(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${body}`
}

function sayKn(text: string): string {
  return `<Say language="kn-IN">${text}</Say>`
}

export async function handleConfirmRoute(fastify: FastifyInstance) {
  fastify.post(
    '/handle-confirm',
    async (
      req: FastifyRequest<{ Querystring: HandleConfirmQuery }>,
      reply: FastifyReply
    ) => {
      const callSid = req.query.callSid || ''
      const speechResult = ((req.body as any)?.SpeechResult || '').toLowerCase()
      const isTimeout = req.query.timeout === 'true'
      const confirmedWords = [
        'yes',
        'haan',
        'ha',
        'sari',
        'houdu',
        'correct',
        'right',
        'okay',
        'ok',
        'aaan'
      ]
      const deniedWords = [
        'no',
        'alla',
        'nahin',
        'nahi',
        'not',
        'wrong',
        'incorrect'
      ]
      const isConfirmed = confirmedWords.some((word) => speechResult.includes(word))
      const isDenied = deniedWords.some((word) => speechResult.includes(word))
      const state = callStore.get(callSid)

      reply.type('text/xml')

      if (!state) {
        return twiml('<Response><Hangup/></Response>')
      }

      if (isConfirmed) {
        callStore.update(callSid, { status: 'verified' })
        broadcastCallUpdate(callSid)
        console.log(`[CONFIRM] ${callSid} — citizen confirmed understanding`)

        return twiml(`<Response>
  ${sayKn('Dhanyavaad. Nimma vishaya note maadiddeene. Agent connect maaduttene.')}
  <Pause length="30"/>
</Response>`)
      }

      if (isDenied && state.verifyAttempts < 1) {
        callStore.update(callSid, { verifyAttempts: 1 })
        broadcastCallUpdate(callSid)
        void runVerifyLoop(callSid, state.transcript)

        return twiml('<Response><Pause length="2"/></Response>')
      }

      if (isTimeout || isDenied || state.verifyAttempts >= 1) {
        console.log(`[CONFIRM] ${callSid} — escalating after failed verification`)
        await escalateToHuman(callSid, state.department)

        return twiml(`<Response>
  ${sayKn('Nimmannu agent ge connect maaduttene.')}
</Response>`)
      }

      console.log(`[CONFIRM] ${callSid} - unclear response, escalating`)
      await escalateToHuman(callSid, state.department)

      return twiml(`<Response>
  ${sayKn('Nimmannu agent ge connect maaduttene.')}
</Response>`)
    }
  )
}
