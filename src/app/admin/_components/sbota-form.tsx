'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { sbotaLink } from '@/lib/sbota-link'
import {
  Card,
  Btn,
  SelectField,
  Toggle,
  cairoToIso,
  dayAdd,
  todayCairo,
} from '@/components/admin-ui'

/**
 * فورم «خروجة جديدة» — مصدر واحد للوحة.
 *
 * بيتفتح من مكانين: «السبوطات» (تختار القالب من قايمة) وجوه القالب نفسه في
 * «القوالب» (القالب متحدد، والصور والكلام فوقه في نفس الكارت). كان في
 * «السبوطات» بس، والمالك قال إن التنقل بين القسمين بيتوّهه (٢٠٢٦-١٠-٠١).
 *
 * الإشعارات مش هنا — هي محفّزات في القاعدة وبتشتغل لوحدها مهما كان الطريق:
 *   - تنزل «مفتوحة» ← اللي داسوا «قولّي لما تفتح» على القالب بيوصلهم إيميل (0117).
 *   - تنزل «مقترحة» ← كل «أنا جاي» بيوصل تليجرام، و«افتح الحجز» بيبعتلهم (0127).
 * والحاجة الوحيدة اللي الفورم بيعملها بنفسه: إيميل جماعي اختياري للأعضاء
 * (`fn_send_broadcast` — بنفس صلاحيتها، والقاعدة هي اللي بتحكم).
 */

export interface FormTemplate {
  id: string
  name_ar: string
  slug?: string
  default_price: number
  org_fee: number
  duration_min: number
  min_group: number
  max_group: number
  is_day: boolean
  girls_only: boolean
  hero_photos?: string[]
}

export interface FormCaptain {
  id: string
  display_name: string | null
  bio_line: string
  is_active: boolean
}

/**
 * مناطق الخريطة — الكبسولات اللي بتخلي اللي تكتبه يوصل لكتلة على الخريطة.
 *
 * ⚠ السبوطة بتوصل لكتلتها على `/map` بمطابقة **اسم المنطقة**. ولما المطابقة
 *    بتفشل السبوطة بتختفي من الخريطة من غير أي رسالة — ده اللي كان حاصل
 *    للتلات سبوطات المفتوحة. الكود بقى فيه كتلة أخيرة بتلم اللي مش معروف،
 *    بس أحسن حاجة إنك تدوس على المنطقة من هنا: الاسم بيبقى مظبوط والكود
 *    بيتحط معاه، فالسبوطة بتقع في مكانها بالظبط.
 */
function useMapAreas() {
  const [rows, setRows] = useState<
    { key: string; label: string; area: string | null; far: boolean }[]
  >([])
  useEffect(() => {
    let alive = true
    void supabase()
      .from('map_areas')
      .select('key, label_ar, area, is_far, is_mystery, w')
      .eq('is_active', true)
      .order('sort', { ascending: true })
      .then((res: { data: MapAreaRow[] | null }) => {
        if (!alive) return
        setRows(
          (res.data ?? [])
            .filter((r) => !r.is_mystery && (r.w > 0 || r.is_far))
            .map((r) => ({
              key: r.key,
              label: r.label_ar,
              area: r.area,
              far: r.is_far,
            })),
        )
      })
    return () => {
      alive = false
    }
  }, [])
  return rows
}

interface MapAreaRow {
  key: string
  label_ar: string
  area: string | null
  is_far: boolean
  is_mystery: boolean
  w: number
}

export function AreaChips({
  value,
  onPick,
}: {
  value: string
  onPick: (label: string, area: string | null) => void
}) {
  const areas = useMapAreas()
  if (!areas.length) return null
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {areas.map((a) => {
        const on = value.trim() === a.label
        return (
          <button
            key={a.key}
            type="button"
            onClick={() => onPick(a.label, a.area)}
            className="min-h-[32px] cursor-pointer rounded-pill px-3 font-display text-13 font-black"
            style={{
              background: on ? '#F4632A' : 'transparent',
              color: on ? '#14161A' : 'var(--fg)',
              border: `2px solid ${on ? '#F4632A' : 'var(--line)'}`,
              opacity: a.far ? 0.75 : 1,
            }}
          >
            {a.label}
          </button>
        )
      })}
    </div>
  )
}

export function Inp({
  label,
  type = 'text',
  value,
  onChange,
  hint,
  className,
  placeholder,
}: {
  label?: string
  type?: string
  value: string
  onChange: (v: string) => void
  hint?: string
  className?: string
  /** بيوري اللي هييجي من القالب لو الخانة اتسابت فاضية */
  placeholder?: string
}) {
  return (
    <label className="flex flex-col gap-1">
      {label && (
        <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
          {label}
        </span>
      )}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`rounded-14 px-3 py-2 font-body text-16 ${className ?? ''}`}
        style={{
          background: 'var(--bg)',
          color: 'var(--fg)',
          border: '2px solid var(--line)',
        }}
      />
      {hint && (
        <span className="font-body text-12" style={{ color: 'var(--muted)' }}>
          {hint}
        </span>
      )}
    </label>
  )
}

/* ============================================================ خروجة جديدة */

/** الحالة اللي الخروجة بتنزل بيها — «مقترحة» الأول بقصد (درس بادل ١٠-٠١) */
const START_AS = [
  { value: 'proposed', label: 'مقترحة — نجمع «أنا جاي» الأول' },
  { value: 'open', label: 'مفتوحة للحجز على طول' },
  { value: 'draft', label: 'مسودة — محدش يشوفها لسه' },
]

const START_HINT: Record<string, string> = {
  proposed:
    'بتبان للناس بزرار «أنا جاي لو اتعملت» من غير دفع. كل واحد يدوس بيجيلك تليجرام، ولما العدد يكمل تدوس «افتح الحجز» في «السبوطات» فيوصلهم إيميل.',
  open: 'الحجز بيفتح على طول. اللي داسوا «قولّي لما تفتح» على القالب ده بيوصلهم إيميل لوحده.',
  draft: 'محدش بيشوفها لحد ما تغيّر حالتها من «السبوطات».',
}

/** «السبت ٣ أكتوبر الساعة ٧ بالليل» بتوقيت القاهرة — للإيميل */
function niceWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ar-EG', {
      timeZone: 'Africa/Cairo',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return ''
  }
}

export function NewSbota({
  templates,
  captains = [],
  fixedTemplateId,
  canBroadcast = false,
  flash,
  onDone,
}: {
  templates: FormTemplate[]
  captains?: FormCaptain[]
  /** من جوه القالب: القالب متحدد ومفيش قايمة */
  fixedTemplateId?: string
  /** صلاحية `notifications.broadcast` — من غيرها خانة الإيميل ما بتظهرش */
  canBroadcast?: boolean
  flash: (m: string) => void
  onDone: (newId?: string) => Promise<void>
}) {
  const [templateId, setTemplateId] = useState(fixedTemplateId ?? '')
  const [titleAr, setTitleAr] = useState('')
  const [venueNameAr, setVenueNameAr] = useState('')
  const [addressAr, setAddressAr] = useState('')
  const [signAr, setSignAr] = useState('')
  const [areaLabelAr, setAreaLabelAr] = useState('')
  // كود المنطقة بيتحط بس لما تدوس على كبسولة — الكتابة الحرة بتسيبه فاضي
  // والكود بيطابق بالاسم.
  const [areaKey, setAreaKey] = useState<string | null>(null)
  const [captainId, setCaptainId] = useState('')
  const [date, setDate] = useState(dayAdd(todayCairo(), 7))
  const [time, setTime] = useState('18:00')
  const [price, setPrice] = useState('')
  const [capacity, setCapacity] = useState('')
  const [minToRun, setMinToRun] = useState('4')
  const [duration, setDuration] = useState('120')
  const [girlsOnly, setGirlsOnly] = useState(false)
  const [isDay, setIsDay] = useState(false)
  const [isMystery, setIsMystery] = useState(false)
  const [startAs, setStartAs] = useState('proposed')
  const [mail, setMail] = useState(false)
  const [mailSubject, setMailSubject] = useState('')
  const [mailBody, setMailBody] = useState('')
  /** المالك عدّل نص الإيميل بإيده — ما نكتبش فوقه لما يغيّر الميعاد */
  const [mailTouched, setMailTouched] = useState(false)
  const [busy, setBusy] = useState(false)

  const tpl = templates.find((x) => x.id === templateId)
  const shownName = titleAr.trim() || tpl?.name_ar || ''

  /** أول ما تختار قالب بنملّي منه السعر والعدد والمدة — وتقدر تغيّرهم */
  function pickTemplate(id: string) {
    setTemplateId(id)
    const t = templates.find((x) => x.id === id)
    if (!t) return
    setPrice(String(Math.round(t.default_price / 100)))
    setCapacity(String(t.max_group))
    setMinToRun(String(t.min_group))
    setDuration(String(t.duration_min))
    setGirlsOnly(t.girls_only)
    setIsDay(t.is_day)
  }

  // من جوه القالب: نملّي القيم مرة واحدة أول ما الفورم يفتح
  useEffect(() => {
    if (fixedTemplateId) pickTemplate(fixedTemplateId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixedTemplateId])

  // نص الإيميل المقترح بيمشي ورا الاسم والميعاد والحالة لحد ما المالك يلمسه
  useEffect(() => {
    if (mailTouched || !shownName) return
    const at = date && time ? niceWhen(cairoToIso(date, time)) : ''
    const where = areaLabelAr.trim() ? ` في ${areaLabelAr.trim()}` : ''
    if (startAs === 'proposed') {
      setMailSubject(`خروجة جديدة: ${shownName} — جاي؟`)
      setMailBody(
        `يا {name}،\n\nبنفكّر نعمل «${shownName}» ${at}${where}، مع مجموعة صغيرة ناس جديدة.\n\nلو حابب تيجي دوس «أنا جاي لو اتعملت» — من غير دفع. لما العدد يكمل هنفتح الحجز ونبعتلك.`,
      )
    } else {
      setMailSubject(`اتفتح الحجز: ${shownName}`)
      setMailBody(
        `يا {name}،\n\nفتحنا الحجز في «${shownName}» ${at}${where}، مع مجموعة صغيرة ناس جديدة.\n\nالأماكن قليلة — احجز مكانك من اللينك.`,
      )
    }
  }, [shownName, date, time, areaLabelAr, startAs, mailTouched])

  async function create() {
    const t = templates.find((x) => x.id === templateId)
    if (!t) return flash('اختار القالب الأول')
    if (!date || !time) return flash('حدّد التاريخ والساعة')

    const cap = Math.round(Number(capacity) || 0)
    const min = Math.round(Number(minToRun) || 0)
    const dur = Math.round(Number(duration) || 0)
    if (cap < 2 || cap > 40) return flash('العدد لازم يكون من 2 لـ 40')
    if (min > cap) return flash('الحد الأدنى مينفعش يكون أكبر من العدد')
    if (dur < 1) return flash('المدة لازم تكون أكتر من صفر')

    const startsAt = cairoToIso(date, time)
    if (new Date(startsAt).getTime() <= Date.now()) return flash('الميعاد ده عدّى')
    const endsAt = new Date(new Date(startsAt).getTime() + dur * 60000).toISOString()
    const sendMail = mail && canBroadcast && startAs !== 'draft'
    if (sendMail && (!mailSubject.trim() || mailBody.trim().length < 10)) {
      return flash('اكتب عنوان ونص للإيميل، أو شيل علامة «ابعت إيميل»')
    }
    if (
      startAs === 'open' &&
      !confirm(`«${shownName}» هتنزل مفتوحة للحجز على طول — مش هتجمع «أنا جاي» الأول. تمام؟`)
    ) {
      return
    }

    setBusy(true)
    const { data, error } = await supabase()
      .from('sbotat')
      .insert({
        template_id: t.id,
        title_ar: titleAr.trim() || null,
        // المكان بيتكتب مش بيتختار — `venues` بقى فيه أماكن الشغل بس
        venue_id: null,
        venue_name_ar: venueNameAr.trim() || null,
        address_ar: addressAr.trim() || null,
        sign_ar: signAr.trim() || null,
        area_label_ar: areaLabelAr.trim() || null,
        area: areaKey,
        captain_id: captainId || null,
        starts_at: startsAt,
        ends_at: endsAt,
        price: Math.round(Number(price) || 0) * 100,
        org_fee: t.org_fee,
        capacity: cap,
        min_to_run: min,
        status: startAs,
        girls_only: girlsOnly,
        is_day: isDay,
        is_mystery: isMystery,
      })
      .select('id')
    const newId = (data as { id: string }[] | null)?.[0]?.id

    if (error || !newId) {
      setBusy(false)
      return flash(`مقدرناش نعمل الخروجة: ${error?.message ?? 'القاعدة رفضت الكتابة'}`)
    }

    let note =
      startAs === 'proposed'
        ? 'الخروجة نزلت «مقترحة» ✓ — هيجيلك تليجرام مع كل «أنا جاي»'
        : startAs === 'open'
          ? 'الخروجة نزلت مفتوحة للحجز ✓'
          : 'الخروجة اتعملت مسودة ✓ — غيّر حالتها من «السبوطات» لما تجهز'

    if (sendMail) {
      // اللينك لازم https (القاعدة بترفض غيره) — على التطوير المحلي بيتشال
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      const link =
        origin.startsWith('https://') && t.slug ? `${origin}/s/${sbotaLink(t.slug, newId)}` : null
      const { data: res, error: mailErr } = await supabase().rpc('fn_send_broadcast', {
        p_subject: mailSubject.trim(),
        p_body: mailBody.trim(),
        p_audience: 'all',
        p_sbota: null,
        p_link: link,
      })
      if (mailErr) {
        note += ` — بس الإيميل مااتبعتش: ${mailErr.message}`
      } else {
        const n = (res as { recipients?: number } | null)?.recipients ?? 0
        note += ` — وإيميل رايح لـ ${n} عضو خلال دقايق`
      }
    }

    setBusy(false)
    flash(note)
    await onDone(newId)
  }

  const activeCaptains = captains.filter((c) => c.is_active)
  const noPhotos = fixedTemplateId && tpl && (tpl.hero_photos ?? []).length === 0

  return (
    <Card
      title={fixedTemplateId ? 'خروجة جديدة من القالب ده' : 'سبوطة جديدة'}
      hint={
        fixedTemplateId
          ? 'الاسم والحدوتة والصور بييجوا من القالب اللي فوق. هنا الميعاد والمكان والسعر بتوع المرة دي بس.'
          : 'اختار القالب الأول — الاسم والحدوتة والصور والسعر والعدد كلهم بييجوا منه، وبعد كده غيّر اللي تحب.'
      }
    >
      {noPhotos && (
        <div className="mt-2 font-body text-13" style={{ color: '#F4632A' }}>
          القالب ده مفيهوش صور — الكارت هيبان من غير صورة. ارفع صورة في «صور السبوطة» فوق.
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-3">
        {!fixedTemplateId && (
          <SelectField
            label="القالب"
            value={templateId}
            onChange={pickTemplate}
            options={[
              { value: '', label: '— اختار قالب —' },
              ...templates.map((t) => ({ value: t.id, label: t.name_ar })),
            ]}
          />
        )}
        <Inp
          label="اسم الخروجة دي (اختياري)"
          value={titleAr}
          onChange={setTitleAr}
          placeholder={tpl?.name_ar ?? ''}
          className="w-full md:w-[300px]"
          hint="سيبه فاضي ياخد اسم القالب. اكتبه لو المرة دي مختلفة — «بادل بالليل»."
        />
        {activeCaptains.length > 0 && (
          <SelectField
            label="الكابتن"
            value={captainId}
            onChange={setCaptainId}
            options={[
              { value: '', label: '— من غير كابتن لسه —' },
              ...activeCaptains.map((c) => ({
                value: c.id,
                label: c.display_name ?? c.bio_line,
              })),
            ]}
          />
        )}
      </div>

      {/* المكان بيتكتب — القايمة اتشالت لأن `venues` بقى فيه أماكن الشغل بس */}
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <Inp
          label="اسم المكان"
          value={venueNameAr}
          onChange={setVenueNameAr}
          className="w-full md:w-[300px]"
          hint="زي ما الناس بتقوله — «كافيه البوسطة»."
        />
        <Inp
          label="العلامة (هيعرفوا بعض إزاي)"
          value={signAr}
          onChange={setSignAr}
          className="w-full md:w-[360px]"
          hint="«الترابيزة اللي عليها ورقة برتقالي». بتوصل للحاجزين مع كشف المجموعة بس — مش معروضة على الموقع."
        />
        <div className="w-full">
          <Inp
            label="اسم المنطقة اللي بيبان"
            value={areaLabelAr}
            onChange={(v) => {
              setAreaLabelAr(v)
              setAreaKey(null)
            }}
            hint="دوس على منطقة تحت — كده الخروجة بتبان على الخريطة في مكانها."
          />
          <AreaChips
            value={areaLabelAr}
            onPick={(label, area) => {
              setAreaLabelAr(label)
              setAreaKey(area)
            }}
          />
        </div>
      </div>

      <div className="mt-3">
        <label className="block font-body text-13" style={{ color: 'var(--muted)' }}>
          العنوان بالتفاصيل
        </label>
        <textarea
          value={addressAr}
          onChange={(e) => setAddressAr(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-12 p-3 font-body text-14"
          style={{
            background: 'var(--bg)',
            border: '2px solid var(--line)',
            color: 'inherit',
          }}
        />
        <div className="mt-1 font-body text-12" style={{ color: 'var(--muted)' }}>
          ما بيوصلش غير للي <b>دفع فعلًا</b>. رفع صورة تحويل مش كفاية — لازم تعتمده من «الفلوس».
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <Inp label="التاريخ" type="date" value={date} onChange={setDate} />
        <Inp label="الساعة (بتوقيت القاهرة)" type="time" value={time} onChange={setTime} />
        <Inp
          label="المدة (دقيقة)"
          type="number"
          value={duration}
          onChange={setDuration}
          className="w-[110px]"
        />
        <Inp
          label="السعر (جنيه)"
          type="number"
          value={price}
          onChange={setPrice}
          className="w-[120px]"
        />
        <Inp
          label="العدد"
          type="number"
          value={capacity}
          onChange={setCapacity}
          className="w-[100px]"
        />
        <Inp
          label="أقل عدد تمشي بيه"
          type="number"
          value={minToRun}
          onChange={setMinToRun}
          className="w-[110px]"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-6">
        <Toggle label="بنات بس" value={girlsOnly} onChange={setGirlsOnly} />
        <Toggle label="نهاري" value={isDay} onChange={setIsDay} />
        <Toggle
          label="غامضة"
          value={isMystery}
          onChange={setIsMystery}
          hint="المكان ما بيبانش غير قبلها بشوية."
        />
      </div>

      {/* تنزل بإيه + الإشعارات */}
      <div
        className="mt-4 flex flex-col gap-3 rounded-14 p-3"
        style={{ border: '2px dashed var(--line)' }}
      >
        <SelectField label="تنزل إزاي" value={startAs} onChange={setStartAs} options={START_AS} />
        <div className="font-body text-13" style={{ color: 'var(--muted)' }}>
          {START_HINT[startAs]}
        </div>

        {canBroadcast && startAs !== 'draft' && (
          <>
            <Toggle
              label="ابعت إيميل لكل الأعضاء إنها نزلت"
              value={mail}
              onChange={setMail}
              hint="اللي لغوا الأخبار مش بيوصلهم. وخلي بالك: Resend المجاني ١٠٠ إيميل في اليوم."
            />
            {mail && (
              <div className="flex flex-col gap-2">
                <Inp
                  label="عنوان الإيميل"
                  value={mailSubject}
                  onChange={(v) => {
                    setMailTouched(true)
                    setMailSubject(v)
                  }}
                  className="w-full"
                />
                <label className="flex flex-col gap-1">
                  <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
                    نص الإيميل — <b>{'{name}'}</b> بيتبدّل باسم كل واحد، واللينك بيتحط لوحده
                  </span>
                  <textarea
                    value={mailBody}
                    onChange={(e) => {
                      setMailTouched(true)
                      setMailBody(e.target.value)
                    }}
                    rows={6}
                    className="w-full rounded-12 p-3 font-body text-14"
                    style={{
                      background: 'var(--bg)',
                      border: '2px solid var(--line)',
                      color: 'inherit',
                    }}
                  />
                </label>
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Btn kind="primary" onClick={create} disabled={busy}>
          {busy ? 'ثانية واحدة…' : 'نزّل الخروجة'}
        </Btn>
        <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
          مواعيد قفل الحجز والكشف وفتح الشات القاعدة بتحسبها لوحدها.
        </span>
      </div>
    </Card>
  )
}
