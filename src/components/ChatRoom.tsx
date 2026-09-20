'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '@/types'
import type { ChatRoomState } from '@/lib/api-mock'
import {
  getChat,
  sendMessage,
  getDirectChat,
  sendDirectMessage,
  reportMessage,
  removeFromRoom,
  subscribeChat,
} from '@/lib/api'
import { setQState } from '@/lib/liveq'
import { useT } from '@/components/CopyProvider'

/**
 * غرفة الشات.
 *
 * ⚠ **اتعملت من أول وجديد (٢٠٢٦-٠٩-٢٠)** بعد ما المالك قال «الشات مش بيفتح».
 *    وما كانتش مسألة شكل — كان فيه عطلين:
 *
 *    ١) **الصفحة بتعلّق للأبد.** `getChat` كانت بترجّع `null` لما الغرفة لسه
 *       ما اتعملتش، والكود هنا بيعمل `return` من غير ما يقفل حالة التحميل.
 *       والغرفة أصلًا ما بتتعملش غير **مع الكشف** (`fn_reveal`) — يعني أي حد
 *       بيفتح شات حجزه قبل الكشف كان بيشوف «بنحمّل» وخلاص. ده الوضع الطبيعي
 *       لكل حاجز، مش حالة نادرة.
 *    ٢) **الرسايل ما كانتش بتوصل.** الغرفة كانت مشتركة في `subscribe` من
 *       `chat-store` — وده **محاكاة بـlocalStorage** في نفس التبويب، والغرفة
 *       أصلًا ما بتكتبش فيه. والاشتراك اللحظي الحقيقي (`subscribeChat`) كان
 *       **كود ميت محدش بينادي عليه**. يعني كلام الناس التانية عمره ما كان
 *       بيبان غير لما تقفل الصفحة وتفتحها.
 *
 * دلوقتي: كل حالة بتتقال بصوت، والرسايل بتوصل لحظي (Realtime) ومعاه سحب
 * احتياطي كل ١٠ ثواني لو الاتصال وقع.
 */

/** كل كام ملي ثانية نسأل القاعدة لو اللحظي مش شغّال */
const POLL_MS = 10_000

/** أطول رسالة — الحد ده في الواجهة بس، القاعدة ليها حدها */
const MAX_LEN = 1000

/** رسالة لسه بتتبعت أو فشلت */
interface Pending {
  key: string
  text: string
  failed: boolean
}

export function ChatRoom({
  bookingId,
  directWith,
  isCaptain = false,
  me,
}: {
  /** شات السبوطة — غرفة المجموعة */
  bookingId?: string
  /**
   * شات خاص مع حد اخترتوا بعض — رقم حسابه.
   *
   * ⚠ نفس الغرفة بتخدم الاتنين عن قصد. النسخة القديمة من الشات الخاص كانت
   *    **شاشة تانية خالص** مكتوبة بإيدها على `localStorage`، وعشان كده فضلت
   *    مزيّفة شهور من غير ما حد ياخد باله: ما كانتش بتشارك أي حتة مع الشات
   *    اللي بيشتغل.
   */
  directWith?: string
  isCaptain?: boolean
  /** اسم صاحب الرسالة — لو مااتبعتش بياخد «أنا» من النصوص */
  me?: string
}) {
  const t = useT()
  /**
   * ⚠ `useT()` بيرجّع **دالة جديدة كل رندر**. فلو حطيناها في deps بتاعة
   *    `useCallback`/`useEffect`، التأثير بيتلغي ويتعاد **كل رندر**: اشتراك
   *    جديد وطلب جديد و`setInterval` جديد في كل مرة. قِسناها: ٢٢ مؤقّت في
   *    تانيتين ونص على صفحة واقفة. الـref بيخلي النص متاح من غير ما يدخل
   *    في حسابات الهوية.
   */
  const tRef = useRef(t)
  tRef.current = t

  const [room, setRoom] = useState<ChatRoomState | null>(null)
  const [pending, setPending] = useState<Pending[]>([])
  const [draft, setDraft] = useState('')
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [unseen, setUnseen] = useState(0)
  const endRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** المستخدم قاري فوق؟ ساعتها ما ننططش لتحت من تحت إيده */
  const atBottom = useRef(true)

  const messages = room?.messages ?? []
  const closed = room?.closed ?? false
  const state = room?.state ?? 'ok'

  /* ---------------------------------------------------- التحميل والمتابعة */

  /** مفتاح ثابت للغرفة — بيتحط في deps بدل الاتنين */
  const key = directWith ? `d:${directWith}` : `b:${bookingId ?? ''}`

  const fetchRoom = useCallback(
    () => (directWith ? getDirectChat(directWith) : getChat(bookingId ?? '')),
    [directWith, bookingId]
  )

  const load = useCallback(
    async (quiet = false) => {
      try {
        const next = await fetchRoom()
        setRoom((prev) => {
          // كلام جديد وانت قاري فوق ← نعدّه بدل ما ننطّك
          if (prev && !atBottom.current) {
            const extra = next.messages.length - prev.messages.length
            if (extra > 0) setUnseen((u) => u + extra)
          }
          return next
        })
        if (next.closed) setQState('sleep')
      } catch {
        if (!quiet) setNotice(tRef.current('chat.offline'))
      }
    },
    [fetchRoom]
  )

  useEffect(() => {
    let alive = true
    let unsubRealtime = () => {}
    let timer: ReturnType<typeof setInterval> | null = null

    // ⚠ أول تحميل بيقفل حالة التحميل مهما حصل — ده كان أصل «مش بيفتح».
    void fetchRoom()
      .then((r) => {
        if (!alive) return
        setRoom(r)
        if (r.closed) setQState('sleep')

        // اللحظي على الغرفة، والسحب الاحتياطي لو اللحظي مش شغّال
        if (r.state === 'ok' && r.roomId) {
          unsubRealtime = subscribeChat(r.roomId, () => void load(true))
        }
        timer = setInterval(() => void load(true), POLL_MS)
      })
      .catch(() => {
        if (!alive) return
        setRoom({
          state: 'missing',
          messages: [],
          closed: false,
          closesAt: '',
          title: '',
        })
      })

    return () => {
      alive = false
      unsubRealtime()
      if (timer) clearInterval(timer)
      setQState('idle')
    }
  }, [key, fetchRoom, load])

  useEffect(() => {
    if (atBottom.current) {
      endRef.current?.scrollIntoView({ block: 'end' })
      setUnseen(0)
    }
  }, [messages.length, pending.length])

  function onScroll() {
    const el = listRef.current
    if (!el) return
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    atBottom.current = near
    if (near) setUnseen(0)
  }

  /* ---------------------------------------------------- الإرسال */

  const deliver = useCallback(
    async (text: string, key: string) => {
      try {
        if (directWith) await sendDirectMessage(directWith, text, me ?? tRef.current('shared.me'))
        else await sendMessage(bookingId ?? '', text, me ?? tRef.current('shared.me'))
        setPending((p) => p.filter((x) => x.key !== key))
        await load(true)
      } catch {
        // ⚠ الرسالة **ما بتضيعش**: بتفضل في القايمة وعليها «ابعت تاني».
        //   قبل كده كانت بتتحط في الشاشة على إنها راحت، والاستثناء بيتبلع.
        setPending((p) => p.map((x) => (x.key === key ? { ...x, failed: true } : x)))
      }
    },
    [bookingId, directWith, me, load]
  )

  function send(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || closed) return
    const key = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setDraft('')
    atBottom.current = true
    setPending((p) => [...p, { key, text, failed: false }])
    void deliver(text, key)
  }

  function retry(p: Pending) {
    setPending((list) => list.map((x) => (x.key === p.key ? { ...x, failed: false } : x)))
    void deliver(p.text, p.key)
  }

  const onReport = async (id: string) => {
    setMenuFor(null)
    await reportMessage(id)
    setNotice(t('shared.label.9'))
    setTimeout(() => setNotice(''), 4000)
  }

  const onRemove = async (author: string) => {
    setMenuFor(null)
    if (!bookingId) return
    await removeFromRoom(bookingId, author)
    setNotice(t('shared.label.10', { name: author }))
    setTimeout(() => setNotice(''), 4000)
    void load(true)
  }

  function startPress(id: string) {
    pressTimer.current = setTimeout(() => setMenuFor(id), 500)
  }
  function endPress() {
    if (pressTimer.current) clearTimeout(pressTimer.current)
  }

  /* ---------------------------------------------------- الشاشات */

  if (room === null) {
    return (
      <div className="py-10 text-center font-body text-15" style={{ color: 'var(--muted)' }}>
        {t('shared.text.13')}
      </div>
    )
  }

  if (state !== 'ok') {
    const when = room.revealAt
      ? new Date(room.revealAt).toLocaleDateString('ar-EG', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })
      : ''
    const box =
      state === 'waiting'
        ? { title: t('chat.wait.title'), body: t('chat.wait.body') }
        : state === 'unpaid'
          ? { title: t('chat.unpaid.title'), body: t('chat.unpaid.body') }
          : { title: t('chat.missing.title'), body: t('chat.missing.body') }

    return (
      <div className="mt-6 rounded-20 p-6" style={{ background: 'var(--surface)' }}>
        <div className="font-display text-22 font-black">{box.title}</div>
        <p className="mt-2 font-body text-16" style={{ color: 'var(--muted)' }}>
          {box.body}
        </p>
        {state === 'waiting' && when && (
          <div className="mt-3 inline-block rounded-pill px-4 py-2 font-display text-15 font-black"
               style={{ background: '#F4632A', color: '#14161A' }}>
            {t('chat.wait.when', { when })}
          </div>
        )}
      </div>
    )
  }

  /* ---------------------------------------------------- الغرفة */

  const closeLabel = room.closesAt
    ? new Date(room.closesAt).toLocaleDateString('ar-EG', { weekday: 'long' })
    : ''

  const pinned = messages.find((m) => m.pinned)
  const rest = messages.filter((m) => !m.pinned)

  /** «النهارده» / «إمبارح» / التاريخ — فاصل بين أيام الكلام */
  function dayLabel(iso: string): string {
    const d = new Date(iso)
    const today = new Date()
    const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
    if (same(d, today)) return t('chat.today')
    const y = new Date(today)
    y.setDate(y.getDate() - 1)
    if (same(d, y)) return t('chat.yesterday')
    return d.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })
  }

  const clock = (iso: string) =>
    new Date(iso).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="flex min-h-[70vh] flex-col">
      {/* الشريط العلوي */}
      <div
        className="sticky top-0 z-10 flex flex-wrap items-baseline gap-x-2 gap-y-1 pb-3 pt-1"
        style={{ background: 'var(--bg)' }}
      >
        <h1 className="m-0 font-display text-22 font-black">{room.title || t('shared.label.8')}</h1>
        <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
          {closed ? t('chat.closed') : t('chat.closesAt', { when: closeLabel })}
        </span>
      </div>

      {notice && (
        <div
          role="status"
          className="mb-3 rounded-14 p-3 font-body text-14 font-semibold"
          style={{ background: '#EFE3CF', color: '#14161A' }}
        >
          {notice}
        </div>
      )}

      {/* الرسالة المثبتة */}
      {pinned && (
        <div className="mb-4 rounded-16 p-4" style={{ background: '#EFE3CF', color: '#14161A' }}>
          <div className="mb-1 font-display text-15 font-black">
            {pinned.author} · {t('chat.pinned')}
          </div>
          <div className="font-body text-15">{pinned.text}</div>
        </div>
      )}

      {/* الرسائل */}
      <div
        ref={listRef}
        onScroll={onScroll}
        className="flex flex-1 flex-col gap-3 overflow-y-auto"
      >
        {rest.length === 0 && pending.length === 0 && (
          <div className="py-8 text-center font-body text-15" style={{ color: 'var(--muted)' }}>
            {t('chat.empty')}
          </div>
        )}

        {rest.map((m, i) => {
          const newDay = i === 0 || dayLabel(rest[i - 1].at) !== dayLabel(m.at)
          return (
            <div key={m.id}>
              {newDay && (
                <div
                  className="my-3 text-center font-body text-12 font-semibold"
                  style={{ color: 'var(--muted)' }}
                >
                  {dayLabel(m.at)}
                </div>
              )}
              <Bubble
                m={m}
                clock={clock(m.at)}
                open={menuFor === m.id}
                isCaptain={isCaptain}
                t={t}
                onPressStart={() => startPress(m.id)}
                onPressEnd={endPress}
                onOpen={() => setMenuFor(m.id)}
                onReport={() => onReport(m.id)}
                onRemove={() => onRemove(m.author)}
                onClose={() => setMenuFor(null)}
              />
            </div>
          )
        })}

        {/* اللي لسه بيتبعت أو وقع */}
        {pending.map((p) => (
          <div key={p.key} className="flex items-start justify-end gap-3">
            <div className="min-w-0 max-w-[80%]">
              <div
                className="rounded-14 p-3 font-body text-15"
                style={{
                  background: '#F4632A',
                  color: '#14161A',
                  opacity: p.failed ? 0.55 : 0.8,
                }}
              >
                {p.text}
              </div>
              <div className="mt-1 flex items-center gap-2 font-body text-12">
                {p.failed ? (
                  <>
                    <span style={{ color: 'var(--err-text)' }}>{t('chat.failed')}</span>
                    <button
                      type="button"
                      onClick={() => retry(p)}
                      className="cursor-pointer border-0 bg-transparent p-0 font-display font-black underline"
                      style={{ color: 'var(--accent-text)' }}
                    >
                      {t('chat.retry')}
                    </button>
                  </>
                ) : (
                  <span style={{ color: 'var(--muted)' }}>{t('chat.sending')}</span>
                )}
              </div>
            </div>
          </div>
        ))}

        <div ref={endRef} />
      </div>

      {/* كلام جديد وانت فوق */}
      {unseen > 0 && (
        <button
          type="button"
          onClick={() => {
            atBottom.current = true
            endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
            setUnseen(0)
          }}
          className="sticky bottom-[84px] mx-auto cursor-pointer rounded-pill px-4 py-2 font-display text-14 font-black"
          style={{ background: '#2B4CFF', color: '#FBF7EF', border: 0 }}
        >
          {t('chat.newMessages')}
        </button>
      )}

      {/* الكتابة — أو رسالة القفل */}
      {closed ? (
        <div
          className="nb-safe-bottom sticky bottom-0 mt-4 rounded-16 p-4 text-center font-body text-15 font-semibold"
          style={{ background: 'var(--surface)', color: 'var(--muted)' }}
        >
          {t('shared.text.8')}
        </div>
      ) : (
        <form
          onSubmit={send}
          className="nb-safe-bottom sticky bottom-0 mt-4 flex items-end gap-2 pt-3"
          style={{ background: 'var(--bg)', borderTop: '2px solid var(--line)' }}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_LEN))}
            onKeyDown={(e) => {
              // Enter يبعت، Shift+Enter سطر جديد — زي أي شات
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send(e as unknown as React.FormEvent)
              }
            }}
            rows={1}
            placeholder={t('shared.label.7')}
            aria-label={t('shared.label.6')}
            className="max-h-[120px] min-h-[52px] w-full min-w-0 resize-none px-[14px] py-[14px] font-body text-16 outline-none"
            style={{
              border: '2px solid #14161A',
              borderRadius: 14,
              background: '#FBF7EF',
              color: '#14161A',
            }}
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="min-h-[52px] shrink-0 cursor-pointer rounded-14 px-5 font-display text-16 font-black disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: '#F4632A', color: '#14161A', border: 0 }}
          >
            {t('shared.text.7')}
          </button>
        </form>
      )}
    </div>
  )
}

/* ============================================================ فقاعة رسالة */

function Bubble({
  m,
  clock,
  open,
  isCaptain,
  t,
  onPressStart,
  onPressEnd,
  onOpen,
  onReport,
  onRemove,
  onClose,
}: {
  m: ChatMessage
  clock: string
  open: boolean
  isCaptain: boolean
  t: (k: string, v?: Record<string, string | number>) => string
  onPressStart: () => void
  onPressEnd: () => void
  onOpen: () => void
  onReport: () => void
  onRemove: () => void
  onClose: () => void
}) {
  return (
    <div className="relative flex items-start gap-3">
      <div
        className="grid h-[40px] w-[40px] shrink-0 place-items-center rounded-pill font-display text-17 font-black"
        style={{ background: m.isCaptain ? '#F4632A' : '#EFE3CF', color: '#14161A' }}
      >
        {m.initial}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-display text-15 font-black">{m.author}</span>
          {m.isCaptain && (
            <span className="font-body text-12" style={{ color: 'var(--muted)' }}>
              {t('shared.text.12')}
            </span>
          )}
          <span className="ms-auto font-body text-12" style={{ color: 'var(--muted)' }}>
            {clock}
          </span>
        </div>
        <button
          type="button"
          onPointerDown={onPressStart}
          onPointerUp={onPressEnd}
          onPointerLeave={onPressEnd}
          onContextMenu={(e) => {
            e.preventDefault()
            onOpen()
          }}
          className="w-full cursor-pointer rounded-14 p-3 text-start font-body text-15"
          style={{
            background: m.mine ? '#F4632A' : 'var(--surface)',
            color: m.mine ? '#14161A' : 'var(--fg)',
            border: 0,
            whiteSpace: 'pre-wrap',
          }}
        >
          {m.text}
        </button>

        {open && (
          <div className="mt-2 flex flex-wrap gap-2 rounded-14 p-2" style={{ background: 'var(--surface)' }}>
            <button
              type="button"
              onClick={onReport}
              className="min-h-[44px] cursor-pointer rounded-pill px-4 font-display text-14 font-black"
              style={{ background: '#8E2F1F', color: '#FBF7EF', border: 0 }}
            >
              {t('shared.text.11')}
            </button>
            {isCaptain && !m.mine && (
              <button
                type="button"
                onClick={onRemove}
                className="min-h-[44px] cursor-pointer rounded-pill px-4 font-display text-14 font-black"
                style={{ background: 'transparent', color: 'var(--fg)', border: '2px solid var(--fg)' }}
              >
                {t('shared.text.10')}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] cursor-pointer border-0 bg-transparent px-3 font-body text-14 font-semibold"
              style={{ color: 'var(--muted)' }}
            >
              {t('shared.text.9')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
