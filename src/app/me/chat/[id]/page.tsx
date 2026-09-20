'use client'

import { useParams } from 'next/navigation'
import { InnerHeader } from '@/components/Header'
import { ChatRoom } from '@/components/ChatRoom'
import { getSession } from '@/lib/session'
import { useT } from '@/components/CopyProvider'
import { FeatureGate } from '@/components/FlagsProvider'

/**
 * شات خاص واحد لواحد — بيتفتح بس بين اتنين اختاروا بعض في التقييم.
 *
 * ⚠ **الصفحة دي كانت مزيّفة بالكامل.** النسخة القديمة (`/me/chat/[name]`)
 *    كانت بتقرا الناس من `src/data/people.ts` — بيانات عرض في الكود —
 *    وبتحفظ الرسايل في `localStorage`، **من غير أي نداء للقاعدة**. يعني
 *    اتنين يختاروا بعض ويفتحوا الشات، وكل واحد بيكتب لنفسه في متصفحه هو.
 *    ولا واحد فيهم شاف كلام التاني أبدًا، والشاشة شكلها شغّالة تمامًا.
 *
 * ⚠ والمسار بقى بـ**رقم الحساب** مش بالاسم. الاسم مش مفتاح: اتنين بنفس
 *    الاسم كانوا هيتشاركوا نفس «الغرفة»، والحارس في القاعدة مالوش أي معنى
 *    لو اللي جاي اسم.
 *
 * كل الحراس في `fn_open_one_on_one`: بترفض لو مش مختارين بعض، وبتعمل
 * الغرفة لو أول مرة. الصفحة دي بتعرض بس.
 */
function PrivateChatPage() {
  const t = useT()
  const params = useParams<{ id: string }>()
  const me = getSession()?.firstName ?? t('dm.label.4')

  return (
    <main className="mx-auto w-full max-w-page px-5 pb-4">
      <InnerHeader back={t('dm.label.1')} href="/me" padded={false} />
      <ChatRoom directWith={params.id} me={me} />
    </main>
  )
}

export default function PrivateChatRoute() {
  return (
    <FeatureGate flag="chat">
      <PrivateChatPage />
    </FeatureGate>
  )
}
