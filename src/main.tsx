import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { AuthProvider } from './lib/AuthContext';
import { ToastProvider } from './lib/ToastContext';

// Importação do motor PWA (Service Worker)
import { registerSW } from 'virtual:pwa-register';

// Regista o Service Worker para cache offline e atualizações automáticas
const updateSW = registerSW({
  onNeedRefresh() {
    console.log('Nova versão do Patri360 disponível. Atualizando...');
  },
  onOfflineReady() {
    console.log('Patri360 pronto para uso totalmente offline!');
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </AuthProvider>
  </StrictMode>
);