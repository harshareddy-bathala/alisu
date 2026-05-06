import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import AccessToken = require('twilio/lib/jwt/AccessToken')

const { VoiceGrant } = AccessToken
const softphoneIdentity = 'alisu-dashboard'

interface TwilioCallStatusBody {
  CallSid?: string
  CallStatus?: string
  CallDuration?: string
  ErrorCode?: string
  ErrorMessage?: string
  From?: string
  To?: string
}

function twimlResponse(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${body}`
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function voiceTokenRoute(fastify: FastifyInstance) {
  const registerRoutes = (prefix: '' | '/api') => {
    fastify.get(`${prefix}/voice-token`, async (_req, reply: FastifyReply) => {
      const accountSid = process.env.TWILIO_ACCOUNT_SID
      const apiKey = process.env.TWILIO_API_KEY
      const apiSecret = process.env.TWILIO_API_SECRET
      const twimlAppSid = process.env.TWILIO_TWIML_APP_SID

      if (!accountSid || !apiKey || !apiSecret || !twimlAppSid) {
        reply.code(500)
        return {
          error: 'Missing Twilio Voice token configuration',
          required: [
            'TWILIO_ACCOUNT_SID',
            'TWILIO_API_KEY',
            'TWILIO_API_SECRET',
            'TWILIO_TWIML_APP_SID'
          ]
        }
      }

      const token = new AccessToken(accountSid, apiKey, apiSecret, {
        identity: softphoneIdentity
      })
      const voiceGrant = new VoiceGrant({
        outgoingApplicationSid: twimlAppSid,
        incomingAllow: true
      })

      token.addGrant(voiceGrant)

      return { token: token.toJwt() }
    })

    fastify.post(`${prefix}/twiml-outbound`, async (req: FastifyRequest<{ Body: { To?: string } }>, reply) => {
      const requestedTo = req.body?.To || ''
      const from = process.env.TWILIO_NUMBER || ''
      const dialNumber = process.env.TWILIO_NUMBER || requestedTo
      const twiml = twimlResponse(`<Response>
  <Dial callerId="${xmlEscape(from)}">
    <Number>${xmlEscape(dialNumber)}</Number>
  </Dial>
</Response>`)

      reply.type('text/xml')
      return twiml
    })

    fastify.post(`${prefix}/twiml-incoming`, async (_req, reply) => {
      const twiml = twimlResponse(`<Response>
  <Dial>
    <Client>${xmlEscape(softphoneIdentity)}</Client>
  </Dial>
</Response>`)

      reply.type('text/xml')
      return twiml
    })

    fastify.post(
      `${prefix}/call-status`,
      async (req: FastifyRequest<{ Body: TwilioCallStatusBody }>) => {
        const body = req.body || {}
        const error =
          body.ErrorCode || body.ErrorMessage
            ? ` error=${body.ErrorCode || ''} ${body.ErrorMessage || ''}`.trimEnd()
            : ''

        console.log(
          `[TWILIO STATUS] ${body.CallSid || 'unknown'} ${body.CallStatus || 'unknown'} ${body.From || ''} -> ${body.To || ''}${error}`
        )

        return { ok: true }
      }
    )
  }

  registerRoutes('')
  registerRoutes('/api')
}
