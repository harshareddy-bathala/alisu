import { FastifyInstance } from 'fastify'
import { complaintStore } from '../services/complaint-store'
import { broadcastComplaint } from '../services/broadcast'

export async function complaintsRoute(fastify: FastifyInstance) {
  // List with filters
  fastify.get('/complaints', async (req: any, reply) => {
    const { status, priority, department, search } = req.query as Record<string, string>
    const results = complaintStore.filter({ status, priority, department, search })
    return reply.send(results.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)))
  })

  // Get single
  fastify.get('/complaints/:id', async (req: any, reply) => {
    const c = complaintStore.get(req.params.id)
    if (!c) return reply.code(404).send({ error: 'Not found' })
    return reply.send(c)
  })

  // Update fields
  fastify.patch('/complaints/:id', async (req: any, reply) => {
    const { issueSummary, location, requestedAction, fullDescription, priority, status } = req.body as any
    const patch: Record<string, any> = {}
    if (issueSummary !== undefined) patch.issueSummary = issueSummary
    if (location !== undefined) patch.location = location
    if (requestedAction !== undefined) patch.requestedAction = requestedAction
    if (fullDescription !== undefined) patch.fullDescription = fullDescription
    if (priority !== undefined) patch.priority = priority

    let updated = status !== undefined
      ? complaintStore.setStatus(req.params.id, status)
      : complaintStore.update(req.params.id, patch)

    if (!updated) return reply.code(404).send({ error: 'Not found' })
    if (Object.keys(patch).length > 0 && status === undefined) {
      updated = complaintStore.update(req.params.id, patch) ?? updated
    }
    broadcastComplaint('COMPLAINT_UPDATED', updated)
    return reply.send(updated)
  })

  // Resolve
  fastify.post('/complaints/:id/resolve', async (req: any, reply) => {
    const { notes = '' } = req.body as any
    const updated = complaintStore.resolve(req.params.id, notes)
    if (!updated) return reply.code(404).send({ error: 'Not found' })
    broadcastComplaint('COMPLAINT_UPDATED', updated)
    return reply.send(updated)
  })

  // Soft delete
  fastify.delete('/complaints/:id', async (req: any, reply) => {
    complaintStore.softDelete(req.params.id)
    return reply.send({ ok: true })
  })
}
