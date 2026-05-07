import { useEffect, useRef, useState } from 'react'

/* ────────────────── CONFIG (edit these for your demo) ────────────────── */
const DEMO_URL    = 'https://www.youtube.com/watch?v=2gmKhe9Cabc' // ← your DigitalOcean dashboard URL
const GITHUB_URL  = 'https://github.com/harshareddy-bathala/alisu' // ← your repo
const VIDEO_ID    = '2gmKhe9Cabc'                // ← YouTube ID (e.g. dQw4w9WgXcQ)

const LANGUAGES = [
  { code: 'kn', name: 'Kannada',   word: 'ನಮಸ್ಕಾರ',     color: '#7C8CFF' },
  { code: 'hi', name: 'Hindi',     word: 'नमस्ते',       color: '#F472B6' },
  { code: 'ta', name: 'Tamil',     word: 'வணக்கம்',     color: '#34D399' },
  { code: 'te', name: 'Telugu',    word: 'నమస్కారం',    color: '#FBBF24' },
  { code: 'ml', name: 'Malayalam', word: 'നമസ്കാരം',   color: '#22D3EE' },
  { code: 'bn', name: 'Bengali',   word: 'নমস্কার',     color: '#A78BFA' },
  { code: 'mr', name: 'Marathi',   word: 'नमस्कार',     color: '#FB7185' },
  { code: 'gu', name: 'Gujarati',  word: 'નમસ્તે',       color: '#60A5FA' },
  { code: 'pa', name: 'Punjabi',   word: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ', color: '#F59E0B' },
  { code: 'od', name: 'Odia',      word: 'ନମସ୍କାର',    color: '#10B981' },
  { code: 'en', name: 'English',   word: 'Hello',        color: '#E5E7EB' },
]

/* ────────────────── Reveal-on-scroll hook ────────────────── */
function useRevealOnScroll() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('.reveal'))
    const io = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('in')
            io.unobserve(e.target)
          }
        }
      },
      { threshold: 0.18, rootMargin: '0px 0px -80px 0px' },
    )
    els.forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [])
}

/* ────────────────── Hero voice orb ────────────────── */
function VoiceOrb() {
  return (
    <div className="relative flex items-center justify-center" style={{ width: 320, height: 320 }}>
      {[0, 1, 2].map(i => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            width: 240 + i * 40,
            height: 240 + i * 40,
            border: `1px solid rgba(124,140,255,${0.3 - i * 0.08})`,
            animation: `ring-expand 3.2s ease-out infinite`,
            animationDelay: `${i * 0.7}s`,
          }}
        />
      ))}
      <div
        className="rounded-full animate-orb-pulse"
        style={{
          width: 200,
          height: 200,
          background: 'radial-gradient(circle, #7C8CFF 0%, rgba(124,140,255,0.35) 50%, transparent 100%)',
          boxShadow: '0 0 80px rgba(124,140,255,0.6), inset 0 0 60px rgba(196,181,253,0.4)',
        }}
      />
      {/* Vertical wave bars inside the orb */}
      <div className="absolute flex items-center gap-2">
        {[0, 1, 2, 3, 4, 5, 6].map(i => (
          <div
            key={i}
            style={{
              width: 4,
              height: 50,
              borderRadius: 4,
              background: 'linear-gradient(180deg, #FFFFFF 0%, #C4B5FD 100%)',
              transformOrigin: 'center',
              animation: 'wave-bar 1.1s ease-in-out infinite',
              animationDelay: `${i * 0.08}s`,
            }}
          />
        ))}
      </div>
    </div>
  )
}

/* ────────────────── Cycling-language word ────────────────── */
function CyclingHello() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setI(x => (x + 1) % LANGUAGES.length), 1800)
    return () => clearInterval(id)
  }, [])
  const lang = LANGUAGES[i]
  return (
    <span
      key={i}
      className="inline-block animate-fade-up font-display tracking-tight"
      style={{ color: lang.color }}
    >
      {lang.word}
    </span>
  )
}

/* ────────────────── Header ────────────────── */
function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md" style={{ background: 'rgba(5,6,11,0.6)', borderBottom: '1px solid rgba(124,140,255,0.08)' }}>
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <a href="#top" className="flex items-center gap-2.5 group">
          <div className="relative w-8 h-8 rounded-lg overflow-hidden" style={{ background: 'radial-gradient(circle, #7C8CFF 0%, #1E2A42 80%)' }}>
            <div className="absolute inset-1.5 rounded-md bg-white/95" />
          </div>
          <span className="font-display font-bold text-lg tracking-tight">Alisu</span>
        </a>

        <nav className="hidden md:flex items-center gap-8 text-sm text-white/60">
          <a className="hover:text-white transition-colors" href="#languages">Languages</a>
          <a className="hover:text-white transition-colors" href="#how-it-works">How it works</a>
          <a className="hover:text-white transition-colors" href="#features">Features</a>
          <a className="hover:text-white transition-colors" href="#demo">Demo</a>
        </nav>

        <div className="flex items-center gap-3">
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="hidden sm:inline-flex btn-ghost text-sm" style={{ padding: '0.55rem 1rem' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.4 3-.405 1.02.005 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
            GitHub
          </a>
          <a href={DEMO_URL} target="_blank" rel="noreferrer" className="btn-primary text-sm" style={{ padding: '0.55rem 1.1rem' }}>
            Live demo
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
          </a>
        </div>
      </div>
    </header>
  )
}

/* ────────────────── Hero ────────────────── */
function Hero() {
  return (
    <section id="top" className="relative hero-bg min-h-screen flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 grid-overlay pointer-events-none" />

      {/* Floating orbs in the background */}
      <div className="absolute top-32 left-10 w-72 h-72 rounded-full opacity-30 animate-float pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(124,140,255,0.5), transparent 70%)', filter: 'blur(40px)' }} />
      <div className="absolute bottom-32 right-10 w-96 h-96 rounded-full opacity-25 animate-float pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(236,72,153,0.4), transparent 70%)', filter: 'blur(50px)', animationDelay: '1.4s' }} />

      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-32 pb-20 grid lg:grid-cols-[1.2fr_1fr] gap-12 items-center">
        {/* Left — text */}
        <div className="space-y-7">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium tracking-wider uppercase glass animate-fade-in">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-dot" />
            Live · Sarvam AI for Bharat 2025
          </div>

          <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.05] tracking-tight animate-fade-up">
            <span className="block">Citizens speak</span>
            <span className="block">
              <CyclingHello />
            </span>
            <span className="block shimmer-text">Alisu listens.</span>
          </h1>

          <p className="text-lg sm:text-xl text-white/70 max-w-xl leading-relaxed animate-fade-up" style={{ animationDelay: '120ms' }}>
            A real-time, multilingual voice AI for the Karnataka 1092 helpline.
            Eleven Indian languages. End-to-end on Sarvam AI.
            Citizens get heard. Operators get structured complaints.
          </p>

          <div className="flex flex-wrap items-center gap-3 animate-fade-up" style={{ animationDelay: '240ms' }}>
            <a href={DEMO_URL} target="_blank" rel="noreferrer" className="btn-primary">
              Try the live demo
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
            </a>
            <a href="#demo" className="btn-ghost">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              Watch the demo
            </a>
          </div>

          {/* Mini stats */}
          <div className="flex items-center gap-8 pt-6 animate-fade-up" style={{ animationDelay: '360ms' }}>
            {[
              { v: '11', l: 'Indian languages' },
              { v: '<3s', l: 'Avg turn latency' },
              { v: '24/7', l: 'Always available' },
            ].map(s => (
              <div key={s.l}>
                <div className="text-2xl sm:text-3xl font-display font-bold">{s.v}</div>
                <div className="text-xs uppercase tracking-widest text-white/50 mt-1">{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right — voice orb */}
        <div className="flex justify-center lg:justify-end animate-fade-in" style={{ animationDelay: '300ms' }}>
          <VoiceOrb />
        </div>
      </div>

      {/* Scroll cue */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/40 text-xs flex flex-col items-center gap-2 animate-fade-in" style={{ animationDelay: '900ms' }}>
        <span className="tracking-widest uppercase">Scroll</span>
        <div className="w-px h-8 bg-gradient-to-b from-white/40 to-transparent" />
      </div>
    </section>
  )
}

/* ────────────────── Languages section ────────────────── */
function LanguagesSection() {
  return (
    <section id="languages" className="relative py-32 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="reveal max-w-2xl mb-16">
          <p className="text-xs uppercase tracking-widest text-indigo-300/80 mb-4">Multilingual</p>
          <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mb-5">
            Every citizen, in their own language.
          </h2>
          <p className="text-white/60 text-lg leading-relaxed">
            Alisu speaks the eleven major Indian languages Sarvam supports — fluently, in native scripts. No transliteration. No translation lag. The citizen never has to switch languages to be understood.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {LANGUAGES.map((l, idx) => (
            <div
              key={l.code}
              className="reveal glass card-hover rounded-2xl px-5 py-6"
              style={{ transitionDelay: `${idx * 40}ms` }}
            >
              <div className="flex items-baseline justify-between mb-3">
                <span className="text-3xl font-display font-semibold" style={{ color: l.color }}>
                  {l.word}
                </span>
                <span className="text-[10px] font-mono uppercase tracking-widest text-white/30">{l.code}</span>
              </div>
              <div className="text-sm text-white/60">{l.name}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ────────────────── How it works (architecture) ────────────────── */
function HowItWorks() {
  const steps = [
    {
      n: '01',
      title: 'Capture',
      desc: 'Browser or phone streams 16-kHz PCM over WebSocket. Adaptive VAD with noise-floor tracking ignores fans, AC, room tone.',
      tag: 'Browser · Twilio · Exotel',
    },
    {
      n: '02',
      title: 'Understand',
      desc: 'Sarvam saaras:v3 transcribes with auto language detection. Partial transcripts stream to the dashboard live.',
      tag: 'Sarvam saaras:v3',
    },
    {
      n: '03',
      title: 'Reason',
      desc: 'sarvam-m runs a structured-JSON conversation: gather → confirm → file. Stays in the citizen\'s language. Detects emergencies and off-topic.',
      tag: 'Sarvam sarvam-m',
    },
    {
      n: '04',
      title: 'Speak',
      desc: 'bulbul:v3 synthesises the reply in the same language and plays it back through the call. Real WAV duration prevents cut-offs.',
      tag: 'Sarvam bulbul:v3',
    },
    {
      n: '05',
      title: 'File',
      desc: 'Confirmed complaints are auto-tagged with department, priority, location, and reference ID. Recordings store both voices.',
      tag: 'Dashboard · Operator',
    },
  ]

  return (
    <section id="how-it-works" className="relative py-32 px-6">
      {/* Subtle gradient backdrop */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 50% 60% at 50% 50%, rgba(124,140,255,0.06), transparent)' }} />

      <div className="relative max-w-7xl mx-auto">
        <div className="reveal max-w-2xl mb-16">
          <p className="text-xs uppercase tracking-widest text-indigo-300/80 mb-4">How it works</p>
          <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mb-5">
            From voice to verified complaint, in seconds.
          </h2>
          <p className="text-white/60 text-lg leading-relaxed">
            Five stages, all running on a single Sarvam API key. The whole pipeline is open source.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-4 relative">
          {steps.map((s, i) => (
            <div
              key={s.n}
              className="reveal glass rounded-2xl p-6 relative card-hover"
              style={{ transitionDelay: `${i * 80}ms` }}
            >
              {/* Connecting line on desktop */}
              {i < steps.length - 1 && (
                <svg
                  className="hidden lg:block absolute top-1/2 -right-4 w-8 h-px pointer-events-none z-0"
                  viewBox="0 0 32 2"
                >
                  <line x1="0" y1="1" x2="32" y2="1" stroke="rgba(124,140,255,0.4)" strokeWidth="1" className="flow-path" />
                </svg>
              )}

              <div className="font-mono text-xs text-indigo-300/70 tracking-widest mb-3">{s.n}</div>
              <h3 className="font-display text-xl font-semibold mb-2">{s.title}</h3>
              <p className="text-sm text-white/60 leading-relaxed mb-4">{s.desc}</p>
              <div className="text-[10px] uppercase tracking-wider text-white/40 font-mono">{s.tag}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ────────────────── Features grid ────────────────── */
function Features() {
  const features = [
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
      ),
      title: 'Real-time voice activity detection',
      body: 'Adaptive RMS noise floor, SNR gating, and onset/offset hysteresis. Coughs and door bumps don\'t cut anyone off.',
    },
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
      ),
      title: 'Language stickiness',
      body: 'A single English address inside a Tamil complaint won\'t flip the call. Explicit language requests still take priority.',
    },
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      ),
      title: 'Live partial transcripts',
      body: 'Citizen\'s words land on the dashboard within ~2 seconds — operators see the call in motion, never a black box.',
    },
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
      ),
      title: 'Structured complaints',
      body: 'Department, priority, location, requested action, summary, and full transcript — auto-extracted. Human reviewers act, don\'t transcribe.',
    },
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      ),
      title: 'In-call resolution',
      body: 'Power outage? Get BESCOM 1912 in seconds. Alisu solves what it can, files what needs follow-up. No paperwork bloat.',
    },
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7z"/></svg>
      ),
      title: 'Both voices recorded',
      body: 'Saved WAVs include Alisu and the citizen, timestamped to call time. Auditable, downloadable, ready for QA.',
    },
  ]
  return (
    <section id="features" className="relative py-32 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="reveal max-w-2xl mb-16">
          <p className="text-xs uppercase tracking-widest text-indigo-300/80 mb-4">What's inside</p>
          <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mb-5">
            Built like a product, not a hack.
          </h2>
          <p className="text-white/60 text-lg leading-relaxed">
            Hard things — endpointing, language stickiness, latency, off-topic rejection — done properly so the demo feels like a service citizens would actually call.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f, i) => (
            <div
              key={f.title}
              className="reveal glass card-hover rounded-2xl p-6"
              style={{ transitionDelay: `${i * 60}ms` }}
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4" style={{ background: 'rgba(124,140,255,0.12)', color: '#A5B4FC' }}>
                {f.icon}
              </div>
              <h3 className="font-display text-lg font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-white/60 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ────────────────── Demo / video ────────────────── */
function Demo() {
  return (
    <section id="demo" className="relative py-32 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="reveal text-center mb-12">
          <p className="text-xs uppercase tracking-widest text-indigo-300/80 mb-4">Demo</p>
          <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mb-5">
            See Alisu handle a real call.
          </h2>
          <p className="text-white/60 text-lg leading-relaxed max-w-xl mx-auto">
            Three minutes. One Kannada complaint. One in-call English resolution. End-to-end on Sarvam.
          </p>
        </div>

        <div
          className="reveal relative rounded-3xl overflow-hidden glass animate-slide-pane"
          style={{ aspectRatio: '16/9', boxShadow: '0 60px 120px -40px rgba(124,140,255,0.4)' }}
        >
          {VIDEO_ID ? (
            <iframe
              src={`https://www.youtube.com/embed/${VIDEO_ID}?rel=0&modestbranding=1`}
              title="Alisu demo"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-white/50">
              <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: 'rgba(124,140,255,0.12)' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              </div>
              <p className="text-sm">Add your YouTube video ID in <span className="font-mono text-indigo-300">App.tsx</span></p>
            </div>
          )}
        </div>

        <div className="reveal text-center mt-12">
          <a href={DEMO_URL} target="_blank" rel="noreferrer" className="btn-primary">
            Try it yourself
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
          </a>
        </div>
      </div>
    </section>
  )
}

/* ────────────────── CTA + Footer ────────────────── */
function Cta() {
  return (
    <section className="relative py-32 px-6">
      <div className="max-w-4xl mx-auto reveal">
        <div className="relative rounded-3xl p-10 sm:p-16 overflow-hidden glass" style={{ boxShadow: '0 80px 160px -60px rgba(124,140,255,0.5)' }}>
          <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-30 pointer-events-none" style={{ background: 'radial-gradient(circle, #7C8CFF, transparent 70%)', filter: 'blur(60px)' }} />
          <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full opacity-25 pointer-events-none" style={{ background: 'radial-gradient(circle, #F472B6, transparent 70%)', filter: 'blur(60px)' }} />

          <div className="relative">
            <h3 className="font-display text-3xl sm:text-5xl font-bold tracking-tight mb-5">
              Ready to hear Alisu?
            </h3>
            <p className="text-white/60 text-lg max-w-xl mb-8 leading-relaxed">
              Open the live demo and place a test call. Speak in any of the supported languages — Kannada, Hindi, Tamil, Telugu, English. No setup needed.
            </p>
            <div className="flex flex-wrap gap-3">
              <a href={DEMO_URL} target="_blank" rel="noreferrer" className="btn-primary">
                Open the live demo
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
              </a>
              <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="btn-ghost">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.4 3-.405 1.02.005 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
                Source on GitHub
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-white/5 py-10 px-6">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/40">
        <div>© 2026 · Alisu · Built for Sarvam AI for Bharat</div>
        <div className="flex items-center gap-5">
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="hover:text-white/80 transition-colors">GitHub</a>
          <a href={DEMO_URL} target="_blank" rel="noreferrer" className="hover:text-white/80 transition-colors">Live demo</a>
        </div>
      </div>
    </footer>
  )
}

/* ────────────────── Mounted scroll-driven cursor halo (subtle) ────────────────── */
function CursorHalo() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!ref.current) return
      ref.current.style.transform = `translate3d(${e.clientX - 200}px, ${e.clientY - 200}px, 0)`
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])
  return (
    <div
      ref={ref}
      className="fixed top-0 left-0 w-[400px] h-[400px] rounded-full pointer-events-none z-0 hidden md:block"
      style={{
        background: 'radial-gradient(circle, rgba(124,140,255,0.10) 0%, transparent 60%)',
        transition: 'transform 200ms ease-out',
      }}
    />
  )
}

export default function App() {
  useRevealOnScroll()
  return (
    <div className="relative">
      <CursorHalo />
      <Header />
      <main>
        <Hero />
        <LanguagesSection />
        <HowItWorks />
        <Features />
        <Demo />
        <Cta />
      </main>
      <Footer />
    </div>
  )
}
