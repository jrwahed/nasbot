'use client'

import { useParams } from 'next/navigation'
import { InnerHeader } from '@/components/Header'
import { ChatRoom } from '@/components/ChatRoom'
import { getSession } from '@/lib/session'
import { useT } from '@/components/CopyProvider'

/**
 * شات السبوطة — غرفة لكل حجز.
 * بيتفتح مع الكشف وبيتقفل بعد السبوطة بيومين ← قراءة فقط.
 * مفيش شات خاص هنا — الخاص من /me بس بعد الاختيار المتبادل.
 */
export default function ChatPage() {
  const t = useT()
  const params = useParams<{ bookingId: string }>()
  const me = getSession()?.firstName ?? t('chat.label.2')

  return (
    <main className="mx-auto w-full max-w-page px-5 pb-4">
      <InnerHeader back={t('chat.label.1')} href={`/my/${params.bookingId}`} padded={false} />
      <ChatRoom bookingId={params.bookingId} me={me} />
    </main>
  )
}
