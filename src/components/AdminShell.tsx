'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { InnerHeader } from '@/components/Header'
import { loadAdminMe, NO_ADMIN, type AdminMe } from '@/lib/admin'

/**
 * الإطار المشترك لصفحات اللوحة: بيتأكد إن اللي فاتح من الفريق،
 * وبيرسم قايمة الأقسام، وبيمرّر الصلاحيات للصفحة.
 *
 * ملاحظة: ده إخفاء واجهة بس. المنع الحقيقي في RLS على كل جدول.
 */

const SECTIONS: { href: string; label: string; perm: string | null }[] = [
  { href: '/admin', label: 'الرئيسية', perm: null },
  { href: '/admin/content', label: 'النصوص', perm: 'content.edit' },
  { href: '/admin/game', label: 'اللعبة', perm: 'game.edit' },
  { href: '/admin/profile-fields', label: 'حقول التسجيل', perm: 'fields.edit' },
  { href: '/admin/templates', label: 'القوالب', perm: 'sbotat.edit' },
  { href: '/admin/sbotat', label: 'السبوطات', perm: 'sbotat.view' },
  { href: '/admin/bookings', label: 'الحجوزات', perm: 'bookings.view' },
  { href: '/admin/matching', label: 'المطابقة', perm: 'matching.view' },
  { href: '/admin/people', label: 'الناس', perm: 'people.view' },
  { href: '/admin/captains', label: 'الكباتن', perm: 'captains.edit' },
  { href: '/admin/payments', label: 'الفلوس', perm: 'payments.view' },
  { href: '/admin/reports', label: 'البلاغات', perm: 'reports.view' },
  { href: '/admin/notifications', label: 'الرسائل', perm: 'notifications.view' },
  { href: '/admin/map', label: 'الخريطة', perm: 'map.edit' },
  { href: '/admin/settings', label: 'الإعدادات', perm: 'settings.view' },
  { href: '/admin/team', label: 'الفريق', perm: 'admins.manage' },
  { href: '/admin/audit', label: 'السجل', perm: 'audit.view' },
]

export function AdminShell({
  title,
  needs,
  children,
}: {
  title: string
  /** الصلاحية المطلوبة للقسم ده */
  needs?: string
  children: (me: AdminMe) => ReactNode
}) {
  const path = usePathname()
  const [me, setMe] = useState<AdminMe | null>(null)

  useEffect(() => {
    loadAdminMe()
      .then(setMe)
      .catch(() => setMe(NO_ADMIN))
  }, [])

  if (me === null) {
    return (
      <main className="mx-auto w-full max-w-page px-5">
        <InnerHeader back="الرئيسية" padded={false} />
        <div className="pt-8" style={{ color: 'var(--muted)' }}>
          ثانية واحدة…
        </div>
      </main>
    )
  }

  const denied = !me.isAdmin || (needs ? !me.permissions.has(needs) : false)

  if (denied) {
    return (
      <main className="mx-auto w-full max-w-page px-5">
        <InnerHeader back="الرئيسية" padded={false} />
        <div className="pt-10">
          <h1 className="m-0 font-display text-30 font-black">
            {me.isAdmin ? 'القسم ده مش من صلاحيتك.' : 'الصفحة دي للإدارة.'}
          </h1>
          <p className="mt-2 font-body text-16" style={{ color: 'var(--muted)' }}>
            {me.isAdmin
              ? 'كلّم صاحب الحساب لو محتاج تدخل هنا.'
              : 'لو أنت من الفريق، ادخل بالرقم المسجل.'}
          </p>
          <Link
            href="/"
            className="mt-4 inline-block underline"
            style={{ color: 'var(--accent-text)' }}
          >
            الرئيسية
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-[1400px] px-5 pb-16">
      <InnerHeader back="الرئيسية" padded={false} />

      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="m-0 font-display text-30 font-black">{title}</h1>
        <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
          دورك: {me.roleKey}
        </span>
      </div>

      <nav className="nb-scroll-x mt-4 gap-2">
        {SECTIONS.filter((s) => !s.perm || me.permissions.has(s.perm)).map((s) => {
          const on = path === s.href
          return (
            <Link
              key={s.href}
              href={s.href}
              className="whitespace-nowrap rounded-pill px-4 py-2 font-display text-15 font-black no-underline"
              style={{
                background: on ? '#F4632A' : 'transparent',
                color: on ? '#14161A' : 'var(--fg)',
                border: `2px solid ${on ? '#F4632A' : 'var(--chip-idle-border)'}`,
              }}
            >
              {s.label}
            </Link>
          )
        })}
      </nav>

      {children(me)}
    </main>
  )
}
