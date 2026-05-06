import { useEffect, useRef } from 'react'
import type { ConversationMessage } from '../types'
import { LANG_NAMES, LANG_OPTIONS, toLangCode, useTranslations } from '../hooks/useTranslations'
import { CustomSelect } from './CustomSelect'
import { useTheme } from '../lib/ThemeContext'

interface TranscriptPanelProps {
  messages: ConversationMessage[]
  callLanguage?: string
  targetLang: string
  onTargetLangChange: (lang: string) => void
}

function formatTime(ts: Date | string): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

function Shimmer() {
  const t = useTheme()
  return (
    <div className="space-y-1.5">
      <div className="h-3 rounded w-5/6 animate-shimmer" style={{ background: t.border }} />
      <div className="h-3 rounded w-3/4 animate-shimmer" style={{ background: t.border }} />
    </div>
  )
}

export function TranscriptPanel({ messages, callLanguage, targetLang, onTargetLangChange }: TranscriptPanelProps) {
  const t = useTheme()
  const bottomRef = useRef<HTMLDivElement>(null)
  const getTranslation = useTranslations(messages, targetLang)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const detectedLang = callLanguage
    ? LANG_NAMES[toLangCode(callLanguage)] || callLanguage
    : 'Auto'

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 px-0.5">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: t.textMuted }}>
          Original ({detectedLang})
        </span>
        <CustomSelect
          value={targetLang}
          onChange={onTargetLangChange}
          options={LANG_OPTIONS.map(l => ({ value: l, label: LANG_NAMES[l] }))}
          compact
          style={{ minWidth: 100 }}
        />
      </div>

      {/* Bubbles */}
      <div className="overflow-y-auto flex-1 space-y-2 max-h-64">
        {messages.length === 0 ? (
          <p className="text-xs italic text-center py-4" style={{ color: t.textMuted }}>
            Waiting for conversation…
          </p>
        ) : (
          messages.map((msg, i) => {
            const tr = getTranslation(msg)
            const isSame = tr?.status === 'same'
            const isAlisu = msg.speaker === 'alisu'
            const speakerColor = isAlisu ? t.primary : t.success
            const speakerBg    = isAlisu ? t.primaryBg : t.successBg

            return (
              <div
                key={i}
                className="rounded-lg overflow-hidden animate-fade-up"
                style={{ border: `1px solid ${t.border}`, animationDelay: `${i * 20}ms` }}
              >
                {/* Speaker row */}
                <div
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium"
                  style={{ background: speakerBg, color: speakerColor }}
                >
                  <span>{isAlisu ? '🤖' : '👤'}</span>
                  <span>{isAlisu ? 'Alisu' : 'Citizen'}</span>
                  <span className="ml-auto" style={{ color: t.textMuted }}>{formatTime(msg.timestamp)}</span>
                </div>

                {/* Dual column */}
                <div className="flex" style={{ borderTop: `1px solid ${t.border}` }}>
                  <div className="flex-1 px-2.5 py-2 text-xs min-w-0" style={{ color: t.text }}>
                    <p className="break-words">{msg.text}</p>
                  </div>
                  <div style={{ width: 1, background: t.border, flexShrink: 0 }} />
                  <div className="flex-1 px-2.5 py-2 text-xs min-w-0" style={{ color: t.textMuted }}>
                    {isSame ? (
                      <p className="italic" style={{ color: t.textDim }}>—</p>
                    ) : tr?.status === 'loading' ? (
                      <Shimmer />
                    ) : tr?.status === 'done' || tr?.status === 'error' ? (
                      <p className="break-words">{tr.text}</p>
                    ) : (
                      <Shimmer />
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
