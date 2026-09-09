'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/components/CopyProvider'
import { openOneOnOne } from '@/lib/api'
import type { WorkCollab } from '@/lib/collab'

/**
 * «شغالين معاك» — اللي بيني وبينهم تبادل في سبوطات الشغل.
 *
 * السرية: القايمة كلها جاية من fn_work_collab_state، يعني اللي بيظهر هنا
 * هو التبادل بس. مفيش أي طريقة من هنا تعرف مين اختارك ومختارتوش.
 *
 * «ابعتله» بتفتح نفس شات الواحد-لواحد الموجود: fn_open_one_on_one عبر
 * openOneOnOne (لو الغرفة لسه ما اتفتحتش بتتعمل)، وبعدين نفس مسار
 * /me/chat/[name] اللي بيستعمله /me. مفيش شات جديد هنا.
 */
export function CollabList({ items }: { items: WorkCollab[] }) {
  const t = useT()
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  if (!items.length) {
    return (
      <div className="mt-3 rounded-20 p-5" style={{ background: 'var(--surface)' }}>
        <div className="font-body text-15" style={{ color: 'var(--muted)' }}>
          {t('shoghl.me.collab.empty')}
        </div>
      </div>
    )
  }

  const metLine = (c: WorkCollab) => {
    if (c.sbotaName && c.venueName)
      return t('shoghl.me.collab.met', { sbota: c.sbotaName, venue: c.venueName })
    if (c.sbotaName) return t('shoghl.me.collab.metSbota', { sbota: c.sbotaName })
    return t('shoghl.me.collab.metWork')
  }

  const talk = async (c: WorkCollab) => {
    setBusy(c.id)
    // الغرفة بتتفتح لو الاتنين في تبادل مسجّل — ولو الدالة رفضت
    // بنكمّل على نفس صفحة الشات زي ما /me بتعمل بالظبط.
    await openOneOnOne(c.id)
    setBusy(null)
    router.push(`/me/chat/${encodeURIComponent(c.firstName)}`)
  }

  return (
    <div className="mt-3 flex flex-col gap-3">
      {items.map((c) => (
        <div
          key={c.id}
          className="flex flex-wrap items-center gap-3 rounded-20 p-4"
          style={{ background: 'var(--surface)' }}
        >
          <span
            aria-hidden
            className="grid h-11 w-11 shrink-0 place-items-center rounded-pill font-display text-18 font-black"
            style={{
              background: c.professionColor ?? 'var(--fg)',
              color: '#FBF7EF',
            }}
          >
            {c.firstName.slice(0, 1)}
          </span>

          <div className="min-w-0 flex-1">
            <div className="font-display text-18 font-black">{c.firstName}</div>
            {c.professionAr && (
              <div className="mt-[2px] flex items-center gap-[6px]">
                <span
                  aria-hidden
                  className="inline-block h-[10px] w-[10px] shrink-0 rounded-pill"
                  style={{ background: c.professionColor ?? 'var(--muted)' }}
                />
                <span className="font-body text-14 font-semibold">{c.professionAr}</span>
              </div>
            )}
            <div className="mt-[2px] font-body text-13" style={{ color: 'var(--muted)' }}>
              {metLine(c)}
            </div>
          </div>

          <button
            type="button"
            disabled={busy !== null}
            onClick={() => talk(c)}
            className="grid min-h-[44px] shrink-0 cursor-pointer place-items-center rounded-pill border-0 px-5 font-display text-15 font-black disabled:opacity-50"
            style={{ background: '#F4632A', color: '#14161A' }}
          >
            {busy === c.id ? t('shoghl.me.collab.opening') : t('shoghl.me.collab.dm')}
          </button>
        </div>
      ))}
    </div>
  )
}
