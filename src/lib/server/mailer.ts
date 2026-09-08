import 'server-only'
import nodemailer from 'nodemailer'

/**
 * إرسال رمز الدخول بالإيميل.
 *
 * مزوّدين، بالترتيب:
 *   1. Resend  — لو RESEND_API_KEY موجود (محتاج دومين موثّق عند Resend).
 *   2. SMTP    — لو SMTP_HOST + SMTP_USER + SMTP_PASS موجودين
 *                (جيميل بكلمة مرور تطبيق بيشتغل من غير أي دومين).
 *
 * لو ولا واحد متظبط، mailConfigured() بترجّع false والمسار بيقرّر هو يعمل إيه
 * (واتساب لو متاح، وإلا خطأ واضح في الإنتاج — مش «بعتنالك» وهي ما بعتت).
 */

export interface MailResult {
  ok: boolean
  ref?: string
  error?: string
}

const RESEND_KEY = process.env.RESEND_API_KEY
const SMTP_HOST = process.env.SMTP_HOST
const SMTP_USER = process.env.SMTP_USER
const SMTP_PASS = process.env.SMTP_PASS

export function mailConfigured(): boolean {
  return Boolean(RESEND_KEY || (SMTP_HOST && SMTP_USER && SMTP_PASS))
}

/** عنوان المرسِل — لو مش محدد بنستخدم حساب SMTP نفسه */
function from(): string {
  return process.env.MAIL_FROM || (SMTP_USER ? `نسبوط <${SMTP_USER}>` : 'نسبوط <onboarding@resend.dev>')
}

function authHtml(code: string): string {
  return `<!doctype html>
<html lang="ar" dir="rtl">
  <body style="margin:0;padding:24px;background:#f6f4ef;font-family:'Segoe UI',Tahoma,system-ui,sans-serif;color:#1a1a1a">
    <div style="max-width:420px;margin:0 auto;background:#fff;border-radius:16px;padding:28px 24px;text-align:right">
      <div style="font-size:22px;font-weight:900;color:#f26b1d;margin-bottom:16px">نسبوط</div>
      <div style="font-size:16px;margin-bottom:8px">رمز دخولك:</div>
      <div dir="ltr" style="font-size:36px;font-weight:900;letter-spacing:8px;text-align:center;padding:14px 0;background:#f6f4ef;border-radius:12px">${code}</div>
      <div style="font-size:13px;color:#666;margin-top:16px;line-height:1.7">
        الرمز صالح لمدة ١٠ دقايق. لو ما طلبتش رمز، سيب الرسالة دي ومتديه لحد.
      </div>
    </div>
  </body>
</html>`
}

export async function sendAuthCodeEmail(to: string, code: string): Promise<MailResult> {
  const subject = `رمز دخولك في نسبوط: ${code}`
  const text = `رمز دخولك في نسبوط: ${code}\nصالح لمدة ١٠ دقايق. لو ما طلبتش رمز، سيب الرسالة دي.`
  const html = authHtml(code)

  if (RESEND_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${RESEND_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: from(), to, subject, text, html }),
      })
      const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string }
      return res.ok ? { ok: true, ref: json.id } : { ok: false, error: json.message ?? 'فشل الإرسال' }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }

  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    try {
      const port = Number(process.env.SMTP_PORT ?? 465)
      const transport = nodemailer.createTransport({
        host: SMTP_HOST,
        port,
        secure: port === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      })
      const info = await transport.sendMail({ from: from(), to, subject, text, html })
      return { ok: true, ref: info.messageId }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }

  return { ok: false, error: 'مفيش مزوّد إيميل متظبط' }
}
