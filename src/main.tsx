import { createRoot } from 'react-dom/client'
import { App } from './App'
import { UiThemeProvider } from './theme/ui-theme'
import './styles/app.scss'

createRoot(document.getElementById('root')!).render(
  <UiThemeProvider>
    <App />
  </UiThemeProvider>,
)
