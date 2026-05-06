import { callStore } from './call-state'
import { complaintStore, type Complaint } from './complaint-store'

const dashboardClients = new Set<any>()

function safeSend(client: any, payload: string): boolean {
  try {
    if (client.readyState === 1 || client.readyState === client.OPEN) {
      client.send(payload)
      return true
    }
  } catch {
    dashboardClients.delete(client)
  }
  return false
}

export function registerDashboardClient(socket: any): void {
  dashboardClients.add(socket)
  socket.on('close', () => dashboardClients.delete(socket))

  socket.send(JSON.stringify({
    type: 'FULL_STATE',
    calls: callStore.getAll(),
    complaints: complaintStore.getAll()
  }))

  console.log(`[DASHBOARD] Client connected. Total clients: ${dashboardClients.size}`)
}

export function broadcastCallUpdate(callSid: string): void {
  const state = callStore.get(callSid)
  if (!state) return
  const payload = JSON.stringify({ type: 'CALL_UPDATE', data: state })
  dashboardClients.forEach(c => safeSend(c, payload))
}

export function broadcastAll(): void {
  const payload = JSON.stringify({
    type: 'FULL_STATE',
    calls: callStore.getAll(),
    complaints: complaintStore.getAll()
  })
  dashboardClients.forEach(c => safeSend(c, payload))
}

export function broadcastComplaint(type: 'COMPLAINT_CREATED' | 'COMPLAINT_UPDATED', complaint: Complaint): void {
  const payload = JSON.stringify({ type, complaint })
  dashboardClients.forEach(c => safeSend(c, payload))
}

export function getDashboardClientCount(): number {
  return dashboardClients.size
}
