'use client'

import { useEffect, useState } from 'react'
import { InnerHeader } from '@/components/Header'
import { CairoMap } from '@/components/CairoMap'
import { FilterChips } from '@/components/FilterChips'
import { mapFilters, mapFilterOptions } from '@/data/areas'
import { getSbotat } from '@/lib/api'
import type { Sbota } from '@/types'
import { useT } from '@/components/CopyProvider'

/**
 * الخريطة كاملة — كتل المناطق SVG والنقط بتنبض.
 * الكتل والنقط بقت من القاعدة — الشغل ده كله جوه CairoMap و src/lib/fields.ts
 * (مراجعة A5). الصفحة دي مسؤولة عن الفلاتر بس.
 */
export default function MapPage() {
  const t = useT()
  const [all, setAll] = useState<Sbota[]>([])
  const [filter, setFilter] = useState<string>(mapFilterOptions[0].label)

  useEffect(() => {
    getSbotat().then(setAll)
  }, [])

  // المقارنة بالـ id مش بالنص — النص ممكن يتغيّر من اللوحة، والـ id ثابت
  const activeId = mapFilterOptions.find((o) => o.label === filter)?.id ?? 'all'

  const shown = all.filter((s) => {
    if (activeId === 'day') return s.timeOfDay === 'day'
    if (activeId === 'night') return s.timeOfDay === 'night'
    if (activeId === 'girls') return s.girls
    return true
  })

  return (
    <main className="mx-auto w-full max-w-page px-5 pb-8">
      <InnerHeader back={t('map.label.1')} padded={false} />

      <h1 className="mb-0 mt-[10px] font-display text-30 font-black leading-[1.15]">{t('map.text.5')}</h1>
      <div className="mt-1" style={{ color: 'var(--muted)' }}>{t('map.text.4')}</div>

      <FilterChips
        items={mapFilters}
        active={filter}
        onPick={setFilter}
        className="pb-1 pt-4"
      />

      <CairoMap sbotat={shown} className="mt-4" />

      <div className="mt-4 flex flex-wrap gap-4 font-body text-14">
        <span className="flex items-center gap-2">
          <span
            className="inline-block"
            style={{ width: 12, height: 12, borderRadius: '50%', background: '#F4632A' }}
          />{t('map.text.3')}</span>
        <span className="flex items-center gap-2">
          <span
            className="inline-block"
            style={{ width: 12, height: 12, borderRadius: '50%', background: '#2B4CFF' }}
          />{t('map.text.2')}</span>
        <span style={{ color: 'var(--muted)' }}>{t('map.text.1')}</span>
      </div>
    </main>
  )
}
