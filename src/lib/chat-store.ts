import type { ChatMessage } from '@/types'

/**
 * تخزين الشات — محاكاة بـ localStorage.
 * الواجهة هنا مقصودة تكون قريبة من Supabase Realtime:
 * loadRoom / appendMessage / subscribe.
 * لما نوصّل خدمة حقيقية، الملف ده بس هو اللي بيتغير.
 */

const key = (roomId: string) => `nasbot-chat-${roomId}`

type Listener = (messages: ChatMessage[]) => void
const listeners = new Map<string, Set<Listener>>()

export function loadRoom(roomId: string): ChatMessage[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(key(roomId))
    return raw ? (JSON.parse(raw) as ChatMessage[]) : []
  } catch {
    return []
  }
}

export function appendMessage(roomId: string, msg: ChatMessage) {
  if (typeof window === 'undefined') return
  try {
    const next = [...loadRoom(roomId), msg]
    localStorage.setItem(key(roomId), JSON.stringify(next))
    listeners.get(roomId)?.forEach((fn) => fn(next))
  } catch {
    /* التخزين مقفول — الرسالة بتفضل في الذاكرة بس */
  }
}

/** بديل مباشر لـ channel.on('INSERT', …) */
export function subscribe(roomId: string, fn: Listener) {
  if (!listeners.has(roomId)) listeners.set(roomId, new Set())
  listeners.get(roomId)!.add(fn)
  return () => {
    listeners.get(roomId)?.delete(fn)
  }
}

export function clearRoom(roomId: string) {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(key(roomId))
  } catch {
    /* مش مشكلة */
  }
}
