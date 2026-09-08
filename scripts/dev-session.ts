/**
 * بيطلّع جلسة لرقم الاختبار وبيطبعها بالشكل اللي المتصفح بيخزّنه بيه.
 * للتجربة المحلية بس — أرقام الاختبار مش شغالة في الإنتاج.
 *
 * التشغيل: npx tsx scripts/dev-session.ts
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const PHONE = (process.env.TEST_PHONE_ALLOWLIST ?? '').split(',')[0].trim()
const SITE = process.env.SITE_URL ?? 'http://localhost:3210'

async function main() {
  await fetch(`${SITE}/api/otp/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: PHONE }),
  })
  const v = await fetch(`${SITE}/api/otp/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: PHONE, code: '1234' }),
  })
  const vj = (await v.json()) as { token_hash?: string; error?: string }
  if (!vj.token_hash) throw new Error(vj.error ?? 'مفيش توكن')

  const db = createClient(URL_, ANON, { auth: { persistSession: false } })
  const { data, error } = await db.auth.verifyOtp({
    token_hash: vj.token_hash,
    type: 'magiclink',
  })
  if (error || !data.session) throw new Error(error?.message ?? 'مفيش جلسة')

  const ref = new URL(URL_).hostname.split('.')[0]
  console.log(JSON.stringify({ key: `sb-${ref}-auth-token`, session: data.session }))
}

main()
