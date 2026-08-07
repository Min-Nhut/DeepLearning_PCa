import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Two portals, one codebase (see src/lib/portal.ts for why they're split):
//   npm run dev        -> mode "doctor", http://localhost:5173
//   npm run dev:admin  -> mode "admin",  http://localhost:5174
// strictPort so a busy port fails loudly instead of silently drifting to
// another one — a drifted port would be a different origin than the backend's
// CORS_ORIGINS allows, and the failure would surface as confusing CORS errors
// rather than "port in use".
// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  server: {
    port: mode === 'admin' ? 5174 : 5173,
    strictPort: true,
  },
}))
