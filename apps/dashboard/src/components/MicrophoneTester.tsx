import { useState, useRef } from 'react'
import { AudioEngine } from '../lib/audio-engine'
import { CallSocket, CallSocketStatus } from '../lib/call-socket'

export function MicrophoneTester() {
  const [isActive, setIsActive] = useState(false)
  const [callStatus, setCallStatus] = useState<CallSocketStatus>('idle')
  const [lastText, setLastText] = useState('')
  const [error, setError] = useState('')

  const wsRef = useRef<WebSocket | null>(null)
  const engineRef = useRef<AudioEngine | null>(null)
  const socketRef = useRef<CallSocket | null>(null)
  const callSidRef = useRef(`local_${Math.random().toString(36).slice(2, 9)}`)

  const startCall = async () => {
    try {
      setError('')
      setLastText('')
      callSidRef.current = `local_${Math.random().toString(36).slice(2, 9)}`

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(`${protocol}//${window.location.host}/media-stream`)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      const engine = new AudioEngine(ws, () => {
        // amplitude callback — available for a future visualizer
      })
      engineRef.current = engine

      const callSocket = new CallSocket({
        setCapturing: active => engine.setCapturing(active),
        onStatus: setCallStatus,
        onText: setLastText,
      })
      socketRef.current = callSocket

      ws.onmessage = event => callSocket.handleMessage(event)
      ws.onerror = () => setError('WebSocket error')
      ws.onclose = () => stopCall()

      ws.onopen = async () => {
        ws.send(JSON.stringify({
          event: 'start',
          callSid: callSidRef.current,
          payload: { customParameters: { From: 'Local Browser' } }
        }))
        ws.send(JSON.stringify({ type: 'audio_config', sampleRate: 16000, channels: 1 }))

        await engine.start()
        // isCapturing stays false until server sends resume_listening after greeting
        setIsActive(true)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to start')
      stopCall()
    }
  }

  const stopCall = () => {
    engineRef.current?.stop()
    socketRef.current?.dispose()

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event: 'stop', callSid: callSidRef.current }))
      wsRef.current.close()
    }

    engineRef.current = null
    socketRef.current = null
    wsRef.current = null
    setIsActive(false)
    setCallStatus('idle')
    setLastText('')
  }

  const statusLabel =
    callStatus === 'speaking' ? 'Alisu is speaking...' :
    callStatus === 'listening' ? 'Listening...' :
    'Connecting...'

  const statusColor =
    callStatus === 'speaking' ? 'text-purple-600 bg-purple-50' : 'text-green-600 bg-green-50'

  const dotColor =
    callStatus === 'speaking' ? 'bg-purple-500' : 'bg-green-500'

  const pingColor =
    callStatus === 'speaking' ? 'bg-purple-400' : 'bg-green-400'

  return (
    <div className="fixed bottom-6 right-6 z-50 bg-white p-4 rounded-2xl shadow-xl border border-gray-200 w-72">
      <h3 className="text-sm font-bold text-gray-900 mb-2">Local Tester</h3>
      {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

      {!isActive ? (
        <button
          onClick={startCall}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-xl text-sm transition-colors"
        >
          Start Local Call
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          <div className={`flex items-center justify-center gap-2 text-sm font-medium p-2 rounded-lg ${statusColor}`}>
            <span className="relative flex h-3 w-3">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${pingColor}`} />
              <span className={`relative inline-flex rounded-full h-3 w-3 ${dotColor}`} />
            </span>
            {statusLabel}
          </div>

          {lastText && (
            <p className="text-xs text-gray-600 italic text-center px-1">"{lastText}"</p>
          )}

          <button
            onClick={stopCall}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-xl text-sm transition-colors"
          >
            End Call
          </button>
        </div>
      )}
    </div>
  )
}
