import { useEffect, useRef, useState } from 'react'
import { CallState } from '../types'
import { useTheme } from '../lib/ThemeContext'

interface Props {
  call: CallState
  onTransfer: (callSid: string) => void
  onDelete?: (callSid: string) => void
  targetLang: string
  onTargetLangChange: (lang: string) => void
}

const SENTIMENT_LABEL: Record<string, string> = {
  calm:       'Calm',
  frustrated: 'Frustrated',
  urgent:     'Urgent',
  distressed: 'Distressed',
  confused:   'Confused',
}
const SENTIMENT_EMOJI: Record<string, string> = {
  calm: '😌', frustrated: '😤', urgent: '⚡', distressed: '🚨', confused: '😕',
}

function StatusPill({ status }: { status: string }) {
  const t = useTheme()

  type CfgEntry = { label: string; color: string; bg: string; border?: string }
  const STATUS_CFG: Record<string, CfgEntry> = {
    active:      { label: 'LISTENING',   color: t.success,   bg: t.successBg },
    speaking:    { label: 'SPEAKING',    color: t.primary,   bg: t.primaryBg },
    processing:  { label: 'PROCESSING',  color: t.warning,   bg: t.warningBg },
    verifying:   { label: 'VERIFYING',   color: t.warning,   bg: t.warningBg },
    escalated:   { label: 'ESCALATED',   color: t.error,     bg: t.errorBg },
    transferred: { label: 'TRANSFERRED', color: t.textMuted, bg: 'transparent', border: `1px solid ${t.border}` },
    ended:       { label: 'ENDED',       color: t.textMuted, bg: 'transparent', border: `1px solid ${t.border}` },
    verified:    { label: 'VERIFIED',    color: t.success,   bg: t.successBg },
    completed:   { label: 'COMPLETED',   color: t.textMuted, bg: 'transparent', border: `1px solid ${t.border}` },
    failed:      { label: 'FAILED',      color: t.error,     bg: t.errorBg },
  }

  const c = STATUS_CFG[status] ?? STATUS_CFG.ended

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider"
      style={{ color: c.color, background: c.bg, border: c.border }}
    >
      {c.label}
    </span>
  )
}

export function CallCard({ call, onTransfer, onDelete, targetLang: _tl, onTargetLangChange: _otlc }: Props) {
  const t = useTheme()
  const [elapsed, setElapsed] = useState('00:00')
  const [idVisible, setIdVisible] = useState(!!call.complaintId)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const prevId = useRef(call.complaintId)

  const isLive = !['ended', 'transferred', 'completed', 'failed'].includes(call.status)

  // Timer — stops when call ends
  useEffect(() => {
    const start = new Date((call.startedAt || call.startTime) as string).getTime()

    if (!isLive) {
      const end = (call as any).endedAt ? new Date((call as any).endedAt).getTime() : start
      const diff = Math.max(0, Math.floor((end - start) / 1000))
      setElapsed(`${String(Math.floor(diff / 60)).padStart(2, '0')}:${String(diff % 60).padStart(2, '0')}`)
      return
    }

    const tick = () => {
      const diff = Math.floor((Date.now() - start) / 1000)
      setElapsed(`${String(Math.floor(diff / 60)).padStart(2, '0')}:${String(diff % 60).padStart(2, '0')}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [call.startedAt, call.startTime, call.status, (call as any).endedAt, isLive])

  // Typewriter on complaint ID first appearance
  useEffect(() => {
    if (call.complaintId && !prevId.current) {
      setIdVisible(false)
      const t = setTimeout(() => setIdVisible(true), 50)
      return () => clearTimeout(t)
    }
    prevId.current = call.complaintId
  }, [call.complaintId])

  const maskNumber = (n?: string) => (!n || n.length < 4) ? (n || 'Unknown') : `***${n.slice(-4)}`
  const messages = (call.conversationHistory ?? []).slice(-4)

  return (
    <div
      className="rounded-2xl flex flex-col animate-slide-up"
      style={{
        background: t.surface,
        boxShadow: `0 1px 3px rgba(0,0,0,0.2), 0 0 0 1px ${t.border}`,
        transition: 'box-shadow 400ms ease',
      }}
    >
      {/* HEADER */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between">
        <span className="text-sm font-semibold tracking-tight" style={{ color: t.text }}>
          {maskNumber(call.callerNumber || call.from)}
        </span>
        <div className="flex items-center gap-2">
          {isLive && (
            <span className="text-xs font-mono tabular-nums" style={{ color: t.textMuted }}>{elapsed}</span>
          )}
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-md uppercase"
            style={{ background: t.border, color: t.textMuted, letterSpacing: '0.1em' }}
          >
            {(call.language || 'kn').replace(/-IN$/, '').toUpperCase()}
          </span>
        </div>
      </div>

      {/* STATUS + SENTIMENT */}
      <div className="px-4 pb-3 flex items-center justify-between gap-2">
        <StatusPill status={call.status} />
        {call.sentiment && (
          <span className="text-xs flex items-center gap-1" style={{ color: t.textMuted }}>
            <span>{SENTIMENT_EMOJI[call.sentiment]}</span>
            <span>{SENTIMENT_LABEL[call.sentiment]}</span>
          </span>
        )}
      </div>

      {/* DEPARTMENT */}
      {call.department && (
        <div className="px-4 pb-3">
          <span
            className="text-xs px-2.5 py-1 rounded-full font-medium"
            style={{ background: t.primaryBg, color: t.primary, border: `1px solid ${t.primaryBorder}` }}
          >
            {call.department}
          </span>
        </div>
      )}

      {/* TRANSCRIPT */}
      <div className="px-4 pb-3">
        {messages.length > 0 || call.partialUserText ? (
          <div
            className="rounded-xl p-3 text-xs space-y-2 overflow-y-auto"
            style={{
              background: t.bgElevated,
              maxHeight: 140,
              border: `1px solid ${t.border}`,
              fontFamily: "'Inter', sans-serif",
            }}
          >
            {messages.map((m, i) => (
              <p key={i} style={{ wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: 1.5 }}>
                <span
                  className="font-semibold mr-1"
                  style={{ color: m.speaker === 'alisu' ? t.primary : t.success, fontSize: 10 }}
                >
                  {m.speaker === 'alisu' ? 'Alisu' : 'Citizen'}
                </span>
                <span style={{ color: t.text }}>{m.text}</span>
              </p>
            ))}
            {/* Live partial — shown while citizen is mid-sentence. */}
            {call.partialUserText && (
              <p style={{ wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: 1.5, fontStyle: 'italic' }}>
                <span className="font-semibold mr-1" style={{ color: t.success, fontSize: 10 }}>Citizen</span>
                <span style={{ color: t.textMuted }}>{call.partialUserText}…</span>
              </p>
            )}
          </div>
        ) : (
          <div
            className="rounded-xl p-3 text-xs"
            style={{ background: t.bgElevated, color: t.textMuted, border: `1px solid ${t.border}` }}
          >
            Waiting for conversation…
          </div>
        )}
      </div>

      {/* PRIORITY + COMPLAINT ID */}
      {(call.priority && call.priority !== 'low' || call.complaintId) && (
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {call.priority && call.priority !== 'low' && (
            <span
              className="text-xs px-2.5 py-0.5 rounded-full font-semibold"
              style={{
                background: call.priority === 'critical' ? t.errorBg : t.warningBg,
                color:      call.priority === 'critical' ? t.error : t.warning,
                border: `1px solid ${call.priority === 'critical' ? t.error : t.warning}40`,
              }}
            >
              {call.priority === 'critical' ? '● ' : ''}{call.priority}
            </span>
          )}
          {call.complaintId && idVisible && (
            <span
              className="text-xs px-2.5 py-0.5 rounded-full font-mono font-semibold overflow-hidden whitespace-nowrap animate-reveal-type"
              style={{
                background: t.warningBg,
                color: t.warning,
                border: `1px solid ${t.warning}40`,
              }}
            >
              {call.complaintId}
            </span>
          )}
        </div>
      )}

      {/* FOOTER */}
      <div className="px-4 pb-4 pt-2" style={{ borderTop: `1px solid ${t.border}` }}>
        {isLive ? (
          <button
            onClick={() => onTransfer(call.callSid)}
            className="w-full py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-80 active:scale-95"
            style={{
              background: t.errorBg,
              color: t.error,
              border: `1px solid ${t.error}40`,
            }}
          >
            Transfer Call
          </button>
        ) : (
          <div className="space-y-1.5">
            <p className="text-xs text-center py-0.5" style={{ color: t.textMuted }}>
              {call.status === 'transferred'
                ? `Transferred → ${call.department || 'Agent'}`
                : `Ended · ${elapsed}`}
            </p>
            {call.callbackTime && (
              <p
                className="text-xs px-3 py-1.5 rounded-xl text-center"
                style={{ background: t.warningBg, color: t.warning, border: `1px solid ${t.warning}40` }}
              >
                📞 Callback scheduled · {call.callbackTime}
              </p>
            )}
            {onDelete && (
              <div className="text-center mt-1">
                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="text-xs"
                    style={{ color: t.textMuted, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Delete
                  </button>
                ) : (
                  <span className="text-xs" style={{ color: t.textMuted }}>
                    Confirm delete?{' '}
                    <button
                      onClick={() => { onDelete(call.callSid); setConfirmDelete(false) }}
                      style={{ color: t.error, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                    >
                      Yes
                    </button>
                    {' / '}
                    <button
                      onClick={() => setConfirmDelete(false)}
                      style={{ color: t.textMuted, background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      No
                    </button>
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
