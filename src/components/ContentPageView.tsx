'use client'

import { useState, type ReactNode } from 'react'
import { InnerHeader } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { Sticker } from '@/components/Sticker'
import { GuaranteeBox } from '@/components/WhoBooked'
import { useT } from '@/components/CopyProvider'
import type { ContentPage, ContentBlock } from '@/types'

/**
 * عارض صفحات المحتوى — القواعد · الأسئلة · مين إحنا · الشروط.
 *
 * الأربعة بيشتركوا في نفس المكوّن ده، والفرق بينهم **بيانات في القاعدة
 * مش كود**. المالك بيضيف سؤال أو فقرة من `/admin/content` وبتبان على طول.
 *
 * أنواع الفقرات:
 *   numbered → كرت مرقّم (القواعد الخمسة). الترقيم محسوب من الترتيب،
 *              فلو المالك مسح واحدة الأرقام بتتظبط لوحدها.
 *   qa       → سؤال بيتفتح ويتقفل.
 *   callout  → صندوق ملوّن (الضمان · بنات بس).
 *   section  → عنوان ونص عادي.
 */
export function ContentPageView({
  page,
  children,
}: {
  page: ContentPage
  /** حاجة زيادة تحت المحتوى — زرار الطوارئ في القواعد مثلًا */
  children?: ReactNode
}) {
  const t = useT()

  // الترقيم بيتحسب هنا مش بيتخزّن، علشان مسح فقرة ما يسيبش فجوة في الأرقام
  let n = 0

  return (
    <main className="mx-auto w-full max-w-page">
      <div className="px-5">
        <InnerHeader back={t('content.back')} padded={false} />

        <h1 className="mb-0 mt-[10px] font-display text-40 font-black leading-[1.1]">
          {page.title}
        </h1>
        {page.intro && <p className="mb-0 mt-2 text-17">{page.intro}</p>}

        {page.blocks.length === 0 ? (
          // صفحة لسه فاضية — بنقول الحقيقة بدل ما نسيب بياض
          <div
            className="mt-8 rounded-20 p-5 font-body text-16"
            style={{ background: '#EFE3CF', color: '#14161A' }}
          >
            {t('content.empty')}
          </div>
        ) : (
          <div className="mt-8 flex flex-col gap-4">
            {page.blocks.map((b, i) => {
              if (b.kind === 'numbered') n += 1
              return <Block key={i} block={b} n={n} />
            })}
          </div>
        )}

        {children}
      </div>

      <Footer />
    </main>
  )
}

function Block({ block, n }: { block: ContentBlock; n: number }) {
  if (block.kind === 'numbered') {
    return (
      <div
        className="flex gap-4 rounded-20 p-5"
        style={{ background: '#EFE3CF', color: '#14161A' }}
      >
        <span className="font-display text-40 font-black leading-none">{n}</span>
        <div className="min-w-0">
          <div className="font-display text-20 font-black">{block.heading}</div>
          <div className="mt-1 font-body text-15">{block.body}</div>
        </div>
      </div>
    )
  }

  if (block.kind === 'qa') return <Question block={block} />

  if (block.kind === 'callout') {
    const cobalt = block.tone === 'cobalt'
    // الضمان بشكله المعروف، وأي كالاوت تاني بصندوق ملوّن
    if (!cobalt && !block.heading) return <GuaranteeBox text={block.body} />
    return (
      <div
        className="rounded-20 p-5"
        style={
          cobalt
            ? { background: '#2B4CFF', color: '#FBF7EF' }
            : { background: '#EFE3CF', color: '#14161A' }
        }
      >
        {block.heading && (
          <Sticker color={cobalt ? 'cream' : 'orange'} rotate={-3} size="sm">
            {block.heading}
          </Sticker>
        )}
        <div className="mt-3 font-body text-16">{block.body}</div>
      </div>
    )
  }

  return (
    <div>
      {block.heading && (
        <h2 className="m-0 font-display text-26 font-black">{block.heading}</h2>
      )}
      <p className="mb-0 mt-2 whitespace-pre-line font-body text-16 leading-[1.9]">
        {block.body}
      </p>
    </div>
  )
}

/** سؤال بيتفتح ويتقفل — الأسئلة بتبقى كتير، فالقايمة تفضل مقروءة */
function Question({ block }: { block: ContentBlock }) {
  const [open, setOpen] = useState(false)
  return (
    <div
      className="overflow-hidden rounded-20"
      style={{ background: '#EFE3CF', color: '#14161A' }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-5 text-start"
        style={{ minHeight: 56 }}
      >
        <span className="font-display text-18 font-black leading-[1.3]">
          {block.heading}
        </span>
        <span
          aria-hidden="true"
          className="shrink-0 font-display text-24 font-black leading-none"
          style={{ transform: open ? 'rotate(45deg)' : 'none' }}
        >
          +
        </span>
      </button>
      {open && (
        <div className="whitespace-pre-line px-5 pb-5 font-body text-16 leading-[1.9]">
          {block.body}
        </div>
      )}
    </div>
  )
}
