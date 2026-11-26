import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, db as localDb } from './db';
import { auth, googleProvider } from './firebase';
import { supabase } from './supabase';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
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

  const autorizarUsuarioFirebase = async (firebaseUser: any): Promise<User | null> => {
    if (firebaseUser.isAnonymous) {
      return {
        userId: firebaseUser.uid,
        name: 'Cidadão (Consulta)',
        email: 'public@patri-mv.gov.br',
        role: 'vistoriador',
        status: 'ativo',
        cargo: 'Visitante'
      };
    }

    const userEmail = firebaseUser.email?.toLowerCase().trim();
    if (!userEmail) return null;

    // 1. Master Admin
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
      localStorage.setItem('current_user', JSON.stringify(userData));
      return userData;
    }

    // 2. Busca no banco local (Dexie)
    try {
      const localUser = await localDb.users.where('email').equalsIgnoreCase(userEmail).first();
      if (localUser && !localUser.deleted) {
        localStorage.setItem('current_user', JSON.stringify(localUser));
        return localUser;
      }
    } catch (e) {
      console.error("Erro ao verificar utilizador local:", e);
    }

    // 3. Fallback na nuvem (Supabase) caso seja o primeiro acesso neste aparelho
    try {
      const { data: cloudUser } = await supabase
        .from('users')
        .select('*')
        .ilike('email', userEmail)
        .eq('deleted', false)
        .maybeSingle();

      if (cloudUser) {
        await localDb.users.put(cloudUser as User);
        localStorage.setItem('current_user', JSON.stringify(cloudUser));
        return cloudUser as User;
      }
    } catch (e) {
      console.error("Erro ao buscar utilizador no Supabase:", e);
    }

    return null;
  };

  useEffect(() => {
    let ativo = true;

    const inicializarAuth = async () => {
      try {
        await getRedirectResult(auth);
      } catch (e) {
        console.warn("Aviso no retorno do redirect Google:", e);
      }

      const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        if (!ativo) return;
        if (firebaseUser) {
          const autorizado = await autorizarUsuarioFirebase(firebaseUser);
          if (autorizado) {
            setUser(autorizado);
          } else {
            try { await firebaseSignOut(auth); } catch {}
            setUser(null);
            localStorage.removeItem('current_user');
          }
        } else {
          setUser(null);
          localStorage.removeItem('current_user');
        }
        setLoading(false);
        setIsFirstUser(false);
      });

      return unsubscribe;
    };

    const unsubPromise = inicializarAuth();
    return () => {
      ativo = false;
      unsubPromise.then((unsub) => unsub && unsub());
    };
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
      if (email && password) {
        const result = await signInWithEmailAndPassword(auth, email, password);
        const autorizado = await autorizarUsuarioFirebase(result.user);
        if (autorizado) {
          setUser(autorizado);
          return true;
        }
        await firebaseSignOut(auth);
        throw new Error("Acesso Restrito. Seu e-mail não pertence à comissão de patrimônio de Manoel Viana.");
      }

      // Login com Google via Pop-up direto no clique do usuario (evita loop de redirect)
      googleProvider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, googleProvider);
      const autorizado = await autorizarUsuarioFirebase(result.user);
      if (autorizado) {
        setUser(autorizado);
        return true;
      }
      await firebaseSignOut(auth);
      throw new Error("Acesso Restrito. Seu e-mail não pertence à comissão de patrimônio de Manoel Viana.");
    } catch (e: any) {
      console.error("Erro no login:", e);
      if (e.code === 'auth/network-request-failed') {
        throw new Error("ERRO DE REDE: O login falhou. Verifique sua conexão com a internet.");
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
          googleProvider.setCustomParameters({ prompt: 'select_account' });
          await signInWithRedirect(auth, googleProvider);
          return true;
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
