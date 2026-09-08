/**
 * فحص سريع للعبة: إعداداتها بتتقرا من القاعدة، والحساب بيطلع
 * نفس نتيجة النسخة الاحتياطية — يعني النقل ما غيّرش سلوك اللعبة.
 */
import { readFileSync } from 'node:fs'

// بنقرا .env.local بإيدنا علشان ما نضيفش تبعية جديدة
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

async function main() {
  const { getGameConfig } = await import('../src/lib/api')
  const { scoreAnswers } = await import('../src/lib/game-config')
  const { gameFallback } = await import('../src/data/game')

  const cfg = await getGameConfig()
  console.log('أسئلة من القاعدة:', cfg.questions.length, '· أنواع:', cfg.types.length)
  console.log('عدد الاختيارات لكل سؤال:', cfg.questions.map((q) => q.options.length).join('،'))

  const cases: [string, Record<string, unknown>][] = [
    ['هادي', { q1: 'اللابتوب', q2: 'بتسمع وبتضحك', q4: 'اتنين تلاتة بس', q5: 'اللي بيهدّي الناس' }],
    ['اجتماعي', { q1: 'الملعب', q2: 'بتتكلم الأول', q4: '12 واحد وصوت عالي', q5: 'اللي بيمسك الخريطة' }],
    ['مستكشف', { q1: 'النيل', q2: 'بتصوّر', q4: '6 ناس ومكان هادي', q5: 'اللي بيصوّر الغروب' }],
    ['ترجيح أول مرة', { q1: 'سرير', q3: 'مش فاكر 😅', q4: 'حسب المزاج' }],
    // تعادل حقيقي بين «هادي» و«أول مرة» — الترجيح بتاع س3 هو اللي بيكسره
    [
      'تعادل بيكسره الترجيح',
      { q1: 'سرير', q2: 'بتسمع وبتضحك', q3: 'السنة دي', q5: 'اللي بيلاقي أكل' },
    ],
    // نفس التعادل من غير الترجيح — المفروض ترتيب الأنواع هو اللي يحسم
    [
      'نفس التعادل من غير ترجيح',
      { q1: 'سرير', q2: 'بتسمع وبتضحك', q3: 'الأسبوع ده', q5: 'اللي بيلاقي أكل' },
    ],
    ['من غير إجابات', {}],
  ]

  let bad = 0
  for (const [name, answers] of cases) {
    const db = scoreAnswers(cfg, answers as never)
    const fb = scoreAnswers(gameFallback, answers as never)
    const same = db.type.key === fb.type.key
    if (!same) bad++
    const tie = db.tied.length ? ` (تعادل ${db.tied.join('/')} — كسره ${db.brokeBy})` : ''
    console.log(`${same ? '✓' : '✗'} ${name}: قاعدة=${db.type.key} · احتياطي=${fb.type.key}${tie}`)
  }

  if (bad) {
    console.error(`\n✗ ${bad} حالة اختلفت بين القاعدة والاحتياطي`)
    process.exit(1)
  }
  console.log('\n✓ اللعبة من القاعدة بتدي نفس نتايج النسخة الاحتياطية')
  process.exit(0)
}

main()
