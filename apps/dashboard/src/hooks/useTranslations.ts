import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConversationMessage } from '../types'
import { authHeaders } from '../lib/api'

type Entry = { status: 'same' | 'loading' | 'done' | 'error'; text: string }

export function toLangCode(lang: string): string {
  const l = (lang || '').toLowerCase().trim().replace('_', '-')
  if (l.startsWith('kn')) return 'kn-IN'
  if (l.startsWith('hi')) return 'hi-IN'
  if (l.startsWith('en')) return 'en-IN'
  if (l.startsWith('ta')) return 'ta-IN'
  if (l.startsWith('te')) return 'te-IN'
  if (l.startsWith('ml')) return 'ml-IN'
  if (l.startsWith('mr')) return 'mr-IN'
  if (l.startsWith('bn') || l.startsWith('be')) return 'bn-IN'
  if (l.startsWith('gu')) return 'gu-IN'
  if (l.startsWith('pa')) return 'pa-IN'
  if (l.startsWith('od') || l.startsWith('or')) return 'od-IN'
  return l || 'kn-IN'
}

export const LANG_NAMES: Record<string, string> = {
  'kn-IN': 'Kannada',
  'hi-IN': 'Hindi',
  'en-IN': 'English',
  'ta-IN': 'Tamil',
  'te-IN': 'Telugu',
  'ml-IN': 'Malayalam',
  'mr-IN': 'Marathi',
  'bn-IN': 'Bengali',
  'gu-IN': 'Gujarati',
  'pa-IN': 'Punjabi',
  'od-IN': 'Odia',
}

export const LANG_OPTIONS = Object.keys(LANG_NAMES) as string[]

function cacheKey(text: string, src: string, tgt: string) {
  return `${src}||${tgt}||${text}`
}

export function useTranslations(messages: ConversationMessage[], targetLang: string) {
  const cache = useRef<Map<string, Entry>>(new Map())
  const [tick, setTick] = useState(0)
  const bump = () => setTick(t => t + 1)

  useEffect(() => {
    let dirty = false

    messages.forEach(msg => {
      const src = toLangCode(msg.language)
      const tgt = toLangCode(targetLang)
      const key = cacheKey(msg.text, src, tgt)

      if (cache.current.has(key)) return

      if (src === tgt) {
        cache.current.set(key, { status: 'same', text: msg.text })
        dirty = true
        return
      }

      cache.current.set(key, { status: 'loading', text: '' })
      dirty = true

      fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          input: msg.text,
          source_language_code: src,
          target_language_code: tgt,
        }),
      })
        .then(r => r.json())
        .then(data => {
          cache.current.set(key, {
            status: 'done',
            text: data.translated_text || msg.text,
          })
          bump()
        })
        .catch(() => {
          cache.current.set(key, { status: 'error', text: msg.text })
          bump()
        })
    })

    if (dirty) bump()
  }, [messages, targetLang])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback(
    (msg: ConversationMessage): Entry | undefined => {
      const src = toLangCode(msg.language)
      const tgt = toLangCode(targetLang)
      return cache.current.get(cacheKey(msg.text, src, tgt))
    },
    [tick, targetLang]
  )
}
