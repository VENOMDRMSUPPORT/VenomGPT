import { createContext, useContext, useState, createElement } from 'react';
import type { ReactNode } from 'react';
import { type VGTheme, darkTheme, lightTheme } from '@/lib/theme';

interface ThemeCtxValue {
  isDark: boolean;
  tm: VGTheme;
  setIsDark: (v: boolean | ((prev: boolean) => boolean)) => void;
}

export const ThemeCtx = createContext<ThemeCtxValue>({
  isDark: true,
  tm: darkTheme,
  setIsDark: () => {},
});

export const useTheme = () => useContext(ThemeCtx);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(true);
  const tm = isDark ? darkTheme : lightTheme;
  return createElement(ThemeCtx.Provider, { value: { isDark, tm, setIsDark } }, children);
}
