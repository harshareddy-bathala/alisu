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
  createdAt: string | Date
  resolvedAt?: string | Date
  resolutionNotes?: string
  statusHistory: Array<{ status: string; timestamp: string | Date; note?: string }>
  deletedAt?: string | Date
}

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
  timestamp: string | Date
}

export interface CallState {
  callSid: string
  from?: string
  to?: string
  callerNumber?: string
  startTime?: Date | string
  startedAt?: Date | string
  endTime?: Date | string
  transcript: string
  lastChunk?: string
  partialUserText?: string
  intent: string
  sentiment: 'calm' | 'frustrated' | 'urgent' | 'distressed' | 'confused'
  language?: string
  department?: string
  needsHuman?: boolean
  verificationSentence?: string
  audioPath?: string
  status: 'active' | 'speaking' | 'processing' | 'verifying' | 'verified' | 'escalated' | 'transferred' | 'ended' | 'completed' | 'failed'
  urgency?: 'low' | 'medium' | 'high' | 'critical'
  priority?: 'critical' | 'high' | 'medium' | 'low'
  // Conversation intelligence
  conversationHistory?: ConversationMessage[]
  conversationStep?: 'gather' | 'confirm' | 'resolve' | 'close'
  followUpCount?: number
  complaintId?: string
  complaintData?: ComplaintData
  irrelevantCount?: number
  isResolved?: boolean
  humanRequested?: boolean
  // Recording & scheduling
  recordingPath?: string
  callbackTime?: string
}
