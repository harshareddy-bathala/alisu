import { useEffect, useReducer, useState } from 'react'
import { CallState, Complaint } from '../types'
import { dashboardWsUrl } from '../lib/api'

interface State {
  calls: Map<string, CallState>
  complaints: Map<string, Complaint>
}

type Action =
  | { type: 'FULL_STATE'; calls: CallState[]; complaints: Complaint[] }
  | { type: 'CALL_UPDATE'; call: CallState }
  | { type: 'COMPLAINT_UPSERT'; complaint: Complaint }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'FULL_STATE': {
      const calls = new Map<string, CallState>()
      for (const c of action.calls) calls.set(c.callSid, c)
      const complaints = new Map<string, Complaint>()
      for (const c of action.complaints) complaints.set(c.id, c)
      return { calls, complaints }
    }
    case 'CALL_UPDATE': {
      const calls = new Map(state.calls)
      calls.set(action.call.callSid, action.call)
      return { ...state, calls }
    }
    case 'COMPLAINT_UPSERT': {
      const complaints = new Map(state.complaints)
      complaints.set(action.complaint.id, action.complaint)
      return { ...state, complaints }
    }
    default:
      return state
  }
}

export function useCallSocket() {
  const [state, dispatch] = useReducer(reducer, { calls: new Map(), complaints: new Map() })
  const [connected, setConnected] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout>

    function connect() {
      ws = new WebSocket(dashboardWsUrl())

      ws.onopen = () => setConnected(true)

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          switch (msg.type) {
            case 'FULL_STATE':
              dispatch({ type: 'FULL_STATE', calls: msg.calls ?? msg.data ?? [], complaints: msg.complaints ?? [] })
              setReady(true)
              break
            case 'CALL_UPDATE':
              dispatch({ type: 'CALL_UPDATE', call: msg.data })
              break
            case 'COMPLAINT_CREATED':
            case 'COMPLAINT_UPDATED':
              dispatch({ type: 'COMPLAINT_UPSERT', complaint: msg.complaint })
              break
          }
        } catch (err) {
          console.error('[WS] parse error', err)
        }
      }

      ws.onclose = () => {
        setConnected(false)
        reconnectTimer = setTimeout(connect, 3000)
      }

      ws.onerror = () => ws?.close()
    }

    connect()
    return () => {
      clearTimeout(reconnectTimer)
      if (ws) { ws.onclose = null; ws.close() }
    }
  }, [])

  return {
    calls: Array.from(state.calls.values()),
    complaints: Array.from(state.complaints.values()),
    connected,
    ready,
  }
}
