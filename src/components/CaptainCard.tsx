import type { Captain } from '@/types'
import { PhotoPlaceholder } from '@/components/PhotoPlaceholder'

/**
 * بطاقة الكابتن.
 * في صفحة السبوطة (ليلي): خلفية #1E2128 وصورة رملي 64px — من الملف.
 * في كشف المجموعة: خلفية رملي #EFE3CF وصورة #E2D2B4 — من الملف.
 */
export function CaptainCard({
  captain,
  tone = 'surface',
  line,
}: {
  captain: Captain
  tone?: 'surface' | 'sand'
  /** السطر المعروض — intro في صفحة السبوطة، gateLine في الكشف */
  line?: string
}) {
  const sand = tone === 'sand'
  return (
    <div
      className="flex items-center gap-[14px] rounded-20 p-4"
      style={{
        background: sand ? '#EFE3CF' : 'var(--surface)',
        color: sand ? '#14161A' : 'var(--fg)',
      }}
    >
      <PhotoPlaceholder
        label={captain.photo}
        variant={sand ? 'sandDeep' : 'sand'}
        circle
        size={64}
      />
      <div className="min-w-0">
        <div className="font-display text-18 font-black">{captain.name}</div>
        <div
          className="font-body text-14"
          style={{ color: sand ? '#14161A' : 'var(--muted)' }}
        >
          {line ?? captain.intro}
        </div>
      </div>
    </div>
  )
}

/** الكابتن في شبكة الرئيسية — دايرة 84 واسم وجملة */
export function CaptainTile({ captain }: { captain: Captain }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <PhotoPlaceholder label={captain.photo} circle size={84} />
      <div className="font-display text-16 font-black">{captain.title}</div>
      <div className="font-body text-14" style={{ color: 'var(--muted)' }}>
        {captain.line}
      </div>
    </div>
  )
}
