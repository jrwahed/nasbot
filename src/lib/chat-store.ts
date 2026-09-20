import type { ChatMessage } from '@/types'

/**
 * تخزين الشات — **محاكاة بـlocalStorage للتطوير بس (`hasSupabase = false`)**.
 *
 * ⚠ **متوصّلش أي شاشة حقيقية بالملف ده.** الكلام اللي كان مكتوب هنا —
 *    «الواجهة مقصودة تكون قريبة من Supabase Realtime… لما نوصّل خدمة حقيقية
 *    الملف ده بس هو اللي بيتغير» — هو اللي وقّعنا: شاشتين اتوصلوا بيه
 *    وفضلوا شغّالين في الشكل وهما مش بيوصّلوا حاجة لحد:
 *
 *      · غرفة شات السبوطة كانت مشتركة في `subscribe` هنا، فرسايل الناس
 *        التانية عمرها ما وصلت (الاشتراك الحقيقي `subscribeChat` كان كود ميت).
 *      · الشات الخاص كان بيكتب هنا بالكامل — كل واحد بيكتب لنفسه في متصفحه.
 *
 *    الملف ده دلوقتي بيتنادى من `api-mock.ts` **وبس**. أي شات حقيقي بيمر من
 *    `messages` في القاعدة و`subscribeChat` (Realtime).
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

/**
 * ⚠ **مش بديل عن Realtime** — كان مكتوب هنا إنه «بديل مباشر لـ
 *    `channel.on('INSERT')`»، والجملة دي هي اللي خلت الشات يتوصّل بيه.
 *    ده بيشتغل في **نفس التبويب** بس ولما حد ينادي `appendMessage` جوّه.
 *    الاشتراك الحقيقي: `subscribeChat` في `src/lib/api.ts`.
 */
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
