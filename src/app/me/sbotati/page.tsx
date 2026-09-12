'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { InnerHeader } from '@/components/Header'
import { Sticker } from '@/components/Sticker'
import { TextArea } from '@/components/Field'
import { PrimaryButton, SecondaryButton, TextButton } from '@/components/Buttons'
import { FeatureGate } from '@/components/FlagsProvider'
import { useT } from '@/components/CopyProvider'
import { isLoggedIn } from '@/lib/session'
import { getMyHostedSbotat, updateMySbotaNote, cancelMySbota } from '@/lib/api'
import type { HostedSbota } from '@/types'

/**
 * «خروجاتي» — الخروجات اللي أنا فاتحها.
 *
 * ⚠ الأعداد بس، مفيش أسماء ولا صور. صاحب الخروجة بيشوف مجموعته من صفحة
 * الحجز بعد الكشف زي أي حد — السرية قبل الكشف هي نص الهوية، ومكسرناهاش
 * علشان اللي فاتح الخروجة.
 */

/** حالة السبوطة → مفتاح نص. القيم دي من `sbota_status_t` في القاعدة. */
const STATUS_KEY: Record<string, string> = {
  draft: 'host.status.draft',
  open: 'host.status.open',
  full: 'host.status.full',
  locked: 'host.status.locked',
  running: 'host.status.running',
  done: 'host.status.done',
  cancelled: 'host.status.cancelled',
}

/** الحالات اللي لسه ينفع فيها تعديل أو إلغاء — نفس اللي القاعدة بتقبلها */
const EDITABLE = new Set(['draft', 'open', 'full'])

function MyHostedList() {
  const t = useT()
  const router = useRouter()
  const params = useSearchParams()
  const justCreated = params.get('new') === '1'

  const [rows, setRows] = useState<HostedSbota[]>([])
  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [err, setErr] = useState('')
  const [confirming, setConfirming] = useState('')

  async function load() {
    const list = await getMyHostedSbotat()
    setRows(list)
    setNotes(Object.fromEntries(list.map((r) => [r.id, r.note])))
    setLoading(false)
  }

  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace('/login?next=/me/sbotati')
      return
    }
    load()
  }, [router])

  async function saveNote(id: string) {
    setErr('')
    setBusy((b) => ({ ...b, [id]: true }))
    const res = await updateMySbotaNote(id, notes[id] ?? '')
    setBusy((b) => ({ ...b, [id]: false }))
    if (!res.ok) {
      setErr(res.error || t('host.mine.saveErr'))
      return
    }
    setSaved((s) => ({ ...s, [id]: true }))
    setTimeout(() => setSaved((s) => ({ ...s, [id]: false })), 2500)
  }

  async function cancel(id: string) {
    setErr('')
    setBusy((b) => ({ ...b, [id]: true }))
    const res = await cancelMySbota(id)
    setBusy((b) => ({ ...b, [id]: false }))
    setConfirming('')
    // القاعدة بترفض الإلغاء لو في حد دافع، وبترجّع العدد في الرسالة —
    // بنعرضها زي ما هي علشان صاحب الخروجة يفهم يعمل إيه.
    if (!res.ok) {
      setErr(res.error || t('host.mine.cancelErr'))
      return
    }
    load()
  }

  return (
    <>
      <InnerHeader />
      <main className="mx-auto flex w-full max-w-[640px] flex-col gap-5 px-4 pb-24 pt-6">
        <div className="flex items-start justify-between gap-3">
          <h1 className="m-0 font-display text-32 font-black leading-[1.1]">
            {t('host.mine.title')}
          </h1>
          <Link href="/new" className="shrink-0">
            <SecondaryButton>{t('host.mine.new')}</SecondaryButton>
          </Link>
        </div>

        {justCreated && (
          <Sticker color="success" rotate={-2} size="sm">
            {t('host.mine.created')}
          </Sticker>
        )}

        {err && (
          <p role="alert" className="font-body text-15 font-semibold" style={{ color: 'var(--err-text)' }}>
            {err}
          </p>
        )}

        {loading ? (
          <p className="font-body text-16">{t('host.mine.loading')}</p>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-start gap-4 rounded-20 p-5" style={{ background: '#EFE3CF' }}>
            <p className="m-0 font-body text-16">{t('host.mine.empty')}</p>
            <Link href="/new">
              <PrimaryButton>{t('host.mine.new')}</PrimaryButton>
            </Link>
          </div>
        ) : (
          rows.map((r) => {
            const editable = EDITABLE.has(r.status)
            return (
              <article
                key={r.id}
                className="flex flex-col gap-3 rounded-20 p-5"
                style={{ background: '#EFE3CF', color: '#14161A' }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="m-0 font-display text-22 font-black leading-[1.15]">{r.name}</h2>
                    <div className="mt-1 font-body text-15 font-semibold">{r.when}</div>
                  </div>
                  <Sticker
                    color={r.status === 'cancelled' ? 'ink' : r.status === 'full' ? 'cobalt' : 'orange'}
                    rotate={3}
                    size="xs"
                  >
                    {t(STATUS_KEY[r.status] ?? 'host.status.open')}
                  </Sticker>
                </div>

                <div className="font-body text-16" style={{ color: '#55575C' }}>
                  {t('host.mine.booked', { booked: r.booked, total: r.capacity })}
                </div>

                {editable && (
                  <>
                    <TextArea
                      label={t('host.mine.note')}
                      placeholder={t('host.new.notePlaceholder')}
                      value={notes[r.id] ?? ''}
                      maxLength={140}
                      onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                    />
                    <div className="flex flex-wrap items-center gap-3">
                      <PrimaryButton onClick={() => saveNote(r.id)} disabled={busy[r.id]}>
                        {saved[r.id] ? t('host.mine.saved') : t('host.mine.save')}
                      </PrimaryButton>

                      {confirming === r.id ? (
                        <>
                          <span className="font-body text-14 font-semibold">
                            {t('host.mine.cancelConfirm')}
                          </span>
                          <TextButton onClick={() => cancel(r.id)}>
                            {t('host.mine.cancelYes')}
                          </TextButton>
                          <TextButton onClick={() => setConfirming('')}>
                            {t('host.mine.cancelNo')}
                          </TextButton>
                        </>
                      ) : (
                        <TextButton onClick={() => setConfirming(r.id)}>
                          {t('host.mine.cancel')}
                        </TextButton>
                      )}
                    </div>
                  </>
                )}
              </article>
            )
          })
        )}

        <p className="font-body text-14" style={{ color: '#55575C' }}>
          {t('host.mine.revealNote')}
        </p>
      </main>
    </>
  )
}

export default function MyHostedPage() {
  return (
    <FeatureGate flag="member_sbota">
      <Suspense fallback={null}>
        <MyHostedList />
      </Suspense>
    </FeatureGate>
  )
}
