import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server port picked from the high range to avoid clashing with other local services.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 41873, strictPort: true },
  preview: { port: 41874, strictPort: true },
});
