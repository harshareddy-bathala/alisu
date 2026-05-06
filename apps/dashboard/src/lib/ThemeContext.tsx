import { createContext, useContext } from 'react'
import { dark, Theme } from './theme'

export const ThemeContext = createContext<Theme>(dark)
export function useTheme(): Theme { return useContext(ThemeContext) }
