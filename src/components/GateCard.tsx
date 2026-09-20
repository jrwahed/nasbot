'use client'

import { useState } from 'react'
import type { Me } from '@/types'
import { redeemInvite } from '@/lib/api'
import { useT } from '@/components/CopyProvider'

/**
 * كرت بوابة الدخول في `/me`.
 *
 * ⚠ **ما بيبانش لو انت عدّيت البوابة** — البوابة مقفولة افتراضيًا، والعضو
 *    المقبول مش محتاج يشوف كلام عن موافقات. بيبان في تلات حالات بس:
 *    مستني · مرفوض · محتاج كود دعوة أو تزكيات.
 *
 * ⚠ سبب المنع نفسه جاي من `fn_gate_state` في القاعدة — الواجهة بتعرضه
 *    وخلاص. لو حسبناه هنا كمان، الاتنين بيتخالفوا وواحد فيهم بيكدب على العضو.
 */
export function GateCard({ me, onChange }: { me: Me; onChange?: () => void }) {
  const t = useT()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [shared, setShared] = useState(false)

  const gate = me.gate
  if (!gate || !gate.blocked) return null

  const needsCode = gate.inviteOnly && !gate.hasInviter
  const needsEndorse = gate.needed > 0 && gate.endorsements < gate.needed

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const v = code.trim()
    if (!v) return
    setBusy(true)
    setErr('')
    const msg = await redeemInvite(v)
    setBusy(false)
    if (msg) return setErr(msg)
    setCode('')
    onChange?.()
  }

  return (
    <section
      className="mt-6 rounded-20 p-5"
      style={{ background: 'var(--surface)', border: '2px solid var(--line)' }}
    >
      <h2 className="m-0 font-display text-20 font-black">
        {gate.status === 'rejected'
          ? t('gate.rejected.title')
          : needsCode
            ? t('gate.invite.title')
            : needsEndorse
              ? t('gate.endorse.title')
              : t('gate.pending.title')}
      </h2>

      <p className="mt-2 font-body text-16" style={{ color: 'var(--muted)' }}>
        {gate.blocked}
      </p>

      {/*
        ⚠ اللينك لازم يبان هنا. صفحة `/zakki/<code>` من غير مدخل = صفحة
          محدش هيوصلها (قاعدة ٩.٨ في CLAUDE.md — نفس اللي حصل مع `/game`).
      */}
      {needsEndorse && (
        <div className="mt-3">
          <div className="font-body text-15">{t('gate.endorse.body', { n: gate.needed })}</div>
          <button
            type="button"
            onClick={() => {
              const url = `${window.location.origin}/zakki/${me.referralCode}`
              void navigator.clipboard?.writeText(url)
              setShared(true)
              setTimeout(() => setShared(false), 2000)
            }}
            className="mt-2 min-h-[48px] w-full cursor-pointer rounded-14 font-display text-16 font-black"
            style={{ background: '#2B4CFF', color: '#FBF7EF', border: 0 }}
          >
            {shared ? t('gate.endorse.done') : `${t('gate.endorse.body.link')} · ${gate.endorsements}/${gate.needed}`}
          </button>
        </div>
      )}

      {needsCode && (
        <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-2">
          <label className="flex min-w-[180px] flex-1 flex-col gap-1">
            <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
              {t('gate.invite.label')}
            </span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 12))}
              autoCapitalize="characters"
              className="min-h-[52px] w-full rounded-14 px-4 font-body text-18 font-black tracking-widest"
              style={{ background: '#FBF7EF', color: '#14161A', border: '2px solid #14161A' }}
            />
          </label>
          <button
            type="submit"
            disabled={busy || !code.trim()}
            className="min-h-[52px] cursor-pointer rounded-14 px-5 font-display text-16 font-black disabled:opacity-40"
            style={{ background: '#F4632A', color: '#14161A', border: 0 }}
          >
            {t('gate.invite.send')}
          </button>
        </form>
      )}

      {err && (
        <div className="mt-2 font-body text-14" style={{ color: 'var(--err-text)' }}>
          {err}
        </div>
      )}
    </section>
  )
}

/**
 * دعواتك — بتبان للعضو المقبول اللي عنده دعوات.
 * كود الدعوة هو نفسه كود الإحالة، علشان ما يبقاش عند العضو كودين.
 */
export function InvitesCard({ me }: { me: Me }) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const gate = me.gate
  if (!gate || gate.blocked || gate.invitesLeft <= 0) return null

  return (
    <section className="mt-4 rounded-20 p-5" style={{ background: '#EFE3CF', color: '#14161A' }}>
      <div className="font-display text-18 font-black">
        {t('gate.invites.left', { n: gate.invitesLeft })}
      </div>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(me.referralCode)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        }}
        className="mt-3 min-h-[52px] w-full cursor-pointer rounded-14 font-display text-22 font-black tracking-widest"
        style={{ background: '#FBF7EF', color: '#14161A', border: '2px solid #14161A' }}
      >
        {copied ? '✓' : me.referralCode}
      </button>
    </section>
  )
}
