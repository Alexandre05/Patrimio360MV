/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { Dashboard } from './components/Dashboard';
import { Card, Button, Input } from './components/UI';
import { Building2, LogIn, ShieldCheck } from 'lucide-react';
import { seedDatabase } from './lib/seed';

function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    const success = await signIn(email);
    if (!success) {
      setError('Acesso negado. Utilize um e-mail de membro cadastrado.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px]">
      <Card className="w-full max-w-md p-10 flex flex-col items-center gap-8 shadow-2xl border-none ring-1 ring-slate-200">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-slate-900 rounded-[2rem] flex items-center justify-center shadow-lg shadow-slate-200 rotate-3">
            <ShieldCheck className="text-white w-8 h-8 -rotate-3" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-black tracking-tighter text-slate-900 leading-none">PATRI-MV</h1>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Manoel Viana</span>
            <p className="text-slate-500 text-xs font-medium mt-3">Sistema de Gestão de Patrimônio Público</p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="w-full flex flex-col gap-5">
          <Input 
            label="E-mail de Acesso" 
            placeholder="ex: prefeito@exemplo.com"
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            error={error}
          />
          <Button type="submit" loading={loading} icon={LogIn} className="h-14 text-lg">
            ACESSAR SISTEMA
          </Button>
        </form>

        <div className="flex flex-col gap-4 w-full">
           <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
              <div className="relative flex justify-center text-[10px] uppercase font-black text-slate-300 tracking-widest"><span className="bg-white px-4">Demo Accounts</span></div>
           </div>
           <div className="grid grid-cols-1 gap-2">
              <button 
                onClick={() => setEmail('prefeito@exemplo.com')}
                className="text-xs text-slate-400 hover:text-slate-900 font-bold p-2 text-left bg-slate-50 rounded-lg border border-transparent hover:border-slate-200 transition-all"
              >
                🔑 Prefeito (Gestão Total)
              </button>
              <button 
                onClick={() => setEmail('comissao@exemplo.com')}
                className="text-xs text-slate-400 hover:text-slate-900 font-bold p-2 text-left bg-slate-50 rounded-lg border border-transparent hover:border-slate-200 transition-all"
              >
                🔍 Comissão (Vistorias)
              </button>
           </div>
        </div>

        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
           <ShieldCheck className="w-4 h-4" /> Acesso Seguro • Offline-First
        </div>
      </Card>
    </div>
  );
}

function Main() {
  const { user, loading } = useAuth();
  const [publicInspectionId, setPublicInspectionId] = useState<string | null>(null);

  useEffect(() => {
    seedDatabase().catch(err => {
      console.error("Erro ao inicializar banco de dados:", err);
    });

    const params = new URLSearchParams(window.location.search);
    const viewId = params.get('view');
    if (viewId) {
      setPublicInspectionId(viewId);
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 animate-pulse">
           <div className="w-12 h-12 bg-slate-300 rounded-2xl"></div>
           <div className="h-4 w-24 bg-slate-200 rounded-full"></div>
        </div>
      </div>
    );
  }

  if (publicInspectionId) {
    return <PublicView id={publicInspectionId} onBack={() => {
      setPublicInspectionId(null);
      window.history.replaceState({}, '', window.location.pathname);
    }} />;
  }

  return user ? <Dashboard /> : <LoginScreen />;
}

import { InspectionPublicView as PublicView } from './components/InspectionPublicView';

export default function App() {
  return (
    <AuthProvider>
      <Main />
    </AuthProvider>
  );
}
