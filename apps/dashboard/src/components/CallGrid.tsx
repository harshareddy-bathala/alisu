import { CallState } from '../types'
import { CallCard } from './CallCard'
import { useTheme } from '../lib/ThemeContext'

interface Props {
  calls: CallState[]
  onTransfer: (callSid: string) => void
  onDelete?: (callSid: string) => void
  targetLang: string
  onTargetLangChange: (lang: string) => void
}

export function CallGrid({ calls, onTransfer, onDelete, targetLang, onTargetLangChange }: Props) {
  const t = useTheme()

  const sorted = [...calls].sort(
    (a, b) => new Date((b.startedAt || b.startTime || 0) as string).getTime()
           - new Date((a.startedAt || a.startTime || 0) as string).getTime()
  )

  if (sorted.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-xl py-20 border border-dashed"
        style={{ background: t.surface, borderColor: t.border }}
      >
        <svg
          className="mb-4 opacity-20"
          width="48" height="48" viewBox="0 0 24 24" fill="none"
          stroke={t.text} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
        <p className="text-sm font-medium" style={{ color: t.textMuted }}>No calls yet</p>
        <p className="text-xs mt-1" style={{ color: t.textMuted, opacity: 0.6 }}>
          Use TEST controls (bottom-left) to simulate a call
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {sorted.map(call => (
        <CallCard
          key={call.callSid}
          call={call}
          onTransfer={onTransfer}
          onDelete={onDelete}
          targetLang={targetLang}
          onTargetLangChange={onTargetLangChange}
        />
      ))}
    </div>
  )
}
