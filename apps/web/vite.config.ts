import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // same-origin /api in development, so cookies and CORS behave as they will behind one domain
    proxy: { '/api': 'http://localhost:3000' },
  },
});
