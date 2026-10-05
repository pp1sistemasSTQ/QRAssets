import { useCallback, useState } from 'react'
import { supabaseConfigurado } from './lib/supabase'
import { IconBox, IconHome, IconQr, IconReturn, IconScan, IconSend } from './components/Icons'
import Dashboard from './pages/Dashboard'
import Activos from './pages/Activos'
import Entrega from './pages/Entrega'
import Escanear from './pages/Escanear'
import Devolucion from './pages/Devolucion'
import Setup from './pages/Setup'

const NAV = [
  { id: 'inicio', label: 'Inicio', Icon: IconHome },
  { id: 'activos', label: 'Activos', Icon: IconBox },
  { id: 'entrega', label: 'Entrega', Icon: IconSend },
  { id: 'escanear', label: 'Escanear', Icon: IconScan },
  { id: 'devolucion', label: 'Devolución', Icon: IconReturn },
]

export default function App() {
  const [pagina, setPagina] = useState('inicio')
  const [params, setParams] = useState({})
  const [toast, setToast] = useState(null)

  const ir = useCallback((id, p = {}) => {
    setParams(p)
    setPagina(id)
    window.scrollTo(0, 0)
  }, [])

  const notify = useCallback((msg, tipo = 'ok') => {
    setToast({ msg, tipo, k: Date.now() })
    setTimeout(() => setToast((t) => (t && Date.now() - t.k >= 3900 ? null : t)), 4000)
  }, [])

  if (!supabaseConfigurado) return <Setup />

  const props = { ir, notify, params }
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><IconQr /></span>
          <div>
            <strong>QRAsset</strong>
            <small>Trazabilidad de activos</small>
          </div>
        </div>
        <nav>
          {NAV.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`nav-item ${pagina === id ? 'active' : ''}`}
              onClick={() => ir(id)}
              aria-current={pagina === id ? 'page' : undefined}
            >
              <Icon />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="content">
        {pagina === 'inicio' && <Dashboard {...props} />}
        {pagina === 'activos' && <Activos {...props} />}
        {pagina === 'entrega' && <Entrega {...props} />}
        {pagina === 'escanear' && <Escanear {...props} />}
        {pagina === 'devolucion' && <Devolucion {...props} />}
      </main>

      {toast && (
        <div className={`toast ${toast.tipo}`} role="status">
          {toast.msg}
        </div>
      )}
    </div>
  )
}
