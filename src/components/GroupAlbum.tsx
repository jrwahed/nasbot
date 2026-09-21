'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useT } from '@/components/CopyProvider'
import { PhotoPlaceholder } from '@/components/PhotoPlaceholder'
import { getAlbum, addAlbumPhoto, removeAlbumPhoto, type AlbumPhoto } from '@/lib/api'

/**
 * «صور الخروجة» — الألبوم اللي بيتفتح **بعد** ما الخروجة تخلص.
 *
 * الوجع: الخروجة بتخلص والصور بتفضل في تليفون كل واحد لوحده، وبعد يومين
 * الذكرى بتتبخّر ومفيش خيط شادّ للسبوطة اللي بعدها.
 *
 * 🔴 **الصور لأهل الخروجة دي بس** — قرار صاحب المشروع. والحارس في القاعدة
 *    (`fn_was_in_sbota`) هو اللي بينفّذه على الجدول والتخزين والدالة مع
 *    بعض. المكوّن ده **مش حارس** — لو القاعدة رجّعت فاضي، مفيش حاجة تتعرض.
 *
 * 🔴 **الاسم الأول وبس.** مفيش صورة بروفايل ولا منطقة ولا نوع شخصية.
 *    الدالة نفسها مش بترجّعهم أصلًا، وفيه فحص في `test_album()` بيفشل لو
 *    حد زوّد عمود.
 *
 * ⚠ والقسم كله **بيختفي** لو مفيش صور ومش قادر ترفع — مش إطار فاضي.
 */
export function GroupAlbum({ sbotaId, canAdd = true }: { sbotaId: string; canAdd?: boolean }) {
  const t = useT()
  const [photos, setPhotos] = useState<AlbumPhoto[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [caption, setCaption] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const rows = await getAlbum(sbotaId)
    setPhotos(rows)
  }, [sbotaId])

  useEffect(() => {
    let alive = true
    getAlbum(sbotaId).then((rows) => alive && setPhotos(rows))
    return () => {
      alive = false
    }
  }, [sbotaId])

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setFailed(false)
    const res = await addAlbumPhoto(sbotaId, file, caption)
    if (res.ok) {
      setCaption('')
      await load()
    } else {
      setFailed(true)
    }
    setBusy(false)
  }

  async function onRemove(p: AlbumPhoto) {
    const ok = await removeAlbumPhoto(p.id, p.path)
    if (ok) await load()
  }

  // لسه بيحمّل · أو القاعدة قالت «مش من حقك» ومفيش رفع → مفيش قسم أصلًا
  if (photos === null) return null
  if (photos.length === 0 && !canAdd) return null

  return (
    <section className="mt-[22px] rounded-20 p-5" style={{ background: '#EFE3CF', color: '#14161A' }}>
      <h2 className="m-0 font-display text-20 font-black">{t('album.title')}</h2>
      <div className="mt-1 font-body text-14" style={{ color: '#55575C' }}>{t('album.note')}</div>

      {photos.length === 0 ? (
        <div className="mt-3 font-body text-15">{t('album.empty')}</div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {photos.map((p) => (
            <figure key={p.id} className="m-0">
              <div className="overflow-hidden rounded-16" style={{ background: '#D9CBAF' }}>
                {p.src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.src}
                    alt={p.caption || t('album.title')}
                    className="block h-auto w-full"
                    loading="lazy"
                  />
                ) : (
                  <PhotoPlaceholder label={p.caption || t('album.title')} variant="sandDeep" />
                )}
              </div>
              <figcaption className="mt-[6px] font-body text-13" style={{ color: '#55575C' }}>
                {p.caption && <div style={{ color: '#14161A' }}>{p.caption}</div>}
                {/* الاسم الأول وبس — مفيش أي بيانات تانية */}
                <div>{p.isMine ? t('album.mine') : t('album.by', { name: p.byName })}</div>
                {p.isMine && (
                  <button
                    type="button"
                    onClick={() => onRemove(p)}
                    className="mt-1 cursor-pointer border-0 bg-transparent p-0 font-body text-13 underline"
                    style={{ color: '#F4632A' }}
                  >
                    {t('album.remove')}
                  </button>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {canAdd && (
        <div className="mt-4">
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder={t('album.caption')}
            maxLength={120}
            className="mb-2 w-full rounded-14 px-4 font-body text-15"
            style={{ minHeight: 48, background: '#FBF7EF', border: '2px solid #D9CBAF', color: '#14161A' }}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onPick}
            className="hidden"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="grid min-h-[48px] w-full cursor-pointer place-items-center rounded-14 border-0 font-display text-16 font-black"
            style={{ background: '#F4632A', color: '#14161A', opacity: busy ? 0.6 : 1 }}
          >
            {busy ? t('album.uploading') : t('album.add')}
          </button>
          {failed && (
            <div role="alert" className="mt-2 font-body text-14" style={{ color: '#C0392B' }}>
              {t('album.failed')}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
