import { useState } from 'react'
import { Complaint, CallState } from '../types'
import { ComplaintDetail } from '../components/ComplaintDetail'
import { CustomSelect } from '../components/CustomSelect'
import { useTheme } from '../lib/ThemeContext'

interface Props {
  complaints: Complaint[]
  calls: CallState[]
  targetLang: string
  onTargetLangChange: (l: string) => void
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', filed: 'Filed', in_progress: 'In Progress', resolved: 'Resolved'
}

const DEPARTMENTS = ['BBMP', 'Police', 'Revenue', 'Electricity', 'Water', 'Health', 'Fire', 'Labour', 'Transport', 'Other']

export function ComplaintsPage({ complaints, calls, targetLang, onTargetLangChange }: Props) {
  const t = useTheme()
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterPriority, setFilterPriority] = useState('all')
  const [filterDept, setFilterDept] = useState('all')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selected, setSelected] = useState<Complaint | null>(null)
  const [localComplaints, setLocalComplaints] = useState<Map<string, Complaint>>(new Map())

  const PRIORITY_STYLE: Record<string, { bg: string; color: string }> = {
    critical: { bg: t.errorBg,   color: t.error   },
    high:     { bg: t.warningBg, color: t.warning },
    medium:   { bg: t.warningBg, color: t.warning },
    low:      { bg: t.bgElevated, color: t.textMuted },
  }
  const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
    draft:       { bg: t.bgElevated, color: t.textMuted },
    filed:       { bg: t.primaryBg,  color: t.primary   },
    in_progress: { bg: t.warningBg,  color: t.warning   },
    resolved:    { bg: t.successBg,  color: t.success   },
  }

  const inputStyle: React.CSSProperties = {
    background: t.bgElevated,
    border: `1px solid ${t.border}`,
    color: t.text,
    borderRadius: 10,
    fontSize: 13,
    padding: '7px 14px',
    outline: 'none',
  }

  const merged = complaints.map(c => localComplaints.get(c.id) ?? c)
  const filtered = merged.filter(c => {
    if (c.deletedAt) return false
    if (filterStatus !== 'all' && c.status !== filterStatus) return false
    if (filterPriority !== 'all' && c.priority !== filterPriority) return false
    if (filterDept !== 'all' && c.department !== filterDept) return false
    if (search) {
      const q = search.toLowerCase()
      if (!`${c.issueSummary} ${c.fullDescription ?? ''}`.toLowerCase().includes(q)) return false
    }
    if (dateFrom && new Date(c.createdAt) < new Date(dateFrom)) return false
    if (dateTo && new Date(c.createdAt) > new Date(dateTo + 'T23:59:59')) return false
    return true
  }).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))

  const handleUpdated = (c: Complaint) => {
    setLocalComplaints(prev => new Map(prev).set(c.id, c))
    if (selected?.id === c.id) setSelected(c)
  }

  const handleDeleted = (id: string) => {
    setLocalComplaints(prev => {
      const m = new Map(prev)
      const c = m.get(id)
      if (c) m.set(id, { ...c, deletedAt: new Date() })
      return m
    })
  }

  const sel = selected ? (localComplaints.get(selected.id) ?? selected) : null
  const selCall = sel ? calls.find(c => c.callSid === sel.callSid) : undefined

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-xl font-bold" style={{ color: t.text }}>Complaints</h2>
        <span
          className="px-2 py-0.5 rounded-full text-sm font-semibold"
          style={{ background: t.primaryBg, color: t.primary }}
        >
          {filtered.length}
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6 items-center">
        <input
          type="text"
          placeholder="Search…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, minWidth: 180 }}
        />
        {([
          ['Status',   ['all', 'draft', 'filed', 'in_progress', 'resolved'], filterStatus,   setFilterStatus],
          ['Priority', ['all', 'critical', 'high', 'medium', 'low'],         filterPriority, setFilterPriority],
        ] as [string, string[], string, (v: string) => void][]).map(([label, opts, val, set]) => (
          <CustomSelect
            key={label}
            value={val}
            onChange={set}
            options={opts.map(o => ({
              value: o,
              label: o === 'all' ? `All ${label}` : (STATUS_LABEL[o] ?? o),
            }))}
            style={{ minWidth: 140 }}
          />
        ))}
        <CustomSelect
          value={filterDept}
          onChange={setFilterDept}
          options={[
            { value: 'all', label: 'All Departments' },
            ...DEPARTMENTS.map(d => ({ value: d, label: d })),
          ]}
          style={{ minWidth: 160 }}
        />
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="From" style={inputStyle} />
        <input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   title="To"   style={inputStyle} />
        {(dateFrom || dateTo) && (
          <button
            onClick={() => { setDateFrom(''); setDateTo('') }}
            className="text-xs px-3 py-1.5 rounded-lg transition-opacity hover:opacity-70"
            style={{ background: t.bgElevated, color: t.textMuted, border: `1px solid ${t.border}` }}
          >
            Clear dates
          </button>
        )}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-3 opacity-60">📋</p>
          <p className="font-medium" style={{ color: t.textMuted }}>No complaints yet</p>
          <p className="text-sm mt-1" style={{ color: t.textDim }}>
            Complaints appear when a citizen confirms their issue
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c, i) => {
            const ps = PRIORITY_STYLE[c.priority] ?? PRIORITY_STYLE.low
            const ss = STATUS_STYLE[c.status]   ?? STATUS_STYLE.draft
            return (
              <button
                key={c.id}
                className="rounded-2xl p-4 cursor-pointer text-left animate-fade-up"
                style={{
                  background: t.surface,
                  border: `1px solid ${t.border}`,
                  boxShadow: t.shadow,
                  animationDelay: `${Math.min(i * 30, 240)}ms`,
                }}
                onMouseEnter={e => {
                  ;(e.currentTarget as HTMLElement).style.borderColor = t.primaryBorder
                  ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={e => {
                  ;(e.currentTarget as HTMLElement).style.borderColor = t.border
                  ;(e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
                }}
                onClick={() => setSelected(c)}
              >
                <p className="font-mono text-xs font-bold mb-2.5" style={{ color: t.warning }}>{c.id}</p>

                <div className="flex flex-wrap gap-1.5 mb-3">
                  <span
                    className="px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize"
                    style={{ background: ps.bg, color: ps.color }}
                  >
                    {c.priority}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{ background: ss.bg, color: ss.color }}>
                    {STATUS_LABEL[c.status] ?? c.status}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium" style={{ background: t.primaryBg, color: t.primary, border: `1px solid ${t.primaryBorder}` }}>
                    {c.department}
                  </span>
                </div>

                <p className="text-sm line-clamp-2 mb-3" style={{ color: t.text, lineHeight: 1.5 }}>{c.issueSummary}</p>

                <div className="text-xs space-y-0.5" style={{ color: t.textMuted }}>
                  {c.location && <p>📍 {c.location}</p>}
                  <p>{c.language} · {new Date(c.createdAt).toLocaleString()}</p>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {sel && (
        <ComplaintDetail
          complaint={sel}
          call={selCall}
          targetLang={targetLang}
          onTargetLangChange={onTargetLangChange}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  )
}
