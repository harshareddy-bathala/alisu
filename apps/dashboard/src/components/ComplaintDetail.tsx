import { useState } from 'react'
import { Complaint, CallState } from '../types'
import { TranscriptPanel } from './TranscriptPanel'
import { authHeaders } from '../lib/api'
import { useTheme } from '../lib/ThemeContext'

interface Props {
  complaint: Complaint
  call?: CallState
  targetLang: string
  onTargetLangChange: (l: string) => void
  onClose: () => void
  onUpdated: (c: Complaint) => void
  onDeleted: (id: string) => void
}

const STATUS_STEPS: Complaint['status'][] = ['draft', 'filed', 'in_progress', 'resolved']
const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', filed: 'Filed', in_progress: 'In Progress', resolved: 'Resolved'
}

async function apiPatch(id: string, body: object): Promise<Complaint> {
  const r = await fetch(`/api/complaints/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
  return r.json()
}

export function ComplaintDetail({ complaint, call, targetLang, onTargetLangChange, onClose, onUpdated, onDeleted }: Props) {
  const t = useTheme()
  const [c, setC] = useState(complaint)
  const [editing, setEditing] = useState<Partial<Complaint>>({})
  const [resolveNotes, setResolveNotes] = useState('')
  const [resolving, setResolving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saving, setSaving] = useState(false)

  const PRIORITY_STYLE: Record<string, { bg: string; color: string }> = {
    critical: { bg: t.errorBg,   color: t.error   },
    high:     { bg: t.warningBg, color: t.warning },
    medium:   { bg: t.warningBg, color: t.warning },
    low:      { bg: t.bgElevated, color: t.textMuted },
  }

  const inputStyle: React.CSSProperties = {
    background: t.bgElevated,
    border: `1px solid ${t.border}`,
    color: t.text,
    borderRadius: 8,
    fontSize: 13,
    padding: '7px 12px',
    outline: 'none',
    width: '100%',
  }

  const field = (k: keyof Complaint) => (editing[k] !== undefined ? editing[k] : c[k]) as string

  const save = async () => {
    setSaving(true)
    try {
      const updated = await apiPatch(c.id, editing)
      setC(updated)
      setEditing({})
      onUpdated(updated)
    } finally { setSaving(false) }
  }

  const resolve = async () => {
    const r = await fetch(`/api/complaints/${c.id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ notes: resolveNotes }),
    })
    const updated = await r.json()
    setC(updated)
    setResolving(false)
    onUpdated(updated)
  }

  const del = async () => {
    await fetch(`/api/complaints/${c.id}`, { method: 'DELETE', headers: authHeaders() })
    onDeleted(c.id)
    onClose()
  }

  const ps = PRIORITY_STYLE[c.priority] ?? PRIORITY_STYLE.low
  const messages = call?.conversationHistory ?? []
  const backdrop = t.name === 'dark' ? 'rgba(8,12,20,0.65)' : 'rgba(15,23,42,0.35)'

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="flex-1 animate-fade-in" style={{ background: backdrop }} onClick={onClose} />

      <div
        className="w-full max-w-lg overflow-y-auto flex flex-col animate-slide-in-right"
        style={{
          background: t.surface,
          borderLeft: `1px solid ${t.border}`,
          boxShadow: t.shadowLg,
        }}
      >
        {/* Header */}
        <div
          className="sticky top-0 flex items-center gap-3 px-5 py-4 z-10"
          style={{ background: t.surface, borderBottom: `1px solid ${t.border}` }}
        >
          <span className="font-mono text-sm font-bold" style={{ color: t.text }}>{c.id}</span>
          <button
            onClick={() => navigator.clipboard?.writeText(c.id)}
            className="text-xs px-2 py-0.5 rounded transition-opacity hover:opacity-70"
            style={{ background: t.bgElevated, color: t.textMuted, border: `1px solid ${t.border}` }}
          >
            copy
          </button>
          <div className="ml-auto flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-xs font-semibold capitalize" style={{ background: ps.bg, color: ps.color }}>
              {c.priority}
            </span>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-lg leading-none transition-opacity hover:opacity-70"
              style={{ color: t.textMuted, background: 'transparent', border: 'none', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Status timeline */}
          <div>
            <p className="text-xs font-semibold uppercase mb-2 tracking-wider" style={{ color: t.textMuted }}>Status</p>
            <div className="flex items-center gap-1">
              {STATUS_STEPS.map((s, i) => (
                <div key={s} className="flex items-center gap-1 flex-1">
                  <button
                    onClick={async () => {
                      const updated = await apiPatch(c.id, { status: s })
                      setC(updated); onUpdated(updated)
                    }}
                    className="flex-1 py-1.5 text-xs rounded font-medium text-center transition-colors"
                    style={
                      c.status === s
                        ? { background: t.primary, color: t.primaryOn }
                        : { background: t.bgElevated, color: t.textMuted, border: `1px solid ${t.border}` }
                    }
                  >
                    {STATUS_LABELS[s]}
                  </button>
                  {i < STATUS_STEPS.length - 1 && (
                    <span style={{ color: t.textDim }}>›</span>
                  )}
                </div>
              ))}
            </div>
            {c.statusHistory.slice(-3).map((h, i) => (
              <p key={i} className="text-xs mt-1" style={{ color: t.textMuted }}>
                {STATUS_LABELS[h.status] ?? h.status} · {new Date(h.timestamp).toLocaleString()}
                {h.note ? ` — ${h.note}` : ''}
              </p>
            ))}
          </div>

          {/* Editable fields */}
          {([
            ['issueSummary',    'Issue Summary'],
            ['location',        'Location'],
            ['requestedAction', 'Requested Action'],
            ['fullDescription', 'Full Description'],
          ] as [keyof Complaint, string][]).map(([key, label]) => (
            <div key={key}>
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: t.textMuted }}>{label}</label>
              {key === 'fullDescription' ? (
                <textarea
                  rows={3}
                  value={field(key) ?? ''}
                  onChange={e => setEditing(p => ({ ...p, [key]: e.target.value }))}
                  style={{ ...inputStyle, resize: 'none', marginTop: 4 }}
                />
              ) : (
                <input
                  value={field(key) ?? ''}
                  onChange={e => setEditing(p => ({ ...p, [key]: e.target.value }))}
                  style={{ ...inputStyle, marginTop: 4 }}
                />
              )}
            </div>
          ))}

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: t.textMuted }}>Priority</label>
            <select
              value={editing.priority ?? c.priority}
              onChange={e => setEditing(p => ({ ...p, priority: e.target.value as Complaint['priority'] }))}
              style={{ ...inputStyle, marginTop: 4 }}
            >
              {['critical', 'high', 'medium', 'low'].map(p => (
                <option key={p} value={p} style={{ background: t.surface, color: t.text }}>{p}</option>
              ))}
            </select>
          </div>

          {Object.keys(editing).length > 0 && (
            <button
              onClick={save}
              disabled={saving}
              className="w-full py-2.5 text-sm font-semibold rounded-lg transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: t.primary, color: t.primaryOn }}
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          )}

          {/* Call info */}
          <div className="rounded-lg p-3 text-xs space-y-1" style={{ background: t.bgElevated, color: t.textMuted, border: `1px solid ${t.border}` }}>
            <p><span className="font-semibold" style={{ color: t.text }}>Call:</span> {c.callSid}</p>
            <p><span className="font-semibold" style={{ color: t.text }}>Filed:</span> {new Date(c.createdAt).toLocaleString()}</p>
            <p><span className="font-semibold" style={{ color: t.text }}>Language:</span> {c.language || '—'}</p>
            <p><span className="font-semibold" style={{ color: t.text }}>Department:</span> {c.department || '—'}</p>
            {c.resolvedAt && (
              <p><span className="font-semibold" style={{ color: t.text }}>Resolved:</span> {new Date(c.resolvedAt).toLocaleString()}</p>
            )}
          </div>

          {/* Resolve */}
          {c.status !== 'resolved' && (
            <div className="rounded-lg p-3" style={{ border: `1px solid ${t.success}45`, background: t.successBg }}>
              {!resolving ? (
                <button
                  onClick={() => setResolving(true)}
                  className="text-sm font-semibold hover:underline"
                  style={{ color: t.success, background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Mark as Resolved
                </button>
              ) : (
                <>
                  <p className="text-xs mb-1" style={{ color: t.textMuted }}>Resolution notes (optional):</p>
                  <textarea
                    rows={2}
                    value={resolveNotes}
                    onChange={e => setResolveNotes(e.target.value)}
                    placeholder="e.g. Pothole repaired by BBMP crew on 5 May"
                    style={{ ...inputStyle, resize: 'none', marginBottom: 8 }}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={resolve}
                      className="flex-1 py-1.5 text-sm rounded font-semibold transition-opacity hover:opacity-90"
                      style={{ background: t.success, color: '#fff' }}
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setResolving(false)}
                      className="text-sm transition-opacity hover:opacity-70"
                      style={{ color: t.textMuted, background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Transcript */}
          {messages.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase mb-2 tracking-wider" style={{ color: t.textMuted }}>Call Transcript</p>
              <TranscriptPanel
                messages={messages}
                callLanguage={call?.language}
                targetLang={targetLang}
                onTargetLangChange={onTargetLangChange}
              />
            </div>
          )}

          {/* Delete */}
          <div className="pt-2" style={{ borderTop: `1px solid ${t.border}` }}>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-xs transition-opacity hover:opacity-70"
                style={{ color: t.error, background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Delete complaint
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-xs" style={{ color: t.textMuted }}>Are you sure?</span>
                <button
                  onClick={del}
                  className="text-xs font-semibold hover:underline"
                  style={{ color: t.error, background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Yes, delete
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs transition-opacity hover:opacity-70"
                  style={{ color: t.textMuted, background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
