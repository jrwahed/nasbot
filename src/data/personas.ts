import type { Persona } from '@/types'

/**
 * الأنواع الستة.
 * الجمل من البرومبت §4.6 حرفيًا.
 * صيغة المؤنث (nameF) من كشف المجموعة في design/نسبوط.dc.html.
 * الألوان من ستيكرات الأشخاص في الملف.
 */
export const personas: Persona[] = [
  {
    id: 'explorer',
    name: 'مستكشف الإجازة',
    nameF: 'مستكشفة الإجازة',
    line: 'بتحب تجرب الجديد، بس مع مجموعة صغيرة مش زحمة.',
    colors: { bg: '#F4632A', fg: '#14161A' },
  },
  {
    id: 'social',
    name: 'الكابتن الاجتماعي',
    nameF: 'الكابتن الاجتماعية',
    line: 'أنت اللي بتفتح الكلام — وبنحتاجك في كل مجموعة.',
    colors: { bg: '#2B4CFF', fg: '#FBF7EF' },
  },
  {
    id: 'quiet',
    name: 'الهادي اللي بيلاحظ',
    nameF: 'الهادية اللي بتلاحظ',
    line: 'بتسمع أكتر ما بتتكلم، وبتفتكر كل التفاصيل.',
    colors: { bg: '#EFE3CF', fg: '#14161A' },
  },
  {
    id: 'firsttime',
    name: 'صاحب أول مرة',
    nameF: 'صاحبة أول مرة',
    line: 'آخر حاجة جديدة كانت زمان — وده بيتغير الأسبوع ده.',
    colors: { bg: '#F4632A', fg: '#14161A' },
  },
  {
    id: 'energy',
    name: 'اللي بيجيب الطاقة',
    nameF: 'اللي بتجيب الطاقة',
    line: 'بتحب الحركة والزحمة والصوت العالي.',
    colors: { bg: '#D9A441', fg: '#14161A' },
  },
  {
    id: 'storyteller',
    name: 'الراوي',
    nameF: 'الراوية',
    line: 'بتحب الحكاية أكتر من النشاط — وهتحكيها.',
    colors: { bg: '#3E5C43', fg: '#FBF7EF' },
  },
]

export const personaById = (id: string) =>
  personas.find((p) => p.id === id) ?? personas[0]
