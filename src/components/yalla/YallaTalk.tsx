'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PrimaryButton, TextButton } from '@/components/Buttons'
import { useT } from '@/components/CopyProvider'
import { isLoggedIn } from '@/lib/session'
import {
  getYallaComments,
  sayYalla,
  unsayYalla,
  uploadYallaPhoto,
  type YallaComment,
  type YallaPost as Post,
} from '@/lib/api'
import { arDigits } from '@/lib/map-db'
import { track } from '@/lib/track'

/**
 * «الكلام» — نقاش تحت نداء «يلا»: كلام وردود وصور.
 *
 * قرار المالك (٢٠٢٦-١١-١٥ ثم ٢٠٢٦-١١-١٦): «تفاعل زي السوشيال ميديا، كومنتات
 * ولايكات، بس من غير ما تبيّن — اسم بس، ومحدش يعرف يدوس عليهم يفتحهم»، وبعدها
 * «أدوس على كلام كريم وأرد باسم نسبوط، ونتناقش والناس تدخل، وأرفع صور».
 *
 * **نطاق الرؤية — الأضيق في التلاتة:**
 *   · **الاسم الأول وبس — مفيش ولا صورة بروفايل.** فقاعدة «مفيش صور قبل
 *     الكشف» (§٣.٧) ما اتكسرتش، ونسبوط ما بقاش شكله تطبيق تعارف.
 *   · **الأعضاء المسجّلين بس** يشوفوا الكلام. الزائر يشوف البوست والعدد.
 *   · **مفيش رابط على أي اسم.** الاسم `<span>` مش `<Link>` — مش «محدش يعرف
 *     يدوس» بالإخفاء، بل **مفيش صفحة أصلًا**.
 *
 * 🔑 **والدوسة لوحدها مجهولة.** «جايين: ٤» رقم مش أسامي — اللي عايز يفضل
 *   مستخبي يدوس وبس، واللي بيكتب بيكشف نفسه **بإرادته**.
 *
 * ⚠ **الشجرة مستوى واحد بس** — رد على كلام، مش رد على رد. والحارس في
 *   القاعدة (`0150`) مش هنا: الخيط اللي مالوش آخر بيبقى غير مقروء على موبايل.
 *
 * ⚠ **ورد «نسبوط» بيتكتب من اللوحة بس.** الحارس في القاعدة، والمكوّن ده
 *   أصلًا مفيهوش الزرار — بيعرضه بس.
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
  /** بترد على مين؟ `null` = كلام جديد */
  const [replyTo, setReplyTo] = useState<YallaComment | null>(null)
  const [photo, setPhoto] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

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

  const rows = useMemo(() => list ?? [], [list])

  /** الجذور وتحت كل واحد ردوده — نفس ترتيب القاعدة */
  const threads = useMemo(() => {
    const roots = rows.filter((c) => !c.parentId)
    return roots.map((root) => ({
      root,
      replies: rows.filter((c) => c.parentId === root.id),
    }))
  }, [rows])

  const pickPhoto = (f: File | null) => {
    setErr(null)
    if (!f) {
      setPhoto(null)
      return
    }
    // ⚠ نفس حدود الدلو في القاعدة — بنقولها بدري بدل ما الرفع يقع.
    if (!f.type.startsWith('image/')) {
      setErr(t('yalla.talk.photoBad'))
      return
    }
    if (f.size > 5 * 1024 * 1024) {
      setErr(t('yalla.talk.photoBig'))
      return
    }
    setPhoto(f)
  }

  const onSend = async () => {
    const text = body.trim()
    if (!text && !photo) return
    setBusy(true)
    setErr(null)

    let photoPath: string | null = null
    if (photo) {
      photoPath = await uploadYallaPhoto(post.callId, photo)
      if (!photoPath) {
        setBusy(false)
        setErr(t('yalla.talk.photoErr'))
        return
      }
    }

    const res = await sayYalla(post.callId, text, {
      parentId: replyTo?.id ?? null,
      photoPath,
    })
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
    setPhoto(null)
    setReplyTo(null)
    if (fileRef.current) fileRef.current.value = ''
    setList(await getYallaComments(post.callId))
  }

  const onDel = async (id: string) => {
    if (!(await unsayYalla(id))) return
    setList((cur) => (cur ?? []).filter((r) => r.id !== id && r.parentId !== id))
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

  return (
    <div className="mt-1 border-t pt-4" style={{ borderColor: 'var(--line)' }}>
      <div className="font-display text-16 font-black leading-none">
        {rows.length > 0
          ? t('yalla.talk.n', { n: arDigits(rows.length) })
          : t('yalla.talk.title')}
      </div>

      {threads.length === 0 ? (
        <p className="m-0 mt-2 font-body text-15" style={{ color: 'var(--muted)' }}>
          {t('yalla.talk.none')}
        </p>
      ) : (
        <ul className="m-0 mt-3 flex list-none flex-col gap-4 p-0">
          {threads.map(({ root, replies }) => (
            <li key={root.id} className="flex flex-col gap-2">
              <Said c={root} t={t} onDel={onDel} onReply={open ? setReplyTo : undefined} />

              {/* ⚠ الإزاحة لازم تبان من بعيد على موبايل — خط ٢px ومسافة
                  أكبر. أول نسخة كانت ١px و١٢px والخيط كان شكله مسطّح.
                  ⚠ والكومنت هنا **فوق** الشرط مش جواه: `{/* *​/}` جوه
                  `{cond && (` بيكسر JSX — الكومنت بيتحسب تعبير تاني. */}
              {replies.length > 0 && (
                <ul
                  className="m-0 ms-1 flex list-none flex-col gap-3 p-0 ps-4"
                  style={{ borderInlineStart: '2px solid var(--line)' }}
                >
                  {replies.map((r) => (
                    <li key={r.id}>
                      {/* ⚠ مفيش زرار «رد» على الرد — مستوى واحد بس */}
                      <Said c={r} t={t} onDel={onDel} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="mt-3 flex flex-col gap-2">
          {replyTo && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
                {t('yalla.talk.replyTo', { name: replyTo.name })}
              </span>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                className="cursor-pointer border-0 bg-transparent p-0 font-body text-13 underline"
                style={{ color: 'var(--muted)' }}
              >
                {t('yalla.talk.cancel')}
              </button>
            </div>
          )}

          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={replyTo ? t('yalla.talk.replyPh') : t('yalla.talk.ph')}
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

          {/* ⚠ الملف مخفي والزرار هو اللي بيفتحه — `input type=file` الخام
              شكله مختلف في كل متصفح وبيكسر الهوية. */}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)}
            className="hidden"
          />

          <div className="flex flex-wrap items-center gap-3">
            <PrimaryButton onClick={onSend} loading={busy} disabled={!body.trim() && !photo}>
              {t('yalla.talk.send')}
            </PrimaryButton>

            {photo ? (
              <button
                type="button"
                onClick={() => {
                  setPhoto(null)
                  if (fileRef.current) fileRef.current.value = ''
                }}
                className="cursor-pointer border-0 bg-transparent p-0 font-body text-13 underline"
                style={{ color: 'var(--muted)' }}
              >
                {t('yalla.talk.photoDrop')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="cursor-pointer border-0 bg-transparent p-0 font-body text-13 underline"
                style={{ color: 'var(--muted)' }}
              >
                {t('yalla.talk.photoAdd')}
              </button>
            )}

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

/** كلام واحد — جذر أو رد. نفس الشكل في الحالتين. */
function Said({
  c,
  t,
  onDel,
  onReply,
}: {
  c: YallaComment
  t: (k: string, v?: Record<string, string | number>) => string
  onDel: (id: string) => void
  /** موجود = اعرض زرار «رد». مش موجود = ده رد، ومفيش رد على رد. */
  onReply?: (c: YallaComment) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline gap-2">
        {/* ⚠ `span` مش `Link` — مفيش بروفايل يتفتح لأي حد */}
        <span className="font-display text-15 font-black leading-none">{c.name}</span>

        {/* ⚠ وسم الموقع — علشان الناس تعرف ده رد رسمي مش عضو اسمه نسبوط */}
        {c.asNasbot && (
          <span
            className="rounded-pill px-2 py-[2px] font-body text-11 font-semibold leading-none"
            style={{ background: '#F4632A', color: '#14161A' }}
          >
            {t('yalla.talk.brand')}
          </span>
        )}

        {c.mine && (
          <span className="font-body text-12" style={{ color: 'var(--accent-text)' }}>
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
        {onReply && (
          <button
            type="button"
            onClick={() => onReply(c)}
            className="cursor-pointer border-0 bg-transparent p-0 font-body text-12 underline"
            style={{ color: 'var(--muted)' }}
          >
            {t('yalla.talk.reply')}
          </button>
        )}
      </div>

      {c.body && <p className="m-0 font-body text-15 leading-[1.5]">{c.body}</p>}

      {c.photoUrl && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={c.photoUrl}
          alt=""
          className="mt-1 max-h-[260px] w-auto max-w-full rounded-14 object-cover"
        />
      )}
    </div>
  )
}
