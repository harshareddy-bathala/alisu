import { getPool } from './index'
import type { CallState } from '../services/call-state'
import type { Complaint } from '../services/complaint-store'

export function persistCall(state: CallState): void {
  const pool = getPool()
  if (!pool) return

  pool.query(
    `INSERT INTO calls (
      call_sid, status, transcript, last_chunk, intent, department, urgency, sentiment,
      needs_human, language, verify_attempts, verification_sentence, audio_path,
      started_at, ended_at, caller_number, deleted_at,
      conversation_history, conversation_step, follow_up_count,
      complaint_id, complaint_data, irrelevant_count, priority,
      is_resolved, human_requested, recording_path, callback_time
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28
    )
    ON CONFLICT (call_sid) DO UPDATE SET
      status = EXCLUDED.status,
      transcript = EXCLUDED.transcript,
      last_chunk = EXCLUDED.last_chunk,
      intent = EXCLUDED.intent,
      department = EXCLUDED.department,
      urgency = EXCLUDED.urgency,
      sentiment = EXCLUDED.sentiment,
      needs_human = EXCLUDED.needs_human,
      language = EXCLUDED.language,
      audio_path = EXCLUDED.audio_path,
      ended_at = EXCLUDED.ended_at,
      deleted_at = EXCLUDED.deleted_at,
      conversation_history = EXCLUDED.conversation_history,
      conversation_step = EXCLUDED.conversation_step,
      follow_up_count = EXCLUDED.follow_up_count,
      complaint_id = EXCLUDED.complaint_id,
      complaint_data = EXCLUDED.complaint_data,
      irrelevant_count = EXCLUDED.irrelevant_count,
      priority = EXCLUDED.priority,
      is_resolved = EXCLUDED.is_resolved,
      human_requested = EXCLUDED.human_requested,
      recording_path = EXCLUDED.recording_path,
      callback_time = EXCLUDED.callback_time`,
    [
      state.callSid, state.status, state.transcript, state.lastChunk,
      state.intent, state.department, state.urgency, state.sentiment,
      state.needsHuman, state.language, state.verifyAttempts, state.verificationSentence,
      state.audioPath,
      state.startedAt, state.endedAt ?? null, state.callerNumber, state.deletedAt ?? null,
      JSON.stringify(state.conversationHistory), state.conversationStep, state.followUpCount,
      state.complaintId ?? null,
      state.complaintData ? JSON.stringify(state.complaintData) : null,
      state.irrelevantCount, state.priority, state.isResolved, state.humanRequested,
      state.recordingPath ?? null,
      state.callbackTime ?? null,
    ]
  ).catch(err => console.error('[DB] persistCall error:', err))
}

export function persistComplaint(c: Complaint): void {
  const pool = getPool()
  if (!pool) return

  pool.query(
    `INSERT INTO complaints (
      id, call_sid, status, priority, department,
      issue_summary, location, requested_action, full_description,
      language, caller_number, created_at, resolved_at, resolution_notes,
      status_history, deleted_at, callback_time
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
    ON CONFLICT (id) DO UPDATE SET
      status = EXCLUDED.status,
      priority = EXCLUDED.priority,
      department = EXCLUDED.department,
      issue_summary = EXCLUDED.issue_summary,
      location = EXCLUDED.location,
      requested_action = EXCLUDED.requested_action,
      full_description = EXCLUDED.full_description,
      resolved_at = EXCLUDED.resolved_at,
      resolution_notes = EXCLUDED.resolution_notes,
      status_history = EXCLUDED.status_history,
      deleted_at = EXCLUDED.deleted_at,
      callback_time = EXCLUDED.callback_time`,
    [
      c.id, c.callSid, c.status, c.priority, c.department,
      c.issueSummary, c.location ?? null, c.requestedAction ?? null, c.fullDescription ?? null,
      c.language, c.callerNumber ?? null,
      c.createdAt, c.resolvedAt ?? null, c.resolutionNotes ?? null,
      JSON.stringify(c.statusHistory), c.deletedAt ?? null,
      (c as any).callbackTime ?? null,
    ]
  ).catch(err => console.error('[DB] persistComplaint error:', err))
}

export async function hydrateCallStore(): Promise<Map<string, CallState>> {
  const pool = getPool()
  const map = new Map<string, CallState>()
  if (!pool) return map

  const { rows } = await pool.query('SELECT * FROM calls WHERE deleted_at IS NULL')
  for (const r of rows) {
    const state: CallState = {
      callSid:               r.call_sid,
      status:                r.status,
      transcript:            r.transcript,
      lastChunk:             r.last_chunk,
      intent:                r.intent,
      department:            r.department,
      urgency:               r.urgency,
      sentiment:             r.sentiment,
      needsHuman:            r.needs_human,
      language:              r.language,
      verifyAttempts:        r.verify_attempts,
      verificationSentence:  r.verification_sentence,
      audioPath:             r.audio_path,
      startedAt:             r.started_at,
      endedAt:               r.ended_at,
      callerNumber:          r.caller_number,
      deletedAt:             r.deleted_at,
      conversationHistory:   r.conversation_history ?? [],
      conversationStep:      r.conversation_step,
      followUpCount:         r.follow_up_count,
      complaintId:           r.complaint_id,
      complaintData:         r.complaint_data,
      irrelevantCount:       r.irrelevant_count,
      priority:              r.priority,
      isResolved:            r.is_resolved,
      humanRequested:        r.human_requested,
      recordingPath:         r.recording_path,
      callbackTime:          r.callback_time,
    } as any
    map.set(r.call_sid, state)
  }
  console.log(`[DB] Hydrated ${map.size} calls from PostgreSQL`)
  return map
}

export async function hydrateComplaintStore(): Promise<Map<string, Complaint>> {
  const pool = getPool()
  const map = new Map<string, Complaint>()
  if (!pool) return map

  const { rows } = await pool.query('SELECT * FROM complaints WHERE deleted_at IS NULL')
  for (const r of rows) {
    const c: Complaint = {
      id:               r.id,
      callSid:          r.call_sid,
      status:           r.status,
      priority:         r.priority,
      department:       r.department,
      issueSummary:     r.issue_summary,
      location:         r.location,
      requestedAction:  r.requested_action,
      fullDescription:  r.full_description,
      language:         r.language,
      callerNumber:     r.caller_number,
      createdAt:        r.created_at,
      resolvedAt:       r.resolved_at,
      resolutionNotes:  r.resolution_notes,
      statusHistory:    r.status_history ?? [],
      deletedAt:        r.deleted_at,
      callbackTime:     r.callback_time,
    } as any
    map.set(r.id, c)
  }
  console.log(`[DB] Hydrated ${map.size} complaints from PostgreSQL`)
  return map
}
