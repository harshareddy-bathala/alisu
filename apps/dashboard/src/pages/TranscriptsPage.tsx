import { useState } from 'react'
import { CallState } from '../types'
import { TranscriptPanel } from '../components/TranscriptPanel'
import { authHeaders } from '../lib/api'
import { useTheme } from '../lib/ThemeContext'

interface Props {
  calls: CallState[]
  targetLang: string
  onTargetLangChange: (lang: string) => void
}

function duration(start: Date | string, end?: Date | string): string {
  const s = new Date(start).getTime()
  const e = end ? new Date(end).getTime() : Date.now()
  const sec = Math.floor((e - s) / 1000)
  return `${Math.floor(sec / 60)}m ${sec % 60}s`
}

const SENTIMENT_EMOJI: Record<string, string> = {
  calm: '😌', frustrated: '😤', urgent: '⚡', distressed: '🚨', confused: '😕'
}

export function TranscriptsPage({ calls, targetLang, onTargetLangChange }: Props) {
  const t = useTheme()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [deleted, setDeleted] = useState<Set<string>>(new Set())
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
    ended:       { bg: t.bgElevated, color: t.textMuted },
    transferred: { bg: t.primaryBg,  color: t.primary   },
    active:      { bg: t.successBg,  color: t.success   },
    speaking:    { bg: t.primaryBg,  color: t.primary   },
  }

  const visible = calls
    .filter(c => {
      if (deleted.has(c.callSid) || (c as any).deletedAt) return false
      if (search) {
        const q = search.toLowerCase()
        if (
          !c.callSid.toLowerCase().includes(q) &&
          !(c.department || '').toLowerCase().includes(q) &&
          !(c.complaintId || '').toLowerCase().includes(q) &&
          !(c.transcript || '').toLowerCase().includes(q) &&
          !(c.conversationHistory || []).some(m => m.text.toLowerCase().includes(q))
        ) return false
      }
      return true
    })
    .sort((a, b) => +new Date(b.startedAt || 0) - +new Date(a.startedAt || 0))

  const doDelete = async (sid: string) => {
    await fetch(`/api/transcripts/${sid}`, { method: 'DELETE', headers: authHeaders() })
    setDeleted(prev => new Set(prev).add(sid))
    setConfirmDel(null)
    if (expanded === sid) setExpanded(null)
  }

  return (
    <div className="w-full">
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <h2 className="text-xl font-bold" style={{ color: t.text }}>Call Transcripts</h2>
        <span
          className="px-2 py-0.5 rounded-full text-sm font-semibold"
          style={{ background: t.primaryBg, color: t.primary }}
        >
          {visible.length}
        </span>
        <input
          type="text"
          placeholder="Search by call ID, department, complaint, or transcript…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="sm:ml-auto text-sm w-full sm:w-80"
          style={{
            background: t.bgElevated,
            border: `1px solid ${t.border}`,
            color: t.text,
            borderRadius: 10,
            padding: '7px 14px',
            outline: 'none',
          }}
        />
      </div>

      {visible.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-3 opacity-60">🎙</p>
          <p className="font-medium" style={{ color: t.textMuted }}>No call transcripts yet</p>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
        <div className="space-y-2 min-w-[640px]">
          {visible.map((call, idx) => {
            const isOpen = expanded === call.callSid
            const messages = call.conversationHistory ?? []
            const ss = STATUS_STYLE[call.status] ?? STATUS_STYLE.ended

            return (
              <div
                key={call.callSid}
                className="rounded-xl overflow-hidden animate-fade-up"
                style={{
                  background: t.surface,
                  border: `1px solid ${t.border}`,
                  animationDelay: `${Math.min(idx * 25, 200)}ms`,
                }}
              >
                {/* Row */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = t.surfaceHover}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                  onClick={() => setExpanded(isOpen ? null : call.callSid)}
                >
                  <span
                    className="text-sm transition-transform"
                    style={{ color: t.textMuted, transform: isOpen ? 'rotate(90deg)' : 'rotate(0)' }}
                  >
                    ▸
                  </span>

                  <span className="font-mono text-xs truncate w-28" style={{ color: t.textMuted }}>{call.callSid}</span>

                  <span className="text-xs w-36" style={{ color: t.textMuted }}>
                    {new Date(call.startedAt || Date.now()).toLocaleString()}
                  </span>

                  <span className="text-xs w-16" style={{ color: t.textMuted }}>
                    {duration(call.startedAt || new Date(), (call as any).endedAt)}
                  </span>

                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded uppercase w-10 text-center"
                    style={{ background: t.bgElevated, color: t.textMuted }}
                  >
                    {(call.language || '?').replace(/-IN$/, '')}
                  </span>

                  <span className="text-xs w-24 truncate" style={{ color: t.textMuted }}>{call.department || '—'}</span>

                  <span className="text-sm w-6">{SENTIMENT_EMOJI[call.sentiment] || '😶'}</span>

                  {call.complaintId && (
                    <span
                      className="font-mono text-xs px-2 py-0.5 rounded"
                      style={{ background: t.warningBg, color: t.warning }}
                    >
                      {call.complaintId}
                    </span>
                  )}

                  <span
                    className="ml-auto text-xs font-medium px-2 py-0.5 rounded capitalize"
                    style={{ background: ss.bg, color: ss.color }}
                  >
                    {call.status}
                  </span>

                  {/* Actions */}
                  <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => window.open(`/api/transcripts/${call.callSid}/export`, '_blank')}
                      className="text-xs px-2 py-0.5 rounded transition-opacity hover:opacity-80"
                      style={{ background: t.primaryBg, color: t.primary, border: `1px solid ${t.primaryBorder}` }}
                    >
                      Export
                    </button>
                    {call.recordingPath && (
                      <button
                        onClick={() => setExpanded(isOpen ? null : call.callSid)}
                        className="text-xs px-2 py-0.5 rounded transition-opacity hover:opacity-80"
                        style={{ background: t.successBg, color: t.success, border: `1px solid ${t.success}33` }}
                      >
                        Recording
                      </button>
                    )}
                    {confirmDel === call.callSid ? (
                      <>
                        <button onClick={() => doDelete(call.callSid)} className="text-xs font-semibold" style={{ color: t.error, background: 'none', border: 'none', cursor: 'pointer' }}>
                          Confirm
                        </button>
                        <button onClick={() => setConfirmDel(null)} className="text-xs" style={{ color: t.textMuted, background: 'none', border: 'none', cursor: 'pointer' }}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmDel(call.callSid)}
                        className="text-xs transition-opacity hover:opacity-70"
                        style={{ color: t.error, background: 'none', border: 'none', cursor: 'pointer' }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded transcript */}
                {isOpen && (
                  <div className="px-4 py-4 animate-fade-in" style={{ borderTop: `1px solid ${t.border}` }}>
                    {call.recordingPath && (
                      <div className="mb-4 flex items-center gap-3">
                        <span className="text-xs font-medium" style={{ color: t.success }}>Recording</span>
                        <audio
                          controls
                          src={`/api/transcripts/${call.callSid}/recording`}
                          style={{ height: 32, flex: 1, minWidth: 0, accentColor: t.success }}
                        />
                        <a
                          href={`/api/transcripts/${call.callSid}/recording`}
                          download={`alisu-${call.callSid}.wav`}
                          className="text-xs px-2 py-0.5 rounded"
                          style={{ background: t.successBg, color: t.success, border: `1px solid ${t.success}33`, textDecoration: 'none', whiteSpace: 'nowrap' }}
                        >
                          Download
                        </a>
                      </div>
                    )}
                    {messages.length > 0 ? (
                      <TranscriptPanel
                        messages={messages}
                        callLanguage={call.language}
                        targetLang={targetLang}
                        onTargetLangChange={onTargetLangChange}
                      />
                    ) : (
                      <p className="text-sm italic" style={{ color: t.textMuted }}>
                        {call.transcript || 'No transcript available'}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        </div>
      )}
    </div>
  )
}
