import type { GameConfig } from '@/lib/game-config'

/**
 * نسخة احتياطية من اللعبة.
 *
 * المصدر الحقيقي هو القاعدة (وبتتعدّل من /admin/game).
 * الملف ده بيشتغل في حالتين بس: الموقع شغّال من غير مفاتيح Supabase،
 * أو القاعدة مش راضية ترد. النصوص هنا نفس اللي اتزرع في القاعدة.
 *
 * ما تعدّلش الملف ده علشان تغيّر اللعبة — عدّل من اللوحة.
 */

/** اختصار: النقاط بتتكتب «نوع=نقط»، والصفر معناه ترجيح عند التعادل بس */
const s = (...pairs: [string, number][]): Record<string, number> =>
  Object.fromEntries(pairs)

export const gameFallback: GameConfig = {
  types: [
    {
      key: 'explorer',
      name: 'مستكشف الإجازة',
      nameF: 'مستكشفة الإجازة',
      line: 'بتحب تجرب الجديد، بس مع مجموعة صغيرة مش زحمة.',
      bg: '#F4632A',
      fg: '#14161A',
    },
    {
      key: 'social',
      name: 'الكابتن الاجتماعي',
      nameF: 'الكابتن الاجتماعية',
      line: 'أنت اللي بتفتح الكلام — وبنحتاجك في كل مجموعة.',
      bg: '#2B4CFF',
      fg: '#FBF7EF',
    },
    {
      key: 'quiet',
      name: 'الهادي اللي بيلاحظ',
      nameF: 'الهادية اللي بتلاحظ',
      line: 'بتسمع أكتر ما بتتكلم، وبتفتكر كل التفاصيل.',
      bg: '#EFE3CF',
      fg: '#14161A',
    },
    {
      key: 'firsttime',
      name: 'صاحب أول مرة',
      nameF: 'صاحبة أول مرة',
      line: 'آخر حاجة جديدة كانت زمان — وده بيتغير الأسبوع ده.',
      bg: '#3E5C43',
      fg: '#FBF7EF',
    },
    {
      key: 'energy',
      name: 'اللي بيجيب الطاقة',
      nameF: 'اللي بتجيب الطاقة',
      line: 'بتحب الحركة والزحمة والصوت العالي.',
      bg: '#D9A441',
      fg: '#14161A',
    },
    {
      key: 'storyteller',
      name: 'الراوي',
      nameF: 'الراوية',
      line: 'بتحب الحكاية أكتر من النشاط — وهتحكيها.',
      bg: '#3E5C43',
      fg: '#FBF7EF',
    },
  ],

  questions: [
    {
      id: 'q1',
      slot: 'q1',
      text: 'الساعة 7 الصبح أنت فين؟',
      kind: 'single',
      required: true,
      progressLabel: 'دقيقة واحدة فاضلة',
      placeholder: '',
      options: [
        { id: 'q1o1', label: 'سرير', iconKey: 'bed', value: 'سرير', scores: s(['firsttime', 2], ['quiet', 1]) },
        { id: 'q1o2', label: 'النيل', iconKey: 'river', value: 'النيل', scores: s(['explorer', 2], ['quiet', 1]) },
        { id: 'q1o3', label: 'الملعب', iconKey: 'court', value: 'الملعب', scores: s(['energy', 2], ['social', 1]) },
        { id: 'q1o4', label: 'اللابتوب', iconKey: 'laptop', value: 'اللابتوب', scores: s(['quiet', 2], ['storyteller', 1]) },
      ],
    },
    {
      id: 'q2',
      slot: 'q2',
      text: 'في قعدة ناس متعرفهمش، أنت اللي…',
      kind: 'single',
      required: true,
      progressLabel: 'دقيقة واحدة فاضلة',
      placeholder: '',
      options: [
        { id: 'q2o1', label: 'بتتكلم الأول', iconKey: 'talk', value: 'بتتكلم الأول', scores: s(['social', 2], ['energy', 1]) },
        { id: 'q2o2', label: 'بتسمع وبتضحك', iconKey: 'ear', value: 'بتسمع وبتضحك', scores: s(['quiet', 2], ['storyteller', 1]) },
        { id: 'q2o3', label: 'بتصوّر', iconKey: 'camera', value: 'بتصوّر', scores: s(['storyteller', 2], ['explorer', 1]) },
        { id: 'q2o4', label: 'بتدور على الأكل', iconKey: 'food', value: 'بتدور على الأكل', scores: s(['energy', 2], ['social', 1]) },
      ],
    },
    {
      id: 'q3',
      slot: 'q3',
      text: 'آخر حاجة جديدة عملتها كانت…',
      kind: 'single',
      required: true,
      progressLabel: 'دقيقة واحدة فاضلة',
      placeholder: '',
      options: [
        { id: 'q3o1', label: 'الأسبوع ده', iconKey: 'calendar', value: 'الأسبوع ده', scores: {} },
        { id: 'q3o2', label: 'الشهر ده', iconKey: 'calendar', value: 'الشهر ده', scores: {} },
        // صفر = بترجّح «صاحب أول مرة» عند التعادل من غير ما تزوّد نقطه
        { id: 'q3o3', label: 'السنة دي', iconKey: 'calendar', value: 'السنة دي', scores: s(['firsttime', 0]) },
        { id: 'q3o4', label: 'مش فاكر 😅', iconKey: 'mood', value: 'مش فاكر 😅', scores: s(['firsttime', 0]) },
      ],
    },
    {
      id: 'q4',
      slot: 'q4',
      text: 'الخروجة المثالية…',
      kind: 'single',
      required: true,
      progressLabel: 'نص دقيقة',
      placeholder: '',
      options: [
        { id: 'q4o1', label: '6 ناس ومكان هادي', iconKey: 'group', value: '6 ناس ومكان هادي', scores: s(['explorer', 2], ['quiet', 1]) },
        { id: 'q4o2', label: '12 واحد وصوت عالي', iconKey: 'crowd', value: '12 واحد وصوت عالي', scores: s(['energy', 2], ['social', 1]) },
        { id: 'q4o3', label: 'اتنين تلاتة بس', iconKey: 'pair', value: 'اتنين تلاتة بس', scores: s(['quiet', 2], ['storyteller', 1]) },
        { id: 'q4o4', label: 'حسب المزاج', iconKey: 'mood', value: 'حسب المزاج', scores: s(['firsttime', 2], ['explorer', 1]) },
      ],
    },
    {
      id: 'q5',
      slot: 'q5',
      text: 'لو في مجموعة ضاعت في الصحرا، أنت…',
      kind: 'single',
      required: true,
      progressLabel: 'نص دقيقة',
      placeholder: '',
      options: [
        { id: 'q5o1', label: 'اللي بيمسك الخريطة', iconKey: 'map', value: 'اللي بيمسك الخريطة', scores: s(['social', 2], ['explorer', 1]) },
        { id: 'q5o2', label: 'اللي بيهدّي الناس', iconKey: 'calm', value: 'اللي بيهدّي الناس', scores: s(['quiet', 2], ['social', 1]) },
        { id: 'q5o3', label: 'اللي بيصوّر الغروب', iconKey: 'sunset', value: 'اللي بيصوّر الغروب', scores: s(['storyteller', 2], ['explorer', 1]) },
        { id: 'q5o4', label: 'اللي بيلاقي أكل', iconKey: 'food', value: 'اللي بيلاقي أكل', scores: s(['energy', 2], ['firsttime', 1]) },
      ],
    },
    {
      id: 'q6',
      slot: 'q6',
      text: 'الميزانية المريحة للخروجة',
      kind: 'single',
      required: true,
      progressLabel: 'نص دقيقة',
      placeholder: '',
      options: [
        { id: 'q6o1', label: 'لحد 250', iconKey: 'money', value: 'لحد 250', scores: {} },
        { id: 'q6o2', label: 'لحد 500', iconKey: 'money', value: 'لحد 500', scores: {} },
        { id: 'q6o3', label: 'لحد 1000', iconKey: 'money', value: 'لحد 1000', scores: {} },
        { id: 'q6o4', label: 'مفيش مشكلة', iconKey: 'money', value: 'مفيش مشكلة', scores: {} },
      ],
    },
    {
      id: 'q7',
      slot: 'q7',
      text: 'الأيام اللي بتفضى فيها',
      kind: 'multi',
      required: true,
      progressLabel: 'خلاص تقريبًا',
      placeholder: '',
      options: [
        { id: 'q7o1', label: 'خميس بالليل', iconKey: 'calendar', value: 'خميس بالليل', scores: {} },
        { id: 'q7o2', label: 'جمعة الصبح', iconKey: 'calendar', value: 'جمعة الصبح', scores: {} },
        { id: 'q7o3', label: 'جمعة بالليل', iconKey: 'calendar', value: 'جمعة بالليل', scores: {} },
        { id: 'q7o4', label: 'وسط الأسبوع', iconKey: 'calendar', value: 'وسط الأسبوع', scores: {} },
      ],
    },
    {
      id: 'q8',
      slot: 'q8',
      text: 'حاجة نفسك تجربها ومجربتهاش',
      kind: 'text',
      required: false,
      progressLabel: 'خلاص تقريبًا',
      placeholder: 'اكتب أي حاجة…',
      options: [],
    },
  ],
}
