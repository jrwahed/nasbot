import type { GameAnswers } from '@/types'

/**
 * شكل لعبة «مين جاي؟» كبيانات.
 *
 * الأسئلة والاختيارات والنقاط والأنواع كلها بتتقرا من القاعدة
 * (game_questions · game_options · game_option_scores · personality_types)
 * وبتتعدّل من لوحة التحكم. الكود هنا فيه المنطق بس:
 * إزاي بنجمع النقاط وإزاي بنكسر التعادل.
 */

export type GameKind = 'single' | 'multi' | 'text'

export interface GameOption {
  id: string
  label: string
  /** مفتاح الأيقونة — بيتحوّل لمكوّن في src/components/game-icons.ts */
  iconKey: string
  /** القيمة اللي بتتخزن في الإجابات (عادة نفس النص) */
  value: string
  /**
   * نقاط لكل نوع.
   * صفر معناها «رجّح النوع ده عند التعادل بس» — من غير ما يزوّد مجموعه.
   */
  scores: Record<string, number>
}

export interface GameQuestion {
  id: string
  /** q1 … q8 — المفتاح اللي بتتخزن بيه الإجابة */
  slot: string
  text: string
  kind: GameKind
  required: boolean
  progressLabel: string
  placeholder: string
  options: GameOption[]
}

export interface GameType {
  key: string
  name: string
  nameF: string
  line: string
  bg: string
  fg: string
}

export interface GameConfig {
  questions: GameQuestion[]
  types: GameType[]
}

/** الإجابة المخزّنة لسؤال — نص واحد أو قايمة (للأسئلة المتعددة) */
function pickedValues(answers: GameAnswers, slot: string): string[] {
  const a = (answers as Record<string, unknown>)[slot]
  if (Array.isArray(a)) return a.filter((x): x is string => typeof x === 'string')
  return typeof a === 'string' && a ? [a] : []
}

export interface Scored {
  type: GameType
  totals: Record<string, number>
  /** الأنواع اللي اتعادلت في الأول — فاضية لو مفيش تعادل */
  tied: string[]
  /** إيه اللي كسر التعادل: مفيش · ترجيح · ترتيب اللوحة */
  brokeBy: 'none' | 'bias' | 'order'
}

/**
 * بتحسب النتيجة وبترجّع التفاصيل كمان — اللوحة بتستعملها في المحاكي
 * علشان صاحب الموقع يشوف النقاط خطوة بخطوة.
 */
export function scoreAnswers(cfg: GameConfig, answers: GameAnswers): Scored {
  const totals: Record<string, number> = {}
  const bias: Record<string, number> = {}
  for (const t of cfg.types) totals[t.key] = 0

  for (const q of cfg.questions) {
    for (const value of pickedValues(answers, q.slot)) {
      const opt = q.options.find((o) => o.value === value)
      if (!opt) continue
      for (const [key, points] of Object.entries(opt.scores)) {
        if (!(key in totals)) continue
        if (points === 0) bias[key] = (bias[key] ?? 0) + 1
        else totals[key] += points
      }
    }
  }

  const first = cfg.types[0]
  const max = Math.max(0, ...Object.values(totals))

  // مفيش إجابات محسوبة — بنرجّع أول نوع بدل ما نكسر الصفحة
  if (max === 0) return { type: first, totals, tied: [], brokeBy: 'none' }

  const winners = cfg.types.filter((t) => totals[t.key] === max)
  if (winners.length === 1) {
    return { type: winners[0], totals, tied: [], brokeBy: 'none' }
  }

  const tied = winners.map((t) => t.key)
  const biased = winners.find((t) => (bias[t.key] ?? 0) > 0)
  if (biased) return { type: biased, totals, tied, brokeBy: 'bias' }

  // آخر حل: ترتيب الأنواع زي ما هو في اللوحة
  return { type: winners[0], totals, tied, brokeBy: 'order' }
}

export function resultFor(cfg: GameConfig, answers: GameAnswers): GameType {
  return scoreAnswers(cfg, answers).type
}
