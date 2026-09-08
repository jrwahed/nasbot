/**
 * إصلاح حساب اتعمل بالغلط.
 *
 * كان في عيب في /api/otp/verify: لو الملف موجود بس الحساب اتعمل بالموبايل
 * من غير إيميل، الرابط السحري كان بيعمل حساب تاني بنفس الإيميل من غير ملف —
 * والعضو بيدخل ويلاقي كل حاجة مقفولة عليه.
 *
 * السكربت ده بيشيل الإيميل من الحساب الزيادة (من غير ما يمسحه) وبيحطّه
 * على الحساب الصح اللي عليه الملف. العيب نفسه اتظبط في المسار.
 *
 * التشغيل: npx tsx scripts/fix-orphan-auth.ts <auth_id_الزيادة> <auth_id_الصح>
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const [orphanId, realId] = process.argv.slice(2)
if (!orphanId || !realId) {
  console.error('لازم تدّي المعرّفين: <الزيادة> <الصح>')
  process.exit(1)
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

async function main() {
  const { data: orphan, error: oErr } = await db.auth.admin.getUserById(orphanId)
  if (oErr || !orphan.user) {
    console.error('مالقيناش الحساب الزيادة:', oErr?.message)
    process.exit(1)
  }
  const email = orphan.user.email
  if (!email) {
    console.error('الحساب الزيادة مالوش إيميل أصلًا — مفيش حاجة نعملها')
    process.exit(1)
  }

  // نتأكد إنه فعلًا فاضي قبل ما نلمسه
  const { count } = await db
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('id', orphanId)
  if ((count ?? 0) > 0) {
    console.error('الحساب ده عليه ملف — مش هنلمسه')
    process.exit(1)
  }

  const parked = `orphan-${orphanId}@invalid.nasbot.app`
  const { error: pErr } = await db.auth.admin.updateUserById(orphanId, { email: parked })
  if (pErr) {
    console.error('مقدرناش نشيل الإيميل من الحساب الزيادة:', pErr.message)
    process.exit(1)
  }
  console.log(`✓ الإيميل اتشال من الحساب الزيادة (بقى ${parked})`)

  const { error: rErr } = await db.auth.admin.updateUserById(realId, {
    email,
    email_confirm: true,
  })
  if (rErr) {
    console.error('مقدرناش نحط الإيميل على الحساب الصح:', rErr.message)
    // نرجّع الإيميل مكانه علشان ما نسيبش الحالة نص نص
    await db.auth.admin.updateUserById(orphanId, { email })
    console.error('رجّعنا الإيميل مكانه.')
    process.exit(1)
  }
  console.log(`✓ الإيميل ${email} بقى على الحساب الصح ${realId}`)
}

main()
