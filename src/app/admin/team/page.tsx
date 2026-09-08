'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdminShell } from '@/components/AdminShell'
import { supabase } from '@/lib/supabase'
import { Card, Btn, SelectField, Table, Empty, Loading, Tag, useFlash, when } from '@/components/admin-ui'

/**
 * الفريق — مين له وصول للوحة وبأي دور.
 *
 * للمالك بس (admins.manage). كل حاجة هنا بتمر من RLS (سياسة au_manage)،
 * يعني لو حد من غير الصلاحية وصل للصفحة بأي شكل، القاعدة نفسها بترفض.
 *
 * الشخص لازم يكون عامل حساب في الموقع الأول برقمه — إحنا بنربط رقمه بدور،
 * مش بنعمل له حساب. وبعدها بيدخل من /admin/login وبيفعّل تطبيق المصادقة أول مرة.
 *
 * حمايتين مقصودتين:
 *   - ما تقدرش توقف نفسك أو تنزّل دورك — وإلا تقفل على نفسك.
 *   - آخر مالك نشط ما ينفعش يتشال أو يتنزّل — لازم يفضل واحد على الأقل.
 */

interface Row {
  id: string
  profile_id: string
  role_key: string
  is_active: boolean
  totp_enabled_at: string | null
  last_login_at: string | null
  created_at: string
  profiles: { first_name: string | null; phone: string; email: string | null } | null
}

interface Role {
  key: string
  name_ar: string
  description_ar: string | null
  rank: number
}

/** نفس قاعدة الخادم: 01001234567 · +201001234567 · 00201001234567 → +201001234567 */
function normalizePhone(raw: string): string | null {
  let d = raw.replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('20')) d = d.slice(2)
  if (d.startsWith('0')) d = d.slice(1)
  if (!/^1[0125][0-9]{8}$/.test(d)) return null
  return `+20${d}`
}

const local = (e164: string) => e164.replace(/^\+20/, '0')

export default function AdminTeamPage() {
  return (
    <AdminShell title="الفريق" needs="admins.manage">
      {() => <Team />}
    </AdminShell>
  )
}

function Team() {
  const [rows, setRows] = useState<Row[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [myId, setMyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const { flash, node: flashNode } = useFlash()

  // إضافة
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState('ops')

  const reload = useCallback(async () => {
    const [{ data: au, error }, { data: rl }, { data: auth }] = await Promise.all([
      supabase()
        .from('admin_users')
        .select(
          'id, profile_id, role_key, is_active, totp_enabled_at, last_login_at, created_at, profiles(first_name, phone, email)'
        )
        .order('created_at'),
      supabase().from('admin_roles').select('key, name_ar, description_ar, rank').order('rank', { ascending: false }),
      supabase().auth.getUser(),
    ])
    if (error) flash(`مقدرناش نقرا الفريق: ${error.message}`)
    setRows(((au ?? []) as unknown as Row[]) ?? [])
    setRoles(((rl ?? []) as Role[]) ?? [])
    setMyId(auth.user?.id ?? null)
    setLoading(false)
  }, [flash])

  useEffect(() => {
    reload()
  }, [reload])

  const roleName = (k: string) => roles.find((r) => r.key === k)?.name_ar ?? k
  const roleOptions = useMemo(() => roles.map((r) => ({ value: r.key, label: r.name_ar })), [roles])
  const activeOwners = useMemo(() => rows.filter((r) => r.role_key === 'owner' && r.is_active).length, [rows])

  /** آخر مالك نشط — ممنوع يتشال أو يتنزّل */
  const isLastOwner = (r: Row) => r.role_key === 'owner' && r.is_active && activeOwners <= 1

  async function add() {
    const e164 = normalizePhone(phone)
    if (!e164) {
      flash('الرقم ده مش شكله صح — مثال: 01001234567')
      return
    }
    setBusy(true)
    const { data: prof } = await supabase()
      .from('profiles')
      .select('id, first_name')
      .eq('phone', e164)
      .maybeSingle()
    if (!prof) {
      setBusy(false)
      flash('مفيش حساب بالرقم ده. الشخص لازم يسجّل في الموقع الأول (من صفحة الانضمام) وبعدين ضيفه.')
      return
    }
    const p = prof as { id: string; first_name: string | null }
    const { data, error } = await supabase()
      .from('admin_users')
      .upsert({ profile_id: p.id, role_key: role, is_active: true }, { onConflict: 'profile_id' })
      .select('id')
    setBusy(false)
    if (error) {
      flash(`مقدرناش نضيف: ${error.message}`)
      return
    }
    if (!data || (data as unknown[]).length === 0) {
      flash('ما اتضافش — القاعدة رفضت، محتاج صلاحية admins.manage')
      return
    }
    setPhone('')
    await reload()
    flash(`${p.first_name ?? local(e164)} بقى «${roleName(role)}» ✓ — يدخل من /admin/login ويفعّل تطبيقه أول مرة`)
  }

  async function patch(r: Row, p: Partial<Pick<Row, 'role_key' | 'is_active' | 'totp_enabled_at'>> & { totp_secret?: null }) {
    const { data, error } = await supabase().from('admin_users').update(p).eq('id', r.id).select('id')
    if (error) {
      flash(`مقدرناش نحفظ: ${error.message}`)
      return false
    }
    if (!data || (data as unknown[]).length === 0) {
      flash('مااتحفظش — القاعدة رفضت، محتاج صلاحية admins.manage')
      return false
    }
    await reload()
    return true
  }

  async function changeRole(r: Row, key: string) {
    if (key === r.role_key) return
    if (r.profile_id === myId && key !== 'owner') {
      flash('ما ينفعش تنزّل دورك انت — خلّي مالك تاني يعملها')
      return
    }
    if (isLastOwner(r) && key !== 'owner') {
      flash('ده آخر مالك نشط — لازم يفضل مالك واحد على الأقل')
      return
    }
    if (await patch(r, { role_key: key })) flash(`اتغيّر لـ «${roleName(key)}» ✓`)
  }

  async function toggleActive(r: Row) {
    if (r.is_active) {
      if (r.profile_id === myId) {
        flash('ما ينفعش توقف نفسك')
        return
      }
      if (isLastOwner(r)) {
        flash('ده آخر مالك نشط — ما ينفعش يتوقف')
        return
      }
      if (!confirm(`نوقف ${nameOf(r)}؟ مش هيعرف يدخل اللوحة لحد ما ترجّعه.`)) return
    }
    if (await patch(r, { is_active: !r.is_active })) flash(r.is_active ? 'اتوقف' : 'رجع شغّال ✓')
  }

  async function resetTotp(r: Row) {
    if (!confirm(`نصفّر تطبيق المصادقة بتاع ${nameOf(r)}؟ هيعمل تفعيل جديد أول مرة يدخل.`)) return
    if (await patch(r, { totp_secret: null, totp_enabled_at: null })) flash('اتصفّر — يفعّل التطبيق من جديد عند الدخول ✓')
  }

  async function remove(r: Row) {
    if (r.profile_id === myId) {
      flash('ما ينفعش تشيل نفسك')
      return
    }
    if (isLastOwner(r)) {
      flash('ده آخر مالك نشط — ما ينفعش يتشال')
      return
    }
    if (!confirm(`نشيل ${nameOf(r)} من الفريق خالص؟ حسابه في الموقع بيفضل زي ما هو.`)) return
    const { error } = await supabase().from('admin_users').delete().eq('id', r.id)
    if (error) {
      flash(`مقدرناش نشيل: ${error.message}`)
      return
    }
    await reload()
    flash('اتشال من الفريق')
  }

  const nameOf = (r: Row) => r.profiles?.first_name || local(r.profiles?.phone ?? '')

  if (loading) return <Loading />

  return (
    <>
      {flashNode}

      <Card title="ضيف حد للفريق" hint="لازم يكون عامل حساب في الموقع برقمه الأول. بعد الإضافة يدخل من /admin/login ويفعّل تطبيق المصادقة أول مرة.">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
              رقم موبايله
            </span>
            <input
              dir="ltr"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !busy && add()}
              placeholder="01xxxxxxxxx"
              className="min-w-[220px] rounded-14 px-4 py-2 font-body text-16"
              style={{ background: 'var(--surface)', color: 'var(--fg)', border: '2px solid var(--line)' }}
            />
          </label>
          <div className="min-w-[180px]">
            <SelectField label="الدور" value={role} options={roleOptions} onChange={setRole} />
          </div>
          <Btn kind="primary" onClick={add} disabled={busy || !phone.trim()}>
            {busy ? 'ثواني…' : 'ضيفه'}
          </Btn>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {roles.map((r) => (
            <Tag key={r.key}>
              <b>{r.name_ar}</b>
              {r.description_ar ? ` — ${r.description_ar}` : ''}
            </Tag>
          ))}
        </div>
      </Card>

      <Card title={`الفريق (${rows.length})`}>
        {rows.length === 0 ? (
          <Empty>مفيش حد في الفريق لسه.</Empty>
        ) : (
          <Table head={['الاسم', 'الرقم', 'الدور', 'الحالة', 'التطبيق', 'آخر دخول', '']}>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid var(--line)', opacity: r.is_active ? 1 : 0.55 }}>
                <td className="p-2 font-semibold">
                  {nameOf(r)}
                  {r.profile_id === myId && <Tag color="#F4632A">انت</Tag>}
                </td>
                <td className="p-2" dir="ltr">
                  {local(r.profiles?.phone ?? '')}
                </td>
                <td className="p-2">
                  <SelectField value={r.role_key} options={roleOptions} onChange={(v) => changeRole(r, v)} />
                </td>
                <td className="p-2">{r.is_active ? <Tag color="#C9F0D4">شغّال</Tag> : <Tag>موقوف</Tag>}</td>
                <td className="p-2">
                  {r.totp_enabled_at ? <Tag color="#C9F0D4">مفعّل</Tag> : <Tag>لسه ما فعّلش</Tag>}
                </td>
                <td className="p-2 whitespace-nowrap" style={{ color: 'var(--muted)' }}>
                  {r.last_login_at ? when(r.last_login_at) : '—'}
                </td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-2">
                    <Btn onClick={() => toggleActive(r)}>{r.is_active ? 'وقّف' : 'رجّع'}</Btn>
                    {r.totp_enabled_at && <Btn onClick={() => resetTotp(r)}>صفّر التطبيق</Btn>}
                    <Btn kind="danger" onClick={() => remove(r)}>
                      شيله
                    </Btn>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  )
}
