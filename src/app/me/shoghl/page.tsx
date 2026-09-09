'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { InnerHeader } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { Sticker } from '@/components/Sticker'
import { PrimaryButton, SecondaryButton } from '@/components/Buttons'
import { isLoggedIn } from '@/lib/session'
import { useT } from '@/components/CopyProvider'
import { CollabList } from '@/components/work/CollabList'
import { getMyWorkCollabs, type WorkCollab } from '@/lib/collab'
import {
  DAY_CODES,
  EMPTY_PASS_STATE,
  EMPTY_WORK_PROFILE,
  cancelRecurring,
  createRecurring,
  dayCopyKey,
  getMyPassState,
  getMyRecurring,
  getMyWorkProfile,
  getProfessions,
  getWorkTemplates,
  getWorkVenueOptions,
  pauseRecurringTwoWeeks,
  resumeRecurring,
  saveMyWorkProfile,
  WORK_STATUS_CODES,
  WORK_STYLE_CODES,
  type DayCode,
  type MyPassState,
  type MyRecurring,
  type MyWorkProfile,
  type ProfessionOption,
  type VenueOption,
  type WorkStatusCode,
  type WorkStyleCode,
  type WorkTemplateOption,
} from '@/lib/work'

/**
 * /me/shoghl — الشغل بتاعي.
 *
 *   · رصيد الكارت بشريط تقدم وتاريخ الانتهاء
 *   · يومي الثابت: تثبيت · «أوقف أسبوعين» · رجوع · إلغاء
 *   · «شغالين معاك» — حالة فاضية دلوقتي (بيانات التبادل مرحلة 5)
 *   · مجالي وأسلوبي — تعديل سريع لـ work_status و profession_id و work_style
 *
 * الصفحة دي محتاجة دخول. كل قراءة بتعدي على safeWork في lib/work.ts،
 * فلو القاعدة علّقت الصفحة بتعرض حالتها الفاضية بدل ما تفضل بتلف.
 */
export default function MyWorkPage() {
  const t = useT()
  const router = useRouter()

  const [ready, setReady] = useState(false)
  const [passes, setPasses] = useState<MyPassState>(EMPTY_PASS_STATE)
  const [days, setDays] = useState<MyRecurring[]>([])
  const [templates, setTemplates] = useState<WorkTemplateOption[]>([])
  const [venues, setVenues] = useState<VenueOption[]>([])
  const [professions, setProfessions] = useState<ProfessionOption[]>([])
  const [profile, setProfile] = useState<MyWorkProfile>(EMPTY_WORK_PROFILE)
  const [collabs, setCollabs] = useState<WorkCollab[]>([])
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  // نموذج «ثبّت يومي»
  const [pickDay, setPickDay] = useState<DayCode | null>(null)
  const [pickTemplate, setPickTemplate] = useState('')
  const [pickVenue, setPickVenue] = useState('')

  const load = useCallback(async () => {
    const [state, mine, tpls, vns, profs, prof, mates] = await Promise.all([
      getMyPassState(),
      getMyRecurring(),
      getWorkTemplates(),
      getWorkVenueOptions(),
      getProfessions(),
      getMyWorkProfile(),
      getMyWorkCollabs(),
    ])
    setPasses(state)
    setCollabs(mates)
    setDays(mine)
    setTemplates(tpls)
    setVenues(vns)
    setProfessions(profs)
    setProfile(prof)
    setPickTemplate((cur) => cur || (tpls[0]?.id ?? ''))
    setReady(true)
  }, [])

  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace(`/login?next=${encodeURIComponent('/me/shoghl')}`)
      return
    }
    load().catch(() => setReady(true))
  }, [router, load])

  if (!ready) {
    return (
      <main className="mx-auto w-full max-w-page px-5">
        <InnerHeader back={t('shoghl.me.back')} href="/me" padded={false} />
        <div className="pt-8 font-body text-16" style={{ color: 'var(--muted)' }}>
          {t('shoghl.loading')}
        </div>
      </main>
    )
  }

  const fmtDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString('ar-EG', {
          timeZone: 'Africa/Cairo',
          day: 'numeric',
          month: 'long',
        })
      : ''

  const active = passes.active
  const pending = passes.pending
  const today = new Date().toISOString().slice(0, 10)

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    setBusy(true)
    const res = await fn()
    setBusy(false)
    setMsg(res.ok ? okMsg : (res.error ?? t('shoghl.me.err')))
    if (res.ok) await load()
  }

  const onCreateDay = () => {
    if (!pickDay || !pickTemplate) return
    run(
      () =>
        createRecurring({
          dayCode: pickDay,
          templateId: pickTemplate,
          venueId: pickVenue || null,
        }),
      t('shoghl.me.day.created')
    )
  }

  const onCancelDay = (id: string) => {
    if (!confirm(t('shoghl.me.day.cancelAsk'))) return
    run(() => cancelRecurring(id), t('shoghl.me.day.cancelled'))
  }

  return (
    <main className="mx-auto w-full max-w-page">
      <div className="px-5">
        <InnerHeader back={t('shoghl.me.back')} href="/me" padded={false} />

        <h1 className="m-0 mt-[10px] font-display text-30 font-black leading-[1.15]">
          {t('shoghl.me.title')}
        </h1>
        <div className="mt-1 font-body text-15" style={{ color: 'var(--muted)' }}>
          {t('shoghl.me.sub')}
        </div>

        {msg && (
          <div
            role="status"
            className="mt-4 rounded-16 p-3 font-body text-14 font-semibold"
            style={{ background: 'var(--surface)' }}
          >
            {msg}
          </div>
        )}

        {/* ===================================================== الكارت */}
        <h2 className="mt-8 font-display text-24 font-black">{t('shoghl.me.pass.title')}</h2>

        {active ? (
          <div className="mt-3 rounded-20 p-5" style={{ background: '#EFE3CF', color: '#14161A' }}>
            <div className="font-display text-28 font-black leading-none">
              {t('shoghl.me.pass.left', { n: active.sessionsLeft, total: active.sessionsTotal })}
            </div>
            {active.expiresAt && (
              <div className="mt-1 font-body text-15" style={{ color: '#55575C' }}>
                {t('shoghl.me.pass.until', { date: fmtDate(active.expiresAt) })}
              </div>
            )}
            {/* شريط التقدم — الجزء المستهلك غامق */}
            <div
              className="mt-4 h-3 w-full overflow-hidden rounded-pill"
              style={{ background: '#FBF7EF' }}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={active.sessionsTotal}
              aria-valuenow={active.sessionsLeft}
              aria-label={t('shoghl.me.pass.title')}
            >
              <div
                className="h-full rounded-pill"
                style={{
                  width: `${Math.round((active.sessionsLeft / Math.max(1, active.sessionsTotal)) * 100)}%`,
                  background: '#F4632A',
                }}
              />
            </div>
            <div className="mt-4">
              <Link
                href="/shoghl"
                className="inline-grid min-h-[46px] place-items-center rounded-pill px-5 font-display text-15 font-black"
                style={{ background: '#14161A', color: '#FBF7EF' }}
              >
                {t('shoghl.me.pass.book')}
              </Link>
            </div>
          </div>
        ) : pending ? (
          <div className="mt-3 rounded-20 p-5" style={{ background: 'var(--surface)' }}>
            <div className="font-body text-16 font-semibold">{t('shoghl.me.pass.pending')}</div>
            <Link
              href="/shoghl/pass"
              className="mt-3 inline-grid min-h-[46px] place-items-center rounded-pill px-5 font-display text-15 font-black"
              style={{ background: 'var(--fg)', color: 'var(--bg)' }}
            >
              {t('shoghl.me.pass.pendingCta')}
            </Link>
          </div>
        ) : (
          <div className="mt-3 rounded-20 p-5" style={{ background: 'var(--surface)' }}>
            <div className="font-body text-16">{t('shoghl.me.pass.none')}</div>
            <Link
              href="/shoghl/pass"
              className="mt-3 inline-grid min-h-[46px] place-items-center rounded-pill px-5 font-display text-15 font-black"
              style={{ background: '#F4632A', color: '#14161A' }}
            >
              {t('shoghl.me.pass.buy')}
            </Link>
          </div>
        )}

        {/* ===================================================== اليوم الثابت */}
        <h2 className="mt-8 font-display text-24 font-black">{t('shoghl.me.day.title')}</h2>
        <div className="mt-1 font-body text-14" style={{ color: 'var(--muted)' }}>
          {t('shoghl.me.day.note')}
        </div>

        <div className="mt-3 flex flex-col gap-3">
          {days.map((d) => {
            const paused = Boolean(d.pauseUntil && d.pauseUntil >= today)
            return (
              <div key={d.id} className="rounded-20 p-4" style={{ background: 'var(--surface)' }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-display text-20 font-black">
                    {t('shoghl.me.day.every', { day: t(dayCopyKey(d.dayCode)) })}
                  </div>
                  {paused && (
                    <Sticker color="cream" rotate={-2} size="sm">
                      {t('shoghl.me.day.paused', { date: fmtDate(d.pauseUntil) })}
                    </Sticker>
                  )}
                </div>
                <div className="mt-1 font-body text-14" style={{ color: 'var(--muted)' }}>
                  {d.templateName}
                  {d.autoBook ? ` · ${t('shoghl.me.day.auto')}` : ` · ${t('shoghl.me.day.manual')}`}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {paused ? (
                    <SecondaryButton
                      className="px-4"
                      disabled={busy}
                      onClick={() => run(() => resumeRecurring(d.id), t('shoghl.me.day.resumed'))}
                    >
                      {t('shoghl.me.day.resume')}
                    </SecondaryButton>
                  ) : (
                    <SecondaryButton
                      className="px-4"
                      disabled={busy}
                      onClick={() =>
                        run(() => pauseRecurringTwoWeeks(d.id), t('shoghl.me.day.pausedOk'))
                      }
                    >
                      {t('shoghl.me.day.pause')}
                    </SecondaryButton>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onCancelDay(d.id)}
                    className="min-h-[44px] cursor-pointer rounded-pill px-4 font-display text-15 font-black disabled:opacity-50"
                    style={{
                      background: 'transparent',
                      color: 'var(--err-text)',
                      border: '2px solid var(--err-text)',
                    }}
                  >
                    {t('shoghl.me.day.cancel')}
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {templates.length === 0 ? (
          <div className="mt-3 font-body text-15" style={{ color: 'var(--muted)' }}>
            {t('shoghl.me.day.noTemplates')}
          </div>
        ) : (
          <div className="mt-3 rounded-20 p-4" style={{ background: 'var(--surface)' }}>
            {days.length === 0 && (
              <div className="font-body text-15">{t('shoghl.me.day.none')}</div>
            )}
            <div className="mt-3 font-body text-14 font-semibold">{t('shoghl.me.day.pick')}</div>
            <div className="nb-scroll-x mt-2 gap-2">
              {DAY_CODES.map((c) => {
                const on = pickDay === c
                const taken = days.some((d) => d.dayCode === c)
                return (
                  <button
                    key={c}
                    type="button"
                    disabled={taken}
                    aria-pressed={on}
                    onClick={() => setPickDay(c)}
                    className="min-h-[44px] cursor-pointer whitespace-nowrap rounded-pill px-4 font-display text-15 font-black disabled:cursor-not-allowed disabled:opacity-40"
                    style={{
                      background: on ? 'var(--fg)' : 'transparent',
                      color: on ? 'var(--bg)' : 'var(--fg)',
                      border: `2px solid ${on ? 'var(--fg)' : 'var(--chip-idle-border)'}`,
                    }}
                  >
                    {t(dayCopyKey(c))}
                  </button>
                )
              })}
            </div>

            {templates.length > 1 && (
              <label className="mt-3 flex flex-col gap-1">
                <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
                  {t('shoghl.me.day.kind')}
                </span>
                <select
                  value={pickTemplate}
                  onChange={(e) => setPickTemplate(e.target.value)}
                  className="min-h-[48px] w-full rounded-14 px-3 font-body text-16"
                  style={{
                    background: 'var(--bg)',
                    color: 'var(--fg)',
                    border: '2px solid var(--line)',
                  }}
                >
                  {templates.map((tp) => (
                    <option key={tp.id} value={tp.id}>
                      {tp.nameAr}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {venues.length > 0 && (
              <label className="mt-3 flex flex-col gap-1">
                <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
                  {t('shoghl.me.day.place')}
                </span>
                <select
                  value={pickVenue}
                  onChange={(e) => setPickVenue(e.target.value)}
                  className="min-h-[48px] w-full rounded-14 px-3 font-body text-16"
                  style={{
                    background: 'var(--bg)',
                    color: 'var(--fg)',
                    border: '2px solid var(--line)',
                  }}
                >
                  <option value="">{t('shoghl.me.day.anyPlace')}</option>
                  {venues.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="mt-4">
              <PrimaryButton
                className="w-full"
                onClick={onCreateDay}
                disabled={!pickDay || !pickTemplate || busy}
              >
                {t('shoghl.me.day.create')}
              </PrimaryButton>
            </div>
          </div>
        )}

        {/* ===================================================== شغالين معاك */}
        <h2 className="mt-8 font-display text-24 font-black">{t('shoghl.me.collab.title')}</h2>
        {collabs.length > 0 && (
          <div className="mt-1 font-body text-14" style={{ color: 'var(--muted)' }}>
            {t('shoghl.me.collab.note')}
          </div>
        )}
        <CollabList items={collabs} />

        {/* ===================================================== مجالي وأسلوبي */}
        <h2 className="mt-8 font-display text-24 font-black">{t('shoghl.me.profile.title')}</h2>
        <div className="mt-3 flex flex-col gap-3 rounded-20 p-4" style={{ background: 'var(--surface)' }}>
          <label className="flex flex-col gap-1">
            <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
              {t('shoghl.me.profile.status')}
            </span>
            <select
              value={profile.workStatus ?? ''}
              onChange={(e) =>
                setProfile((p) => ({
                  ...p,
                  workStatus: (e.target.value || null) as WorkStatusCode | null,
                }))
              }
              className="min-h-[48px] w-full rounded-14 px-3 font-body text-16"
              style={{ background: 'var(--bg)', color: 'var(--fg)', border: '2px solid var(--line)' }}
            >
              <option value="">{t('shoghl.me.profile.none')}</option>
              {WORK_STATUS_CODES.map((c) => (
                <option key={c} value={c}>
                  {t(`shoghl.workStatus.${c}`)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
              {t('shoghl.me.profile.profession')}
            </span>
            <select
              value={profile.professionId ?? ''}
              onChange={(e) =>
                setProfile((p) => ({ ...p, professionId: e.target.value || null }))
              }
              className="min-h-[48px] w-full rounded-14 px-3 font-body text-16"
              style={{ background: 'var(--bg)', color: 'var(--fg)', border: '2px solid var(--line)' }}
            >
              <option value="">{t('shoghl.me.profile.none')}</option>
              {professions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nameAr}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
              {t('shoghl.me.profile.style')}
            </span>
            <select
              value={profile.workStyle ?? ''}
              onChange={(e) =>
                setProfile((p) => ({
                  ...p,
                  workStyle: (e.target.value || null) as WorkStyleCode | null,
                }))
              }
              className="min-h-[48px] w-full rounded-14 px-3 font-body text-16"
              style={{ background: 'var(--bg)', color: 'var(--fg)', border: '2px solid var(--line)' }}
            >
              <option value="">{t('shoghl.me.profile.none')}</option>
              {WORK_STYLE_CODES.map((c) => (
                <option key={c} value={c}>
                  {t(`shoghl.workStyle.${c}`)}
                </option>
              ))}
            </select>
          </label>

          <PrimaryButton
            className="w-full"
            disabled={busy}
            onClick={() => run(() => saveMyWorkProfile(profile), t('shoghl.me.profile.saved'))}
          >
            {t('shoghl.me.profile.save')}
          </PrimaryButton>
        </div>
      </div>

      <Footer />
    </main>
  )
}
