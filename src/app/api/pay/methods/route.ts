import { NextResponse } from 'next/server'
import { admin } from '@/lib/server/supabase-admin'
import { isPlaceholderPayTo } from '@/lib/server/pay-guard'

/**
 * وسايل التحويل المتاحة — **من غير الأرقام نفسها**.
 *
 * ⚠ ليه المسار ده موجود أصلًا: الحارس في `/api/pay/create` بيرفض الوسيلة
 *   اللي رقمها لسه وهمي — بس الصفحة مكانتش تعرف، وكانت بتعرض الوسيلتين
 *   و**فودافون كاش هي الافتراضية**. فالمالك يظبّط إنستاباي، والعضو يدخل
 *   يدفع، يلاقي «الدفع متوقف» — والدفع مش متوقف، هو بس اختار الوسيلة
 *   الغلط من غير ما حد يقوله.
 *
 * ⚠ بيرجّع `true/false` بس. الرقم نفسه ما بيخرجش من هنا — بيتسلّم للعضو
 *   بعد ما الحجز يتعمل فعلًا في `/api/pay/create`، وده مقصود.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { data } = await admin()
      .from('settings')
      .select('vodafone_number, instapay_handle')
      .single()
    const s = (data ?? {}) as { vodafone_number?: string; instapay_handle?: string }
    return NextResponse.json({
      vodafone_cash: !isPlaceholderPayTo(s.vodafone_number),
      instapay: !isPlaceholderPayTo(s.instapay_handle),
    })
  } catch {
    // القاعدة وقعت — بنقول «الاتنين متاحين» بدل ما نقفل الدفع من عندنا.
    // الحارس الحقيقي في `/api/pay/create` هو اللي بيمنع، مش الصفحة دي.
    return NextResponse.json({ vodafone_cash: true, instapay: true })
  }
}
