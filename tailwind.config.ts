import type { Config } from 'tailwindcss'

/**
 * كل القيم هنا مستخرجة حرفيًا من design/نسبوط.dc.html
 * راجع DESIGN_TOKENS.md — مفيش قيمة اتقرّبت.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // الأساسية
        orange: '#F4632A',
        ink: '#14161A',
        cream: '#FBF7EF',
        cobalt: '#2B4CFF',
        sand: '#EFE3CF',
        success: '#3E5C43',
        warn: '#D9A441',
        error: '#8E2F1F',
        // المساعدة — من الملف
        'sand-deep': '#E2D2B4',
        'sand-line': '#D9CBAF',
        'photo-text': '#6B6455',
        'muted-day': '#55575C',
        'muted-night': '#C9C4B8',
        'surface-night': '#1E2128',
        'stroke-night': '#2A2E36',
        'map-label': '#9A9CA3',
        'btn-grey': '#3A3D44',
        // متغيرات الوضع — بتتبدل مع data-theme
        bg: 'var(--bg)',
        fg: 'var(--fg)',
        muted: 'var(--muted)',
        surface: 'var(--surface)',
        line: 'var(--line)',
        'logo-stroke': 'var(--logo-stroke)',
      },
      fontFamily: {
        display: ['var(--font-rubik)', 'Rubik', 'system-ui', 'sans-serif'],
        body: ['var(--font-plex)', 'IBM Plex Sans Arabic', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // سلّم الأحجام المرصود في الملف
        '11': ['11px', { lineHeight: '1.4' }],
        '12': ['12px', { lineHeight: '1.4' }],
        '13': ['13px', { lineHeight: '1.5' }],
        '14': ['14px', { lineHeight: '1.7' }],
        '15': ['15px', { lineHeight: '1.7' }],
        '16': ['16px', { lineHeight: '1.7' }],
        '17': ['17px', { lineHeight: '1.7' }],
        '18': ['18px', { lineHeight: '1.3' }],
        '20': ['20px', { lineHeight: '1.2' }],
        '22': ['22px', { lineHeight: '1.2' }],
        '24': ['24px', { lineHeight: '1.15' }],
        '26': ['26px', { lineHeight: '1.15' }],
        '28': ['28px', { lineHeight: '1.15' }],
        '30': ['30px', { lineHeight: '1.15' }],
        '32': ['32px', { lineHeight: '1.15' }],
        '34': ['34px', { lineHeight: '1.1' }],
        '40': ['40px', { lineHeight: '1.1' }],
      },
      borderRadius: {
        // من الملف
        '8': '8px',
        '11': '11px',
        '12': '12px',
        '14': '14px',
        '16': '16px',
        '18': '18px',
        '20': '20px',
        '24': '24px',
        '26': '26px',
        '30': '30px',
        pill: '999px',
      },
      spacing: {
        '18': '18px',
        '22': '22px',
        '26': '26px',
        '34': '34px',
        '46': '46px',
        '48': '48px',
        '50': '50px',
        '52': '52px',
        '56': '56px',
        '58': '58px',
        '64': '64px',
        '84': '84px',
        '140': '140px',
        '240': '240px',
        '260': '260px',
        '300': '300px',
      },
      maxWidth: {
        page: '720px',
        screen390: '390px',
      },
      animation: {
        marquee: 'nb-marquee 28s linear infinite',
        pulseDot: 'nb-pulse 1.6s ease-out infinite',
        qIdle: 'nb-q-idle 6s ease-in-out infinite',
        qJump: 'nb-q-jump .6s ease-out',
        spinOnce: 'nb-spin-once 1.2s cubic-bezier(.2,.8,.2,1)',
      },
      keyframes: {
        // حرفيًا من الملف
        'nb-marquee': {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
        'nb-pulse': {
          '0%': { boxShadow: '0 0 0 0 rgba(244,99,42,.7)' },
          '100%': { boxShadow: '0 0 0 14px rgba(244,99,42,0)' },
        },
        'nb-q-idle': {
          '0%,88%,100%': { transform: 'skewX(-6deg) rotate(-8deg)' },
          '92%': { transform: 'skewX(-6deg) rotate(-16deg)' },
          '96%': { transform: 'skewX(-6deg) rotate(-2deg)' },
        },
        'nb-q-jump': {
          '0%,100%': { transform: 'skewX(-6deg) translateY(0)' },
          '40%': { transform: 'skewX(-6deg) translateY(-22px)' },
          '70%': { transform: 'skewX(-6deg) translateY(-6px)' },
        },
        'nb-spin-once': {
          from: { transform: 'skewX(-6deg) rotate(0deg) scale(.7)' },
          to: { transform: 'skewX(-6deg) rotate(360deg) scale(1)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
