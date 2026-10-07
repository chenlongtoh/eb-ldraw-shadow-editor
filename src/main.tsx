import { createRoot } from 'react-dom/client'
import { App } from './App'
import { UiThemeProvider } from './theme/ui-theme'
import { initLibraries } from './services/libraries'
import './styles/app.scss'

const root = createRoot(document.getElementById('root')!)

// Every part load resolves through the library index, so load it before the editor mounts.
initLibraries().then(
  () =>
    root.render(
      <UiThemeProvider>
        <App />
      </UiThemeProvider>,
    ),
  (error: unknown) => {
    console.error(error)
    root.render(<p role="alert">Could not load the LDraw part library. Check your connection and reload.</p>)
  },
)
