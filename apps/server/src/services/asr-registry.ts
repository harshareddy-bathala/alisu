const resetHandlers = new Map<string, () => void>()

export function registerASRReset(callSid: string, fn: () => void): void {
  resetHandlers.set(callSid, fn)
}

export function unregisterASRReset(callSid: string): void {
  resetHandlers.delete(callSid)
}

export function triggerASRReset(callSid: string): void {
  resetHandlers.get(callSid)?.()
}
