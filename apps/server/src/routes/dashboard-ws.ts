import { FastifyInstance } from 'fastify'
import { registerDashboardClient, getDashboardClientCount } from '../services/broadcast'

export async function dashboardWsRoute(fastify: FastifyInstance) {
  fastify.get('/dashboard-ws', { websocket: true }, (socket: any) => {
    registerDashboardClient(socket)
    console.log(`[DASHBOARD] Client connected. Total clients: ${getDashboardClientCount()}`)
  })
}
