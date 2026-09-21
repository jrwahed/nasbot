'use client'

import Link from 'next/link'
import { footerLine } from '@/data/lists'
import { useFooterLinks } from '@/components/FooterLinksProvider'
import { useFlags } from '@/components/FlagsProvider'
import type { FlagKey } from '@/data/flags-fallback'
import { useT } from '@/components/CopyProvider'

/**
 * الذيل — من design/نسبوط.dc.html:
 * حشو 36px 20px 80px، الروابط بوزن 600 بلون النص،
 * والسطر تحتها بلون ثانوي بحجم 14.
 *
 * ⚠ قبل كده الروابط كانت خريطة ثابتة في الملف ده، و**أربعة** من الخمسة
 * كانوا بيروحوا `/rules` — يعني الأسئلة ومين إحنا والشروط مكانش ليهم
 * صفحات أصلًا. دلوقتي الروابط بتتقرا من `content_pages`: المالك يغيّر
 * اسم الرابط أو يقفل الصفحة من `/admin/content` والرابط يختفي لوحده.
 *
 * «افتح خروجة» مش صفحة محتوى فبيتحط هنا، وراه مفتاح الميزة زي أي مكان
 * تاني. (كان «بقى كابتن» — المنتج ما بقاش قايم على الكابتن فمفيش وظيفة
 * تتقدّم ليها، أي حد يفتح خروجة بنفسه.)
 */

/**
 * روابط الذيل اللي مش صفحات محتوى — كل واحد شايل مفتاحه.
 * نفس نمط `NAV` في الهيدر، ونفس الحارس بيفحص الاتنين.
 */
const EXTRA: ReadonlyArray<{ href: string; key: string; flag?: FlagKey }> = [
  { href: '/new', key: 'host.me.new', flag: 'member_sbota' },
]
export function Footer() {
  const links = useFooterLinks()
  const flags = useFlags()
  const t = useT()

  // مفتاح مقفول = الرابط يختفي خالص
  const extra = EXTRA.filter((l) => !l.flag || (flags[l.flag]?.on ?? true))

  return (
    <footer
      className="px-5 pb-20 pt-9 font-body text-14"
      style={{ color: 'var(--muted)' }}
    >
      <div
        className="flex flex-wrap gap-x-[18px] gap-y-2 font-semibold"
        style={{ color: 'var(--fg)' }}
      >
        {links.map((l) => (
          <Link key={l.href} href={l.href}>
            {l.label}
          </Link>
        ))}
        {extra.map((l) => (
          <Link key={l.href} href={l.href}>
            {t(l.key)}
          </Link>
        ))}
      </div>
      <div className="mt-4">{footerLine}</div>
    </footer>
  )
}
