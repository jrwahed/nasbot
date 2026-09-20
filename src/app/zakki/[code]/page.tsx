'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { InnerHeader } from '@/components/Header'
import { supabase, hasSupabase } from '@/lib/supabase'
import { endorse } from '@/lib/api'
import { useT } from '@/components/CopyProvider'

/**
 * صفحة التزكية — «أنا أعرفه».
 *
 * العضو اللي مستني تزكيات بيبعت اللينك ده لناس جوه، وكل واحد بيدوس مرة.
 *
 * ⚠ الكود في اللينك هو `referral_code` بتاع اللي عايز التزكية — مش رقم
 *    حسابه. الرقم ما ينفعش يتحط في لينك بيتبعت في واتساب.
 *
 * ⚠ كل الحراس في `fn_endorse` جوّه القاعدة: مين يقدر يزكّي، ومحدش يزكّي
 *    نفسه، والتكرار. الصفحة دي بتعرض النتيجة بس.
 */
export default function ZakkiPage() {
  const t = useT()
  const params = useParams<{ code: string }>()
  const code = (params.code ?? '').toUpperCase()

  const [name, setName] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!hasSupabase) return
    const { data } = await supabase()
      .from('profiles')
      .select('id, first_name')
      .eq('referral_code', code)
      .maybeSingle()
    setName((data as { first_name: string } | null)?.first_name ?? '')
  }, [code])

  useEffect(() => {
    void load()
  }, [load])

  async function go() {
    if (!hasSupabase) return
    setBusy(true)
    const { data } = await supabase()
      .from('profiles')
      .select('id')
      .eq('referral_code', code)
      .maybeSingle()
    const id = (data as { id: string } | null)?.id
    if (!id) {
      setBusy(false)
      return setMsg(t('gate.zakki.bad'))
    }
    const err = await endorse(id)
    setBusy(false)
    if (err) return setMsg(err)
    setDone(true)
  }

  return (
    <main className="mx-auto w-full max-w-page px-5 pb-8">
      <InnerHeader back={t('map.label.1')} href="/" padded={false} />

      <div className="mt-6 rounded-20 p-6" style={{ background: 'var(--surface)' }}>
        <h1 className="m-0 font-display text-24 font-black">{t('gate.zakki.title')}</h1>
        <p className="mt-2 font-body text-16" style={{ color: 'var(--muted)' }}>
          {name ? t('gate.zakki.body', { name }) : t('gate.zakki.bad')}
        </p>

        {done ? (
          <div className="mt-4 font-display text-18 font-black" style={{ color: 'var(--accent-text)' }}>
            {t('gate.endorse.done')}
          </div>
        ) : (
          name && (
            <button
              type="button"
              onClick={go}
              disabled={busy}
              className="mt-4 min-h-[52px] w-full cursor-pointer rounded-14 font-display text-18 font-black disabled:opacity-40"
              style={{ background: '#F4632A', color: '#14161A', border: 0 }}
            >
              {t('gate.endorse.do')}
            </button>
          )
        )}

        {msg && (
          <div className="mt-3 font-body text-14" style={{ color: 'var(--err-text)' }}>
            {msg}
          </div>
        )}

        <Link
          href="/me"
          className="mt-5 inline-block font-body text-15 font-semibold underline"
          style={{ color: 'var(--accent-text)' }}
        >
          {t('gate.zakki.mine')}
        </Link>
      </div>
    </main>
  )
}
