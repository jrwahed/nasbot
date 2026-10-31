'use client'

import { useCallback, useEffect, useState } from 'react'
import { AdminShell } from '@/components/AdminShell'
import { supabase } from '@/lib/supabase'
import { rejected, revalidateSite, loadBannedWords, bannedIn } from '@/lib/admin'
import {
  Card,
  Btn,
  Tabs,
  TextField,
  NumberField,
  Toggle,
  SelectField,
  Empty,
  Loading,
  Tag,
  useFlash,
  when,
} from '@/components/admin-ui'
import type { AdminMe } from '@/lib/admin'
import { getCasePreview, type CasePreviewDoc } from '@/lib/cases'

/**
 * «القضايا» — العوالم والقضايا وبنك الأسئلة والمهمات وألغاز الخزنة.
 *
 * كل محتوى اللعبة بيتعدّل من هنا: المقدمة والكروت والحدث والنهايتين لكل
 * قضية، ونص التلميح لكل اختيار في بنك الأسئلة، والمهمات السرية. يعني
 * «أي قضية جديدة بتاخد ٢٠ دقيقة كتابة» زي ما البرومبت بيقول.
 *
 * ⚠ **كل كتابة وراها `rejected()`** (§٧): القاعدة مقفولة على `cases.edit`،
 *   والمصفوفة الفاضية معناها إن القاعدة رفضت — مش نجاح. من غير الحارس ده
 *   الصفحة بتقول «اتحفظ ✓» وهي كذبة.
 *
 * ⚠ **الكلمات الممنوعة** بتتفحص قبل الحفظ زي باقي صفحات المحتوى (تعارف ·
 *   شريك · إعجاب · فعالية · تذكرة · باقة · منصة · مستخدم · اكتشف).
 *
 * ⚠ **مفيش «اختار المتهم» ولا «شوف الأدوار» هنا — ولا هيكون.** اختيار
 *   المتهم جوه القاعدة ومحدش يقدر يغيّره وهو بيلعب، ولا حتى من اللوحة.
 *   لو حد جه يضيف الزرار ده بكره: ده بيكسر اللعبة، مش بيسهّلها.
 */

interface World {
  slug: string
  name_ar: string
  detective_name_ar: string
  suspect_name_ar: string
  mood_ar: string | null
  theme: string
  codenames: boolean
  has_act2_event: boolean
  sort: number
  is_active: boolean
}

interface CaseRow {
  id: string
  world_slug: string
  slug: string
  title_ar: string
  shape: string
  intro_ar: string
  detective_card_ar: string
  suspect_card_ar: string
  act2_event_ar: string | null
  win_ending_ar: string
  escape_ending_ar: string
  twist_ar: string | null
  min_players: number
  max_players: number | null
  sort: number
  is_active: boolean
  report_ar: string | null
  scene_ar: string | null
  goal_ar: string | null
}

interface QRow {
  id: string
  slug: string
  question_ar: string
  kind: string
  sort: number
  is_active: boolean
}

interface ORow {
  id: string
  question_id: string
  value: string
  label_ar: string
  clue_ar: string
  sort: number
}

interface MissionRow {
  id: string
  slug: string
  text_ar: string
  fits_ar: string | null
  world_slug: string | null
  sort: number
  is_active: boolean
}

interface RiddleRow {
  key: string
  slot: number
  riddle_ar: string
  question_slug: string | null
  option_values: string[]
  hint_ar: string | null
  is_active: boolean
}

interface SessionRow {
  id: string
  sbota_id: string
  act: string
  outcome: string | null
  built_at: string | null
  ended_at: string | null
  created_at: string
}

const THEMES = [
  { value: 'mono', label: 'أبيض وأسود' },
  { value: 'dark', label: 'غامق (سري)' },
  { value: 'warm', label: 'كريمي وملوّن' },
]

const SHAPES = [
  { value: 'single', label: 'متهم واحد' },
  { value: 'double', label: 'عميلين (٨+)' },
  { value: 'vault', label: 'الخزنة (من غير متهم)' },
]

const ACTS: Record<string, string> = {
  setup: 'مااتفتحتش',
  arrive: 'الوصول',
  act1: 'الفصل الأول',
  break1: 'النشاط',
  act2: 'الفصل التاني',
  break2: 'النشاط (٢)',
  final: 'الاتهام',
  done: 'خلصت',
}

const OUTCOMES: Record<string, string> = {
  caught: 'اتقفش',
  escaped: 'هرب',
  vault_open: 'الخزنة اتفتحت',
  vault_shut: 'الخزنة فضلت مقفولة',
}

type Tab = 'worlds' | 'cases' | 'questions' | 'missions' | 'vault' | 'live'

export default function CasesPage() {
  return (
    <AdminShell title="القضايا" needs="cases.view">
      {(me) => <Body me={me} />}
    </AdminShell>
  )
}

function Body({ me }: { me: AdminMe }) {
  const [tab, setTab] = useState<Tab>('cases')
  const [worlds, setWorlds] = useState<World[]>([])
  const [cases, setCases] = useState<CaseRow[]>([])
  const [qs, setQs] = useState<QRow[]>([])
  const [opts, setOpts] = useState<ORow[]>([])
  const [missions, setMissions] = useState<MissionRow[]>([])
  const [riddles, setRiddles] = useState<RiddleRow[]>([])
  const [live, setLive] = useState<SessionRow[]>([])
  const [banned, setBanned] = useState<string[]>([])
  /** الملف اللي المالك فاتحه دلوقتي للقراية — slug القضية */
  const [openFile, setOpenFile] = useState<string | null>(null)
  const [fileDoc, setFileDoc] = useState<CasePreviewDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const { msg, flash } = useFlash()

  const canEdit = me.permissions.has('cases.edit')

  const reload = useCallback(async () => {
    const db = supabase()
    const [w, c, q, o, m, r, s] = await Promise.all([
      db.from('case_worlds').select('*').order('sort'),
      db.from('cases').select('*').order('world_slug').order('sort'),
      db.from('case_questions').select('*').order('sort'),
      db.from('case_options').select('*').order('sort'),
      db.from('case_missions').select('*').order('sort'),
      db.from('case_vault_riddles').select('*').order('slot'),
      db
        .from('case_sessions')
        .select('id, sbota_id, act, outcome, built_at, ended_at, created_at')
        .order('created_at', { ascending: false })
        .limit(20),
    ])
    setWorlds((w.data ?? []) as World[])
    setCases((c.data ?? []) as CaseRow[])
    setQs((q.data ?? []) as QRow[])
    setOpts((o.data ?? []) as ORow[])
    setMissions((m.data ?? []) as MissionRow[])
    setRiddles((r.data ?? []) as RiddleRow[])
    setLive((s.data ?? []) as SessionRow[])
    setLoading(false)
  }, [])

  useEffect(() => {
    loadBannedWords().then(setBanned)
    reload()
  }, [reload])

  /** أي كتابة بتمر من هنا — الحارس في مكان واحد مش مكرّر في كل خانة */
  const save = async (
    table: string,
    key: Record<string, string | number>,
    patch: Record<string, unknown>,
  ) => {
    if (!canEdit) return flash('محتاج صلاحية cases.edit')
    const texts = Object.values(patch)
      .filter((v): v is string => typeof v === 'string')
      .join(' ')
    const bad = bannedIn(texts, banned)
    if (bad.length) return flash(`فيه كلمة ممنوعة: ${bad.join(' · ')}`)

    let qb = supabase().from(table).update(patch)
    for (const [k, v] of Object.entries(key)) qb = qb.eq(k, v)
    const { data, error } = await qb.select(Object.keys(key)[0])
    if (error) return flash(`مقدرناش: ${error.message}`)
    if (rejected(data)) return flash('مااتحفظش — القاعدة رفضت الكتابة، محتاج صلاحية cases.edit')
    await reload()
    await revalidateSite()
    flash('اتحفظ ✓')
  }

  /**
   * «اقرا الملف» — المعاينة.
   *
   * ⚠ دي اللي كانت ناقصة: المالك كتب ٩ قضايا وما كانش يقدر يقرا ولا
   *   واحدة من غير ما يعمل سبوطة ويحجز فيها ويفتح جلسة. فتح الموقع
   *   ولقى مفيش حاجة — وبحق. ميزة تتكتب وما تتشافش = ميزة مش موجودة
   *   (الدرس التامن).
   */
  const readFile = async (slug: string) => {
    if (openFile === slug) {
      setOpenFile(null)
      setFileDoc(null)
      return
    }
    setOpenFile(slug)
    setFileDoc(null)
    const d = await getCasePreview(slug)
    if (!d) return flash('مقدرناش نجيب الملف — محتاج صلاحية cases.view')
    setFileDoc(d)
  }

  if (loading) return <Loading />

  const tabs: { id: Tab; label: string }[] = [
    { id: 'cases', label: `القضايا (${cases.length})` },
    { id: 'worlds', label: `العوالم (${worlds.length})` },
    { id: 'questions', label: `بنك الأسئلة (${qs.length})` },
    { id: 'missions', label: `المهمات (${missions.length})` },
    { id: 'vault', label: 'الخزنة' },
    { id: 'live', label: 'اللي حصل' },
  ]

  return (
    <>
      {msg && (
        <div className="mt-4 rounded-12 px-4 py-3 font-body text-14" style={{ background: 'var(--sand)' }}>
          {msg}
        </div>
      )}

      <p className="mt-4 font-body text-14" style={{ color: 'var(--muted)' }}>
        كل سبوطة ممكن يكون فيها قضية: واحد سرّي هو المتهم والباقيين فريق بيكشفه،
        والتلميحات متبنية من إجاباتهم عن نفسهم. اللعبة بتتقفل كلها من «الإعدادات ←
        مفاتيح المزايا ← قضية الليلة»، والعالم بيتربط بالقالب من «القوالب».
      </p>
      <p className="mt-2 font-body text-13" style={{ color: 'var(--muted)' }}>
        اختيار المتهم وحساب التلميحات جوه القاعدة — مفيش حاجة هنا بتختار متهم ولا
        بتعرض الأدوار، وده مقصود.
      </p>
      <p className="mt-2 font-body text-13" style={{ color: 'var(--muted)' }}>
        «اقرا الملف» بيوريك القضية كاملة زي ما المجموعة هتقراها — ومعاها كارت المتهم
        والنهايتين. وطريقة الحل («إزاي تتحل») واحدة لكل اللعبة وبتتعدّل من «النصوص»
        بمفاتيح <code>case.how.*</code>، مش من هنا.
      </p>

      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'cases' && (
        <div className="mt-4 flex flex-col gap-4">
          {cases.length === 0 && <Empty>مفيش قضايا. الزق WORK_MIGRATION_49.</Empty>}
          {cases.map((c) => (
            <Card key={c.id}>
              <div className="flex flex-wrap items-center gap-2">
                <strong className="font-display text-18">{c.title_ar}</strong>
                <Tag>{worlds.find((w) => w.slug === c.world_slug)?.name_ar ?? c.world_slug}</Tag>
                <Tag>{SHAPES.find((s) => s.value === c.shape)?.label ?? c.shape}</Tag>
                {!c.is_active && <Tag>مقفولة</Tag>}
                <span className="font-body text-12" style={{ color: 'var(--muted)' }}>
                  {c.slug}
                </span>
              </div>

              <div className="mt-3">
                <Btn onClick={() => readFile(c.slug)}>
                  {openFile === c.slug ? 'اقفل الملف' : 'اقرا الملف 🔍'}
                </Btn>
              </div>

              {openFile === c.slug && fileDoc ? (
                <div
                  className="mt-3 rounded-12 p-4 font-body text-14"
                  style={{ background: 'var(--sand)', whiteSpace: 'pre-wrap', lineHeight: 1.8 }}
                >
                  <strong>البلاغ</strong>
                  {'\n'}{fileDoc.report || '— فاضي —'}
                  {'\n\n'}<strong>مسرح الواقعة</strong>
                  {'\n'}{fileDoc.scene || '— فاضي —'}
                  {'\n\n'}<strong>المطلوب</strong>
                  {'\n'}{fileDoc.goal || '— فاضي —'}
                  {'\n\n'}<strong>كارت {fileDoc.detectiveName}</strong>
                  {'\n'}{fileDoc.detectiveCard}
                  {'\n\n'}<strong>كارت {fileDoc.suspectName} (سري)</strong>
                  {'\n'}{fileDoc.suspectCard}
                  {fileDoc.act2Event ? (
                    <>
                      {'\n\n'}<strong>حدث الفصل التاني</strong>
                      {'\n'}{fileDoc.act2Event}
                    </>
                  ) : null}
                  {'\n\n'}<strong>لو اتقفش</strong>
                  {'\n'}{fileDoc.winEnding}
                  {fileDoc.twist ? `\n(مفاجأة) ${fileDoc.twist}` : ''}
                  {'\n\n'}<strong>لو هرب</strong>
                  {'\n'}{fileDoc.escapeEnding}
                </div>
              ) : null}

              <div className="mt-3 flex flex-col gap-3">
                <TextField
                  label="العنوان"
                  value={c.title_ar}
                  onSave={(v) => save('cases', { id: c.id }, { title_ar: v })}
                />
                <TextField
                  label="البلاغ — الحكاية من أولها"
                  value={c.report_ar ?? ''}
                  multiline
                  hint="مين ومتى وإيه اللي حصل. ده أول حاجة المجموعة بتقراها — خليه يتقرا زي بلاغ مباحث."
                  onSave={(v) => save('cases', { id: c.id }, { report_ar: v || null })}
                />
                <TextField
                  label="مسرح الواقعة"
                  value={c.scene_ar ?? ''}
                  multiline
                  hint="اللي قدامهم لما يبصّوا حواليهم. بيدّيهم حاجة يتكلموا عنها."
                  onSave={(v) => save('cases', { id: c.id }, { scene_ar: v || null })}
                />
                <TextField
                  label="المطلوب"
                  value={c.goal_ar ?? ''}
                  multiline
                  hint="إيه اللي لازم يطلعوا بيه آخر الليلة."
                  onSave={(v) => save('cases', { id: c.id }, { goal_ar: v || null })}
                />
                <TextField
                  label="المقدمة على الشاشة"
                  value={c.intro_ar}
                  multiline
                  hint="دي أول حاجة الكل بيقراها. القصة في سطرين أو تلاتة."
                  onSave={(v) => save('cases', { id: c.id }, { intro_ar: v })}
                />
                <TextField
                  label="كارت المحقق"
                  value={c.detective_card_ar}
                  multiline
                  onSave={(v) => save('cases', { id: c.id }, { detective_card_ar: v })}
                />
                <TextField
                  label="كارت المتهم"
                  value={c.suspect_card_ar}
                  multiline
                  hint="ده بيوصل للمتهم بس — مفيش متصفح تاني بياخده."
                  onSave={(v) => save('cases', { id: c.id }, { suspect_card_ar: v })}
                />
                <TextField
                  label="حدث الفصل التاني"
                  value={c.act2_event_ar ?? ''}
                  multiline
                  hint="سيبها فاضية في العوالم اللي مفيهاش حدث («مين عملها؟»)."
                  onSave={(v) => save('cases', { id: c.id }, { act2_event_ar: v || null })}
                />
                <TextField
                  label="النهاية لو الفريق كسب"
                  value={c.win_ending_ar}
                  multiline
                  onSave={(v) => save('cases', { id: c.id }, { win_ending_ar: v })}
                />
                <TextField
                  label="النهاية لو المتهم هرب"
                  value={c.escape_ending_ar}
                  multiline
                  onSave={(v) => save('cases', { id: c.id }, { escape_ending_ar: v })}
                />
                <TextField
                  label="النهاية المفاجئة (اختيارية)"
                  value={c.twist_ar ?? ''}
                  multiline
                  hint="بتظهر لو اتقفش بس."
                  onSave={(v) => save('cases', { id: c.id }, { twist_ar: v || null })}
                />

                <div className="flex flex-wrap gap-3">
                  <SelectField
                    label="العالم"
                    value={c.world_slug}
                    options={worlds.map((w) => ({ value: w.slug, label: w.name_ar }))}
                    onChange={(v) => save('cases', { id: c.id }, { world_slug: v })}
                  />
                  <SelectField
                    label="الشكل"
                    value={c.shape}
                    options={SHAPES}
                    onChange={(v) => save('cases', { id: c.id }, { shape: v })}
                  />
                  <NumberField
                    label="أقل عدد"
                    value={c.min_players}
                    onSave={(v) => save('cases', { id: c.id }, { min_players: v })}
                  />
                  <NumberField
                    label="الترتيب"
                    value={c.sort}
                    onSave={(v) => save('cases', { id: c.id }, { sort: v })}
                  />
                </div>

                <Toggle
                  label="شغّالة"
                  value={c.is_active}
                  onChange={(v) => save('cases', { id: c.id }, { is_active: v })}
                />
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === 'worlds' && (
        <div className="mt-4 flex flex-col gap-4">
          {worlds.map((w) => (
            <Card key={w.slug}>
              <div className="flex flex-wrap items-center gap-2">
                <strong className="font-display text-18">{w.name_ar}</strong>
                <Tag>{THEMES.find((t) => t.value === w.theme)?.label ?? w.theme}</Tag>
                {w.codenames && <Tag>أسماء حركية</Tag>}
                {!w.has_act2_event && <Tag>مفيش حدث</Tag>}
              </div>
              <div className="mt-3 flex flex-col gap-3">
                <TextField
                  label="الاسم"
                  value={w.name_ar}
                  onSave={(v) => save('case_worlds', { slug: w.slug }, { name_ar: v })}
                />
                <TextField
                  label="المحققين اسمهم"
                  value={w.detective_name_ar}
                  onSave={(v) => save('case_worlds', { slug: w.slug }, { detective_name_ar: v })}
                />
                <TextField
                  label="المتهم اسمه"
                  value={w.suspect_name_ar}
                  onSave={(v) => save('case_worlds', { slug: w.slug }, { suspect_name_ar: v })}
                />
                <TextField
                  label="الجو"
                  value={w.mood_ar ?? ''}
                  multiline
                  onSave={(v) => save('case_worlds', { slug: w.slug }, { mood_ar: v || null })}
                />
                <SelectField
                  label="الثيم"
                  value={w.theme}
                  options={THEMES}
                  onChange={(v) => save('case_worlds', { slug: w.slug }, { theme: v })}
                />
                <Toggle
                  label="أسماء حركية لكل واحد"
                  value={w.codenames}
                  hint="بتكسر حرج الأسامي اللي محدش فاكرها، وبتبقى هزار بينهم بعد السبوطة."
                  onChange={(v) => save('case_worlds', { slug: w.slug }, { codenames: v })}
                />
                <Toggle
                  label="فيه حدث في الفصل التاني"
                  value={w.has_act2_event}
                  hint="لو مقفولة، الفصل التاني بيتدمج في الختام والقضية تبقى فصلين."
                  onChange={(v) => save('case_worlds', { slug: w.slug }, { has_act2_event: v })}
                />
                <Toggle
                  label="شغّال"
                  value={w.is_active}
                  onChange={(v) => save('case_worlds', { slug: w.slug }, { is_active: v })}
                />
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === 'questions' && (
        <div className="mt-4 flex flex-col gap-4">
          <Card>
            <p className="font-body text-14">
              الشرط الوحيد في أي سؤال جديد: لو الإجابة اتقالت قدام ٥ غرباء، محدش
              هيتكسف منها. مفيش سن ولا شغل ولا جواز ولا دين ولا ساكن فين.
            </p>
            <p className="mt-2 font-body text-13" style={{ color: 'var(--muted)' }}>
              والتلميح بيوصف الموقف مش الشخص: «بينسى يرد على الرسايل» ماشي، إنما
              «مابيهتمش بحد» ممنوع. ومفيش تلميح عن الشكل أو الجسم خالص.
            </p>
          </Card>

          {qs.map((q) => (
            <Card key={q.id}>
              <div className="flex flex-wrap items-center gap-2">
                <strong className="font-display text-16">{q.question_ar}</strong>
                {q.kind === 'observed' && <Tag>ما يتكدبش فيه</Tag>}
                {!q.is_active && <Tag>مقفول</Tag>}
              </div>
              <div className="mt-3 flex flex-col gap-3">
                <TextField
                  label="السؤال"
                  value={q.question_ar}
                  onSave={(v) => save('case_questions', { id: q.id }, { question_ar: v })}
                />
                <div className="flex flex-wrap gap-3">
                  <NumberField
                    label="الترتيب"
                    value={q.sort}
                    onSave={(v) => save('case_questions', { id: q.id }, { sort: v })}
                  />
                  <Toggle
                    label="شغّال"
                    value={q.is_active}
                    onChange={(v) => save('case_questions', { id: q.id }, { is_active: v })}
                  />
                </div>

                <div className="mt-2 flex flex-col gap-3">
                  {opts
                    .filter((o) => o.question_id === q.id)
                    .map((o) => (
                      <div
                        key={o.id}
                        className="rounded-12 p-3"
                        style={{ background: 'var(--sand)' }}
                      >
                        <TextField
                          label={`الاختيار «${o.value}»`}
                          value={o.label_ar}
                          onSave={(v) => save('case_options', { id: o.id }, { label_ar: v })}
                        />
                        <div className="mt-2">
                          <TextField
                            label="التلميح لو المتهم اختار ده"
                            value={o.clue_ar}
                            onSave={(v) => save('case_options', { id: o.id }, { clue_ar: v })}
                          />
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === 'missions' && (
        <div className="mt-4 flex flex-col gap-4">
          <Card>
            <p className="font-body text-14">
              المتهم بياخد مهمة عشوائي. لو خلّصها من غير ما حد ياخد باله بيكسب نص
              النقط حتى لو اتقفش — عشان يبقى ليه دور يلعبه مش بس يستخبى.
            </p>
            <p className="mt-2 font-body text-13" style={{ color: 'var(--muted)' }}>
              أي مهمة جديدة لازم تعدّي من تلات شروط: مفيهاش لمس، ومفيهاش إحراج
              لحد، ومفيهاش سؤال عن حاجة شخصية.
            </p>
          </Card>
          {missions.map((m) => (
            <Card key={m.id}>
              <TextField
                label="المهمة"
                value={m.text_ar}
                multiline
                onSave={(v) => save('case_missions', { id: m.id }, { text_ar: v })}
              />
              <div className="mt-3 flex flex-wrap gap-3">
                <TextField
                  label="مناسبة لـ"
                  value={m.fits_ar ?? ''}
                  onSave={(v) => save('case_missions', { id: m.id }, { fits_ar: v || null })}
                />
                <SelectField
                  label="العالم"
                  value={m.world_slug ?? ''}
                  options={[{ value: '', label: 'أي عالم' }, ...worlds.map((w) => ({ value: w.slug, label: w.name_ar }))]}
                  onChange={(v) => save('case_missions', { id: m.id }, { world_slug: v || null })}
                />
                <Toggle
                  label="شغّالة"
                  value={m.is_active}
                  onChange={(v) => save('case_missions', { id: m.id }, { is_active: v })}
                />
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === 'vault' && (
        <div className="mt-4 flex flex-col gap-4">
          <Card>
            <p className="font-body text-14">
              «الخزنة» مفيهاش متهم: الكل فريق واحد، وكل رقم لغز عن المجموعة نفسها
              بيتحسب من إجاباتهم. اللي مفيهوش سؤال، صاحب الخروجة بيدخّله («مين كسب
              الجيم؟»).
            </p>
          </Card>
          {riddles.map((r) => (
            <Card key={r.key}>
              <div className="flex flex-wrap items-center gap-2">
                <Tag>رقم {r.slot}</Tag>
                {!r.question_slug && <Tag>صاحب الخروجة بيدخّله</Tag>}
              </div>
              <div className="mt-3 flex flex-col gap-3">
                <TextField
                  label="اللغز"
                  value={r.riddle_ar}
                  onSave={(v) => save('case_vault_riddles', { key: r.key }, { riddle_ar: v })}
                />
                <TextField
                  label="الهنت (بيفتح بعد الوقت اللي في الإعدادات)"
                  value={r.hint_ar ?? ''}
                  onSave={(v) => save('case_vault_riddles', { key: r.key }, { hint_ar: v || null })}
                />
                <SelectField
                  label="بيتحسب من سؤال"
                  value={r.question_slug ?? ''}
                  options={[
                    { value: '', label: 'صاحب الخروجة بيدخّله' },
                    ...qs.map((q) => ({ value: q.slug, label: q.question_ar })),
                  ]}
                  onChange={(v) =>
                    save('case_vault_riddles', { key: r.key }, { question_slug: v || null })
                  }
                />
                <Toggle
                  label="شغّال"
                  value={r.is_active}
                  onChange={(v) => save('case_vault_riddles', { key: r.key }, { is_active: v })}
                />
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === 'live' && (
        <div className="mt-4 flex flex-col gap-3">
          {live.length === 0 && <Empty>مفيش ولا قضية اتلعبت لسه.</Empty>}
          {live.map((s) => (
            <Card key={s.id}>
              <div className="flex flex-wrap items-center gap-2">
                <Tag>{ACTS[s.act] ?? s.act}</Tag>
                {s.outcome && <Tag>{OUTCOMES[s.outcome] ?? s.outcome}</Tag>}
                {!s.built_at && <Tag>الأدوار مااتوزّعتش</Tag>}
                <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
                  {when(s.created_at)}
                </span>
              </div>
              <div className="mt-2 font-body text-13" style={{ color: 'var(--muted)' }}>
                السبوطة: {s.sbota_id}
                {s.ended_at ? ` · خلصت ${when(s.ended_at)}` : ''}
              </div>
              <p className="mt-2 font-body text-12" style={{ color: 'var(--muted)' }}>
                مفيش أدوار ولا تلميحات ولا أصوات معروضة هنا عن قصد — دي بيانات لعبة
                شغّالة، وعرضها من اللوحة يكسرها.
              </p>
            </Card>
          ))}
        </div>
      )}

      {!canEdit && (
        <Card>
          <p className="font-body text-14">
            إنت شايف بس. التعديل محتاج صلاحية <strong>cases.edit</strong>.
          </p>
        </Card>
      )}

      <div className="mt-6">
        <Btn onClick={() => reload()}>حدّث</Btn>
      </div>
    </>
  )
}
