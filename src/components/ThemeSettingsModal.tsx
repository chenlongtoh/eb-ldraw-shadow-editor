import { useEffect, useRef } from 'react'
import {
  ACCENT_BLUE,
  ACCENT_SOFT,
  ACCENT_VIVID,
  useUiTheme,
  type UiAccentPreference,
  type UiThemePreference,
} from '../theme/ui-theme'

const THEME_OPTIONS: { value: UiThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

const ACCENT_OPTIONS: { value: UiAccentPreference; label: string; swatch: string }[] = [
  { value: 'vivid', label: 'Vivid', swatch: ACCENT_VIVID },
  { value: 'soft', label: 'Soft', swatch: ACCENT_SOFT },
  { value: 'blue', label: 'Blue', swatch: ACCENT_BLUE },
]

export function ThemeSettingsModal({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const { preference, setPreference, accent, setAccent } = useUiTheme()

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      className="theme-settings-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <div className="theme-settings-header">
        <h2 className="theme-settings-title">Settings</h2>
        <button
          ref={closeRef}
          type="button"
          className="theme-settings-close"
          aria-label="Close"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      <div className="theme-settings-body">
        <section className="theme-settings-section">
          <h3 className="theme-settings-section-title" id="theme-selector-label">
            Appearance
          </h3>
          <div
            className="theme-selector"
            role="radiogroup"
            aria-labelledby="theme-selector-label"
          >
            {THEME_OPTIONS.map((option) => {
              const selected = preference === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={selected ? 'theme-card theme-card-active' : 'theme-card'}
                  onClick={() => setPreference(option.value)}
                >
                  <span
                    className={`theme-preview theme-preview-${option.value}`}
                    aria-hidden="true"
                  >
                    <span className="theme-preview-header" />
                    <span className="theme-preview-body">
                      <span className="theme-preview-sidebar" />
                      <span className="theme-preview-canvas">
                        <span className="theme-preview-accent" />
                      </span>
                    </span>
                  </span>
                  <span className="theme-card-label">{option.label}</span>
                </button>
              )
            })}
          </div>
          <div className="accent-block">
            <span className="accent-label" id="accent-selector-label">
              Accent
            </span>
            <div
              className="accent-selector"
              role="radiogroup"
              aria-labelledby="accent-selector-label"
            >
              {ACCENT_OPTIONS.map((option) => {
                const selected = accent === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={selected ? 'accent-card accent-card-active' : 'accent-card'}
                    onClick={() => setAccent(option.value)}
                  >
                    <span
                      className="accent-swatch"
                      style={{ background: option.swatch }}
                      aria-hidden="true"
                    />
                    <span className="theme-card-label">{option.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
