// Design tokens (docs/ARCHITECTURE.md § Design). The app's ThemeProvider reads these.

export interface Palette {
  background: string;
  surface: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  onPrimary: string;
  primaryPressed: string;
  /** Dark "secondary" button (e.g. "I finished this book"). */
  inverse: string;
  onInverse: string;
  availableBg: string;
  availableFg: string;
  availableDot: string;
  busyBg: string;
  busyFg: string;
  busyDot: string;
  scannerBackground: string;
  scannerAccent: string;
}

export type ColorSchemeName = 'light' | 'dark';

export const palettes: Record<ColorSchemeName, Palette> = {
  light: {
    background: '#F3F4F1',
    surface: '#FFFFFF',
    border: '#DDE1DC',
    text: '#16201B',
    textMuted: '#5B6660',
    primary: '#1F6B4A',
    onPrimary: '#FFFFFF',
    primaryPressed: '#154D35',
    inverse: '#16201B',
    onInverse: '#FFFFFF',
    availableBg: '#DCEFE4',
    availableFg: '#155238',
    availableDot: '#2E9E64',
    busyBg: '#FCE9C2',
    busyFg: '#6E4300',
    busyDot: '#B07400',
    scannerBackground: '#0F1513',
    scannerAccent: '#3DDC84',
  },
  dark: {
    background: '#0F1513',
    surface: '#1A2320',
    border: '#2C3833',
    text: '#E8ECE9',
    textMuted: '#A3AFA8',
    primary: '#3DDC84',
    onPrimary: '#0F1513',
    primaryPressed: '#2FB56C',
    inverse: '#E8ECE9',
    onInverse: '#0F1513',
    availableBg: '#1D3A2B',
    availableFg: '#9FE0BC',
    availableDot: '#3DDC84',
    busyBg: '#3D2E10',
    busyFg: '#F5CF85',
    busyDot: '#E0A63A',
    scannerBackground: '#0F1513',
    scannerAccent: '#3DDC84',
  },
};

export const PROFILE_COLORS = [
  { key: 'green', value: '#1F6B4A' },
  { key: 'blue', value: '#2C4A6B' },
  { key: 'rust', value: '#B5523B' },
  { key: 'violet', value: '#6B4E8A' },
  { key: 'ochre', value: '#C08A1E' },
] as const;
export type ProfileColorKey = (typeof PROFILE_COLORS)[number]['key'];

/** Generated-cover palette of the design, with the text color readable on each background. */
export const COVER_PALETTE = [
  { background: '#B5523B', foreground: '#FFFFFF' },
  { background: '#2C4A6B', foreground: '#FFFFFF' },
  { background: '#E3B448', foreground: '#2A1E00' },
  { background: '#1E2A33', foreground: '#FFFFFF' },
  { background: '#6B4E8A', foreground: '#FFFFFF' },
  { background: '#3E6B4F', foreground: '#FFFFFF' },
  { background: '#2F5D62', foreground: '#FFFFFF' },
  { background: '#C08A1E', foreground: '#FFFFFF' },
  { background: '#8C2F2F', foreground: '#FFFFFF' },
  { background: '#5E7A3A', foreground: '#FFFFFF' },
] as const;
export type CoverColors = (typeof COVER_PALETTE)[number];

/**
 * Deterministic cover colors from a title (FNV-1a hash of the trimmed, lower-cased,
 * accent-free title), so a book keeps its color on every device.
 */
export function coverColorsFor(title: string): CoverColors {
  const normalized = title.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return COVER_PALETTE[hash % COVER_PALETTE.length] as CoverColors;
}

/** Font family names as registered by @expo-google-fonts in the app. */
export const fonts = {
  display: 'BricolageGrotesque_700Bold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
} as const;

export const radii = { sm: 6, md: 12, lg: 14, xl: 18, pill: 999 } as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const;

/** Minimum touch target (px). */
export const TOUCH_TARGET = 44;

export const fontSizes = {
  screenTitle: 30,
  sectionTitle: 19,
  body: 15,
  small: 14,
  caption: 12,
  badge: 11,
} as const;
