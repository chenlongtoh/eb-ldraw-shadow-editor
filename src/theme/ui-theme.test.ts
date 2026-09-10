import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applyUiAccent,
  applyUiTheme,
  DEFAULT_UI_ACCENT_PREFERENCE,
  DEFAULT_UI_THEME_PREFERENCE,
  isUiAccentPreference,
  isUiThemePreference,
  persistUiAccentPreference,
  persistUiThemePreference,
  readUiAccentPreference,
  readUiThemePreference,
  resolveUiTheme,
  UI_ACCENT_STORAGE_KEY,
  UI_THEME_STORAGE_KEY,
} from './ui-theme'

function installBrowserMocks() {
  const store = new Map<string, string>()
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
  }
  const dataset: Record<string, string | undefined> = {}
  vi.stubGlobal('window', { localStorage })
  vi.stubGlobal('document', { documentElement: { dataset } })
  return { store, dataset }
}

describe('ui theme preference', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('accepts only light, dark, and system', () => {
    expect(isUiThemePreference('light')).toBe(true)
    expect(isUiThemePreference('dark')).toBe(true)
    expect(isUiThemePreference('system')).toBe(true)
    expect(isUiThemePreference('auto')).toBe(false)
    expect(isUiThemePreference('')).toBe(false)
  })

  it('defaults to dark when nothing is stored', () => {
    installBrowserMocks()
    expect(readUiThemePreference()).toBe(DEFAULT_UI_THEME_PREFERENCE)
    expect(readUiThemePreference()).toBe('dark')
  })

  it('reads and persists the preference', () => {
    const { store } = installBrowserMocks()
    persistUiThemePreference('light')
    expect(store.get(UI_THEME_STORAGE_KEY)).toBe('light')
    expect(readUiThemePreference()).toBe('light')
  })

  it('ignores corrupt stored values', () => {
    const { store } = installBrowserMocks()
    store.set(UI_THEME_STORAGE_KEY, 'purple')
    expect(readUiThemePreference()).toBe('dark')
  })

  it('resolves system from prefers-color-scheme', () => {
    vi.stubGlobal('window', {
      matchMedia: (query: string) => ({
        matches: query.includes('dark'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    })
    expect(resolveUiTheme('system')).toBe('dark')
    expect(resolveUiTheme('light')).toBe('light')
  })

  it('applies the resolved theme on the document', () => {
    const { dataset } = installBrowserMocks()
    applyUiTheme('dark')
    expect(dataset.theme).toBe('dark')
    applyUiTheme('light')
    expect(dataset.theme).toBe('light')
  })
})

describe('ui accent preference', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('accepts only vivid, soft, and blue', () => {
    expect(isUiAccentPreference('vivid')).toBe(true)
    expect(isUiAccentPreference('soft')).toBe(true)
    expect(isUiAccentPreference('blue')).toBe(true)
    expect(isUiAccentPreference('muted')).toBe(false)
    expect(isUiAccentPreference('')).toBe(false)
  })

  it('defaults to blue when nothing is stored', () => {
    installBrowserMocks()
    expect(readUiAccentPreference()).toBe(DEFAULT_UI_ACCENT_PREFERENCE)
    expect(readUiAccentPreference()).toBe('blue')
  })

  it('reads and persists the accent', () => {
    const { store } = installBrowserMocks()
    persistUiAccentPreference('soft')
    expect(store.get(UI_ACCENT_STORAGE_KEY)).toBe('soft')
    expect(readUiAccentPreference()).toBe('soft')
  })

  it('ignores corrupt stored values', () => {
    const { store } = installBrowserMocks()
    store.set(UI_ACCENT_STORAGE_KEY, 'neon')
    expect(readUiAccentPreference()).toBe('blue')
  })

  it('applies the accent on the document', () => {
    const { dataset } = installBrowserMocks()
    applyUiAccent('soft')
    expect(dataset.accent).toBe('soft')
    applyUiAccent('vivid')
    expect(dataset.accent).toBe('vivid')
    applyUiAccent('blue')
    expect(dataset.accent).toBe('blue')
  })
})
