import type { Persona } from '@/types'
import type { GameAnswers } from '@/types'

/**
 * حفظ إجابات اللعبة على الجهاز.
 *
 * الحساب نفسه اتنقل لـ src/lib/game-config.ts وبياخد إعداداته من القاعدة،
 * علشان الأسئلة والنقاط تتعدّل من اللوحة من غير نشر.
 */

/** الاسم بصيغة النوع الصح */
export function personaName(p: Persona, gender?: string) {
  return gender === 'بنت' ? p.nameF : p.name
}

export const GAME_KEY = 'nasbot-game'

export function saveAnswers(a: GameAnswers) {
  try {
    localStorage.setItem(GAME_KEY, JSON.stringify(a))
  } catch {
    /* التخزين مقفول — مش مشكلة، اللعبة بتكمل في الذاكرة */
  }
}

export function loadAnswers(): GameAnswers {
  try {
    const raw = localStorage.getItem(GAME_KEY)
    return raw ? (JSON.parse(raw) as GameAnswers) : {}
  } catch {
    return {}
  }
}
