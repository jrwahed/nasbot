'use client'

import Link from 'next/link'
import { footerLine } from '@/data/lists'
import { useFooterLinks } from '@/components/FooterLinksProvider'
import { useFlag } from '@/components/FlagsProvider'
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
export function Footer() {
  const links = useFooterLinks()
  const hosting = useFlag('member_sbota')
  const t = useT()

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
        {hosting.on && <Link href="/new">{t('host.me.new')}</Link>}
      </div>
      <div className="mt-4">{footerLine}</div>
    </footer>
  )
}
