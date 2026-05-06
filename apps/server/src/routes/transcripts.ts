import fs from 'fs'
import { FastifyInstance } from 'fastify'
import { callStore } from '../services/call-state'
import { getRecordingPath } from '../services/call-recorder'
import { broadcastCallUpdate } from '../services/broadcast'

function durationLabel(startedAt: Date, endedAt?: Date): string {
  const start = new Date(startedAt).getTime()
  const end = endedAt ? new Date(endedAt).getTime() : Date.now()
  const secs = Math.floor((end - start) / 1000)
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}m ${s}s`
}

function callToText(call: ReturnType<typeof callStore.get>): string {
  if (!call) return ''
  const lines = [
    'ALISU 1092 HELPLINE — CALL TRANSCRIPT',
    '======================================',
    `Call ID   : ${call.callSid}`,
    `Date      : ${new Date(call.startedAt).toLocaleString()}`,
    `Duration  : ${durationLabel(call.startedAt, call.endedAt)}`,
    `Language  : ${call.language || 'unknown'}`,
    `Department: ${call.department || 'unknown'}`,
    `Sentiment : ${call.sentiment || 'unknown'}`,
    `Status    : ${call.status}`,
    call.complaintId ? `Complaint : ${call.complaintId}` : '',
    '======================================',
    ''
  ]

  for (const msg of (call.conversationHistory ?? [])) {
    const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    const speaker = msg.speaker === 'alisu' ? 'Alisu  ' : 'Citizen'
    lines.push(`[${time}] ${speaker}: ${msg.text}`)
  }

  if (!call.conversationHistory?.length && call.transcript) {
    lines.push(call.transcript)
  }

  return lines.filter(l => l !== '').join('\n')
}

export async function transcriptsRoute(fastify: FastifyInstance) {
  // List all (excluding soft-deleted)
  fastify.get('/transcripts', async (_req, reply) => {
    const calls = callStore.getAll()
      .filter(c => !c.deletedAt)
      .sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt))
    return reply.send(calls)
  })

  // Single call with full data
  fastify.get('/transcripts/:callSid', async (req: any, reply) => {
    const call = callStore.get(req.params.callSid)
    if (!call || call.deletedAt) return reply.code(404).send({ error: 'Not found' })
    return reply.send(call)
  })

  // Soft delete
  fastify.delete('/transcripts/:callSid', async (req: any, reply) => {
    const call = callStore.get(req.params.callSid)
    if (!call) return reply.code(404).send({ error: 'Not found' })
    callStore.update(req.params.callSid, { deletedAt: new Date() } as any)
    broadcastCallUpdate(req.params.callSid)
    return reply.send({ ok: true })
  })

  // Download call recording (.wav)
  fastify.get('/transcripts/:callSid/recording', async (req: any, reply) => {
    const recordingPath = getRecordingPath(req.params.callSid)
    if (!recordingPath || !fs.existsSync(recordingPath)) {
      return reply.code(404).send({ error: 'Recording not available' })
    }
    reply.header('Content-Disposition', `attachment; filename="alisu-recording-${req.params.callSid}.wav"`)
    reply.header('Content-Type', 'audio/wav')
    return reply.send(fs.createReadStream(recordingPath))
  })

  // Export as plain text
  fastify.get('/transcripts/:callSid/export', async (req: any, reply) => {
    const call = callStore.get(req.params.callSid)
    if (!call || call.deletedAt) return reply.code(404).send({ error: 'Not found' })
    const text = callToText(call)
    const filename = `alisu-transcript-${req.params.callSid}.txt`
    reply.header('Content-Disposition', `attachment; filename="${filename}"`)
    reply.header('Content-Type', 'text/plain; charset=utf-8')
    return reply.send(text)
  })
}
