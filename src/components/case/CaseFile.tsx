'use client'

import { useT } from '@/components/CopyProvider'
import type { CaseClue, CaseFileDoc, CasePlayer } from '@/lib/cases'

/**
 * «ملف القضية» — الدوسيه.
 *
 * طلب المالك (٢٠٢٦-١٠-٣١): «اعمله زي تحقيق المباحث — وإزاي المحامي لما
 * يقرا الورق مع الظباط يحلّوا القضية.» فالشاشة مش «مقدمة + زرار»، دي
 * **ورق**: ترويسة برقم ملف وختم، وبلاغ، ومسرح واقعة، ومطلوب، وطريقة،
 * وأدلة مرقّمة بأختام، وقايمة اللي في الأوضة.
 *
 * 🔴 **الأدلة المقفولة بتبان كخانة فاضية بختم «لسه مقفول» — من غير نصها.**
 *    النص نفسه مش بيوصل المتصفح أصلًا (`fn_case_clues` بترجّع المفتوح بس)،
 *    فالخانة الفاضية دي **شكل** مش إخفاء: بتوري المجموعة إن فيه تلات أدلة
 *    وإن فاضل اتنين، من غير ما تدّي حرف.
 *
 * ⚠ وكل النص من `copy_strings` و`cases` — مفيش حرف عربي مكتوب هنا (§٣.١).
 */
export function CaseFile({
  doc,
  clues,
  players,
  preview,
}: {
  doc: CaseFileDoc
  clues: CaseClue[]
  players: CasePlayer[]
  preview?: boolean
}) {
  const t = useT()
  const mono = doc.theme === 'mono'
  const dark = doc.theme === 'dark'

  const paper = mono ? '#FBF7EF' : dark ? '#14161A' : '#FBF7EF'
  const ink = dark ? '#FBF7EF' : '#14161A'
  const rule = dark ? 'rgba(251,247,239,.22)' : 'rgba(20,22,26,.18)'

  // تلات خانات أدلة دايمًا — اللي مفتوح فيه نص، واللي لأ ختم «لسه مقفول»
  const slots = [1, 2, 3].map((n) => clues.find((c) => c.act === n) ?? null)

  const Head = ({ children }: { children: React.ReactNode }) => (
    <h2
      className="mt-6 pb-1 text-[13px] font-bold tracking-[0.18em]"
      style={{ borderBottom: `1px solid ${rule}`, opacity: 0.75 }}
    >
      {children}
    </h2>
  )

  return (
    <article
      className="mt-4 rounded-20 px-5 py-6"
      style={{ background: paper, color: ink, border: `1px solid ${rule}` }}
    >
      {preview ? (
        <div
          className="mb-4 rounded-12 px-3 py-2 text-[13px]"
          style={{ background: '#2B4CFF', color: '#FBF7EF' }}
        >
          {t('case.file.preview')}
        </div>
      ) : null}

      {/* ===== ترويسة الملف ===== */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-[12px] tracking-[0.2em]" style={{ opacity: 0.6 }}>
            {t('case.file.title')}
          </div>
          <h1 className="mt-1 text-[28px] font-bold leading-none">{doc.caseTitle}</h1>
        </div>
        <div className="text-right text-[12px]" style={{ opacity: 0.6 }}>
          <div>{doc.worldName}</div>
          {doc.fileNo ? <div>{t('case.file.no').replace('{{1}}', doc.fileNo)}</div> : null}
        </div>
      </div>

      {/* ===== البلاغ — الحكاية من أولها ===== */}
      {doc.report ? (
        <>
          <Head>{t('case.file.report')}</Head>
          <div className="mt-2 space-y-2 text-[16px] leading-relaxed">
            {doc.report.split('\n').filter(Boolean).map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </>
      ) : null}

      {/* ===== مسرح الواقعة ===== */}
      {doc.scene ? (
        <>
          <Head>{t('case.file.scene')}</Head>
          <p className="mt-2 text-[15px] leading-relaxed" style={{ opacity: 0.9 }}>
            {doc.scene}
          </p>
        </>
      ) : null}

      {/* ===== المطلوب ===== */}
      {doc.goal ? (
        <>
          <Head>{t('case.file.goal')}</Head>
          <p
            className="mt-2 rounded-16 p-4 text-[16px] font-bold leading-relaxed"
            style={{ background: dark ? 'rgba(244,99,42,.18)' : '#EFE3CF' }}
          >
            {doc.goal}
          </p>
        </>
      ) : null}

      {/* ===== إزاي تتحل ===== */}
      <Head>{t('case.file.how')}</Head>
      <ol className="mt-2 space-y-2 text-[15px] leading-relaxed">
        {(doc.shape === 'vault'
          ? ['case.how.vault', 'case.how.5']
          : ['case.how.1', 'case.how.2', 'case.how.3', 'case.how.4', 'case.how.5']
        ).map((k, i) => (
          <li key={k} className="flex gap-2">
            <span className="shrink-0 font-bold" style={{ color: '#F4632A' }}>
              {i + 1}
            </span>
            <span>{t(k)}</span>
          </li>
        ))}
      </ol>
      {doc.shape !== 'vault' ? (
        <p className="mt-2 text-[14px] font-bold" style={{ color: '#2B4CFF' }}>
          {t('case.how.team')}
        </p>
      ) : null}

      {/* ===== الأدلة ===== */}
      {doc.shape !== 'vault' ? (
        <>
          <Head>{t('case.file.evidence')}</Head>
          <ul className="mt-2 space-y-2">
            {slots.map((c, i) => (
              <li
                key={i}
                className="rounded-16 p-4"
                style={{
                  background: c ? (dark ? 'rgba(251,247,239,.1)' : '#EFE3CF') : 'transparent',
                  border: c ? 'none' : `1px dashed ${rule}`,
                  opacity: c ? 1 : 0.55,
                }}
              >
                <div className="flex items-center justify-between text-[12px]" style={{ opacity: 0.7 }}>
                  <span>{t('case.clue.n').replace('{{1}}', String(i + 1))}</span>
                  <span
                    className="rounded-full px-2 py-[2px]"
                    style={{
                      border: `1px solid ${rule}`,
                      color: c ? '#F4632A' : undefined,
                    }}
                  >
                    {c ? t('case.file.open') : t('case.file.sealed')}
                  </span>
                </div>
                {c ? (
                  <>
                    <p className="mt-1 text-[17px] font-bold leading-snug">{c.text}</p>
                    <div className="mt-1 text-[13px]" style={{ opacity: 0.7 }}>
                      {t('case.clue.applies').replace('{{1}}', String(c.appliesTo))}
                    </div>
                  </>
                ) : (
                  <p className="mt-1 text-[14px]">{t('case.file.waiting')}</p>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {/* ===== اللي في الأوضة ===== */}
      {players.length ? (
        <>
          <Head>{t('case.file.people')}</Head>
          <ul className="mt-2 flex flex-wrap gap-2">
            {players.map((p) => (
              <li
                key={p.profileId}
                className="rounded-full px-3 py-1 text-[14px]"
                style={{
                  background: p.isMe ? '#14161A' : 'transparent',
                  color: p.isMe ? '#FBF7EF' : ink,
                  border: `1px solid ${rule}`,
                }}
              >
                {p.codename ? `${p.codename} · ${p.name}` : p.name}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </article>
  )
}
