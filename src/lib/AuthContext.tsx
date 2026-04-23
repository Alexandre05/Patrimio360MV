import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, db as localDb } from './db';
import { auth, db as firestore, googleProvider } from './firebase';
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email?: string) => Promise<boolean>;
  signUp: (userData: Omit<User, 'userId'>) => Promise<boolean>;
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
        const userDoc = await getDoc(doc(firestore, 'users', firebaseUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data() as User;
          setUser(userData);
          localStorage.setItem('current_user', JSON.stringify(userData));
        } else {
          // If auth exists but no doc, check if it's the first user or needs registration
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
    try {
      const q = query(collection(firestore, 'users'));
      const snapshot = await getDocs(q);
      setIsFirstUser(snapshot.empty);
    } catch (e) {
      console.warn("Could not check users count. Defaulting to login.", e);
      setIsFirstUser(false); 
    }
  };

  const signIn = async (email?: string) => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const firebaseUser = result.user;
      
      const userDoc = await getDoc(doc(firestore, 'users', firebaseUser.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data() as User;
        setUser(userData);
        return true;
      } else {
        // Logged in via Google but not registered in Patri-MV
        // We might want to auto-register or show first-access screen
        return false;
      }
    } catch (e) {
      console.error("Erro no login:", e);
      return false;
    }
  };

  const signUp = async (userData: Omit<User, 'userId'>) => {
    try {
      // For first user, we might need a specific flow. 
      // Usually, sign up happens after Google Auth if the user doc doesn't exist
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) {
        // Need to login first
        const result = await signInWithPopup(auth, googleProvider);
        if (!result.user) return false;
        
        const newUser: User = {
          ...userData,
          userId: result.user.uid,
          email: result.user.email || userData.email
        };
        await setDoc(doc(firestore, 'users', result.user.uid), newUser);
        setUser(newUser);
        setIsFirstUser(false);
        return true;
      } else {
        const newUser: User = {
          ...userData,
          userId: firebaseUser.uid,
          email: firebaseUser.email || userData.email
        };
        await setDoc(doc(firestore, 'users', firebaseUser.uid), newUser);
        setUser(newUser);
        setIsFirstUser(false);
        return true;
      }
    } catch (e) {
      console.error("Erro ao cadastrar usuário:", e);
      return false;
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUser(null);
    localStorage.removeItem('current_user');
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
