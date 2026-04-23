import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, db } from './db';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string) => Promise<boolean>;
  signUp: (userData: Omit<User, 'userId'>) => Promise<boolean>;
  signOut: () => void;
  isFirstUser: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFirstUser, setIsFirstUser] = useState(false);

  useEffect(() => {
    checkFirstUser();
    try {
      const savedUser = localStorage.getItem('current_user');
      if (savedUser) {
        setUser(JSON.parse(savedUser));
      }
    } catch (e) {
      console.error("Erro ao carregar usuário salvo:", e);
      localStorage.removeItem('current_user');
    }
    setLoading(false);
  }, []);

  const checkFirstUser = async () => {
    const count = await db.users.count();
    setIsFirstUser(count === 0);
  };

  const signIn = async (email: string) => {
    const foundUser = await db.users.where('email').equalsIgnoreCase(email).first();
    if (foundUser) {
      setUser(foundUser);
      localStorage.setItem('current_user', JSON.stringify(foundUser));
      return true;
    }
    return false;
  };

  const signUp = async (userData: Omit<User, 'userId'>) => {
    try {
      const userId = userData.email === 'henri199@gmail.com' ? 'admin-dev' : uuidv4();
      const newUser: User = {
        ...userData,
        userId
      };
      await db.users.add(newUser);
      setUser(newUser);
      localStorage.setItem('current_user', JSON.stringify(newUser));
      setIsFirstUser(false);
      return true;
    } catch (e) {
      console.error("Erro ao cadastrar usuário:", e);
      return false;
    }
  };

  const signOut = () => {
    setUser(null);
    localStorage.removeItem('current_user');
    checkFirstUser();
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
