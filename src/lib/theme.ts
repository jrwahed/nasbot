import type { Theme, TimeOfDay } from '@/types'

export const THEME_KEY = 'nasbot-theme'

/**
 * الوضع الافتراضي حسب ساعة الجهاز:
 * من 5 صباحًا لـ 5 مساءً نهاري، غير كده ليلي.
 */
export function themeFromClock(d: Date = new Date()): Theme {
  const h = d.getHours()
  return h >= 5 && h < 17 ? 'day' : 'night'
}

export function timeOfDayNow(d: Date = new Date()): TimeOfDay {
  return themeFromClock(d)
}

/**
 * السكريبت اللي بيتحط في <head> علشان الوضع يتظبط قبل أول رسم —
 * من غير وميض ومن غير عدم تطابق مع الخادم.
 */
export const themeInitScript = `
(function(){
  try {
    var saved = localStorage.getItem(${JSON.stringify(THEME_KEY)});
    var h = new Date().getHours();
    var t = saved === 'day' || saved === 'night' ? saved : (h >= 5 && h < 17 ? 'day' : 'night');
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'night');
  }
})();
`.trim()
