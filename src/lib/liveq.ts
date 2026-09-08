'use client'

/**
 * حالة علامة الاستفهام الحية — مخزن صغير عالمي
 * علشان أي صفحة تقدر تخليها تنط (عند الحجز) أو تنام (لما شات يتقفل).
 */

export type QState = 'idle' | 'looking' | 'jump' | 'sleep'

let current: QState = 'idle'
const listeners = new Set<(s: QState) => void>()

export function getQState() {
  return current
}

export function setQState(s: QState) {
  current = s
  listeners.forEach((fn) => fn(s))
}

/** نطة قصيرة وبعدها بترجع idle */
export function qJump() {
  setQState('jump')
  setTimeout(() => {
    if (current === 'jump') setQState('idle')
  }, 700)
}

export function subscribeQ(fn: (s: QState) => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
