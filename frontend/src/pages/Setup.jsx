export default function Setup() {
  return (
    <div className="setup">
      <div className="card setup-card">
        <h1>Configura Supabase</h1>
        <p className="muted">
          Falta conectar la app con tu proyecto. Edita <code>frontend/.env</code> con tus credenciales
          (Supabase → Project Settings → API) y reinicia <code>npm run dev</code>.
        </p>
        <pre>{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...`}</pre>
        <p className="muted">
          En el SQL Editor ejecuta <code>backend/supabase/schema.sql</code> y después
          <code> backend/supabase/storage.sql</code>. El segundo script configura los buckets
          <code> firmas</code> y <code> actas_respaldos</code>.
        </p>
      </div>
    </div>
  )
}
