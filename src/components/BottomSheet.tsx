'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { useT } from '@/components/CopyProvider'

/**
 * نافذة سفلية — بتطلع من تحت، بخلفية الوضع وزوايا 20 فوق.
 * بتتقفل بالـ Escape وبالضغط على الخلفية، والتركيز بيتحبس جواها.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    ref.current?.focus()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label={t('shared.label.1')}
        onClick={onClose}
        className="absolute inset-0 cursor-pointer border-0"
        style={{ background: 'rgba(20,22,26,.6)' }}
      />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative max-h-[85vh] w-full max-w-[720px] overflow-y-auto p-5 pb-8 outline-none"
        style={{
          background: 'var(--bg)',
          color: 'var(--fg)',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          borderTop: '2px solid var(--line)',
        }}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="m-0 font-display text-24 font-black">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('shared.label.1')}
            className="grid h-[44px] w-[44px] cursor-pointer place-items-center border-0 bg-transparent font-display text-24 font-black"
            style={{ color: 'var(--fg)' }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
