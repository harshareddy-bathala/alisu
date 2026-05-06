import cors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import websocket from '@fastify/websocket'
import dotenv from 'dotenv'
import Fastify from 'fastify'
import fs from 'fs'
import path from 'path'
import { handleConfirmRoute } from './routes/handle-confirm'
import { incomingCallRoute } from './routes/incoming-call'
import { mediaStreamRoute } from './routes/media-stream'
import { testCallRoute } from './routes/test-call'
import { transferRoute } from './routes/transfer'
import { voiceTokenRoute } from './routes/voice-token'
import { dashboardWsRoute } from './routes/dashboard-ws'
import { complaintsRoute } from './routes/complaints'
import { transcriptsRoute } from './routes/transcripts'
import { callStore } from './services/call-state'
import { complaintStore } from './services/complaint-store'
import { initDB } from './db/index'
import { hydrateCallStore, hydrateComplaintStore } from './db/persist'
import { preloadGreeting } from './services/conversation-engine'
import { authPreHandler } from './lib/auth'
import { sarvamFetch } from './lib/sarvam-fetch'

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') })
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true })

const app = Fastify({ logger: true })
const port = Number(process.env.PORT || 3000)
const tmpDir = path.resolve('/tmp')
const RECORDING_DIR = process.env.RECORDING_DIR || '/tmp/alisu-recordings'

fs.mkdirSync(tmpDir, { recursive: true })
fs.mkdirSync(RECORDING_DIR, { recursive: true })

// ── Auth ──────────────────────────────────────────────────────────────────────
app.addHook('preHandler', authPreHandler)

app.addContentTypeParser(
  'application/x-www-form-urlencoded',
  { parseAs: 'string' },
  (_req, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(body as string)))
  }
)

app.get('/audio/:fileName', async (req: any, reply) => {
  const fileName: string = req.params.fileName
  // Path traversal guard — reject names that try to escape /tmp
  if (!fileName || fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
    return reply.code(400).send({ error: 'Invalid filename' })
  }
  const audioPath = path.join('/tmp', fileName)
  if (!fs.existsSync(audioPath)) {
    return reply.code(404).send({ error: 'Audio not found' })
  }
  reply.type('audio/wav').send(fs.createReadStream(audioPath))
})

app.register(cors)
app.register(websocket)
app.register(fastifyStatic, {
  root: tmpDir,
  prefix: '/audio/'
})
app.register(incomingCallRoute)
app.register(mediaStreamRoute)
if (process.env.NODE_ENV !== 'production') {
  app.register(testCallRoute)
}
app.register(voiceTokenRoute)
app.register(handleConfirmRoute)
app.register(dashboardWsRoute)
app.register(complaintsRoute)
app.register(transcriptsRoute)
const callSnapshotHandler = async () => ({
  calls: callStore.getAll()
})
app.get('/api/calls', { logLevel: 'silent' }, callSnapshotHandler)
app.get('/calls', { logLevel: 'silent' }, callSnapshotHandler)
app.get('/ws/calls', { logLevel: 'silent' }, callSnapshotHandler)
app.post('/transfer', async (req, reply) => transferRoute(app, req, reply))

app.post('/translate', async (req: any, reply) => {
  const { input, source_language_code, target_language_code } = req.body as any
  if (!input || !source_language_code || !target_language_code) {
    return reply.code(400).send({ error: 'Missing fields' })
  }
  try {
    const res = await sarvamFetch('https://api.sarvam.ai/translate', {
      method: 'POST',
      headers: {
        'api-subscription-key': process.env.SARVAM_API_KEY || '',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ input, source_language_code, target_language_code, mode: 'formal' })
    })
    if (!res.ok) {
      const err = await res.text()
      console.error('[TRANSLATE] Sarvam error:', res.status, err)
      return reply.code(502).send({ error: 'Translation API failed' })
    }
    const data = await res.json()
    return reply.send({ translated_text: data.translated_text })
  } catch (err) {
    console.error('[TRANSLATE] fetch failed:', err)
    return reply.code(500).send({ error: 'Internal error' })
  }
})

app.get('/health', async () => ({
  status: 'ok',
  activeCalls: callStore.getAll().filter(c => !['ended', 'transferred'].includes(c.status)).length,
  db: !!process.env.DATABASE_URL,
}))

// ── Recording retention — delete WAVs older than 30 days ─────────────────────
function scheduleRecordingCleanup() {
  const RETENTION_MS = 30 * 24 * 60 * 60 * 1000
  const run = () => {
    try {
      const files = fs.readdirSync(RECORDING_DIR)
      let n = 0
      for (const f of files) {
        if (!f.endsWith('.wav') || f === 'greeting-cache.wav') continue
        const fp = path.join(RECORDING_DIR, f)
        if (fs.statSync(fp).mtimeMs < Date.now() - RETENTION_MS) {
          fs.unlinkSync(fp)
          n++
        }
      }
      if (n > 0) console.log(`[REC] Cleaned up ${n} recording(s) older than 30 days`)
    } catch (err) {
      console.error('[REC] Cleanup error:', err)
    }
  }
  run()
  setInterval(run, 24 * 60 * 60 * 1000)
}

async function start() {
  if (!process.env.SARVAM_API_KEY) {
    console.error('[FATAL] SARVAM_API_KEY is not set — all voice/AI features will fail. Check .env')
    process.exit(1)
  }

  // Init DB + hydrate memory stores before accepting connections
  await initDB()
  const [callData, complaintData] = await Promise.all([hydrateCallStore(), hydrateComplaintStore()])
  callStore.hydrate(callData)
  complaintStore.hydrate(complaintData)

  // Pre-warm greeting TTS — runs async, doesn't block server start
  preloadGreeting().catch(err => console.warn('[GREETING] preload error:', err))

  // Clean up old recordings once on start, then daily
  scheduleRecordingCleanup()

  app.listen({ port, host: '0.0.0.0' }, (error) => {
    if (error) {
      app.log.error(error)
      process.exit(1)
    }
    console.log(`Alisu server running on port ${port}`)
    console.log('Registered Routes:\n' + app.printRoutes())
    console.log(
      'Sarvam API key:',
      `sk_***${process.env.SARVAM_API_KEY!.slice(-4)}`
    )
    if (process.env.DATABASE_URL) {
      console.log('[DB] PostgreSQL persistence enabled')
    } else {
      console.log('[DB] In-memory only — set DATABASE_URL for persistence')
    }
    if (process.env.DASHBOARD_SECRET) {
      console.log('[AUTH] Dashboard secret set — API is protected')
    }
  })
}

start().catch(err => {
  console.error('Failed to start server:', err)
  process.exit(1)
})

// Graceful shutdown — releases port before nodemon/process manager restarts
const shutdown = async () => {
  try { await app.close() } catch { /* ignore */ }
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT',  shutdown)
