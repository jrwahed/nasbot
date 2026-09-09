'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { InnerHeader } from '@/components/Header'
import { PhotoPlaceholder } from '@/components/PhotoPlaceholder'
import { metBefore } from '@/data/people'
import { loadRoom, appendMessage } from '@/lib/chat-store'
import { getSession } from '@/lib/session'
import type { ChatMessage } from '@/types'
import { useT } from '@/components/CopyProvider'
import { FeatureGate } from '@/components/FlagsProvider'

/**
 * شات خاص واحد لواحد.
 * بيتفتح بس بين اتنين اختاروا بعض في التقييم — عشان كده
 * المسار ده جوه /me ومش متاح من شات السبوطة.
 */
function PrivateChatPage() {
  const t = useT()
  const params = useParams<{ name: string }>()
  const name = decodeURIComponent(params.name)
  const person = metBefore.find((p) => p.name === name)
  const roomId = `dm-${name}`
  const me = getSession()?.firstName ?? t('dm.label.4')

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMessages(loadRoom(roomId))
  }, [roomId])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  const send = (e: React.FormEvent) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    const msg: ChatMessage = {
      id: `m-${Date.now()}`,
      roomId,
      author: me,
      initial: me[0],
      text,
      at: new Date().toISOString(),
      mine: true,
    }
    appendMessage(roomId, msg)
    setMessages((m) => [...m, msg])
    setDraft('')
  }

  if (!person) {
    return (
      <main className="mx-auto w-full max-w-page px-5">
        <InnerHeader back={t('dm.label.3')} href="/me" padded={false} />
        <div className="pt-8 font-body text-16">{t('dm.text.4')}</div>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-page flex-col px-5 pb-4">
      <InnerHeader back={t('dm.label.3')} href="/me" padded={false} />

      <div className="flex items-center gap-3 py-3">
        <PhotoPlaceholder label={person.photo} circle size={48} />
        <div>
          <div className="font-display text-20 font-black">{person.name}</div>
          <div className="font-body text-13" style={{ color: 'var(--muted)' }}>{t('dm.text.3')}</div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 pt-2">
        {messages.length === 0 && (
          <div className="font-body text-15" style={{ color: 'var(--muted)' }}>{t('dm.text.2')}</div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className="max-w-[80%] self-end rounded-14 p-3 font-body text-15"
            style={{ background: '#F4632A', color: '#14161A' }}
          >
            {m.text}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={send}
        className="nb-safe-bottom sticky bottom-0 mt-4 flex gap-2 pt-3"
        style={{ background: 'var(--bg)', borderTop: '2px solid var(--line)' }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('dm.label.2')}
          aria-label={t('dm.label.1')}
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
          className="min-h-[52px] shrink-0 cursor-pointer rounded-14 border-0 px-5 font-display text-16 font-black"
          style={{ background: '#F4632A', color: '#14161A' }}
        >{t('dm.text.1')}</button>
      </form>
    </main>
  )
}

/**
 * القفل من اللوحة: مفتاح «chat» في /admin/settings ← مفاتيح المزايا.
 * مقفول = شاشة «مقفول» برسالة المالك بدل الصفحة (مراجعة A2).
 */
export default function PrivateChatPageRoute() {
  return (
    <FeatureGate flag="chat">
      <PrivateChatPage />
    </FeatureGate>
  )
}
