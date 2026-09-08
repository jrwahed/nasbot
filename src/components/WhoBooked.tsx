import type { WhoBooked as WhoBookedData } from '@/types'
import { ShieldIcon } from '@/components/Icons'
import { useT } from '@/components/CopyProvider'

/**
 * «مين حاجز لحد دلوقتي» — بدون أسماء.
 * من الملف: بطاقة رملي زوايا 20 حشو 18، العنوان Rubik 20،
 * الرقم Rubik 34، السطر عادي، وتحت خط فاصل #D9CBAF سطر الكشف بحجم 14.
 */
export function WhoBooked({ data }: { data: WhoBookedData }) {
  const t = useT()
  return (
    <div
      className="rounded-20 p-[18px]"
      style={{ background: '#EFE3CF', color: '#14161A' }}
    >
      <div className="font-display text-20 font-black">{t('shared.text.32')}</div>
      <div className="mt-[6px] font-display text-34 font-black leading-[1.1]">
        {t('shared.ofTotal', { n: data.booked, total: data.total })}
      </div>
      <div className="mt-[6px] font-body text-16">{data.line}</div>
      <div
        className="mt-[10px] pt-[10px] font-body text-14"
        style={{ color: '#55575C', borderTop: '1px solid #D9CBAF' }}
      >
        {data.revealLine}
      </div>
    </div>
  )
}

/**
 * صندوق الضمان — رملي، زوايا 16، حشو 16، درع أخضر 26px،
 * والنص 15 بوزن 600. من الملف.
 */
export function GuaranteeBox({ text }: { text: string }) {
  return (
    <div
      className="flex items-start gap-3 rounded-16 p-4"
      style={{ background: '#EFE3CF', color: '#14161A' }}
    >
      <ShieldIcon />
      <div className="font-body text-15 font-semibold">{text}</div>
    </div>
  )
}
