'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { WaitButton } from '@/components/Buttons'
import { useT } from '@/components/CopyProvider'
import { getTemplates, wantSoon, type SoonItem } from '@/lib/api'
import { isLoggedIn } from '@/lib/session'
import { track } from '@/lib/track'

/**
 * «كل الخروجات» — كاتالوج القوالب تحت السبوطات في الرئيسية (0145).
 *
 * طلب المالك (٢٠٢٦-١١-١٥): «عاوز يلا الصفحة الافتراضية وتحتها القوالب»،
 * واختار إن القسم يعرض **الـ٩٤ كلهم**.
 *
 * 🔴 **الكارت هنا شكله تاني عن `ComingSoon` و`SbotaCard` عن قصد.**
 *    دول بيحطوا صورة بنسبة 4/3 عبر `PhotoPlaceholder` — واللي مالوش
 *    صورة بياخد **مربع رملي مكتوب فيه «[صورة]»**. على الإنتاج ٩١ من
 *    الـ٩٤ مالهمش صور، يعني القسم كان هيبقى حيطة مربعات فاضية.
 *    والمالك اختار صريح: «كله، من غير مربع صورة فاضي».
 *
 *    فالكارت بقى **صف**: الصورة مربع صغير **لو موجودة بس**، والكلام جنبها.
 *    مفيش `PhotoPlaceholder` ومفيش صورة مخترعة (§٨ «مفيش بيانات وهمية»).
 *
 * ⚠ ومفيش سعر ولا ميعاد — `fn_templates_all` مش بترجّعهم أصلًا، وفيه صف
 *   اختبار صريح على ده. الكاتالوج «إيه اللي ممكن نعمله» مش قايمة أسعار.
 *
 * ⚠ ومفيش قصّ بعدد ثابت («ورّيني أول ١٢») — ده كان هيبقى رقم في الكود
 *   (§٣.٢). القايمة كاملة، والكارت الصف صغير فالـ٩٤ بيتصفّحوا عادي.
 *
 * ⚠ وبيختفي خالص لو مفيش ولا قالب — مش عنوان فوق فراغ (زي `ComingSoon`).
 */
export function Templates({ className = '' }: { className?: string }) {
  const t = useT()
  const [items, setItems] = useState<SoonItem[]>([])

  useEffect(() => {
    let alive = true
    getTemplates().then((l) => {
      if (alive) setItems(l)
    })
    return () => {
      alive = false
    }
  }, [])

  if (items.length === 0) return null

  return (
    <section className={className}>
      <h2 className="m-0 font-display text-26 font-black leading-[1.15]">{t('tpl.home.title')}</h2>
      <div className="mt-1 font-body text-16" style={{ color: 'var(--sbt-sub)' }}>
        {t('tpl.home.sub')}
      </div>

      {/*
        ⚠ **عمود واحد على الكمبيوتر (مش `xl:grid-cols-2`).** العمود الشمال
          في الرئيسية عرضه 40%، فتقسيمه لاتنين بيخلّي الكارت ~١٨٠px —
          والاسم بيتقص: «أديرة وادي ا…» · «الهرم المدر…». اتشاف في اللقطة
          على ١٤٤٠ (الدرس الخمستاشر).
      */}
      <div className="grid grid-cols-1 gap-3 pt-4 md:grid-cols-2 lg:grid-cols-1">
        {items.map((item) => (
          <TemplateRow
            key={item.templateId}
            item={item}
            onChange={(on) =>
              setItems((prev) =>
                prev.map((x) => (x.templateId === item.templateId ? { ...x, iWant: on } : x))
              )
            }
          />
        ))}
      </div>
    </section>
  )
}

function TemplateRow({
  item,
  onChange,
}: {
  item: SoonItem
  onChange: (on: boolean) => void
}) {
  const t = useT()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)

  /** نفس مسار `SoonCard` بالحرف — `fn_want_soon` هي الطريق الوحيد للكتابة */
  const onTap = async () => {
    if (!isLoggedIn()) {
      router.push('/login?next=/')
      return
    }
    const next = !item.iWant
    setBusy(true)
    setErr(false)
    const res = await wantSoon(item.templateId, next)
    setBusy(false)
    if (res === null) {
      setErr(true)
      return
    }
    if (res) track('soon_want', { slug: item.slug })
    onChange(res)
  }

  return (
    <article
      className="flex w-full max-w-full items-center gap-3 overflow-hidden rounded-16 p-3"
      style={{ background: '#EFE3CF', color: '#14161A' }}
    >
      {/* 🔴 الصورة بتتعرض **لو موجودة بس** — مفيش مربع بديل */}
      {item.imgSrc && (
        <div className="relative h-[64px] w-[64px] shrink-0 overflow-hidden rounded-12">
          <Image
            src={item.imgSrc}
            alt={item.photoAlt ?? item.name}
            fill
            sizes="64px"
            className="object-cover"
          />
        </div>
      )}

      <div className="min-w-0 flex-1">
        {/* ⚠ **بيلفّ مش بيتقص** — اسم الخروجة هو المعلومة الوحيدة في الكارت */}
        <h3 className="m-0 font-display text-18 font-black leading-[1.2]">{item.name}</h3>
        {item.mood && (
          <div className="font-body text-14" style={{ color: '#55575C' }}>
            {item.mood}
          </div>
        )}
        {err && (
          <div className="font-body text-13" style={{ color: '#B3261E' }}>
            {t('soon.error')}
          </div>
        )}
      </div>

      {item.iWant ? (
        <button
          type="button"
          onClick={onTap}
          disabled={busy}
          className="min-h-[40px] shrink-0 cursor-pointer rounded-12 px-3 font-display text-14 font-black leading-none"
          style={{ background: '#14161A', color: '#FBF7EF', border: 0 }}
        >
          {t('soon.wanted')}
        </button>
      ) : (
        <WaitButton onClick={onTap} disabled={busy}>
          {t('soon.want')}
        </WaitButton>
      )}
    </article>
  )
}
