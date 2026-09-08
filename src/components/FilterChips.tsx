'use client'
import { useT } from '@/components/CopyProvider'

/**
 * الفلاتر — شريط بتمرير أفقي، الكبسولة المفعّلة برتقالي ومايلة -3.
 * القيم من data-dc-script في design/نسبوط.dc.html:
 * min-height 40 · padding 0 16 · border 2px · font 900 14 Rubik.
 *
 * الارتفاع 40 أقل من قاعدة الـ 44 لمس — بنسيب الشكل زي الملف
 * وبنزوّد مساحة لمس شفافة بـ .nb-touch-44 (راجع PLAN.md §11 بند 3).
 */
export function FilterChips({
  items,
  active,
  onPick,
  className = '',
}: {
  items: readonly string[]
  active: string
  onPick: (v: string) => void
  className?: string
}) {
  const t = useT()
  /**
   * حد الكبسولة غير المفعّلة: رملي زي الملف في الوضع الليلي (على خلفية سودا).
   * في الوضع النهاري الرملي على الكريمي مش بيبان — بنستخدم لون النص
   * (زي أزرار الاختيار في شاشة 8 في الملف).
   */
  const idleBorder = 'var(--chip-idle-border)'
  return (
    <div
      className={`nb-scroll-x gap-2 ${className}`}
      role="group"
      aria-label={t('shared.label.10')}
    >
      {items.map((label) => {
        const on = label === active
        return (
          <button
            key={label}
            type="button"
            onClick={() => onPick(label)}
            aria-pressed={on}
            className="nb-touch-44 shrink-0 cursor-pointer rounded-pill px-4 font-display text-14 font-black leading-none"
            style={{
              minHeight: 40,
              border: `2px solid ${on ? '#F4632A' : idleBorder}`,
              background: on ? '#F4632A' : 'transparent',
              color: on ? '#14161A' : 'var(--fg)',
              transform: on ? 'rotate(-3deg)' : undefined,
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
