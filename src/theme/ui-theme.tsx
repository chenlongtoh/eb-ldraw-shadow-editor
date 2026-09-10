import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type UiThemePreference = 'light' | 'dark' | 'system'
export type ResolvedUiTheme = 'light' | 'dark'
export type UiAccentPreference = 'vivid' | 'soft' | 'blue'

export const UI_THEME_STORAGE_KEY = 'eb-ui-theme'
export const UI_ACCENT_STORAGE_KEY = 'eb-ui-accent'

export const DEFAULT_UI_THEME_PREFERENCE: UiThemePreference = 'dark'
export const DEFAULT_UI_ACCENT_PREFERENCE: UiAccentPreference = 'blue'

/** Neon brand lime. */
export const ACCENT_VIVID = '#B8FF00'
/** EasternBrick accent yellow — lower-contrast alternative to neon lime. */
export const ACCENT_SOFT = '#FFE400'
/** Cool blue — readable on light and dark chrome. */
export const ACCENT_BLUE = '#2563EB'

const VALID_PREFERENCES: ReadonlySet<string> = new Set(['light', 'dark', 'system'])
const VALID_ACCENTS: ReadonlySet<string> = new Set(['vivid', 'soft', 'blue'])

export function isUiThemePreference(value: unknown): value is UiThemePreference {
  return typeof value === 'string' && VALID_PREFERENCES.has(value)
}

export function isUiAccentPreference(value: unknown): value is UiAccentPreference {
  return typeof value === 'string' && VALID_ACCENTS.has(value)
}

export function readUiThemePreference(): UiThemePreference {
  if (typeof window === 'undefined') return DEFAULT_UI_THEME_PREFERENCE
  try {
    const stored = window.localStorage.getItem(UI_THEME_STORAGE_KEY)
    return isUiThemePreference(stored) ? stored : DEFAULT_UI_THEME_PREFERENCE
  } catch {
    return DEFAULT_UI_THEME_PREFERENCE
  }
}

export function persistUiThemePreference(preference: UiThemePreference): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(UI_THEME_STORAGE_KEY, preference)
  } catch {
    /* private mode / disabled storage */
  }
}

export function readUiAccentPreference(): UiAccentPreference {
  if (typeof window === 'undefined') return DEFAULT_UI_ACCENT_PREFERENCE
  try {
    const stored = window.localStorage.getItem(UI_ACCENT_STORAGE_KEY)
    return isUiAccentPreference(stored) ? stored : DEFAULT_UI_ACCENT_PREFERENCE
  } catch {
    return DEFAULT_UI_ACCENT_PREFERENCE
  }
}

export function persistUiAccentPreference(accent: UiAccentPreference): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(UI_ACCENT_STORAGE_KEY, accent)
  } catch {
    /* private mode / disabled storage */
  }
}

export function resolveUiTheme(preference: UiThemePreference): ResolvedUiTheme {
  if (preference === 'light' || preference === 'dark') return preference
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark'
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyUiTheme(theme: ResolvedUiTheme): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme
}

export function applyUiAccent(accent: UiAccentPreference): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.accent = accent
}

interface UiThemeContextValue {
  preference: UiThemePreference
  resolved: ResolvedUiTheme
  setPreference: (preference: UiThemePreference) => void
  accent: UiAccentPreference
  setAccent: (accent: UiAccentPreference) => void
}

const UiThemeContext = createContext<UiThemeContextValue | null>(null)

export function UiThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<UiThemePreference>(readUiThemePreference)
  const [accent, setAccentState] = useState<UiAccentPreference>(readUiAccentPreference)
  const resolved = resolveUiTheme(preference)

  useEffect(() => {
    applyUiTheme(resolveUiTheme(preference))
    persistUiThemePreference(preference)
  }, [preference])

  useEffect(() => {
    applyUiAccent(accent)
    persistUiAccentPreference(accent)
  }, [accent])

  useEffect(() => {
    if (preference !== 'system' || typeof window.matchMedia !== 'function') return undefined
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyUiTheme(resolveUiTheme('system'))
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [preference])

  const setPreference = useCallback((next: UiThemePreference) => {
    setPreferenceState(next)
    applyUiTheme(resolveUiTheme(next))
    persistUiThemePreference(next)
  }, [])

  const setAccent = useCallback((next: UiAccentPreference) => {
    setAccentState(next)
    applyUiAccent(next)
    persistUiAccentPreference(next)
  }, [])

  const value = useMemo(
    () => ({ preference, resolved, setPreference, accent, setAccent }),
    [preference, resolved, setPreference, accent, setAccent],
  )

  return <UiThemeContext.Provider value={value}>{children}</UiThemeContext.Provider>
}

export function useUiTheme(): UiThemeContextValue {
  const context = useContext(UiThemeContext)
  if (!context) {
    throw new Error('useUiTheme must be used within UiThemeProvider')
  }
  return context
}
