export type CallSocketStatus = 'idle' | 'listening' | 'speaking' | 'processing'

export interface CallSocketHandlers {
  setCapturing: (active: boolean) => void
  onStatus: (status: CallSocketStatus) => void
  onText: (text: string) => void
  onCallEnded?: () => void
  onAudioStarted?: (text: string, durationMs: number) => void
}

export class CallSocket {
  private audioCtx: AudioContext | null = null
  private currentSource: AudioBufferSourceNode | null = null
  private audioQueue: ArrayBuffer[] = []
  private isPlayingQueue = false
  private pendingAlisuText = ''
  private handlers: CallSocketHandlers

  constructor(handlers: CallSocketHandlers) {
    this.handlers = handlers
  }

  handleMessage(event: MessageEvent): void {
    if (event.data instanceof ArrayBuffer) {
      this.enqueueAudio(event.data)
      return
    }

    let msg: any
    try {
      msg = JSON.parse(event.data as string)
    } catch {
      return
    }

    switch (msg.type) {
      case 'audio_meta':
        this.pendingAlisuText = (msg.text as string) || ''
        this.handlers.setCapturing(false)
        this.handlers.onStatus('speaking')
        break

      case 'processing':
        // Stop streaming PCM the instant the server starts thinking. Otherwise
        // the user's tail-of-sentence audio leaks into the next turn's transcript.
        this.handlers.setCapturing(false)
        this.handlers.onStatus('processing')
        break

      case 'resume_listening':
        this.handlers.setCapturing(true)
        this.handlers.onStatus('listening')
        break

      case 'text_only':
        this.handlers.onText(msg.text ?? '')
        this.handlers.setCapturing(true)
        this.handlers.onStatus('listening')
        break

      case 'call_ended':
        this.handlers.setCapturing(false)
        this.handlers.onCallEnded?.()
        break
    }
  }

  /** Stop currently playing audio and clear queue — used for interruption. */
  stopCurrentAudio(): void {
    this.audioQueue = []
    this.isPlayingQueue = false
    this.pendingAlisuText = ''
    if (this.currentSource) {
      try { this.currentSource.stop() } catch { /* already ended */ }
      this.currentSource = null
    }
  }

  private enqueueAudio(buffer: ArrayBuffer): void {
    this.audioQueue.push(buffer)
    if (!this.isPlayingQueue) this.drainAudioQueue()
  }

  private async drainAudioQueue(): Promise<void> {
    if (this.audioQueue.length === 0) { this.isPlayingQueue = false; return }
    this.isPlayingQueue = true
    const buffer = this.audioQueue.shift()!
    if (!this.audioCtx) this.audioCtx = new AudioContext()
    try {
      const decoded = await this.audioCtx.decodeAudioData(buffer.slice(0))
      const source = this.audioCtx.createBufferSource()
      this.currentSource = source
      source.buffer = decoded
      source.connect(this.audioCtx.destination)
      source.onended = () => {
        if (this.currentSource === source) this.currentSource = null
        this.drainAudioQueue()
      }
      source.start()
      // Notify once per audio_meta — consume so subsequent queue buffers don't re-trigger
      if (this.pendingAlisuText) {
        this.handlers.onAudioStarted?.(this.pendingAlisuText, decoded.duration * 1000)
        this.pendingAlisuText = ''
      }
    } catch (err) {
      console.error('[CallSocket] audio decode failed:', err)
      this.drainAudioQueue()
    }
  }

  dispose(): void {
    this.stopCurrentAudio()
    this.audioCtx?.close()
    this.audioCtx = null
  }
}
