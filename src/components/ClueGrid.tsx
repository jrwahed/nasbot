import type { Clue } from '@/types'
import { LockIcon } from '@/components/Icons'
import { useT } from '@/components/CopyProvider'

/**
 * الأدلة — 7 مربعات، واحد بيتفتح كل يوم قبل الميعاد.
 * المقفول عليه قفل SVG ومكتوب «بكرة».
 */
export function ClueGrid({ clues }: { clues: Clue[] }) {
  const t = useT()
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {clues.map((c) => (
        <div
          key={c.day}
          className="flex flex-col items-center justify-center gap-2 p-4 text-center"
          style={{
            aspectRatio: '1',
            borderRadius: 18,
            background: c.unlocked ? '#EFE3CF' : 'rgba(251,247,239,.10)',
            color: c.unlocked ? '#14161A' : '#FBF7EF',
            border: c.unlocked ? 'none' : '2px solid rgba(251,247,239,.25)',
          }}
        >
          {c.unlocked ? (
            <>
              <span className="font-display text-13 font-black" style={{ color: '#6B6455' }}>
                {c.label}
              </span>
              <span className="font-body text-13" style={{ color: '#6B6455' }}>
                {c.content}
              </span>
            </>
          ) : (
            <>
              <LockIcon size={26} stroke="#FBF7EF" />
              <span className="font-display text-15 font-black">{t('shared.text.14')}</span>
            </>
          )}
        </div>
      ))}
    </div>
  )
}
