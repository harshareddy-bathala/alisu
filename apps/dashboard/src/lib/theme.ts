export interface Theme {
  name: 'dark' | 'light'

  // surfaces
  bg:           string  // page background
  bgElevated:   string  // raised inputs / nested rows
  surface:      string  // cards, panels
  surfaceHover: string
  border:       string
  borderStrong: string

  // text
  text:         string
  textMuted:    string
  textDim:      string

  // accent
  primary:       string
  primaryHover:  string
  primaryBg:     string
  primaryBorder: string
  primaryOn:     string  // text colour on a primary-filled button

  // status
  success:   string
  successBg: string
  warning:   string
  warningBg: string
  error:     string
  errorBg:   string

  // call states (fixed across themes for consistent semantic meaning)
  listening: string
  speaking:  string

  // gradients / glow
  pageGradient:   string
  cardGradient:   string
  shadow:         string
  shadowLg:       string
  scrollbarThumb: string
}

export const dark: Theme = {
  name:          'dark',

  bg:            '#0A0F1A',
  bgElevated:    '#0F1623',
  surface:       '#111A2C',
  surfaceHover:  '#172238',
  border:        '#1E2A42',
  borderStrong:  '#27365A',

  text:          '#F4F6FB',
  textMuted:     '#8A95B0',
  textDim:       '#4A5572',

  primary:       '#7C8CFF',
  primaryHover:  '#8E9DFF',
  primaryBg:     'rgba(124,140,255,0.12)',
  primaryBorder: 'rgba(124,140,255,0.28)',
  primaryOn:     '#0A0F1A',

  success:   '#34D399',
  successBg: 'rgba(52,211,153,0.12)',
  warning:   '#FBBF24',
  warningBg: 'rgba(251,191,36,0.12)',
  error:     '#F87171',
  errorBg:   'rgba(248,113,113,0.12)',

  listening: '#34D399',
  speaking:  '#7C8CFF',

  pageGradient:   'radial-gradient(ellipse at top, rgba(124,140,255,0.08), transparent 70%), #0A0F1A',
  cardGradient:   'linear-gradient(160deg, #142036 0%, #0E1626 100%)',
  shadow:         '0 1px 3px rgba(0,0,0,0.3)',
  shadowLg:       '0 12px 32px rgba(0,0,0,0.5)',
  scrollbarThumb: '#27365A',
}

export const light: Theme = {
  name:          'light',

  bg:            '#F6F7FB',
  bgElevated:    '#FFFFFF',
  surface:       '#FFFFFF',
  surfaceHover:  '#F1F3F9',
  border:        '#E4E7EE',
  borderStrong:  '#CBD2DE',

  text:          '#0F172A',
  textMuted:     '#64748B',
  textDim:       '#94A3B8',

  primary:       '#5460F0',
  primaryHover:  '#404DDD',
  primaryBg:     'rgba(84,96,240,0.08)',
  primaryBorder: 'rgba(84,96,240,0.22)',
  primaryOn:     '#FFFFFF',

  success:   '#059669',
  successBg: 'rgba(5,150,105,0.08)',
  warning:   '#D97706',
  warningBg: 'rgba(217,119,6,0.10)',
  error:     '#DC2626',
  errorBg:   'rgba(220,38,38,0.08)',

  listening: '#059669',
  speaking:  '#5460F0',

  pageGradient:   'radial-gradient(ellipse at top, rgba(84,96,240,0.06), transparent 70%), #F6F7FB',
  cardGradient:   'linear-gradient(160deg, #FFFFFF 0%, #FBFCFE 100%)',
  shadow:         '0 1px 2px rgba(15,23,42,0.06)',
  shadowLg:       '0 12px 32px rgba(15,23,42,0.08)',
  scrollbarThumb: '#CBD2DE',
}
