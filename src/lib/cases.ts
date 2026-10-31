/**
 * «قضية الليلة» — طبقة البيانات.
 *
 * كل سبوطة ممكن يكون فيها **قضية**: واحد من المجموعة سرّي هو المتهم،
 * والباقيين فريق بيكشفه. والتلميحات متبنية من إجابات المجموعة عن نفسها.
 *
 * 🔴 **القاعدة الحاكمة في الملف ده كله:** مفيش ولا استعلام مباشر على
 *    `case_players` ولا `case_clues` ولا `case_votes` — الجداول دي
 *    مفيهاش سياسة قراية للعضو عن قصد (`0132`). كل حاجة بتيجي من دالة
 *    `security definer` بترجّع **اللي من حقك إنت بس**:
 *
 *      · `fn_case_my_role`  → دورك إنت. صف واحد. مفيش parameter لحد تاني.
 *      · `fn_case_clues`    → التلميحات المفتوحة لحد الفصل الحالي بس.
 *      · `fn_case_code`     → الكود، لصاحب الخروجة بس.
 *      · `fn_case_vote_state` → أرقام بس، مفيش «مين صوّت لمين».
 *      · `fn_case_result`   → بعد الختام بس.
 *
 *    لو حد زوّد استعلام مباشر هنا، هوية المتهم تبقى في المتصفح —
 *    وده نفس نوع الغلطة اللي كشفت اسم المكان قبل الدفع (الدرس حداشر).
 *
 * ⚠ الاحتياطي من غير قاعدة (`!DB`) بيرجّع `null`/فاضي **بس**. ممنوع بيانات
 *   عرض وهمية هنا (قرار المالك ٢٠٢٦-٠٩-٢٧) — الشاشة تختفي أحسن من إنها
 *   تكدب. الاستثناء الوحيد `api-mock.ts`، ومفيش قضايا فيه.
 */
import { supabase, hasSupabase } from '@/lib/supabase'

const DB = hasSupabase

/* ============================================================ الأنواع */

export type CaseAct = 'setup' | 'arrive' | 'act1' | 'break1' | 'act2' | 'break2' | 'final' | 'done'
export type CaseRole = 'detective' | 'suspect' | 'watcher'
export type CaseShape = 'single' | 'double' | 'vault'

export interface CaseState {
  sessionId: string
  act: CaseAct
  actStartedAt: string | null
  started: boolean
  worldSlug: string
  worldName: string
  theme: 'mono' | 'dark' | 'warm'
  codenames: boolean
  detectiveName: string
  suspectName: string
  hasAct2Event: boolean
  caseSlug: string
  caseTitle: string
  shape: CaseShape
  intro: string
  joined: number
  players: number
  iAmIn: boolean
  iAmHost: boolean
  outcome: string | null
  cardSeconds: number
  hintAfterMin: number
  talkMin: number
}

export interface CaseMyRole {
  role: CaseRole
  card: string | null
  codename: string | null
  mission: string | null
  missionDone: boolean | null
  arriveOrder: number | null
  partnerCodename: string | null
}

/** ملف القضية — الدوسيه اللي المجموعة بتقراه. ⚠ مفيهوش الحل. */
export interface CaseFileDoc {
  fileNo: string
  caseTitle: string
  worldName: string
  theme: string
  report: string
  scene: string
  goal: string
  intro: string
  shape: CaseShape
  act: CaseAct
  started: boolean
  ended: boolean
  detectiveName: string
  suspectName: string
}

/** الملف الكامل للوحة — فيه كارت المتهم والنهايتين. `cases.view` بس. */
export interface CasePreviewDoc extends Omit<CaseFileDoc, 'fileNo' | 'act' | 'started' | 'ended'> {
  detectiveCard: string
  suspectCard: string
  act2Event: string | null
  winEnding: string
  escapeEnding: string
  twist: string | null
  minPlayers: number
  hasAct2Event: boolean
}

export interface CaseQuestion {
  questionId: string
  question: string
  options: { optionId: string; value: string; label: string; mine: boolean }[]
}

export interface CaseClue {
  act: number
  slot: number
  text: string
  appliesTo: number
}

export interface CasePlayer {
  profileId: string
  name: string
  codename: string | null
  arriveOrder: number | null
  isMe: boolean
}

export interface CaseVoteState {
  round: number
  voted: number
  players: number
  everyoneVoted: boolean
  myTarget: string | null
  open: boolean
}

export interface CaseResult {
  outcome: string
  suspectName: string
  suspectIsMe: boolean
  suspectCodename: string | null
  ending: string
  twist: string | null
  mission: string | null
  missionDone: boolean | null
  worldName: string
  theme: string
  caseTitle: string
}

export interface CaseLie {
  question: string
  said: string
  truthHint: string
}

export interface CaseAward {
  name: string
  title: string
  rule: string
  isMe: boolean
  points: number
}

export interface CaseVaultRiddle {
  slot: number
  riddle: string
  hint: string | null
  hintOpen: boolean
  solved: boolean
  tries: number
}

export interface CaseMyPoints {
  points: number
  titles: { key: string; name_ar: string; n: number }[]
}

/* ======================================================== أدوات صغيرة */

const row = (data: unknown): Record<string, unknown> | null => {
  const r = Array.isArray(data) ? data[0] : data
  return (r ?? null) as Record<string, unknown> | null
}
const rows = (data: unknown): Record<string, unknown>[] =>
  (Array.isArray(data) ? data : []) as Record<string, unknown>[]

const s = (v: unknown): string => String(v ?? '')
const sOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : String(v))
const n = (v: unknown, d = 0): number => (v === null || v === undefined ? d : Number(v))

/* =========================================================== الحالة */

export async function getCaseState(sbotaId: string): Promise<CaseState | null> {
  if (!DB) return null
  const { data, error } = await supabase().rpc('fn_case_state', { s_id: sbotaId })
  if (error) return null
  const r = row(data)
  if (!r) return null
  return {
    sessionId: s(r.session_id),
    act: s(r.act) as CaseAct,
    actStartedAt: sOrNull(r.act_started_at),
    started: Boolean(r.started),
    worldSlug: s(r.world_slug),
    worldName: s(r.world_name_ar),
    theme: (s(r.theme) || 'mono') as CaseState['theme'],
    codenames: Boolean(r.codenames),
    detectiveName: s(r.detective_name_ar),
    suspectName: s(r.suspect_name_ar),
    hasAct2Event: Boolean(r.has_act2_event),
    caseSlug: s(r.case_slug),
    caseTitle: s(r.case_title_ar),
    shape: (s(r.shape) || 'single') as CaseShape,
    intro: s(r.intro_ar),
    joined: n(r.joined),
    players: n(r.players),
    iAmIn: Boolean(r.i_am_in),
    iAmHost: Boolean(r.i_am_host),
    outcome: sOrNull(r.outcome),
    cardSeconds: n(r.card_seconds, 5),
    hintAfterMin: n(r.hint_after_min, 10),
    talkMin: n(r.talk_min, 5),
  }
}

/* ======================================================== ملف القضية */

/**
 * الدوسيه للاعب: البلاغ ومسرح الواقعة والمطلوب.
 *
 * ⚠ **الأدلة مش هنا** — بتيجي من `getCaseClues` اللي بترجّع المفتوح لحد
 *   الفصل الحالي بس. لو اتجمّعوا في دالة واحدة، أول واحد ينسى الحارس
 *   هيبعت التلاتة مع بعض.
 */
export async function getCaseFile(sbotaId: string): Promise<CaseFileDoc | null> {
  if (!DB) return null
  const { data, error } = await supabase().rpc('fn_case_file', { s_id: sbotaId })
  if (error) return null
  const r = row(data)
  if (!r) return null
  return {
    fileNo: s(r.file_no),
    caseTitle: s(r.case_title_ar),
    worldName: s(r.world_name_ar),
    theme: s(r.theme),
    report: s(r.report_ar),
    scene: s(r.scene_ar),
    goal: s(r.goal_ar),
    intro: s(r.intro_ar),
    shape: (s(r.shape) || 'single') as CaseShape,
    act: s(r.act) as CaseAct,
    started: Boolean(r.started),
    ended: Boolean(r.ended),
    detectiveName: s(r.detective_name_ar),
    suspectName: s(r.suspect_name_ar),
  }
}

/** معاينة الملف الكامل — للوحة بس (`cases.view`). بترجّع null لأي حد تاني. */
export async function getCasePreview(slug: string): Promise<CasePreviewDoc | null> {
  if (!DB) return null
  const { data, error } = await supabase().rpc('fn_case_preview', { p_slug: slug })
  if (error) return null
  const r = row(data)
  if (!r) return null
  return {
    caseTitle: s(r.case_title_ar),
    worldName: s(r.world_name_ar),
    theme: s(r.theme),
    report: s(r.report_ar),
    scene: s(r.scene_ar),
    goal: s(r.goal_ar),
    intro: s(r.intro_ar),
    shape: (s(r.shape) || 'single') as CaseShape,
    detectiveName: s(r.detective_name_ar),
    suspectName: s(r.suspect_name_ar),
    detectiveCard: s(r.detective_card_ar),
    suspectCard: s(r.suspect_card_ar),
    act2Event: sOrNull(r.act2_event_ar),
    winEnding: s(r.win_ending_ar),
    escapeEnding: s(r.escape_ending_ar),
    twist: sOrNull(r.twist_ar),
    minPlayers: n(r.min_players),
    hasAct2Event: Boolean(r.has_act2_event),
  }
}

/* ====================================================== يوم الكشف */

/** الـ١٢ سؤال بتوع الخروجة دي مجمّعة باختياراتها. ⚠ من غير نص التلميح. */
export async function getCaseQuestions(sbotaId: string): Promise<CaseQuestion[]> {
  if (!DB) return []
  const { data, error } = await supabase().rpc('fn_case_questions', { s_id: sbotaId })
  if (error) return []
  const byId = new Map<string, CaseQuestion>()
  for (const r of rows(data)) {
    const qid = s(r.question_id)
    if (!byId.has(qid)) byId.set(qid, { questionId: qid, question: s(r.question_ar), options: [] })
    byId.get(qid)!.options.push({
      optionId: s(r.option_id),
      value: s(r.option_value),
      label: s(r.option_label_ar),
      mine: Boolean(r.my_choice),
    })
  }
  return [...byId.values()]
}

export async function answerCase(sbotaId: string, optionId: string): Promise<string | null> {
  if (!DB) return 'مش متاح'
  const { error } = await supabase().rpc('fn_case_answer', { s_id: sbotaId, p_option_id: optionId })
  return error ? error.message : null
}

export async function getCaseAnswered(
  sbotaId: string,
): Promise<{ answered: number; players: number; mine: number } | null> {
  if (!DB) return null
  const { data, error } = await supabase().rpc('fn_case_answered_count', { s_id: sbotaId })
  if (error) return null
  const r = row(data)
  if (!r) return null
  return { answered: n(r.answered), players: n(r.players), mine: n(r.mine) }
}

/* ========================================== سؤال اللبس (ما يتكدبش فيه) */

export async function getCaseObserveQ(sbotaId: string): Promise<CaseQuestion | null> {
  if (!DB) return null
  const { data, error } = await supabase().rpc('fn_case_observe_q', { s_id: sbotaId })
  if (error) return null
  const list = rows(data)
  if (!list.length) return null
  return {
    questionId: s(list[0].question_id),
    question: s(list[0].question_ar),
    options: list.map((r) => ({
      optionId: s(r.option_id),
      value: '',
      label: s(r.option_label_ar),
      mine: Boolean(r.my_choice),
    })),
  }
}

export async function observeCase(sbotaId: string, optionId: string): Promise<string | null> {
  if (!DB) return 'مش متاح'
  const { error } = await supabase().rpc('fn_case_observe', { s_id: sbotaId, p_option_id: optionId })
  return error ? error.message : null
}

/* ============================================================ الدخول */

export async function joinCase(sbotaId: string, code: string): Promise<string | null> {
  if (!DB) return 'مش متاح'
  const { error } = await supabase().rpc('fn_case_join', { s_id: sbotaId, p_code: code })
  return error ? error.message : null
}

export async function watchCase(sbotaId: string): Promise<string | null> {
  if (!DB) return 'مش متاح'
  const { error } = await supabase().rpc('fn_case_watch', { s_id: sbotaId })
  return error ? error.message : null
}

/* ===================================================== 🔴 دوري أنا */

export async function getMyCaseRole(sbotaId: string): Promise<CaseMyRole | null> {
  if (!DB) return null
  const { data, error } = await supabase().rpc('fn_case_my_role', { s_id: sbotaId })
  if (error) return null
  const r = row(data)
  if (!r) return null
  return {
    role: s(r.role) as CaseRole,
    card: sOrNull(r.card_ar),
    codename: sOrNull(r.codename_ar),
    mission: sOrNull(r.mission_ar),
    missionDone: r.mission_done === null || r.mission_done === undefined ? null : Boolean(r.mission_done),
    arriveOrder: r.arrive_order === null || r.arrive_order === undefined ? null : n(r.arrive_order),
    partnerCodename: sOrNull(r.partner_codename_ar),
  }
}

export async function getCaseClues(sbotaId: string): Promise<CaseClue[]> {
  if (!DB) return []
  const { data, error } = await supabase().rpc('fn_case_clues', { s_id: sbotaId })
  if (error) return []
  return rows(data).map((r) => ({
    act: n(r.act),
    slot: n(r.slot, 1),
    text: s(r.text_ar),
    appliesTo: n(r.applies_to),
  }))
}

export async function getCasePlayers(sbotaId: string): Promise<CasePlayer[]> {
  if (!DB) return []
  const { data, error } = await supabase().rpc('fn_case_players_list', { s_id: sbotaId })
  if (error) return []
  return rows(data).map((r) => ({
    profileId: s(r.profile_id),
    name: s(r.name),
    codename: sOrNull(r.codename_ar),
    arriveOrder: r.arrive_order === null || r.arrive_order === undefined ? null : n(r.arrive_order),
    isMe: Boolean(r.is_me),
  }))
}

/* =========================================================== التصويت */

export async function voteCase(sbotaId: string, targetId: string): Promise<string | null> {
  if (!DB) return 'مش متاح'
  const { error } = await supabase().rpc('fn_case_vote', { s_id: sbotaId, p_target: targetId })
  return error ? error.message : null
}

export async function getCaseVoteState(sbotaId: string): Promise<CaseVoteState | null> {
  if (!DB) return null
  const { data, error } = await supabase().rpc('fn_case_vote_state', { s_id: sbotaId })
  if (error) return null
  const r = row(data)
  if (!r) return null
  return {
    round: n(r.round),
    voted: n(r.voted),
    players: n(r.players),
    everyoneVoted: Boolean(r.everyone_voted),
    myTarget: sOrNull(r.my_target),
    open: Boolean(r.open),
  }
}

/* ============================================ المتهم: الكدبة والمهمة */

export async function markCaseLie(
  sbotaId: string,
  questionId: string,
  lied: boolean,
): Promise<string | null> {
  if (!DB) return 'مش متاح'
  const { error } = await supabase().rpc('fn_case_mark_lie', {
    s_id: sbotaId,
    p_question: questionId,
    p_lied: lied,
  })
  return error ? error.message : null
}

export async function setCaseMissionDone(sbotaId: string, done: boolean): Promise<string | null> {
  if (!DB) return 'مش متاح'
  const { error } = await supabase().rpc('fn_case_mission_done', { s_id: sbotaId, p_done: done })
  return error ? error.message : null
}

/* ============================================================ الختام */

export async function getCaseResult(sbotaId: string): Promise<CaseResult | null> {
  if (!DB) return null
  const { data, error } = await supabase().rpc('fn_case_result', { s_id: sbotaId })
  if (error) return null
  const r = row(data)
  if (!r) return null
  return {
    outcome: s(r.outcome),
    suspectName: s(r.suspect_name),
    suspectIsMe: Boolean(r.suspect_is_me),
    suspectCodename: sOrNull(r.suspect_codename_ar),
    ending: s(r.ending_ar),
    twist: sOrNull(r.twist_ar),
    mission: sOrNull(r.mission_ar),
    missionDone: r.mission_done === null || r.mission_done === undefined ? null : Boolean(r.mission_done),
    worldName: s(r.world_name_ar),
    theme: s(r.theme),
    caseTitle: s(r.case_title_ar),
  }
}

export async function getCaseLies(sbotaId: string): Promise<CaseLie[]> {
  if (!DB) return []
  const { data, error } = await supabase().rpc('fn_case_lies', { s_id: sbotaId })
  if (error) return []
  return rows(data).map((r) => ({
    question: s(r.question_ar),
    said: s(r.said_ar),
    truthHint: s(r.truth_hint_ar),
  }))
}

export async function getCaseAwards(sbotaId: string): Promise<CaseAward[]> {
  if (!DB) return []
  const { data, error } = await supabase().rpc('fn_case_awards', { s_id: sbotaId })
  if (error) return []
  return rows(data).map((r) => ({
    name: s(r.name),
    title: s(r.title_ar),
    rule: s(r.rule_ar),
    isMe: Boolean(r.is_me),
    points: n(r.points),
  }))
}

export async function getMyCasePoints(): Promise<CaseMyPoints | null> {
  if (!DB) return null
  const { data, error } = await supabase().rpc('fn_case_my_points')
  if (error) return null
  const r = row(data)
  if (!r) return null
  const raw = r.titles
  const titles = Array.isArray(raw) ? (raw as CaseMyPoints['titles']) : []
  return { points: n(r.points), titles }
}

/* ============================================================ الخزنة */

export async function getCaseVault(sbotaId: string): Promise<CaseVaultRiddle[]> {
  if (!DB) return []
  const { data, error } = await supabase().rpc('fn_case_vault', { s_id: sbotaId })
  if (error) return []
  return rows(data).map((r) => ({
    slot: n(r.slot),
    riddle: s(r.riddle_ar),
    hint: sOrNull(r.hint_ar),
    hintOpen: Boolean(r.hint_open),
    solved: Boolean(r.solved),
    tries: n(r.tries),
  }))
}

export async function tryCaseVault(
  sbotaId: string,
  digits: number[],
): Promise<{ ok: boolean; error: string | null }> {
  if (!DB) return { ok: false, error: 'مش متاح' }
  const { data, error } = await supabase().rpc('fn_case_vault_try', {
    s_id: sbotaId,
    p_digits: digits,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: Boolean(data), error: null }
}

/* ================================================= صاحب الخروجة فقط */

export async function getCaseCode(sbotaId: string): Promise<string | null> {
  if (!DB) return null
  const { data, error } = await supabase().rpc('fn_case_code', { s_id: sbotaId })
  if (error || !data) return null
  return String(data)
}

export async function openCase(sbotaId: string): Promise<string | null> {
  if (!DB) return 'مش متاح'
  const { error } = await supabase().rpc('fn_case_open', { s_id: sbotaId })
  return error ? error.message : null
}

/**
 * توزيع الأدوار. الشكل بيحدّد الدالة — والواجهة **ما بتختارش**، بتمرّر
 * اللي `fn_case_state` قالته. ده بيمنع إننا نسأل «شكلها إيه؟» في مكانين.
 */
export async function buildCase(sbotaId: string, shape: CaseShape): Promise<string | null> {
  if (!DB) return 'مش متاح'
  const fn =
    shape === 'vault' ? 'fn_case_build_vault' : shape === 'double' ? 'fn_case_build_double' : 'fn_case_build'
  const { error } = await supabase().rpc(fn, { s_id: sbotaId })
  return error ? error.message : null
}

export async function nextCaseAct(sbotaId: string): Promise<string | null> {
  if (!DB) return 'مش متاح'
  const { error } = await supabase().rpc('fn_case_next_act', { s_id: sbotaId })
  return error ? error.message : null
}

export async function finishCase(sbotaId: string, shape: CaseShape): Promise<string | null> {
  if (!DB) return 'مش متاح'
  const fn =
    shape === 'vault' ? 'fn_case_vault_close' : shape === 'double' ? 'fn_case_finish_double' : 'fn_case_finish'
  const { error } = await supabase().rpc(fn, { s_id: sbotaId })
  return error ? error.message : null
}

export async function setCaseLosers(sbotaId: string, losers: string[]): Promise<string | null> {
  if (!DB) return 'مش متاح'
  const { error } = await supabase().rpc('fn_case_set_losers', { s_id: sbotaId, p_losers: losers })
  return error ? error.message : null
}

export async function setCaseGames(sbotaId: string, count: number): Promise<string | null> {
  if (!DB) return 'مش متاح'
  const { error } = await supabase().rpc('fn_case_set_games', { s_id: sbotaId, p_n: count })
  return error ? error.message : null
}
