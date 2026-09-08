import 'server-only'

/**
 * إرسال رسائل واتساب عبر واجهة الأعمال الرسمية، والبديل رسالة نصية.
 * لو مفيش مفاتيح: بيطبع في السجل بس (وضع التطوير) وبيرجّع ok
 * علشان المسار كله يتجرب من غير حساب حقيقي.
 */

export interface SendResult {
  ok: boolean
  ref?: string
  error?: string
  /** اتبعت فعلًا ولا اتطبع في السجل بس */
  simulated?: boolean
}

const TOKEN = process.env.WHATSAPP_TOKEN
const PHONE_ID = process.env.WHATSAPP_PHONE_ID

/** قالب مصادقة — الرمز بيتبعت كمعامل، مش كنص حر */
export async function sendAuthCode(to: string, code: string): Promise<SendResult> {
  const template = process.env.WHATSAPP_TEMPLATE_AUTH ?? 'nasbot_auth_code'

  if (!TOKEN || !PHONE_ID) {
    // eslint-disable-next-line no-console
    console.log(`[واتساب — محاكاة] الرمز ${code} للرقم ${to}`)
    return { ok: true, simulated: true }
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: template,
          language: { code: 'ar' },
          components: [
            { type: 'body', parameters: [{ type: 'text', text: code }] },
            {
              type: 'button',
              sub_type: 'url',
              index: '0',
              parameters: [{ type: 'text', text: code }],
            },
          ],
        },
      }),
    })
    const json = await res.json()
    if (!res.ok) return { ok: false, error: json?.error?.message ?? 'فشل الإرسال' }
    return { ok: true, ref: json?.messages?.[0]?.id }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** البديل: رسالة نصية لو واتساب فشل */
export async function sendSms(to: string, body: string): Promise<SendResult> {
  const key = process.env.SMS_PROVIDER_KEY
  if (!key) {
    // eslint-disable-next-line no-console
    console.log(`[رسالة نصية — محاكاة] ${to}: ${body}`)
    return { ok: true, simulated: true }
  }
  // بيتوصل بمزود محلي — الشكل بيختلف حسب المزود
  return { ok: true, simulated: true }
}

/** رسالة بقالب معتمد — للإشعارات (تأكيد، كشف، تذكير…) */
export async function sendTemplate(
  to: string,
  template: string,
  params: string[]
): Promise<SendResult> {
  if (!TOKEN || !PHONE_ID) {
    // eslint-disable-next-line no-console
    console.log(`[واتساب — محاكاة] ${template} → ${to} (${params.join(' | ')})`)
    return { ok: true, simulated: true }
  }
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: template,
          language: { code: 'ar' },
          components: [
            { type: 'body', parameters: params.map((p) => ({ type: 'text', text: p })) },
          ],
        },
      }),
    })
    const json = await res.json()
    return res.ok
      ? { ok: true, ref: json?.messages?.[0]?.id }
      : { ok: false, error: json?.error?.message }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
