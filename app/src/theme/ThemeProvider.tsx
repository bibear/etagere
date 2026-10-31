import {
  type ColorSchemeName,
  type Palette,
  TOUCH_TARGET,
  fontSizes,
  fonts,
  palettes,
  radii,
  spacing,
} from '@etagere/shared';
import { type ReactNode, createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

export interface Theme {
  scheme: ColorSchemeName;
  colors: Palette;
  fonts: typeof fonts;
  fontSizes: typeof fontSizes;
  radii: typeof radii;
  spacing: typeof spacing;
  touchTarget: number;
}

export const makeTheme = (scheme: ColorSchemeName): Theme => ({
  scheme,
  colors: palettes[scheme],
  fonts,
  fontSizes,
  radii,
  spacing,
  touchTarget: TOUCH_TARGET,
});

const ThemeContext = createContext<Theme>(makeTheme('light'));

/** Follows the system light / dark setting; `scheme` forces one (tests, previews). */
export function ThemeProvider({
  children,
  scheme,
}: {
  children: ReactNode;
  scheme?: ColorSchemeName;
}) {
  const system = useColorScheme();
  const resolved: ColorSchemeName = scheme ?? (system === 'dark' ? 'dark' : 'light');
  const theme = useMemo(() => makeTheme(resolved), [resolved]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export const useTheme = (): Theme => useContext(ThemeContext);
