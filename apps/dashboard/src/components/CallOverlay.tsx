import { useEffect, useRef, useState } from 'react'
import { VoiceAnimation, VoiceState } from './VoiceAnimation'
import { CallSocketStatus } from '../lib/call-socket'
import { ConversationMessage } from '../types'
import { useTheme } from '../lib/ThemeContext'

// Browser amplitude is raw RMS (0..1). Speech RMS sits around 0.04-0.15;
// fan / keyboard / room tone live around 0.003-0.015. Anything below this
// is treated as "no one is talking" so the wave doesn't react to a quiet room.
const USER_SPEECH_THRESHOLD = 0.025
// We require this many consecutive above-threshold ticks before showing the
// "user speaking" wave. A single click/clap won't crank up the bars.
const USER_SPEECH_SUSTAIN   = 2

const LANG_LABEL: Record<string, string> = {
  kn: 'KN', 'kn-IN': 'KN',
  hi: 'HI', 'hi-IN': 'HI',
  en: 'EN', 'en-IN': 'EN',
}

interface Props {
  callStatus: CallSocketStatus
  amplitude: number
  messages: ConversationMessage[]
  partialUserText?: string
  language?: string
  onEndCall: () => void
  speakingText?: string
  speakingDurationMs?: number
}

export function CallOverlay({ callStatus, amplitude, messages, partialUserText, language, onEndCall, speakingText, speakingDurationMs }: Props) {
  const t = useTheme()

  // Sustained "is the user actually speaking" gate. Without this, a single
  // amplitude blip from a click or door bump flips the wave on for one frame.
  const sustainRef = useRef(0)
  const [userActive, setUserActive] = useState(false)

  useEffect(() => {
    if (callStatus !== 'listening') {
      sustainRef.current = 0
      if (userActive) setUserActive(false)
      return
    }
    if (amplitude > USER_SPEECH_THRESHOLD) {
      sustainRef.current = Math.min(USER_SPEECH_SUSTAIN, sustainRef.current + 1)
      if (sustainRef.current >= USER_SPEECH_SUSTAIN && !userActive) setUserActive(true)
    } else {
      sustainRef.current = Math.max(0, sustainRef.current - 1)
      if (sustainRef.current === 0 && userActive) setUserActive(false)
    }
  }, [amplitude, callStatus, userActive])

  const voiceState: VoiceState =
    callStatus === 'speaking'    ? 'alisu_speaking' :
    callStatus === 'processing'  ? 'processing'     :
    userActive                   ? 'user_speaking'  : 'idle'

  // Word-by-word animation for the active Alisu line — paced to match TTS.
  const [revealedWords, setRevealedWords] = useState(Infinity)

  useEffect(() => {
    if (!speakingText || !speakingDurationMs) {
      setRevealedWords(Infinity)
      return
    }
    const words = speakingText.trim().split(/\s+/)
    setRevealedWords(1)
    const msPerWord = speakingDurationMs / words.length
    let count = 1
    const timer = setInterval(() => {
      count++
      setRevealedWords(count)
      if (count >= words.length) { clearInterval(timer); setRevealedWords(Infinity) }
    }, msPerWord)
    return () => { clearInterval(timer); setRevealedWords(Infinity) }
  }, [speakingText, speakingDurationMs])

  useEffect(() => {
    if (callStatus !== 'speaking') setRevealedWords(Infinity)
  }, [callStatus])

  const lastThree = messages.slice(-3)
  const lastAlisuIdx = lastThree.reduce((acc, m, i) => m.speaker === 'alisu' ? i : acc, -1)
  const langCode = LANG_LABEL[language ?? ''] ?? 'KN'

  const statusConfig: Record<string, { label: string; color: string }> = {
    speaking:   { label: 'ALISU IS SPEAKING', color: t.speaking   },
    processing: { label: 'PROCESSING',        color: t.warning    },
    listening:  { label: 'LISTENING',         color: t.listening  },
    idle:       { label: 'LISTENING',         color: t.listening  },
  }
  const sc = statusConfig[callStatus] ?? statusConfig.listening

  // Light-mode and dark-mode use a slightly tinted glassy backdrop.
  const overlayBg = t.name === 'dark'
    ? 'rgba(8,12,20,0.96)'
    : 'rgba(246,247,251,0.96)'

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col animate-fade-in"
      style={{ background: overlayBg, backdropFilter: 'blur(24px)' }}
    >
      {/* TOP — status label */}
      <div className="flex items-end justify-center" style={{ height: '20%' }}>
        <p
          key={callStatus}
          className="text-xs font-semibold tracking-widest uppercase animate-fade-in"
          style={{ color: sc.color, letterSpacing: '0.22em' }}
        >
          {sc.label}
        </p>
      </div>

      {/* MIDDLE — voice animation + language badge */}
      <div className="flex flex-col items-center justify-center gap-6" style={{ height: '50%' }}>
        <VoiceAnimation state={voiceState} amplitude={amplitude} />
        <span
          className="px-3 py-1 rounded-full text-xs font-bold tracking-widest"
          style={{ background: t.bgElevated, color: t.textMuted, border: `1px solid ${t.border}` }}
        >
          {langCode}
        </span>
      </div>

      {/* BOTTOM — last 3 conversation bubbles + live partial */}
      <div
        className="flex flex-col justify-end gap-2 px-6 pb-4 overflow-y-auto"
        style={{ height: '32%' }}
      >
        {/* Live partial transcript — visible only while user is mid-utterance.
            Appears within ~2s of the user speaking, so the demonstrator never
            wonders if the call is hung. Replaced by the real bubble once the
            LLM round-trip starts. */}
        {partialUserText && callStatus === 'listening' && (
          <div className="flex justify-end animate-fade-up flex-shrink-0">
            <p
              className="text-sm px-4 py-2.5"
              style={{
                wordBreak: 'break-word',
                overflowWrap: 'break-word',
                maxWidth: '80%',
                background: 'transparent',
                color: t.textMuted,
                border: `1px dashed ${t.success}66`,
                borderRadius: '16px 16px 4px 16px',
                fontStyle: 'italic',
              }}
            >
              {partialUserText}
              <span
                className="inline-block w-0.5 h-4 ml-0.5 align-middle animate-pulse"
                style={{ background: t.success, verticalAlign: 'middle' }}
              />
            </p>
          </div>
        )}

        {lastThree.map((msg, i) => {
          const isAnimatedMsg = i === lastAlisuIdx && speakingText === msg.text
          const displayText = isAnimatedMsg
            ? msg.text.trim().split(/\s+/).slice(0, revealedWords).join(' ')
            : msg.text

          return (
            <div
              key={i}
              className={`flex animate-fade-up flex-shrink-0 ${msg.speaker === 'user' ? 'justify-end' : 'justify-start'}`}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <p
                className="text-sm px-4 py-2.5"
                style={{
                  wordBreak: 'break-word',
                  overflowWrap: 'break-word',
                  maxWidth: '80%',
                  ...(msg.speaker === 'user'
                    ? {
                        background: t.successBg,
                        color: t.text,
                        borderRadius: '16px 16px 4px 16px',
                        border: `1px solid ${t.success}30`,
                      }
                    : {
                        background: t.surface,
                        color: t.text,
                        borderLeft: `2px solid ${t.speaking}`,
                        borderRadius: '0 16px 16px 0',
                        minHeight: 36,
                      }),
                }}
              >
                {displayText}
                {isAnimatedMsg && revealedWords !== Infinity && (
                  <span
                    className="inline-block w-0.5 h-4 ml-0.5 align-middle animate-pulse"
                    style={{ background: t.speaking, verticalAlign: 'middle' }}
                  />
                )}
              </p>
            </div>
          )
        })}
      </div>

      {/* BOTTOM BAR — end call button */}
      <div className="flex flex-col items-center gap-2 pb-10">
        <button
          onClick={onEndCall}
          className="flex items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95"
          style={{ width: 64, height: 64, background: t.error, boxShadow: `0 8px 28px ${t.error}55` }}
          aria-label="End call"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.42 19.42 0 0 1 4.43 9.88a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.34 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.34 8.91" />
            <line x1="23" y1="1" x2="1" y2="23" />
          </svg>
        </button>
        <span className="text-xs" style={{ color: t.textMuted }}>Tap to end call</span>
      </div>
    </div>
  )
}
