import type { Person } from '@/types'

/**
 * السبعة اللي في كشف المجموعة — منقولين حرفيًا من data-dc-script
 * في design/نسبوط.dc.html بألوان ستيكراتهم زي ما هي.
 */
export const people: Person[] = [
  {
    name: 'مريم',
    initial: 'م',
    tag: 'مستكشفة الإجازة',
    line: 'المرة التالتة · بتحب الشمس الصبح، مش بتحب الزحمة',
    tagColors: { bg: '#F4632A', fg: '#14161A' },
    photo: '[صورة]',
  },
  {
    name: 'يوسف',
    initial: 'ي',
    tag: 'الكابتن الاجتماعي',
    line: 'أول مرة · بيفتح الكلام مع أي حد',
    tagColors: { bg: '#2B4CFF', fg: '#FBF7EF' },
    photo: '[صورة]',
  },
  {
    name: 'نور',
    initial: 'ن',
    tag: 'الهادية اللي بتلاحظ',
    line: 'المرة التانية · بتسمع أكتر ما بتتكلم',
    tagColors: { bg: '#EFE3CF', fg: '#14161A' },
    photo: '[صورة]',
  },
  {
    name: 'عمر',
    initial: 'ع',
    tag: 'اللي بيجيب الطاقة',
    line: 'المرة الخامسة · مش بيقعد ساكت دقيقة',
    tagColors: { bg: '#D9A441', fg: '#14161A' },
    photo: '[صورة]',
  },
  {
    name: 'سلمى',
    initial: 'س',
    tag: 'الراوية',
    line: 'أول مرة · معاها حكاية لكل موقف',
    tagColors: { bg: '#3E5C43', fg: '#FBF7EF' },
    photo: '[صورة]',
  },
  {
    name: 'كريم',
    initial: 'ك',
    tag: 'صاحب أول مرة',
    line: 'أول مرة · جرب البادل الأسبوع اللي فات وعجبه',
    tagColors: { bg: '#F4632A', fg: '#14161A' },
    photo: '[صورة]',
  },
  {
    name: 'هنا',
    initial: 'ه',
    tag: 'مستكشفة الإجازة',
    line: 'المرة التالتة · بتيجي بعجلتها',
    tagColors: { bg: '#2B4CFF', fg: '#FBF7EF' },
    photo: '[صورة]',
  },
]

/** ليه المجموعة دي؟ — نص الملف حرفيًا */
export const whyThisGroup = 'كلكم مبتدئين في البادل، ونصكم قال "مجموعة هادية".'

/** «رايحين معاك» في /me — اللي حصل بينهم اختيار متبادل في التقييم */
export const metBefore: Person[] = [people[0], people[2], people[4]]
