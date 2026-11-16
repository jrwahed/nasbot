'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { QIcon } from '@/components/QIcon'
import { Sticker } from '@/components/Sticker'
import { PrimaryButton, SecondaryButton } from '@/components/Buttons'
import { YallaSheet } from '@/components/yalla/YallaSheet'
import { YallaTalk } from '@/components/yalla/YallaTalk'
import { YallaPoll } from '@/components/yalla/YallaPoll'
import { useT } from '@/components/CopyProvider'
import { isLoggedIn } from '@/lib/session'
import { imInYalla, joinYallaWinner, type YallaPost as Post } from '@/lib/api'
import { arDigits, yallaWhen } from '@/lib/map-db'
import { track } from '@/lib/track'

/**
 * بوست «يلا» — نداء، والناس هي اللي بتقرر الميعاد والمنطقة.
 *
 * **شكلين:**
 *   · `kind = 'post'` (كل نداء جديد) — **الويك اند، ودوسة واحدة.** مفيش
 *     نافذة اختيار خالص: العضو يدوس «أنا جاي»، ويكتب في «الكلام» إمتى
 *     فاضي وإيه المكان. قرار المالك ٢٠٢٦-١١-١٥ بعد ما شاف ٢١ ميعاد و١٦
 *     منطقة في النافذة: «مش عاوز الاقتراحات دي كلها».
 *   · `kind = 'choice'` — النداء القديم بنافذة الاختيار. لسه موجود علشان
 *     النداء اللي المالك نزّله بالفورم القديم ما يبوظش.
 *
 * الشكل من السوشيال ميديا، والمحتوى **نص الطريق**:
 *   ✓ علامة الموقع + «من ساعتين» + الحالة · سطر بخط كبير · صورة النشاط ·
 *     عدد اللي جايين · كلام الأعضاء · صف أزرار
 *   ✗ مفيش صور أعضاء · مفيش بروفايل يتفتح لأي حد · مفيش عدد متابعين ·
 *     والدوسة **مجهولة** (رقم مش أسامي) — اللي بيكتب هو اللي بيختار يبان
 *
 * ⚠ **من غير صورة البوست كلام بس** — مش مربع رملي فاضي ولا صورة بديلة
 *   (قرار المالك). الـ٨٥ قالب في الدليل مفيهمش صور، فالحالة دي هي الأغلب
 *   مش الاستثناء.
 *
 * ⚠ **الألوان كلها من متغيّرات الثيم** مش ثوابت الهوية — الدرس الاتنين
 *   وتلاتين: `#14161A` على الخطوط الفاصلة بيختفي في الوضع الليلي (غامق على
 *   غامق). الاستثناء الوحيد الزرار البرتقالي (ده تعريفه).
 *
 * ⚠ والأرقام بالعربي (`arDigits`) — «٤ من ٦» مش «4 من 6».
 */
export function YallaPost({
  post,
  onChanged,
}: {
  post: Post
  /** الفيد بيحدّث البوست في مكانه — من غير ما ننقل صفحة */
  onChanged: (next: Post) => void
}) {
  const t = useT()
  const router = useRouter()
  const [sheet, setSheet] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)
  const [copied, setCopied] = useState(false)

  const isPost = post.kind === 'post'
  const mine = post.mySlots.length > 0 && !!post.myArea
  const locked = post.status === 'locked'
  const closed = post.status === 'closed'
  /** فاضل واحد أو اتنين = «قرّب يكمل» */
  const near = !locked && post.groupSize - post.topN <= 2 && post.topN > 0

  const state = locked || closed ? 'done' : near ? 'near' : 'open'
  const stateKey = `yalla.state.${state}` as const

  const onTap = () => {
    if (!isLoggedIn()) {
      // ⚠ نفس نمط باقي الموقع: بيرجع لمكانه بعد التسجيل
      router.push(`/join?next=${encodeURIComponent(`/yalla/${post.link}`)}`)
      return
    }
    // النداء القديم: نافذة اختيار. البوست: دوسة واحدة وخلاص.
    if (!isPost) {
      setSheet(true)
      return
    }
    void onImIn()
  }

  /** «أنا جاي» في بوست — الميعاد والمنطقة مخفيين والقاعدة بتاخدهم لوحدها */
  const onImIn = async () => {
    setBusy(true)
    setErr(false)
    const res = await imInYalla(post.callId)
    setBusy(false)
    if (!res) {
      setErr(true)
      return
    }
    track('yalla_choose', { slug: post.slug })
    onChanged({
      ...post,
      // ⚠ الواجهة ما بتعرضهمش — بس لازم تتعلّم إني دوست، علشان الزرار
      //   يقلب لـ«قلت إنك جاي ✓» من غير ما ننتظر دورة الـpoll.
      mySlots: post.slots.map((x) => x.id),
      myArea: post.areas[0]?.key ?? null,
      totalN: res.n,
    })
  }

  const onShare = async () => {
    const url = `${window.location.origin}/yalla/${post.link}`
    const nav = navigator as Navigator & {
      share?: (d: { title?: string; text?: string; url?: string }) => Promise<void>
    }
    if (nav.share) {
      await nav.share({ text: post.line, url }).catch(() => {})
      return
    }
    await navigator.clipboard?.writeText(url).catch(() => {})
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2500)
  }

  const onJoin = async () => {
    if (!isLoggedIn()) {
      router.push(`/join?next=${encodeURIComponent(`/yalla/${post.link}`)}`)
      return
    }
    setBusy(true)
    setErr(false)
    const res = await joinYallaWinner(post.callId)
    setBusy(false)
    if (!res) {
      setErr(true)
      return
    }
    track('yalla_switch', { slug: post.slug, seated: res.seated })
    onChanged({ ...post, myBooking: res.booking, myWaiting: res.waiting })
  }

  return (
    <article
      className="w-full max-w-full overflow-hidden rounded-20"
      style={{ background: 'var(--surface)', color: 'var(--fg)' }}
    >
      {/* ===== فوق: مين نزّله وإمتى وحالته ===== */}
      <div className="flex items-center gap-3 px-[18px] pt-[18px]">
        <QIcon size={36} />
        <div className="min-w-0 flex-1">
          <div className="font-display text-18 font-black leading-none">{t('yalla.brand')}</div>
          <div className="mt-1 font-body text-13" style={{ color: 'var(--muted)' }}>
            {ago(post.createdAt, t)}
          </div>
        </div>
        {/* ⚠ حالة «مفتوح» بلون الخلفية مش «كريمي»: الكارت نفسه `--surface`،
            والستيكر الكريمي بيبقى **نفس لون الكارت** في الوضع النهاري —
            الكلمة بتتقري بس الكبسولة مش موجودة. اتكشفت باللقطة (الدرس
            الاتنين وتلاتين). والتنتين التانيين ألوان مصمتة فواضحين في
            الوضعين. */}
        <Sticker
          color={locked || closed ? 'ink' : near ? 'orange' : 'cream'}
          bg={locked || closed || near ? undefined : 'var(--bg)'}
          fg={locked || closed || near ? undefined : 'var(--fg)'}
          rotate={-3}
          fontSize={13}
          padding="4px 12px"
        >
          {t(stateKey)}
        </Sticker>
      </div>

      {/* ===== سطر المالك — كلام بوست مش عنوان إعلان ===== */}
      <p className="m-0 px-[18px] pt-3 font-display text-26 font-black leading-[1.2]">
        {post.line}
      </p>

      {/* ===== صورة النشاط — لو موجودة بس ===== */}
      {post.imgSrc && (
        <div className="mt-4" style={{ aspectRatio: '4 / 3' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.imgSrc}
            alt={post.photoAlt ?? post.what}
            className="h-full w-full object-cover"
          />
        </div>
      )}

      <div className="flex flex-col gap-3 px-[18px] pb-[18px] pt-4">
        {/* ===== الاتجاه — أعداد بس، مفيش أسامي ===== */}
        {locked ? (
          <div className="font-body text-17">
            {t('yalla.locked.line', {
              when: yallaWhen(post.wonWhen ?? ''),
              area: post.wonArea ?? '',
            })}
          </div>
        ) : closed ? (
          <div className="font-body text-17" style={{ color: 'var(--muted)' }}>
            {t('yalla.closed.line')}
          </div>
        ) : isPost ? (
          /* ⚠ **البوست: عدد وبس.** مفيش «أكتر ناس قالت الجمعة في التجمع» —
             مفيش اقتراحات أصلًا، والميعاد والمكان بيتكتبوا في الكلام تحت.
             والعدد **رقم مش أسامي**: الدوسة مجهولة عن قصد. */
          <div className="flex flex-col gap-1">
            <div className="font-body text-17">
              {post.totalN > 0
                ? t('yalla.post.n', { n: arDigits(post.totalN) })
                : t('yalla.post.none')}
            </div>
            {/* ⚠ الشرح بيختفي بعد ما يدوس — بقى كلام زيادة، والكارت بيقصر.
                اتشاف في اللقطة: سطرين شرح في كل كارت حتى اللي خلص. */}
            <div className="font-body text-14" style={{ color: 'var(--muted)' }}>
              {t('yalla.weekend')}
              {!mine && ` · ${t('yalla.post.hint')}`}
            </div>
          </div>
        ) : post.topN > 0 && post.topWhen ? (
          <div className="font-body text-17">
            {t('yalla.trend', {
              when: yallaWhen(post.topWhen),
              area: post.topArea ?? '',
              n: arDigits(post.topN),
              of: arDigits(post.groupSize),
            })}
          </div>
        ) : (
          <div className="font-body text-17" style={{ color: 'var(--muted)' }}>
            {t('yalla.trend.none')}
          </div>
        )}

        {/* ===== اختياري أنا ===== */}
        {!locked && !closed && !isPost && mine && post.myN !== null && post.myWhen && (
          <div
            className="font-body text-16 font-semibold"
            style={{ color: 'var(--accent-text)' }}
          >
            {t('yalla.mine', {
              n: arDigits(post.myN),
              when: yallaWhen(post.myWhen),
              area: post.myAreaLabel ?? '',
            })}
          </div>
        )}

        {post.costNote && (
          <div className="font-body text-14" style={{ color: 'var(--muted)' }}>
            {post.costNote}
          </div>
        )}

        {/* ===== الأزرار ===== */}
        <div className="mt-1 flex flex-wrap items-center gap-3">
          {locked ? (
            post.myBooking ? (
              <>
                <span className="font-body text-16 font-semibold">{t('yalla.switch.in')}</span>
                <Link
                href={`/my/${post.myBooking}`}
                className="min-h-[48px] rounded-14 px-5 font-display text-18 font-black leading-none"
                style={{
                  background: '#F4632A',
                  color: '#14161A',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                  {t('yalla.booking')}
                </Link>
              </>
            ) : post.myWaiting ? (
              <div className="font-body text-16 font-semibold">{t('yalla.switch.wait')}</div>
            ) : (
              <PrimaryButton onClick={onJoin} loading={busy}>
                {t('yalla.switch.cta')}
              </PrimaryButton>
            )
          ) : closed ? null : mine ? (
            /* ⚠ في البوست الزرار **مش بيفتح حاجة** — العضو دوس خلاص.
               وفي النداء القديم بيفتح النافذة علشان يغيّر اختياره. */
            isPost ? (
              <span
                className="min-h-[48px] rounded-14 px-[14px] font-display text-15 font-black leading-none"
                style={{
                  background: 'var(--fg)',
                  color: 'var(--bg)',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                {t('yalla.post.mine')}
              </span>
            ) : (
              <button
                type="button"
                onClick={onTap}
                className="min-h-[48px] cursor-pointer rounded-14 px-[14px] font-display text-15 font-black leading-none"
                style={{ background: 'var(--fg)', color: 'var(--bg)', border: 0 }}
              >
                {t('yalla.cta.mine')}
              </button>
            )
          ) : (
            <PrimaryButton onClick={onTap} loading={isPost && busy}>
              {isPost ? t('yalla.post.cta') : t('yalla.cta')}
            </PrimaryButton>
          )}

          <SecondaryButton onClick={onShare}>{t('yalla.share')}</SecondaryButton>
          {copied && (
            <span className="font-body text-14" style={{ color: 'var(--ok-text)' }}>
              {t('yalla.share.copied')}
            </span>
          )}
        </div>

        {/* ⚠ سطر المهلة للنداء القديم بس. في البوست **مفيش اختيار أصلًا**،
            فـ«الاختيار مفتوح لحد…» كلام فاضل من الفورم القديم — طلب المالك
            إنه يتشال لما شافه على الموقع الحي (٢٠٢٦-١١-١٥). والمهلة لسه
            شغّالة في القاعدة والمهمة المجدولة، وباينة في اللوحة. */}
        {!locked && !closed && !isPost && (
          <div className="font-body text-13" style={{ color: 'var(--muted)' }}>
            {t('yalla.deadline', { when: yallaWhen(post.deadline) })}
          </div>
        )}

        {err && (
          <div className="font-body text-14" style={{ color: 'var(--err-text)' }}>
            {t('yalla.switch.err')}
          </div>
        )}
        {/* ===== التصويت — فوق الكلام، لأنه الخلاصة واللي بيتعمل عليه القفل.
            بيخفي نفسه لو مفيش اختيارات ولا العضو مسجّل. ===== */}
        {isPost && !closed && <YallaPoll post={post} />}

        {/* ===== الكلام — في البوست بس، وللأعضاء بس ===== */}
        {isPost && !closed && <YallaTalk post={post} />}
      </div>

      {/* ⚠ النافذة للنداء القديم بس — البوست مفيهوش اختيار خالص */}
      {!isPost && (
        <YallaSheet
          post={post}
          open={sheet}
          onClose={() => setSheet(false)}
          onChanged={onChanged}
        />
      )}
    </article>
  )
}

/**
 * «من ساعتين».
 *
 * ⚠ الصيغة كلها من `copy_strings` — الكود بيحسب الرقم بس ويختار المفتاح.
 */
function ago(iso: string, t: (k: string, v?: Record<string, string | number>) => string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (mins < 1) return t('yalla.ago.now')
  if (mins < 60) return t('yalla.ago.min', { n: arDigits(mins) })
  const hours = Math.round(mins / 60)
  if (hours < 24) return t('yalla.ago.hour', { n: arDigits(hours) })
  return t('yalla.ago.day', { n: arDigits(Math.round(hours / 24)) })
}
