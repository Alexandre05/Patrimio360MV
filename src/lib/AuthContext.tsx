import React, { createContext, useContext, useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { User, db as localDb } from './db';
import { auth, googleProvider } from './firebase';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut as firebaseSignOut,
  signInAnonymously
} from 'firebase/auth';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email?: string, password?: string) => Promise<boolean>;
  signInAsGuest: () => Promise<void>;
  signUp: (userData: Omit<User, 'userId'>, password?: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  isFirstUser: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFirstUser, setIsFirstUser] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        if (firebaseUser.isAnonymous) {
          setUser({
            userId: firebaseUser.uid,
            name: 'Cidadão (Consulta)',
            email: 'public@patri-mv.gov.br',
            role: 'vistoriador',
            status: 'ativo',
            cargo: 'Visitante'
          });
          setLoading(false);
          return;
        }

        const userEmail = firebaseUser.email?.toLowerCase().trim();

        // 1. O "Master Admin" (Reconhecimento Imediato via Código - Sem bloqueio do Firestore)
        if (userEmail === 'alexandremenna05@gmail.com') {
          const userData: User = {
            userId: firebaseUser.uid,
            name: firebaseUser.displayName || 'Alexandre Barreto Menna',
            email: userEmail,
            role: 'administrador',
            status: 'ativo',
            cargo: 'Administrador Master'
          };
          
          await localDb.users.put(userData);
          setUser(userData);
          localStorage.setItem('current_user', JSON.stringify(userData));
          setLoading(false);
          return;
        }

        // 2. Utilizadores comuns cadastrados localmente no Dexie
        if (userEmail) {
          try {
            const localUser = await localDb.users.where('email').equals(userEmail).first();
            if (localUser) {
              setUser(localUser);
              localStorage.setItem('current_user', JSON.stringify(localUser));
              setLoading(false);
              return;
            }
          } catch (e) {
            console.error("Erro ao verificar utilizador local:", e);
          }
        }

        // Se não for master nem estiver cadastrado, encerra a sessão por segurança
        try {
          await firebaseSignOut(auth);
        } catch (e) {}
        setUser(null);
        localStorage.removeItem('current_user');
      } else {
        setUser(null);
        localStorage.removeItem('current_user');
      }
      setLoading(false);
      setIsFirstUser(false);
    });

    return () => unsubscribe();
  }, []);

  const signInAsGuest = async () => {
    try {
      await signInAnonymously(auth);
    } catch (e) {
      console.error("Erro ao entrar como convidado:", e);
      throw e;
    }
  };

  const signIn = async (email?: string, password?: string) => {
    try {
      let firebaseUser;
      if (email && password) {
        const result = await signInWithEmailAndPassword(auth, email, password);
        firebaseUser = result.user;
      } else {
        const result = await signInWithPopup(auth, googleProvider);
        firebaseUser = result.user;
      }
      
      const userEmail = firebaseUser.email?.toLowerCase().trim();

      // Libera acesso imediato para o Master Admin
      if (userEmail === 'alexandremenna05@gmail.com') {
        const userData: User = {
          userId: firebaseUser.uid,
          name: firebaseUser.displayName || 'Alexandre Barreto Menna',
          email: userEmail,
          role: 'administrador',
          status: 'ativo',
          cargo: 'Administrador Master'
        };
        
        await localDb.users.put(userData);
        setUser(userData);
        localStorage.setItem('current_user', JSON.stringify(userData));
        return true;
      }

      // Verifica se existe no banco local Dexie
      if (userEmail) {
        const localUser = await localDb.users.where('email').equals(userEmail).first();
        if (localUser) {
          setUser(localUser);
          localStorage.setItem('current_user', JSON.stringify(localUser));
          return true;
        }
      }

      if (auth.currentUser) {
        await firebaseSignOut(auth);
      }
      setUser(null);
      localStorage.removeItem('current_user');
      
      throw new Error("Acesso Restrito. Seu e-mail não pertence à comissão de patrimônio de Manoel Viana.");
    } catch (e: any) {
      console.error("Erro no login:", e);
      if (e.code === 'auth/network-request-failed') {
        throw new Error("ERRO DE REDE: O login falhou. Por favor, abra o aplicativo em uma nova aba.");
      }
      throw e;
    }
  };

  const signUp = async (userData: Omit<User, 'userId'>, password?: string) => {
    try {
      let firebaseUser = auth.currentUser;
      
      if (!firebaseUser) {
        if (password) {
           const result = await createUserWithEmailAndPassword(auth, userData.email, password);
           firebaseUser = result.user;
        } else {
           const result = await signInWithPopup(auth, googleProvider);
           firebaseUser = result.user;
        }
      }
      
      if (!firebaseUser) return false;

      const newUser: User = {
        ...userData,
        userId: firebaseUser.uid,
        email: firebaseUser.email?.toLowerCase().trim() || userData.email
      };
      
      await localDb.users.put(newUser);
      setUser(newUser);
      setIsFirstUser(false);
      localStorage.setItem('not_first_user', 'true');
      return true;
    } catch (e) {
      console.error("Erro ao cadastrar usuário:", e);
      return false;
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (e) {
      console.warn('Erro remoto no logout:', e);
    } finally {
      setUser(null);
      localStorage.removeItem('current_user');
      window.location.reload();
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signInAsGuest, signUp, signOut, isFirstUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}