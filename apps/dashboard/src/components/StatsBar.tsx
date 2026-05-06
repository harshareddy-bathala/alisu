import { useEffect, useRef, useState } from 'react'
import { CallState } from '../types'
import { Complaint } from '../types'
import { useTheme } from '../lib/ThemeContext'

function useCountUp(target: number, duration = 600): number {
  const [val, setVal] = useState(0)
  const prevTarget = useRef(0)

  useEffect(() => {
    const from = prevTarget.current
    prevTarget.current = target
    let startTime = 0

    const animate = (ts: number) => {
      if (!startTime) startTime = ts
      const progress = Math.min((ts - startTime) / duration, 1)
      const eased = 1 - (1 - progress) ** 3
      setVal(Math.round(from + (target - from) * eased))
      if (progress < 1) requestAnimationFrame(animate)
    }

    requestAnimationFrame(animate)
  }, [target, duration])

  return val
}

interface Props {
  calls: CallState[]
  complaints: Complaint[]
}

interface StatProps {
  label: string
  value: number | string
  accent: string
  icon: string
}

function StatCard({ label, value, accent, icon }: StatProps) {
  const t = useTheme()
  const counted = useCountUp(typeof value === 'number' ? value : 0)
  const displayed = typeof value === 'number' ? counted : value

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3 relative overflow-hidden"
      style={{
        background: t.surface,
        boxShadow: `0 1px 3px rgba(0,0,0,0.1), 0 0 0 1px ${t.border}`,
      }}
    >
      {/* Accent top bar */}
      <div
        className="absolute top-0 left-0 right-0"
        style={{ height: 2, background: accent, borderRadius: '8px 8px 0 0' }}
      />

      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: t.textMuted, letterSpacing: '0.12em' }}>
          {label}
        </span>
        <span className="text-base opacity-40">{icon}</span>
      </div>

      <span
        className="text-3xl font-bold tabular-nums"
        style={{ color: accent }}
      >
        {displayed}
      </span>
    </div>
  )
}

export function StatsBar({ calls, complaints }: Props) {
  const t = useTheme()

  const activeCalls = calls.filter(c =>
    ['active', 'speaking', 'processing', 'verifying'].includes(c.status)
  ).length

  const today = new Date().toDateString()
  const completedToday = calls.filter(c =>
    (c.status === 'ended' || c.status === 'completed') &&
    new Date((c.startedAt || c.startTime) as string).toDateString() === today
  ).length

  const filedComplaints = complaints.filter(c => !c.deletedAt).length

  const endedWithDuration = calls.filter(c => {
    const hasEnded = c.status === 'ended' || c.status === 'completed'
    const hasStart = c.startedAt || c.startTime
    const hasEnd = (c as any).endedAt
    return hasEnded && hasStart && hasEnd
  })
  const avgMs = endedWithDuration.length > 0
    ? endedWithDuration.reduce((sum, c) => {
        return sum + (new Date((c as any).endedAt).getTime() - new Date((c.startedAt || c.startTime) as string).getTime())
      }, 0) / endedWithDuration.length
    : 0
  const avgLabel = avgMs > 0
    ? `${Math.floor(avgMs / 60000)}m ${Math.round((avgMs % 60000) / 1000)}s`
    : '—'

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard label="Active Calls"     value={activeCalls}     accent={t.success} icon="📞" />
      <StatCard label="Completed Today"  value={completedToday}  accent={t.primary} icon="✓" />
      <StatCard label="Complaints Filed" value={filedComplaints} accent={t.warning} icon="📋" />
      <StatCard label="Avg Handle Time"  value={avgLabel}        accent={t.textMuted} icon="⏱" />
    </div>
  )
}
