import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, db } from './db';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string) => Promise<boolean>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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

  const signIn = async (email: string) => {
    // In a real app, this would check Firebase Auth
    // For now, we seed a few users and check local DB
    const foundUser = await db.users.where('email').equalsIgnoreCase(email).first();
    if (foundUser) {
      setUser(foundUser);
      localStorage.setItem('current_user', JSON.stringify(foundUser));
      return true;
    }
    return false;
  };

  const signOut = () => {
    setUser(null);
    localStorage.removeItem('current_user');
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
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
