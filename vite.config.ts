import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'], // Faz cache de todos os arquivos visuais
        maximumFileSizeToCacheInBytes: 5000000, // 5MB limit
      },
      manifest: {
        name: 'Patri360 - Gestão Patrimonial',
        short_name: 'Patri360',
        description: 'Sistema de Auditoria e Gestão Patrimonial Offline-First',
        theme_color: '#0f172a', // Cor do slate-900 (tema do app)
        background_color: '#f8fafc',
        display: 'standalone', // Faz abrir como app nativo (sem barra de URL)
        orientation: 'portrait',
        icons: [
          {
            src: 'https://cdn-icons-png.flaticon.com/512/2907/2907224.png', // Ícone provisório de inventário
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});