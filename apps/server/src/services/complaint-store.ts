import { persistComplaint } from '../db/persist'

export interface Complaint {
  id: string
  callSid: string
  status: 'draft' | 'filed' | 'in_progress' | 'resolved'
  priority: 'critical' | 'high' | 'medium' | 'low'
  department: string
  issueSummary: string
  location?: string
  requestedAction?: string
  fullDescription?: string
  language: string
  callerNumber?: string
  createdAt: Date
  resolvedAt?: Date
  resolutionNotes?: string
  statusHistory: Array<{ status: string; timestamp: Date; note?: string }>
  deletedAt?: Date
  callbackTime?: string
}

const complaints = new Map<string, Complaint>()

export const complaintStore = {
  create(c: Complaint): void {
    complaints.set(c.id, c)
    persistComplaint(c)
  },

  get(id: string): Complaint | undefined {
    return complaints.get(id)
  },

  update(id: string, patch: Partial<Omit<Complaint, 'id' | 'callSid' | 'createdAt'>>): Complaint | undefined {
    const c = complaints.get(id)
    if (!c) return undefined
    const updated = { ...c, ...patch }
    complaints.set(id, updated)
    persistComplaint(updated)
    return updated
  },

  resolve(id: string, notes: string): Complaint | undefined {
    const c = complaints.get(id)
    if (!c) return undefined
    const now = new Date()
    const updated: Complaint = {
      ...c,
      status: 'resolved',
      resolvedAt: now,
      resolutionNotes: notes,
      statusHistory: [...c.statusHistory, { status: 'resolved', timestamp: now, note: notes }],
    }
    complaints.set(id, updated)
    persistComplaint(updated)
    return updated
  },

  setStatus(id: string, status: Complaint['status']): Complaint | undefined {
    const c = complaints.get(id)
    if (!c) return undefined
    const updated: Complaint = {
      ...c,
      status,
      statusHistory: [...c.statusHistory, { status, timestamp: new Date() }],
    }
    complaints.set(id, updated)
    persistComplaint(updated)
    return updated
  },

  softDelete(id: string): void {
    const c = complaints.get(id)
    if (!c) return
    const updated = { ...c, deletedAt: new Date() }
    complaints.set(id, updated)
    persistComplaint(updated)
  },

  getAll(includeDeleted = false): Complaint[] {
    const all = Array.from(complaints.values())
    return includeDeleted ? all : all.filter(c => !c.deletedAt)
  },

  filter(opts: { status?: string; priority?: string; department?: string; search?: string }): Complaint[] {
    return this.getAll().filter(c => {
      if (opts.status     && opts.status     !== 'all' && c.status     !== opts.status)     return false
      if (opts.priority   && opts.priority   !== 'all' && c.priority   !== opts.priority)   return false
      if (opts.department && opts.department !== 'all' && c.department !== opts.department) return false
      if (opts.search) {
        const q = opts.search.toLowerCase()
        if (!`${c.issueSummary} ${c.fullDescription ?? ''}`.toLowerCase().includes(q)) return false
      }
      return true
    })
  },

  /** Called once on server startup to load persisted data from PostgreSQL. */
  hydrate(data: Map<string, Complaint>): void {
    for (const [id, complaint] of data) {
      complaints.set(id, complaint)
    }
  },
}
