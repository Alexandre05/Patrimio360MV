import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut as firebaseSignOut, 
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const firebaseConfigInfo = firebaseConfig;
export const firebaseApp = app;

// Inicializa apenas o serviço de Autenticação (Login)
export const auth = getAuth(app);

// Melhora a persistência da sessão no navegador
setPersistence(auth, browserLocalPersistence).catch(err => 
  console.error("Erro de persistência do Auth:", err)
);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});