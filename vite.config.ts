import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/warehouse-knowledge-base/',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
});
