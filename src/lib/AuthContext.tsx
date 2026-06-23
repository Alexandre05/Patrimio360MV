import React, { createContext, useContext, useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { User, db as localDb } from './db';
import { auth, db as firestore, googleProvider } from './firebase';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut as firebaseSignOut,
  signInAnonymously
} from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, limit, getDocs, where } from 'firebase/firestore';

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
        // If it is an anonymous user (guest citizen)
        if (firebaseUser.isAnonymous) {
          setUser({
            userId: firebaseUser.uid,
            name: 'Cidadão (Consulta)',
            email: 'public@patri-mv.gov.br',
            role: 'vistoriador', // Using low level role just to satisfy internal types if needed, rules will handle actual access
            status: 'ativo',
            cargo: 'Visitante'
          });
          setLoading(false);
          return;
        }

        const userEmail = firebaseUser.email;

        // 1. O "Master Admin" (Acesso Incondicional)
        if (userEmail === 'henri199@gmail.com') {
          try {
            let userDoc = await getDoc(doc(firestore, 'users', firebaseUser.uid));
            let userData: User;
            
            if (userDoc.exists()) {
              userData = userDoc.data() as User;
              if (userData.role !== 'administrador' || userData.email !== userEmail) {
                userData = {
                  ...userData,
                  role: 'administrador',
                  email: userEmail
                };
                await setDoc(doc(firestore, 'users', firebaseUser.uid), userData);
              }
            } else {
              userData = {
                userId: firebaseUser.uid,
                name: firebaseUser.displayName || 'Master Admin',
                email: userEmail,
                role: 'administrador',
                status: 'ativo',
                cargo: 'Administrador Master'
              };
              await setDoc(doc(firestore, 'users', firebaseUser.uid), userData);
            }
            
            // Salvar no Dexie
            await localDb.users.put(userData);
            
            setUser(userData);
            localStorage.setItem('current_user', JSON.stringify(userData));
          } catch (e) {
            console.error("Erro ao configurar Master Admin:", e);
          }
          setLoading(false);
          return;
        }

        // 2. A "Lista de Convidados" (Comissão de Vistoria)
        if (userEmail) {
          try {
            // Verificar se o documento existe direto pelo UID
            let userDoc = await getDoc(doc(firestore, 'users', firebaseUser.uid));
            if (userDoc.exists()) {
              const userData = userDoc.data() as User;
              if (userData.email === userEmail) {
                await localDb.users.put(userData);
                setUser(userData);
                localStorage.setItem('current_user', JSON.stringify(userData));
                setLoading(false);
                return;
              }
            }

            // Senão, tentar buscar pelo e-mail
            const q = query(collection(firestore, 'users'), where('email', '==', userEmail), limit(1));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
              const oldDoc = querySnapshot.docs[0];
              const userData = oldDoc.data() as User;
              
              // Migrar documento para o novo UID do Google Auth
              const newUserData = { ...userData, userId: firebaseUser.uid };
              await setDoc(doc(firestore, 'users', firebaseUser.uid), newUserData);
              
              try {
                const { deleteDoc } = await import('firebase/firestore');
                if (oldDoc.id !== firebaseUser.uid) {
                  await deleteDoc(doc(firestore, 'users', oldDoc.id));
                }
              } catch (e) {}

              await localDb.users.put(newUserData);
              setUser(newUserData);
              localStorage.setItem('current_user', JSON.stringify(newUserData));
              setLoading(false);
              return;
            }
          } catch (e) {
            console.error("Erro ao verificar lista de convidados:", e);
          }
        }

        // Se chegarmos aqui e não for o primeiro usuário instalando o sistema, é um estranho!
        // 3. O "Bloqueio de Estranhos" (Acesso Negado)
        if (!isFirstUser) {
          console.warn("Acesso negado: Usuário estranho bloqueado na portaria.");
          try {
            await firebaseSignOut(auth);
          } catch (e) {}
          setUser(null);
          localStorage.removeItem('current_user');
        } else {
          // No caso de primeiro usuário criando conta
          setLoading(false);
          return;
        }
      } else {
        setUser(null);
        localStorage.removeItem('current_user');
      }
      setLoading(false);
      checkFirstUser();
    });

    return () => unsubscribe();
  }, [isFirstUser]);

  const checkFirstUser = async () => {
    if (auth.currentUser) {
      setIsFirstUser(false);
      return;
    }
    
    const cachedNotFirst = localStorage.getItem('not_first_user');
    if (cachedNotFirst === 'true') {
      setIsFirstUser(false);
      return;
    }

    try {
      // Check for sentinel document (allowed public read in rules)
      const configDoc = await getDoc(doc(firestore, 'users', '_config'));
      
      if (configDoc.exists()) {
        setIsFirstUser(false);
        localStorage.setItem('not_first_user', 'true');
        return;
      }

      // If sentinel is missing, we check if the collection is truly empty
      // Note: This might fail if rules are strict, which is fine
      const q = query(collection(firestore, 'users'), limit(1));
      const querySnapshot = await getDocs(q);
      
      const isEmpty = querySnapshot.empty;
      setIsFirstUser(isEmpty);
      
      if (!isEmpty) {
        localStorage.setItem('not_first_user', 'true');
      }
    } catch (e: any) {
      // If we get a permission error, it means the rules are already active
      // usually implying that the system is already set up and secured.
      console.log("CheckFirstUser: Access restricted, assuming not first setup.");
      setIsFirstUser(false);
      localStorage.setItem('not_first_user', 'true');
    }
  };

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
      
      const userEmail = firebaseUser.email;

      // 1. O "Master Admin" (Acesso Incondicional)
      if (userEmail === 'henri199@gmail.com') {
        const userUid = firebaseUser.uid;
        
        let userDoc = await getDoc(doc(firestore, 'users', userUid));
        let userData: User;
        
        if (userDoc.exists()) {
          userData = userDoc.data() as User;
          if (userData.role !== 'administrador' || userData.email !== userEmail) {
            userData = {
              ...userData,
              role: 'administrador',
              email: userEmail
            };
            await setDoc(doc(firestore, 'users', userUid), userData);
          }
        } else {
          userData = {
            userId: userUid,
            name: firebaseUser.displayName || 'Master Admin',
            email: userEmail,
            role: 'administrador',
            status: 'ativo',
            cargo: 'Administrador Master'
          };
          await setDoc(doc(firestore, 'users', userUid), userData);
        }
        
        // Salvar no Dexie
        await localDb.users.put(userData);
        
        setUser(userData);
        localStorage.setItem('current_user', JSON.stringify(userData));
        return true;
      }

      // Se for o primeiro usuário configurando o sistema, permite o login inicial
      if (isFirstUser) {
        return true;
      }

      // 2. A "Lista de Convidados" (Comissão de Vistoria)
      if (userEmail) {
        // Tenta ver se temos cadastro pelo e-mail
        const q = query(collection(firestore, 'users'), where('email', '==', userEmail), limit(1));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          const matchedDoc = querySnapshot.docs[0];
          const userData = matchedDoc.data() as User;
          
          let finalUserData = { ...userData };
          
          // Se o UID do login for diferente do ID cadastrado, realiza a migração de UID
          if (matchedDoc.id !== firebaseUser.uid) {
            finalUserData.userId = firebaseUser.uid;
            await setDoc(doc(firestore, 'users', firebaseUser.uid), finalUserData);
            
            try {
              const { deleteDoc } = await import('firebase/firestore');
              if (matchedDoc.id !== '_config' && matchedDoc.id !== firebaseUser.uid) {
                await deleteDoc(doc(firestore, 'users', matchedDoc.id));
              }
            } catch (e) {
              console.error("Erro ao deletar documento antigo:", e);
            }
          }
          
          // Salvar no Dexie
          await localDb.users.put(finalUserData);
          
          setUser(finalUserData);
          localStorage.setItem('current_user', JSON.stringify(finalUserData));
          return true;
        }

        // Tenta ver se há um documento de usuário direto com este UID
        const directDoc = await getDoc(doc(firestore, 'users', firebaseUser.uid));
        if (directDoc.exists()) {
          const directData = directDoc.data() as User;
          if (directData.email === userEmail) {
            await localDb.users.put(directData);
            setUser(directData);
            localStorage.setItem('current_user', JSON.stringify(directData));
            return true;
          }
        }
      }

      // 3. O "Bloqueio de Estranhos" (Acesso Negado)
      if (auth.currentUser) {
        await firebaseSignOut(auth);
      }
      setUser(null);
      localStorage.removeItem('current_user');
      
      throw new Error("Acesso Restrito. Seu e-mail não pertence à comissão de patrimônio de Manoel Viana.");
    } catch (e: any) {
      console.error("Erro no login:", e);
      if (e.code === 'auth/network-request-failed') {
        throw new Error("ERRO DE REDE: O login com Google falhou. Isso acontece quando o iframe é bloqueado pelo navegador ou por problemas de conexão. Por favor, tente abrir o aplicativo em uma NOVA ABA ou verifique sua conexão.");
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

      // If it's the first user, create the sentinel document
      if (isFirstUser) {
        await setDoc(doc(firestore, 'users', '_config'), {
          initializedAt: new Date().toISOString(),
          initialAdmin: firebaseUser.uid
        });
      }

      const newUser: User = {
        ...userData,
        userId: firebaseUser.uid,
        email: firebaseUser.email || userData.email
      };
      
      await setDoc(doc(firestore, 'users', firebaseUser.uid), newUser);
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
