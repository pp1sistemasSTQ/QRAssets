import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // host: true permite abrir la app desde el celular en la misma red (necesario para probar el escáner)
  server: { host: true, port: 5173 },
})
