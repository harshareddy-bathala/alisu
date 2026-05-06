import { useState, useRef, useCallback } from 'react'
import { AudioEngine } from '../lib/audio-engine'
import { CallSocket, CallSocketStatus } from '../lib/call-socket'

// Interrupt fires only when amplitude stays above this for INTERRUPT_SUSTAIN_FRAMES frames.
// Amplitude is now raw RMS (0..1) — well above fan/traffic noise but below speech.
const INTERRUPT_THRESHOLD      = 0.04  // raw RMS — fans / room tone live around 0.005–0.015
const INTERRUPT_SUSTAIN_FRAMES = 3     // ~255ms sustained (3 × 4096/48000 ≈ 85ms each)

export interface TestCallState {
  isActive: boolean
  callStatus: CallSocketStatus
  amplitude: number
  callSid: string
  error: string
  speakingText: string
  speakingDurationMs: number
}

export function useTestCall() {
  const [state, setState] = useState<TestCallState>({
    isActive: false,
    callStatus: 'idle',
    amplitude: 0,
    callSid: '',
    error: '',
    speakingText: '',
    speakingDurationMs: 0,
  })

  const wsRef                = useRef<WebSocket | null>(null)
  const engineRef            = useRef<AudioEngine | null>(null)
  const socketRef            = useRef<CallSocket | null>(null)
  const sidRef               = useRef('')
  const callStatusRef        = useRef<CallSocketStatus>('idle')
  const interruptedRef       = useRef(false)
  const aboveThresholdFrames = useRef(0)  // sustained interrupt counter

  const stop = useCallback(() => {
    engineRef.current?.stop()
    socketRef.current?.dispose()

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event: 'stop', callSid: sidRef.current }))
      wsRef.current.close()
    }

    engineRef.current       = null
    socketRef.current       = null
    wsRef.current           = null
    callStatusRef.current   = 'idle'
    interruptedRef.current  = false
    aboveThresholdFrames.current = 0

    setState({ isActive: false, callStatus: 'idle', amplitude: 0, callSid: '', error: '', speakingText: '', speakingDurationMs: 0 })
  }, [])

  const start = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, error: '' }))
      const callSid = `local_${Math.random().toString(36).slice(2, 9)}`
      sidRef.current = callSid

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(`${protocol}//${window.location.host}/media-stream`)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      const engine = new AudioEngine(ws, (amp) => {
        if (callStatusRef.current === 'speaking' && !interruptedRef.current) {
          if (amp > INTERRUPT_THRESHOLD) {
            aboveThresholdFrames.current++
            // Require sustained amplitude — single burst (fan, door, cough) doesn't interrupt
            if (aboveThresholdFrames.current >= INTERRUPT_SUSTAIN_FRAMES) {
              interruptedRef.current = true
              aboveThresholdFrames.current = 0
              socketRef.current?.stopCurrentAudio()
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'interrupt' }))
              }
            }
          } else {
            aboveThresholdFrames.current = 0
          }
        } else if (callStatusRef.current !== 'speaking') {
          aboveThresholdFrames.current = 0
        }

        // Show amplitude only when not in Alisu's speaking state
        setState(prev => {
          if (prev.callStatus === 'speaking') return prev
          return { ...prev, amplitude: amp }
        })
      })
      engineRef.current = engine

      const socket = new CallSocket({
        setCapturing: active => engine.setCapturing(active),
        onStatus: (status) => {
          callStatusRef.current = status
          if (status === 'listening') {
            interruptedRef.current = false
            aboveThresholdFrames.current = 0
          }
          setState(prev => ({
            ...prev,
            callStatus: status,
            amplitude: status === 'speaking' ? 0 : prev.amplitude,
          }))
        },
        onText: () => {},
        onCallEnded: stop,
        onAudioStarted: (text, durationMs) => {
          setState(prev => ({ ...prev, speakingText: text, speakingDurationMs: durationMs }))
        },
      })
      socketRef.current = socket

      ws.onmessage = e => socket.handleMessage(e)
      ws.onerror   = () => setState(prev => ({ ...prev, error: 'WebSocket error' }))
      ws.onclose   = () => stop()

      ws.onopen = async () => {
        ws.send(JSON.stringify({
          event: 'start',
          callSid,
          payload: { customParameters: { From: 'Local Browser' } },
        }))
        ws.send(JSON.stringify({ type: 'audio_config', sampleRate: 16000, channels: 1 }))
        await engine.start()
        callStatusRef.current = 'listening'
        setState(prev => ({ ...prev, isActive: true, callStatus: 'listening', callSid }))
      }
    } catch (err: any) {
      setState(prev => ({ ...prev, error: err.message || 'Failed to start' }))
      stop()
    }
  }, [stop])

  return { ...state, start, stop }
}
