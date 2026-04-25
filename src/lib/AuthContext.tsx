import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, db as localDb } from './db';
import { auth, db as firestore, googleProvider } from './firebase';
import { onAuthStateChanged, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, limit, getDocs } from 'firebase/firestore';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email?: string, password?: string) => Promise<boolean>;
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
        let userDoc = await getDoc(doc(firestore, 'users', firebaseUser.uid));
        
        if (userDoc.exists()) {
          const userData = userDoc.data() as User;
          setUser(userData);
          localStorage.setItem('current_user', JSON.stringify(userData));
        } else if (firebaseUser.email) {
          const q = query(collection(firestore, 'users'), where('email', '==', firebaseUser.email), limit(1));
          const querySnapshot = await getDocs(q);
          if (!querySnapshot.empty) {
             const userData = querySnapshot.docs[0].data() as User;
             setUser(userData);
             localStorage.setItem('current_user', JSON.stringify(userData));
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
    // Only check if explicitly needed or as a one-time safety check
    // We avoid doing this on every unauthenticated load to prevent console 403 errors
    if (auth.currentUser) {
      setIsFirstUser(false);
      return;
    }
    
    // Improved logic: skip check if browser already has user session or if it's a known non-first-user environment
    if (localStorage.getItem('not_first_user')) {
      setIsFirstUser(false);
      return;
    }

    try {
      // Limit to 1 to minimize read cost and check existence efficiently
      const q = query(collection(firestore, 'users'), limit(1));
      const snapshot = await getDocs(q);
      const isEmpty = snapshot.empty;
      setIsFirstUser(isEmpty);
      if (!isEmpty) {
        localStorage.setItem('not_first_user', 'true');
      }
    } catch (e) {
      // 403 is expected for public users if rules are tight. That's fine.
      console.log("Check users skipped/denied (Public Access).");
      setIsFirstUser(false); 
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
      
      let userDoc = await getDoc(doc(firestore, 'users', firebaseUser.uid));
      
      if (userDoc.exists()) {
        const userData = userDoc.data() as User;
        setUser(userData);
        return true;
      } else if (firebaseUser.email) {
        // Fallback: Check if there's a user record with this email created by the admin
        const q = query(collection(firestore, 'users'), where('email', '==', firebaseUser.email), limit(1));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          const userData = querySnapshot.docs[0].data() as User;
          
          // It's a good practice to update the user document to reference the real auth UID, 
          // but for now we'll just log them in using the existing generated ID profile.
          setUser(userData);
          return true;
        }
      }
      
      // Logged in but not registered in Patri-MV
      return false;
    } catch (e: any) {
      console.error("Erro no login:", e);
      // Let the app handle the specific error (could throw instead, but returning false is fine or throw for UI)
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
        email: firebaseUser.email || userData.email
      };
      
      await setDoc(doc(firestore, 'users', firebaseUser.uid), newUser);
      setUser(newUser);
      setIsFirstUser(false);
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
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, isFirstUser }}>
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
