/**
 * بيسحب الهجرات المطبّقة من قاعدة البيانات ويحطها ملفات في supabase/migrations/
 * علشان الملفات في المستودع تطابق القاعدة بالظبط.
 *
 * التشغيل: npx tsx scripts/dump-migrations.ts
 */
import { writeFile, mkdir, readdir, unlink } from 'node:fs/promises'
import path from 'node:path'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('محتاج NEXT_PUBLIC_SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const OUT = path.join(process.cwd(), 'supabase', 'migrations')

async function main() {
  const res = await fetch(`${URL}/rest/v1/rpc/dump_migrations`, {
    method: 'POST',
    headers: { apikey: KEY!, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    body: '{}',
  })
  if (!res.ok) { console.error(await res.text()); process.exit(1) }
  const rows: { version: string; name: string; sql: string }[] = await res.json()

  await mkdir(OUT, { recursive: true })
  // بنمسح ملفات SQL القديمة بس — README بيفضل
  for (const f of await readdir(OUT)) {
    if (f.endsWith('.sql')) await unlink(path.join(OUT, f))
  }

  for (const r of rows) {
    const file = path.join(OUT, `${r.version}_${r.name}.sql`)
    await writeFile(file, r.sql + '\n', 'utf8')
    console.log('✓', path.basename(file))
  }
  console.log(`\n${rows.length} هجرة اتكتبت في supabase/migrations/`)
}
main()
