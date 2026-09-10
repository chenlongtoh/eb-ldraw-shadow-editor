import { useUiTheme } from '../theme/ui-theme'

const EASTERNBRICK_HOME = 'https://www.easternbrick.com'

export function BrandWordmark({ suffix }: { suffix: string }) {
  const { resolved } = useUiTheme()
  const logoSrc = resolved === 'dark' ? '/eb-logo-light.png' : '/eb-logo-inverse.png'

  return (
    <div className="brand-wordmark">
      <a
        className="brand-home"
        href={EASTERNBRICK_HOME}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="EasternBrick"
      >
        <img
          className="brand-logo"
          src={logoSrc}
          alt=""
          width={36}
          height={30}
        />
        <span className="brand-name">EasternBrick</span>
      </a>
      <span className="brand-pipe" aria-hidden="true">
        |
      </span>
      <h1 className="brand-suffix">{suffix}</h1>
    </div>
  )
}
