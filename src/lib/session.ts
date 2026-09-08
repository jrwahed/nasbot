/**
 * الجلسة — cookie موقّع بسيط.
 * مفيش كلمة سر: رقم الموبايل + رمز التحقق هما الدخول.
 * التوقيع هنا للمرحلة دي بس — لما نوصّل خادم حقيقي بيتبدل بتوقيع بمفتاح سري.
 */

export const SESSION_COOKIE = 'nasbot_session'

export interface Session {
  phone: string
  firstName: string
  gender?: string
  role: 'member' | 'captain'
}

/** توقيع بسيط — كافي للمرحلة دي، مش للإنتاج */
function sign(payload: string) {
  let h = 0
  for (let i = 0; i < payload.length; i++) {
    h = (h << 5) - h + payload.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h).toString(36)
}

export function encodeSession(s: Session): string {
  const payload = encodeURIComponent(JSON.stringify(s))
  return `${payload}.${sign(payload)}`
}

export function decodeSession(raw: string | undefined): Session | null {
  if (!raw) return null
  const i = raw.lastIndexOf('.')
  if (i < 0) return null
  const payload = raw.slice(0, i)
  const sig = raw.slice(i + 1)
  if (sign(payload) !== sig) return null
  try {
    return JSON.parse(decodeURIComponent(payload)) as Session
  } catch {
    return null
  }
}

/* ---- على المتصفح ---- */

export function setSession(s: Session) {
  if (typeof document === 'undefined') return
  const val = encodeSession(s)
  document.cookie = `${SESSION_COOKIE}=${val}; path=/; max-age=${60 * 60 * 24 * 90}; samesite=lax`
}

export function getSession(): Session | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(new RegExp(`(?:^|; )${SESSION_COOKIE}=([^;]*)`))
  return decodeSession(m?.[1])
}

export function clearSession() {
  if (typeof document === 'undefined') return
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0`
}

export function isLoggedIn() {
  return getSession() !== null
}
