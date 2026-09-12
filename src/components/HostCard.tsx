'use client'

import { Sticker } from '@/components/Sticker'
import { useT } from '@/components/CopyProvider'

/**
 * بطاقة صاحب الخروجة — بديلة `CaptainCard` في السبوطات اللي عضو فتحها.
 *
 * ⚠ **مفيش صورة هنا عن قصد.** الكابتن ليه صورة لأنه وش الموقع وبيستنى
 * الناس عند البوابة. صاحب الخروجة عضو زي أي حد في المجموعة، وقاعدة الهوية
 * إن مفيش صور قبل الكشف (CLAUDE.md §٣.٧). الاسم الأول وسطره بس.
 */
export function HostCard({
  name,
  note,
  tone = 'surface',
}: {
  name: string
  note?: string
  tone?: 'surface' | 'sand'
}) {
  const t = useT()
  const sand = tone === 'sand'
  return (
    <div
      className="flex flex-col gap-2 rounded-20 p-4"
      style={{
        background: sand ? '#EFE3CF' : 'var(--surface)',
        color: sand ? '#14161A' : 'var(--fg)',
      }}
    >
      <Sticker color={sand ? 'orange' : 'cream'} rotate={-3} size="xs">
        {t('host.card.label')}
      </Sticker>
      <div className="font-display text-18 font-black">
        {t('host.badge.member', { name })}
      </div>
      <div
        className="font-body text-14"
        style={{ color: sand ? '#14161A' : 'var(--muted)' }}
      >
        {note?.trim() ? note : t('host.card.noNote')}
      </div>
    </div>
  )
}
