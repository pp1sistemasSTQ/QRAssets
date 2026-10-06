const ESTADOS = {
  disponible: { label: 'Disponible', cls: 'ok' },
  asignado: { label: 'Asignado', cls: 'info' },
  en_mantenimiento: { label: 'En mantenimiento', cls: 'warn' },
}

export function Badge({ estado }) {
  const e = ESTADOS[estado] || { label: estado, cls: '' }
  return <span className={`badge ${e.cls}`}>{e.label}</span>
}

export function PageHeader({ titulo, subtitulo, children }) {
  return (
    <header className="page-header">
      <div>
        <h1>{titulo}</h1>
        {subtitulo && <p className="muted">{subtitulo}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </header>
  )
}

export function Modal({ titulo, onClose, children, className = '' }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div
        className={`modal card ${className}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
      >
        <div className="modal-head">
          <h2>{titulo}</h2>
          <button className="btn ghost icon" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
