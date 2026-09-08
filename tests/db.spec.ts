import { test, expect } from '@playwright/test'

/**
 * اختبارات القاعدة الحقيقية — بتشتغل على REST مباشرة، مش على الواجهة.
 * بتتخطى نفسها لو المفاتيح مش موجودة، علشان الاختبارات تفضل تعدي
 * على أي جهاز من غير إعداد.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

test.describe('القاعدة الحقيقية', () => {
  test.skip(!URL || !KEY, 'مفيش مفاتيح Supabase — الاختبارات دي بتتخطى')

  const h = { apikey: KEY!, authorization: `Bearer ${KEY}` }

  test('الزائر بيشوف السبوطات المعروضة بس', async ({ request }) => {
    const res = await request.get(`${URL}/rest/v1/sbotat_public?select=slug,name_ar,area,status`, {
      headers: h,
    })
    expect(res.status()).toBe(200)
    const rows = await res.json()
    expect(Array.isArray(rows)).toBe(true)
    expect(rows.length).toBeGreaterThan(0)
    // كلها في حالات العرض العام بس
    for (const r of rows) {
      expect(['open', 'full', 'locked', 'running']).toContain(r.status)
      expect(r.area).toBeTruthy()
    }
  })

  test('العرض العام مفيهوش عنوان ولا إحداثيات أصلًا', async ({ request }) => {
    // مش مجرد null — الأعمدة دي مش موجودة في العرض خالص.
    // مصدر العنوان الوحيد هو fn_sbota_address وهي بتتحقق من الحجز المدفوع.
    for (const col of ['address', 'map_lat', 'map_lng', 'venue_name']) {
      const res = await request.get(`${URL}/rest/v1/sbotat_public?select=${col}`, { headers: h })
      expect(res.status(), `العمود ${col} لسه موجود في العرض العام`).toBe(400)
    }

    // وكل الأعمدة المتاحة مفيهاش أي حاجة حساسة
    const all = await (
      await request.get(`${URL}/rest/v1/sbotat_public?select=*&limit=1`, { headers: h })
    ).json()
    const keys = Object.keys(all[0] ?? {})
    for (const bad of ['address', 'map_lat', 'map_lng', 'venue_name']) {
      expect(keys).not.toContain(bad)
    }
  })

  test('العنوان مرفوض للزائر عبر الدالة كمان', async ({ request }) => {
    const list = await (
      await request.get(`${URL}/rest/v1/sbotat_public?select=id&limit=1`, { headers: h })
    ).json()
    const res = await request.post(`${URL}/rest/v1/rpc/fn_sbota_address`, {
      headers: { ...h, 'content-type': 'application/json' },
      data: { s_id: list[0].id },
    })
    // الزائر مش مسموحله ينادي الدالة أصلًا
    expect(res.status()).toBeGreaterThanOrEqual(400)
  })

  test('«مين حاجز» بترجّع أرقام بس من غير أسامي', async ({ request }) => {
    const list = await (
      await request.get(`${URL}/rest/v1/sbotat_public?select=id&limit=1`, { headers: h })
    ).json()
    const res = await request.post(`${URL}/rest/v1/rpc/fn_who_booked`, {
      headers: { ...h, 'content-type': 'application/json' },
      data: { s_id: list[0].id },
    })
    expect(res.status()).toBe(200)
    const rows = await res.json()
    const row = Array.isArray(rows) ? rows[0] : rows
    // أرقام بس — مفيش أي حقل فيه اسم أو معرّف شخص
    expect(Object.keys(row).sort()).toEqual(
      ['age_max', 'age_min', 'booked', 'boys', 'first_timers', 'girls', 'returning_count', 'total'].sort()
    )
  })

  test('الجداول الحساسة مقفولة على الزائر', async ({ request }) => {
    for (const t of ['profiles', 'messages', 'pair_affinity', 'payments', 'wallet_ledger', 'bookings']) {
      const res = await request.get(`${URL}/rest/v1/${t}?select=*`, { headers: h })
      const body = await res.json()
      // يا إما ممنوع، يا إما صفر صفوف — المهم مفيش أي بيانات
      if (res.status() === 200) {
        expect(Array.isArray(body) ? body.length : 0, `${t} رجّع بيانات للزائر`).toBe(0)
      } else {
        expect(res.status()).toBeGreaterThanOrEqual(400)
      }
    }
  })

  test('otp_codes مرفوض تمامًا', async ({ request }) => {
    const res = await request.get(`${URL}/rest/v1/otp_codes?select=*`, { headers: h })
    expect(res.status()).toBeGreaterThanOrEqual(400)
  })

  test('الزائر ما يقدرش يكتب حجز', async ({ request }) => {
    const res = await request.post(`${URL}/rest/v1/bookings`, {
      headers: { ...h, 'content-type': 'application/json' },
      data: { sbota_id: '00000000-0000-0000-0000-000000000000', profile_id: '00000000-0000-0000-0000-000000000000' },
    })
    expect(res.status()).toBeGreaterThanOrEqual(400)
  })
})
