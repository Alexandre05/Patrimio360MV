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
import { getStorage } from 'firebase/storage';
import { 
  initializeFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp, 
  getDocFromServer 
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const firebaseConfigInfo = firebaseConfig;
export const firebaseApp = app;
export const auth = getAuth(app);

// Improve persistence for shared environments
setPersistence(auth, browserLocalPersistence).catch(err => console.error("Persistence error:", err));

export const storage = getStorage(app);

// Use initializeFirestore with experimentalForceLongPolling for better stability in iframe environments
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

export interface FirestoreErrorInfo {
  error: string;
  operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';
  path: string | null;
  authInfo: {
    userId: string;
    email: string;
    emailVerified: boolean;
    isAnonymous: boolean;
    providerInfo: { providerId: string; displayName: string; email: string; }[];
  }
}

export function handleFirestoreError(error: any, operationType: any, path: string | null = null): never {
  const user = auth.currentUser;
  const message = error.message || String(error);
  
  // Check for specific quota or connectivity errors
  const isQuotaExceeded = message.includes('Quota exceeded') || message.includes('quota') || message.includes('limit');
  const isOffline = message.includes('offline');

  const errorInfo: FirestoreErrorInfo = {
    error: isQuotaExceeded 
      ? "LIMITE DE COTAS EXCEDIDO: O sistema atingiu o limite de uso diário gratuito do Google Cloud. Os dados locais continuam seguros, mas a sincronização em nuvem voltará ao normal amanhã."
      : isOffline 
        ? "SEM CONEXÃO: Verifique sua internet. O sistema continuará funcionando no modo offline."
        : message,
    operationType,
    path,
    authInfo: {
      userId: user?.uid || 'unauthenticated',
      email: user?.email || '',
      emailVerified: user?.emailVerified || false,
      isAnonymous: user?.isAnonymous || false,
      providerInfo: user?.providerData.map(p => ({
        providerId: p.providerId,
        displayName: p.displayName || '',
        email: p.email || ''
      })) || []
    }
  };
  throw new Error(JSON.stringify(errorInfo));
}
