import { useEffect, useRef, useState } from 'react'
import { useCallSocket } from './hooks/useCallSocket'
import { authHeaders } from './lib/api'
import { StatsBar } from './components/StatsBar'
import { CallGrid } from './components/CallGrid'
import { TestControls } from './components/TestControls'
import { ComplaintsPage } from './pages/ComplaintsPage'
import { TranscriptsPage } from './pages/TranscriptsPage'
import { ThemeContext } from './lib/ThemeContext'
import { dark, light } from './lib/theme'

type Tab = 'calls' | 'complaints' | 'transcripts'

const DEFAULT_TARGET = 'en-IN'

function playChime() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.25)
    gain.gain.setValueAtTime(0.25, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.6)
    osc.onended = () => ctx.close()
  } catch {
    // AudioContext blocked; ignore
  }
}

export default function App() {
  const { calls, complaints, connected, ready } = useCallSocket()
  const [tab, setTab] = useState<Tab>('calls')

  const [isDark, setIsDark] = useState<boolean>(
    () => (localStorage.getItem('alisu.theme') ?? 'dark') !== 'light'
  )
  const t = isDark ? dark : light

  // Sync the CSS variable used by scrollbars + global elements that can't easily
  // pull from React context (e.g. ::-webkit-scrollbar-thumb).
  useEffect(() => {
    document.documentElement.style.setProperty('--scrollbar-thumb', t.scrollbarThumb)
    document.documentElement.style.colorScheme = t.name
  }, [t])

  const [targetLang, setTargetLangState] = useState<string>(
    () => localStorage.getItem('alisu.targetLang') || DEFAULT_TARGET
  )
  const setTargetLang = (lang: string) => {
    setTargetLangState(lang)
    localStorage.setItem('alisu.targetLang', lang)
  }

  const handleTransfer = async (callSid: string) => {
    try {
      const res = await fetch('/api/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ callSid }),
      })
      if (!res.ok) console.error('Transfer failed:', await res.text())
    } catch (err) {
      console.error('Transfer error:', err)
    }
  }

  const handleDelete = async (callSid: string) => {
    setDeletedLocally(prev => new Set(prev).add(callSid))
    try {
      await fetch('/api/transcripts/' + callSid, { method: 'DELETE', headers: authHeaders() })
    } catch (err) {
      console.error('Delete error:', err)
      setDeletedLocally(prev => { const s = new Set(prev); s.delete(callSid); return s })
    }
  }

  // Optimistic local delete set — items disappear immediately on delete click
  const [deletedLocally, setDeletedLocally] = useState<Set<string>>(new Set())

  const activeComplaints = complaints.filter(c => !c.deletedAt)
  const activeCalls = calls.filter(c => !(c as any).deletedAt && !deletedLocally.has(c.callSid))

  // Chime on new complaint filed
  const seededRef = useRef(false)
  const seenIdsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!ready) return
    if (!seededRef.current) {
      seededRef.current = true
      activeComplaints.forEach(c => seenIdsRef.current.add(c.id))
      return
    }
    const newOnes = activeComplaints.filter(c => !seenIdsRef.current.has(c.id))
    if (newOnes.length > 0) {
      newOnes.forEach(c => seenIdsRef.current.add(c.id))
      playChime()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeComplaints, ready])

  const liveCalls = activeCalls.filter(c => !['ended', 'transferred', 'completed'].includes(c.status))

  const tabs: [Tab, string, number][] = [
    ['calls',       'Live Calls',  liveCalls.length],
    ['complaints',  'Complaints',  activeComplaints.length],
    ['transcripts', 'Transcripts', activeCalls.length],
  ]

  return (
    <ThemeContext.Provider value={t}>
      <div className="min-h-screen flex flex-col font-sans" style={{ background: t.pageGradient, color: t.text }}>

        {/* HEADER */}
        <header
          className="px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between animate-fade-in"
          style={{
            borderBottom: `1px solid ${t.border}`,
            background: t.name === 'dark' ? 'rgba(17,26,44,0.85)' : 'rgba(255,255,255,0.85)',
            backdropFilter: 'blur(12px)',
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <div>
            <h1
              className="text-2xl font-bold tracking-tight"
              style={{
                background: `linear-gradient(135deg, ${t.text} 0%, ${t.primary} 100%)`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Alisu
            </h1>
            <p className="text-xs font-medium mt-0.5 tracking-wider uppercase" style={{ color: t.textMuted, letterSpacing: '0.1em' }}>
              Karnataka 1092 Helpline
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const next = !isDark
                setIsDark(next)
                localStorage.setItem('alisu.theme', next ? 'dark' : 'light')
              }}
              aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              className="transition-transform hover:scale-105 active:scale-95"
              style={{
                background: t.surface,
                border: `1px solid ${t.border}`,
                color: t.text,
                borderRadius: 999,
                width: 36, height: 36,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, cursor: 'pointer',
              }}
            >
              {isDark ? '☀' : '🌙'}
            </button>
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full"
              style={{ background: t.bgElevated, border: `1px solid ${t.border}` }}
            >
              <span className="relative flex h-1.5 w-1.5">
                {connected && (
                  <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ background: t.success }} />
                )}
                <span
                  className="relative inline-flex h-1.5 w-1.5 rounded-full"
                  style={{ background: connected ? t.success : t.error }}
                />
              </span>
              <span className="text-xs font-semibold" style={{ color: connected ? t.success : t.error }}>
                {connected ? 'Connected' : 'Offline'}
              </span>
            </div>
          </div>
        </header>

        {/* TABS */}
        <div
          className="flex px-4 sm:px-6 gap-0.5 overflow-x-auto"
          style={{ borderBottom: `1px solid ${t.border}`, scrollbarWidth: 'none' }}
        >
          {tabs.map(([id, label, count]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="flex-shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-all flex items-center gap-2 whitespace-nowrap"
              style={{
                borderBottomColor: tab === id ? t.primary : 'transparent',
                color: tab === id ? t.text : t.textMuted,
                background: 'transparent',
              }}
            >
              {label}
              {count > 0 && (
                <span
                  className="text-xs px-1.5 py-0.5 rounded-full font-semibold tabular-nums"
                  style={{
                    background: tab === id ? t.primaryBg : t.border,
                    color:      tab === id ? t.primary : t.textMuted,
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* BODY */}
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 md:p-8">

          {tab === 'calls' && (
            <div className="flex flex-col gap-6">
              {/* Stats row */}
              <div className="animate-fade-in" style={{ animationDelay: '200ms', opacity: 0 }}>
                <StatsBar calls={activeCalls} complaints={activeComplaints} />
              </div>

              {/* Live calls grid */}
              <div className="animate-fade-in" style={{ animationDelay: '400ms', opacity: 0 }}>
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="text-lg font-semibold" style={{ color: t.text }}>
                    Recent Calls
                  </h2>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: t.border, color: t.textMuted }}
                  >
                    {activeCalls.length}
                  </span>
                </div>
                <CallGrid
                  calls={activeCalls}
                  onTransfer={handleTransfer}
                  onDelete={handleDelete}
                  targetLang={targetLang}
                  onTargetLangChange={setTargetLang}
                />
              </div>
            </div>
          )}

          {tab === 'complaints' && (
            <div className="animate-fade-in">
              <ComplaintsPage
                complaints={activeComplaints}
                calls={activeCalls}
                targetLang={targetLang}
                onTargetLangChange={setTargetLang}
              />
            </div>
          )}

          {tab === 'transcripts' && (
            <div className="animate-fade-in">
              <TranscriptsPage
                calls={activeCalls}
                targetLang={targetLang}
                onTargetLangChange={setTargetLang}
              />
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="py-4 mt-auto" style={{ borderTop: `1px solid ${t.border}` }}>
          <p className="text-center text-xs font-medium tracking-wider" style={{ color: t.textDim, letterSpacing: '0.08em' }}>
            SARVAM AI · AI FOR BHARAT 2026
          </p>
        </footer>

        {/* Test controls — bottom-left, always rendered */}
        <TestControls calls={activeCalls} />
      </div>
    </ThemeContext.Provider>
  )
}
