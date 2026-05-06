import { persistCall } from '../db/persist'

export interface ComplaintData {
  issueSummary: string
  location?: string
  requestedAction?: string
  fullDescription?: string
}

export interface ConversationMessage {
  speaker: 'user' | 'alisu'
  text: string
  language: string
  timestamp: Date
}

export interface CallState {
  callSid: string
  status: 'active' | 'speaking' | 'processing' | 'verifying' | 'verified' | 'escalated' | 'transferred' | 'ended'
  transcript: string
  lastChunk: string
  intent: string
  department: string
  urgency: 'low' | 'medium' | 'high' | 'critical'
  sentiment: 'calm' | 'frustrated' | 'urgent' | 'distressed' | 'confused'
  needsHuman: boolean
  language: string  // BCP-47ish: kn-IN, hi-IN, ta-IN, te-IN, en-IN, etc.
  // Live partial transcript shown in the dashboard while the merge window is open.
  // Cleared once the LLM-bound utterance has been finalized into conversationHistory.
  partialUserText?: string
  verifyAttempts: number
  verificationSentence: string
  audioPath?: string
  startedAt: Date
  endedAt?: Date
  callerNumber: string
  deletedAt?: Date
  // Conversation intelligence
  conversationHistory: ConversationMessage[]
  conversationStep: 'gather' | 'confirm' | 'resolve' | 'close'
  followUpCount: number
  complaintId?: string
  complaintData?: ComplaintData
  irrelevantCount: number
  priority: 'critical' | 'high' | 'medium' | 'low'
  isResolved: boolean
  humanRequested: boolean
  // Recording & scheduling
  recordingPath?: string
  callbackTime?: string
}

const calls = new Map<string, CallState>()

export const callStore = {
  create(sid: string, callerNumber: string): void {
    const state: CallState = {
      callSid: sid,
      status: 'active',
      transcript: '',
      lastChunk: '',
      intent: '',
      department: '',
      urgency: 'low',
      sentiment: 'calm',
      needsHuman: false,
      language: 'kn' as any,
      verifyAttempts: 0,
      verificationSentence: '',
      startedAt: new Date(),
      callerNumber,
      conversationHistory: [],
      conversationStep: 'gather',
      followUpCount: 0,
      irrelevantCount: 0,
      priority: 'low',
      isResolved: false,
      humanRequested: false,
    }
    calls.set(sid, state)
    persistCall(state)
  },

  get(sid: string): CallState | undefined {
    return calls.get(sid)
  },

  update(sid: string, patch: Partial<CallState>): void {
    const call = calls.get(sid)
    if (!call) return
    const updated = { ...call, ...patch }
    calls.set(sid, updated)
    persistCall(updated)
  },

  remove(sid: string): void {
    calls.delete(sid)
  },

  getAll(): CallState[] {
    return Array.from(calls.values())
  },

  /** Called once on server startup to load persisted data from PostgreSQL. */
  hydrate(data: Map<string, CallState>): void {
    for (const [sid, state] of data) {
      calls.set(sid, state)
    }
  },
}
