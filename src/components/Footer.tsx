import Link from 'next/link'
import { footerLine, footerLinks } from '@/data/lists'

/**
 * الذيل — من design/نسبوط.dc.html:
 * حشو 36px 20px 80px، الروابط بوزن 600 بلون النص،
 * والسطر تحتها بلون ثانوي بحجم 14.
 */
const HREFS: Record<string, string> = {
  القواعد: '/rules',
  الأسئلة: '/rules',
  'بقى كابتن': '/captains',
  'مين إحنا': '/rules',
  الشروط: '/rules',
}

export function Footer() {
  return (
    <footer
      className="px-5 pb-20 pt-9 font-body text-14"
      style={{ color: 'var(--muted)' }}
    >
      <div
        className="flex flex-wrap gap-x-[18px] gap-y-2 font-semibold"
        style={{ color: 'var(--fg)' }}
      >
        {footerLinks.map((l) => (
          <Link key={l} href={HREFS[l] ?? '/rules'}>
            {l}
          </Link>
        ))}
      </div>
      <div className="mt-4">{footerLine}</div>
    </footer>
  )
}
