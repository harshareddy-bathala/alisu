import { useEffect, useRef, useState } from 'react'
import { useTheme } from '../lib/ThemeContext'

export type VoiceState = 'idle' | 'user_speaking' | 'alisu_speaking' | 'processing' | 'error'

interface Props {
  state: VoiceState
  amplitude?: number
}

// Fixed footprint for every state. Without this the page reflows whenever the
// state changes (28×28 dot ↔ 56-tall bars ↔ 140-tall orb), which the user sees
// as the bar animation "flickering with other shapes" mid-utterance.
const BOX = 160

export function VoiceAnimation({ state, amplitude = 0 }: Props) {
  const t = useTheme()
  const [heights, setHeights] = useState([20, 20, 20, 20, 20])
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (state !== 'user_speaking') {
      cancelAnimationFrame(rafRef.current)
      // Don't reset heights to 20 — keep last frame so the bars fade out at
      // their current height instead of snapping flat (the snap reads as a
      // flicker when state oscillates).
      return
    }

    const phases = [0, 0.4, 0.8, 1.2, 1.6]
    const startTime = Date.now()

    const tick = () => {
      const elapsed = (Date.now() - startTime) / 1000
      // Map raw RMS (~0.02 quiet … ~0.20 loud speech) to a usable visual range.
      const energy = Math.min(1, Math.max(0.18, amplitude * 6))
      const next = phases.map(phase => {
        const wave = Math.sin(elapsed * 5 + phase * Math.PI) * 0.5 + 0.5
        return 22 + wave * energy * 78
      })
      setHeights(next)
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [state, amplitude])

  // Each layer is absolutely positioned and cross-fades on visibility.
  const layer: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'opacity 220ms ease',
    pointerEvents: 'none',
  }

  return (
    <div className="relative" style={{ width: BOX, height: BOX }}>
      {/* idle dot */}
      <div style={{ ...layer, opacity: state === 'idle' ? 1 : 0 }}>
        <div
          className="rounded-full animate-pulse-dim"
          style={{
            width: 28, height: 28,
            background: t.textMuted,
            boxShadow: `0 0 24px ${t.textMuted}55`,
          }}
        />
      </div>

      {/* user speaking bars */}
      <div style={{ ...layer, opacity: state === 'user_speaking' ? 1 : 0 }}>
        <div className="flex items-end gap-2" style={{ height: 64 }}>
          {heights.map((h, i) => (
            <div
              key={i}
              className="rounded-full"
              style={{
                width: 5,
                height: `${Math.min(100, h)}%`,
                background: t.listening,
                boxShadow: `0 0 10px ${t.listening}80`,
                transition: 'height 80ms ease',
              }}
            />
          ))}
        </div>
      </div>

      {/* alisu speaking — concentric rings + breathing orb */}
      <div style={{ ...layer, opacity: state === 'alisu_speaking' ? 1 : 0 }}>
        <div className="relative flex items-center justify-center" style={{ width: 140, height: 140 }}>
          <div
            className="absolute rounded-full animate-ring-out"
            style={{
              width: 140,
              height: 140,
              border: `1px solid ${t.speaking}55`,
              filter: 'blur(2px)',
            }}
          />
          <div
            className="absolute rounded-full animate-ring-out"
            style={{
              width: 110,
              height: 110,
              border: `1px solid ${t.speaking}88`,
              animationDelay: '500ms',
            }}
          />
          <div
            className="rounded-full animate-orb-breathe"
            style={{
              width: 88,
              height: 88,
              background: `radial-gradient(circle at center, ${t.speaking} 0%, ${t.speaking}33 60%, transparent 100%)`,
              boxShadow: `0 0 40px ${t.speaking}66`,
            }}
          />
        </div>
      </div>

      {/* processing dots */}
      <div style={{ ...layer, opacity: state === 'processing' ? 1 : 0 }}>
        <div className="flex items-center gap-2.5">
          {[0, 160, 320].map((delay, i) => (
            <div
              key={i}
              className="rounded-full animate-dot-bob"
              style={{
                width: 10, height: 10,
                background: t.warning,
                boxShadow: `0 0 8px ${t.warning}88`,
                animationDelay: `${delay}ms`,
              }}
            />
          ))}
        </div>
      </div>

      {/* error */}
      <div style={{ ...layer, opacity: state === 'error' ? 1 : 0 }}>
        <div className="rounded-full" style={{ width: 28, height: 28, background: t.error }} />
      </div>
    </div>
  )
}
