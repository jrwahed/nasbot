'use client'

import { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '@/types'
import { getChat, sendMessage, reportMessage, removeFromRoom } from '@/lib/api'
import { subscribe } from '@/lib/chat-store'
import { setQState } from '@/lib/liveq'
import { useT } from '@/components/CopyProvider'

/**
 * غرفة الشات.
 * بتتفتح مع كشف المجموعة وبتتقفل بعد السبوطة بيومين ← قراءة فقط.
 * ضغط مطول على أي رسالة بيعرض «إبلاغ»، والكابتن عنده «شيل من الغرفة».
 * مفيش شات خاص هنا.
 */
export function ChatRoom({
  bookingId,
  isCaptain = false,
  me,
}: {
  bookingId: string
  isCaptain?: boolean
  /** اسم صاحب الرسالة — لو مااتبعتش بياخد «أنا» من النصوص */
  me?: string
}) {
  const t = useT()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [closed, setClosed] = useState(false)
  const [title, setTitle] = useState('')
  const [closesAt, setClosesAt] = useState('')
  const [draft, setDraft] = useState('')
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const endRef = useRef<HTMLDivElement>(null)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let alive = true
    getChat(bookingId).then((room) => {
      if (!alive || !room) return
      setMessages(room.messages)
      setClosed(room.closed)
      setTitle(room.title)
      setClosesAt(room.closesAt)
      setLoading(false)
      // الغرفة اتقفلت ← علامة الاستفهام بتنام
      if (room.closed) setQState('sleep')
    })
    const unsub = subscribe(bookingId, () => {
      getChat(bookingId).then((room) => {
        if (alive && room) setMessages(room.messages)
      })
    })
    return () => {
      alive = false
      unsub()
      setQState('idle')
    }
  }, [bookingId])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text || closed) return
    setDraft('')
    const msg = await sendMessage(bookingId, text, me ?? t('shared.me'))
    setMessages((m) => [...m, msg])
  }

  const onReport = async (id: string) => {
    setMenuFor(null)
    await reportMessage(id)
    setNotice(t('shared.label.9'))
    setTimeout(() => setNotice(''), 4000)
  }

  const onRemove = async (name: string) => {
    setMenuFor(null)
    await removeFromRoom(bookingId, name)
    setNotice(t('chat.removed', { name }))
    setTimeout(() => setNotice(''), 4000)
  }

  const startPress = (id: string) => {
    pressTimer.current = setTimeout(() => setMenuFor(id), 500)
  }
  const endPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current)
  }

  const closeLabel = closesAt
    ? new Date(closesAt).toLocaleDateString('ar-EG', {
        weekday: 'long',
      })
    : ''

  const pinned = messages.find((m) => m.pinned)
  const rest = messages.filter((m) => !m.pinned)

  return (
    <div className="flex min-h-[70vh] flex-col">
      {/* الشريط العلوي */}
      <div
        className="sticky top-0 z-10 flex flex-wrap items-baseline gap-x-2 gap-y-1 pb-3 pt-1"
        style={{ background: 'var(--bg)' }}
      >
        <h1 className="m-0 font-display text-22 font-black">{title || t('shared.label.8')}</h1>
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

      {/* الرسالة المثبتة من الكابتن */}
      {pinned && (
        <div
          className="mb-4 rounded-16 p-4"
          style={{ background: '#EFE3CF', color: '#14161A' }}
        >
          <div className="mb-1 font-display text-15 font-black">
            {pinned.author} · {t('chat.pinned')}
          </div>
          <div className="font-body text-15">{pinned.text}</div>
        </div>
      )}

      {/* الرسائل */}
      <div className="flex flex-1 flex-col gap-3">
        {loading && (
          <div className="font-body text-14" style={{ color: 'var(--muted)' }}>{t('shared.text.13')}</div>
        )}
        {rest.map((m) => (
          <div key={m.id} className="relative flex items-start gap-3">
            <div
              className="grid h-[40px] w-[40px] shrink-0 place-items-center rounded-pill font-display text-17 font-black"
              style={{
                background: m.isCaptain ? '#F4632A' : '#EFE3CF',
                color: '#14161A',
              }}
            >
              {m.initial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-display text-15 font-black">{m.author}</span>
                {m.isCaptain && (
                  <span className="font-body text-12" style={{ color: 'var(--muted)' }}>{t('shared.text.12')}</span>
                )}
              </div>
              <button
                type="button"
                onPointerDown={() => startPress(m.id)}
                onPointerUp={endPress}
                onPointerLeave={endPress}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setMenuFor(m.id)
                }}
                className="w-full cursor-pointer rounded-14 p-3 text-start font-body text-15"
                style={{
                  background: m.mine ? '#F4632A' : 'var(--surface)',
                  color: m.mine ? '#14161A' : 'var(--fg)',
                  border: 0,
                }}
              >
                {m.text}
              </button>

              {menuFor === m.id && (
                <div
                  className="mt-2 flex flex-wrap gap-2 rounded-14 p-2"
                  style={{ background: 'var(--surface)' }}
                >
                  <button
                    type="button"
                    onClick={() => onReport(m.id)}
                    className="min-h-[44px] cursor-pointer rounded-pill px-4 font-display text-14 font-black"
                    style={{ background: '#8E2F1F', color: '#FBF7EF', border: 0 }}
                  >{t('shared.text.11')}</button>
                  {isCaptain && !m.mine && (
                    <button
                      type="button"
                      onClick={() => onRemove(m.author)}
                      className="min-h-[44px] cursor-pointer rounded-pill px-4 font-display text-14 font-black"
                      style={{
                        background: 'transparent',
                        color: 'var(--fg)',
                        border: '2px solid var(--fg)',
                      }}
                    >{t('shared.text.10')}</button>
                  )}
                  <button
                    type="button"
                    onClick={() => setMenuFor(null)}
                    className="min-h-[44px] cursor-pointer border-0 bg-transparent px-3 font-body text-14 font-semibold"
                    style={{ color: 'var(--muted)' }}
                  >{t('shared.text.9')}</button>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* الكتابة — أو رسالة القفل */}
      {closed ? (
        <div
          className="nb-safe-bottom sticky bottom-0 mt-4 rounded-16 p-4 text-center font-body text-15 font-semibold"
          style={{ background: 'var(--surface)', color: 'var(--muted)' }}
        >{t('shared.text.8')}</div>
      ) : (
        <form
          onSubmit={send}
          className="nb-safe-bottom sticky bottom-0 mt-4 flex gap-2 pt-3"
          style={{ background: 'var(--bg)', borderTop: '2px solid var(--line)' }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('shared.label.7')}
            aria-label={t('shared.label.6')}
            className="min-h-[52px] w-full min-w-0 px-[14px] font-body text-16 outline-none"
            style={{
              border: '2px solid #14161A',
              borderRadius: 14,
              background: '#FBF7EF',
              color: '#14161A',
            }}
          />
          <button
            type="submit"
            className="min-h-[52px] shrink-0 cursor-pointer rounded-14 px-5 font-display text-16 font-black"
            style={{ background: '#F4632A', color: '#14161A', border: 0 }}
          >{t('shared.text.7')}</button>
        </form>
      )}
    </div>
  )
}
