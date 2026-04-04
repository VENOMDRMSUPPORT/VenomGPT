import { createContext, useContext } from 'react';
import { type VGTheme, darkTheme } from '@/lib/theme';

export const ThemeCtx = createContext<{ isDark: boolean; tm: VGTheme }>({ isDark: true, tm: darkTheme });
export const useTheme = () => useContext(ThemeCtx);
