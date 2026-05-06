export class AudioEngine {
  private context: AudioContext | null = null
  private processor: ScriptProcessorNode | null = null
  private stream: MediaStream | null = null
  private ws: WebSocket
  private onAmplitude: (value: number) => void
  isCapturing = false

  constructor(ws: WebSocket, onAmplitude: (value: number) => void) {
    this.ws = ws
    this.onAmplitude = onAmplitude
  }

  async start(): Promise<void> {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext
    this.context = new Ctx({ sampleRate: 48000 })
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl:  true,
        channelCount: 1,
      }
    })

    const source = this.context.createMediaStreamSource(this.stream)
    this.processor = this.context.createScriptProcessor(4096, 1, 1)
    source.connect(this.processor)
    this.processor.connect(this.context.destination)

    this.processor.onaudioprocess = (e) => {
      const float32 = e.inputBuffer.getChannelData(0)

      // Always report amplitude — needed for interruption detection during Alisu's speech.
      // We report raw RMS (0..1) without inflation, so the UI threshold matches what
      // a quiet room actually looks like. Multiplying here previously made room-tone
      // visibly cross the "user is speaking" threshold.
      let sumSq = 0
      for (let i = 0; i < float32.length; i++) sumSq += float32[i] ** 2
      const rms = Math.sqrt(sumSq / float32.length)
      this.onAmplitude(Math.min(1, rms))

      // Only send PCM when actively capturing
      if (!this.isCapturing || this.ws.readyState !== WebSocket.OPEN) return

      const downsampled = this.downsample(float32, 48000, 16000)
      const int16 = new Int16Array(downsampled.length)
      for (let i = 0; i < downsampled.length; i++) {
        const s = Math.max(-1, Math.min(1, downsampled[i]))
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
      }
      this.ws.send(int16.buffer)
    }
  }

  private downsample(buf: Float32Array, fromRate: number, toRate: number): Float32Array {
    if (fromRate === toRate) return buf
    const ratio = fromRate / toRate
    const out = new Float32Array(Math.round(buf.length / ratio))
    for (let i = 0; i < out.length; i++) {
      const start = Math.floor(i * ratio)
      const end = Math.min(Math.floor((i + 1) * ratio), buf.length)
      let sum = 0
      for (let j = start; j < end; j++) sum += buf[j]
      out[i] = sum / (end - start)
    }
    return out
  }

  setCapturing(active: boolean): void {
    this.isCapturing = active
  }

  stop(): void {
    this.isCapturing = false
    this.processor?.disconnect()
    this.context?.close()
    this.stream?.getTracks().forEach(t => t.stop())
    this.processor = null
    this.context = null
    this.stream = null
  }
}
