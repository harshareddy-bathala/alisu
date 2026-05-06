import { useState } from 'react'
import { useTestCall } from '../hooks/useTestCall'
import { CallOverlay } from './CallOverlay'
import { CallState } from '../types'
import { useTheme } from '../lib/ThemeContext'

interface Props {
  calls: CallState[]
}

export function TestControls({ calls }: Props) {
  const t = useTheme()
  const [expanded, setExpanded] = useState(false)
  const { isActive, callStatus, amplitude, callSid, error, start, stop, speakingText, speakingDurationMs } = useTestCall()

  const currentCall = calls.find(c => c.callSid === callSid)

  return (
    <>
      {/* Full-screen call overlay */}
      {isActive && (
        <CallOverlay
          callStatus={callStatus}
          amplitude={amplitude}
          messages={currentCall?.conversationHistory ?? []}
          partialUserText={currentCall?.partialUserText}
          language={currentCall?.language}
          onEndCall={stop}
          speakingText={speakingText}
          speakingDurationMs={speakingDurationMs}
        />
      )}

      {/* Bottom-left test panel */}
      <div className="fixed bottom-6 left-6 z-40">
        {!expanded ? (
          <button
            onClick={() => setExpanded(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-full text-xs font-bold tracking-widest transition-all hover:scale-105 active:scale-95"
            style={{
              background: t.surface,
              border: `1px solid ${t.warning}55`,
              color: t.warning,
              boxShadow: t.shadow,
              backdropFilter: 'blur(8px)',
            }}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: t.warning, boxShadow: `0 0 8px ${t.warning}` }} />
            TEST
          </button>
        ) : (
          <div
            className="rounded-2xl p-4 w-56 animate-fade-up"
            style={{ background: t.surface, border: `1px solid ${t.border}`, boxShadow: t.shadowLg }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold tracking-widest" style={{ color: t.warning }}>
                TEST CONTROLS
              </span>
              <button
                onClick={() => setExpanded(false)}
                aria-label="Close test controls"
                className="text-base leading-none transition-opacity hover:opacity-60"
                style={{ color: t.textMuted, background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>

            {error && (
              <p className="text-xs mb-3 px-2 py-1 rounded" style={{ color: t.error, background: t.errorBg }}>
                {error}
              </p>
            )}

            {!isActive ? (
              <button
                onClick={() => { void start() }}
                className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 active:scale-95"
                style={{ background: t.primary, color: t.primaryOn }}
              >
                Simulate Call
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium"
                  style={{
                    background: callStatus === 'speaking' ? t.primaryBg : t.successBg,
                    color:      callStatus === 'speaking' ? t.primary   : t.success,
                  }}
                >
                  <span className="relative flex h-2 w-2">
                    <span
                      className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
                      style={{ background: callStatus === 'speaking' ? t.primary : t.success }}
                    />
                    <span
                      className="relative inline-flex h-2 w-2 rounded-full"
                      style={{ background: callStatus === 'speaking' ? t.primary : t.success }}
                    />
                  </span>
                  {callStatus === 'speaking' ? 'Alisu speaking' : callStatus === 'processing' ? 'Thinking…' : 'Listening'}
                </div>

                <button
                  onClick={stop}
                  className="w-full py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90 active:scale-95"
                  style={{ background: t.errorBg, color: t.error, border: `1px solid ${t.error}40` }}
                >
                  End Call
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
