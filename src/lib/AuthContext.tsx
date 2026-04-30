import React, { createContext, useContext, useEffect, useState } from 'react';
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

        let userDoc = await getDoc(doc(firestore, 'users', firebaseUser.uid));
        
        if (userDoc.exists()) {
          const userData = userDoc.data() as User;
          setUser(userData);
          localStorage.setItem('current_user', JSON.stringify(userData));
        } else if (firebaseUser.email) {
          const q = query(collection(firestore, 'users'), where('email', '==', firebaseUser.email), limit(1));
          const querySnapshot = await getDocs(q);
          if (!querySnapshot.empty) {
             const oldDoc = querySnapshot.docs[0];
             const userData = oldDoc.data() as User;
             
             // Migrate the document to the new UID
             const newUserData = { ...userData, userId: firebaseUser.uid };
             await setDoc(doc(firestore, 'users', firebaseUser.uid), newUserData);
             
             try {
                // Clean up old document
                const { deleteDoc } = await import('firebase/firestore');
                if (oldDoc.id !== firebaseUser.uid) {
                  await deleteDoc(doc(firestore, 'users', oldDoc.id));
                }
             } catch(e) { }

             setUser(newUserData);
             localStorage.setItem('current_user', JSON.stringify(newUserData));
          } else {
             setUser(null);
          }
        } else {
          setUser(null);
        }
      } else {
        setUser(null);
        localStorage.removeItem('current_user');
      }
      setLoading(false);
      checkFirstUser();
    });

    return () => unsubscribe();
  }, []);

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
      
      // Check admins collection first for super admin privileges
      const adminDoc = await getDoc(doc(firestore, 'admins', firebaseUser.uid));
      const isAdmin = adminDoc.exists();

      let userDoc = await getDoc(doc(firestore, 'users', firebaseUser.uid));
      
      if (userDoc.exists()) {
        const userData = userDoc.data() as User;
        // Inject super admin status if found in admins collection
        const updatedUser = { ...userData, role: isAdmin ? 'administrador' : userData.role };
        setUser(updatedUser);
        return true;
      } else if (firebaseUser.email) {
        // Fallback: Check if there's a user record with this email created by the admin
        const q = query(collection(firestore, 'users'), where('email', '==', firebaseUser.email), limit(1));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          const oldDoc = querySnapshot.docs[0];
          const userData = oldDoc.data() as User;
          
          // Migrate the document to the new UID
          const newUserData = { ...userData, userId: firebaseUser.uid, role: isAdmin ? 'administrador' : userData.role };
          await setDoc(doc(firestore, 'users', firebaseUser.uid), newUserData);
          
          try {
             const { deleteDoc } = await import('firebase/firestore');
             if (oldDoc.id !== firebaseUser.uid && oldDoc.id !== '_config') {
               await deleteDoc(doc(firestore, 'users', oldDoc.id));
             }
          } catch(e) { }

          setUser(newUserData);
          return true;
        }
      }
      
      // If they are in the 'admins' collection but don't have a record in 'users' yet, 
      // let them in (they probably need to register or we can auto-create)
      if (isAdmin) {
        const newUser: User = {
          userId: firebaseUser.uid,
          name: firebaseUser.displayName || 'Administrador',
          email: firebaseUser.email || '',
          role: 'administrador',
          status: 'ativo',
          cargo: 'Super Admin'
        };
        await setDoc(doc(firestore, 'users', firebaseUser.uid), newUser);
        setUser(newUser);
        return true;
      }
      
      if (auth.currentUser) {
        await firebaseSignOut(auth);
      }
      return false;
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

import { v4 as uuidv4 } from 'uuid';

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
