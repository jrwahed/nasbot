import type { ComponentType } from 'react'
import {
  BedIcon,
  RiverIcon,
  CourtIcon,
  LaptopIcon,
  TalkIcon,
  EarIcon,
  CameraIcon,
  FoodIcon,
  MapIcon,
  CalmIcon,
  SunsetIcon,
  GroupIcon,
  CrowdIcon,
  PairIcon,
  MoodIcon,
  MoneyIcon,
  CalendarIcon,
} from '@/components/Icons'

/**
 * أيقونات اختيارات اللعبة.
 * القاعدة بتخزّن مفتاح نصي (icon_key) والصورة نفسها بتفضل في الكود —
 * فصاحب الموقع بيختار من القايمة دي في اللوحة، ومش محتاج يرفع صور.
 */
export type GameIcon = ComponentType<{ size?: number; stroke?: string }>

export const GAME_ICONS: Record<string, GameIcon> = {
  bed: BedIcon,
  river: RiverIcon,
  court: CourtIcon,
  laptop: LaptopIcon,
  talk: TalkIcon,
  ear: EarIcon,
  camera: CameraIcon,
  food: FoodIcon,
  map: MapIcon,
  calm: CalmIcon,
  sunset: SunsetIcon,
  group: GroupIcon,
  crowd: CrowdIcon,
  pair: PairIcon,
  mood: MoodIcon,
  money: MoneyIcon,
  calendar: CalendarIcon,
}

/** أسماء عربية للقايمة المنسدلة في اللوحة */
export const GAME_ICON_LABELS: Record<string, string> = {
  bed: 'سرير',
  river: 'نيل',
  court: 'ملعب',
  laptop: 'لابتوب',
  talk: 'كلام',
  ear: 'ودن',
  camera: 'كاميرا',
  food: 'أكل',
  map: 'خريطة',
  calm: 'هدوء',
  sunset: 'غروب',
  group: 'مجموعة صغيرة',
  crowd: 'زحمة',
  pair: 'اتنين',
  mood: 'مزاج',
  money: 'فلوس',
  calendar: 'تقويم',
}

/** لو المفتاح مش معروف بنرجّع أيقونة المزاج بدل ما الصفحة تفضل فاضية */
export const iconFor = (key: string): GameIcon => GAME_ICONS[key] ?? MoodIcon
