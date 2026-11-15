'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PrimaryButton, TextButton } from '@/components/Buttons'
import { useT } from '@/components/CopyProvider'
import { isLoggedIn } from '@/lib/session'
import {
  getYallaComments,
  sayYalla,
  unsayYalla,
  type YallaComment,
  type YallaPost as Post,
} from '@/lib/api'
import { arDigits } from '@/lib/map-db'
import { track } from '@/lib/track'

/**
 * «الكلام» — كومنتات على نداء «يلا».
 *
 * قرار المالك (٢٠٢٦-١١-١٥): «تفاعل زي السوشيال ميديا، كومنتات ولايكات، بس
 * من غير ما تبيّن — هو اسم بس وصورة، ومحدش يعرف يدوس عليهم يفتحهم».
 * واتسأل عن نطاق الرؤية واختار **الأضيق**:
 *
 *   · **الاسم الأول وبس — مفيش ولا صورة.** فقاعدة «مفيش صور قبل الكشف»
 *     (§٣.٧) ما اتكسرتش، ونسبوط ما بقاش شكله تطبيق تعارف.
 *   · **الأعضاء المسجّلين بس** يشوفوا الكلام. الزائر يشوف البوست والعدد،
 *     وتحت القسم سطر «سجّل الأول وتكلّم مع اللي جايين».
 *   · **مفيش رابط على أي اسم.** الاسم `<span>` مش `<Link>` — مش «محدش
 *     يعرف يدوس» بالإخفاء، بل مفيش صفحة أصلًا.
 *
 * 🔑 **والدوسة لوحدها مجهولة.** «جايين: ٤» رقم مش أسامي — اللي عايز يفضل
 *   مستخبي يدوس وبس، واللي بيكتب بيكشف نفسه **بإرادته**. ودي اللي بتخلي
 *   «الاختيار سري» لسه صح.
 *
 * ⚠ والحارس الحقيقي في القاعدة مش هنا: `yalla_comments` **مفيهاش ولا سياسة
 *   قراية** (ولا لصاحب الصف)، و`fn_yalla_comments` بترجّع (الاسم الأول ·
 *   الكلام · الوقت · ده بتاعي؟) وبس — مفيش `profile_id` ومفيش صورة، وفيه
 *   صف اختبار بنيوي بيقع لو حد زوّد عمود. §٣.٣ بالحرف.
 *
 * ⚠ الألوان كلها من متغيّرات الثيم — الدرس الاتنين وتلاتين.
 */
export function YallaTalk({ post }: { post: Post }) {
  const t = useT()
  const router = useRouter()
  const [list, setList] = useState<YallaComment[] | null>(null)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const area = useRef<HTMLTextAreaElement | null>(null)

  const me = isLoggedIn()
  const open = post.status === 'open'

  // ⚠ الزائر ما بينادينا خالص — الدالة مقفولة على `anon` أصلًا، ونداؤها
  //   كان هيرجّع فاضي بالصمت (الدرس التلاتة وتلاتين).
  useEffect(() => {
    if (!me) {
      setList([])
      return
    }
    let alive = true
    getYallaComments(post.callId).then((rows) => {
      if (alive) setList(rows)
    })
    return () => {
      alive = false
    }
  }, [me, post.callId])

  const onSend = async () => {
    const text = body.trim()
    if (!text) return
    setBusy(true)
    setErr(null)
    const res = await sayYalla(post.callId, text)
    setBusy(false)
    if (res !== 'ok') {
      setErr(
        res === 'words'
          ? t('yalla.talk.errWords')
          : res === 'max'
            ? t('yalla.talk.errMax')
            : t('yalla.talk.err')
      )
      return
    }
    track('yalla_say', { slug: post.slug })
    setBody('')
    setList(await getYallaComments(post.callId))
  }

  const onDel = async (id: string) => {
    if (!(await unsayYalla(id))) return
    setList((rows) => (rows ?? []).filter((r) => r.id !== id))
  }

  // ===== الزائر: سطر واحد وزرار تسجيل، من غير عنوان قسم فوق فراغ =====
  if (!me) {
    return (
      <div
        className="mt-1 flex flex-wrap items-center gap-3 border-t pt-4"
        style={{ borderColor: 'var(--line)' }}
      >
        <span className="font-body text-15" style={{ color: 'var(--muted)' }}>
          {t('yalla.talk.join')}
        </span>
        <TextButton
          onClick={() =>
            router.push(`/join?next=${encodeURIComponent(`/yalla/${post.link}`)}`)
          }
        >
          {t('yalla.talk.joinCta')}
        </TextButton>
      </div>
    )
  }

  const rows = list ?? []

  return (
    <div className="mt-1 border-t pt-4" style={{ borderColor: 'var(--line)' }}>
      <div className="font-display text-16 font-black leading-none">
        {rows.length > 0
          ? t('yalla.talk.n', { n: arDigits(rows.length) })
          : t('yalla.talk.title')}
      </div>

      {rows.length === 0 ? (
        <p className="m-0 mt-2 font-body text-15" style={{ color: 'var(--muted)' }}>
          {t('yalla.talk.none')}
        </p>
      ) : (
        <ul className="m-0 mt-3 flex list-none flex-col gap-3 p-0">
          {rows.map((c) => (
            <li key={c.id} className="flex flex-col gap-1">
              <div className="flex items-baseline gap-2">
                {/* ⚠ `span` مش `Link` — مفيش بروفايل يتفتح لأي حد */}
                <span className="font-display text-15 font-black leading-none">{c.name}</span>
                {c.mine && (
                  <span
                    className="font-body text-12"
                    style={{ color: 'var(--accent-text)' }}
                  >
                    {t('yalla.talk.mine')}
                  </span>
                )}
                {c.mine && (
                  <button
                    type="button"
                    onClick={() => onDel(c.id)}
                    className="cursor-pointer border-0 bg-transparent p-0 font-body text-12 underline"
                    style={{ color: 'var(--muted)' }}
                  >
                    {t('yalla.talk.del')}
                  </button>
                )}
              </div>
              <p className="m-0 font-body text-15 leading-[1.5]">{c.body}</p>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            ref={area}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t('yalla.talk.ph')}
            rows={2}
            maxLength={400}
            className="w-full rounded-14 p-3 font-body text-16 leading-[1.5] outline-none"
            style={{
              background: 'var(--bg)',
              color: 'var(--fg)',
              border: '1px solid var(--line)',
              resize: 'none',
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <PrimaryButton onClick={onSend} loading={busy} disabled={!body.trim()}>
              {t('yalla.talk.send')}
            </PrimaryButton>
            <span className="font-body text-12" style={{ color: 'var(--muted)' }}>
              {t('yalla.talk.private')}
            </span>
          </div>
          {err && (
            <div className="font-body text-14" style={{ color: 'var(--err-text)' }}>
              {err}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
