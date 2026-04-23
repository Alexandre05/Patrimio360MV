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
import { db } from './lib/db';
import { db as firestore } from './lib/firebase';
import { doc, deleteDoc } from 'firebase/firestore';

import { UserPlus, UserCheck } from 'lucide-react';

const params = new URLSearchParams(window.location.search);
const publicViewId = params.get('view');

function SetupScreen() {
  const { signUp } = useAuth();
  const [formData, setFormData] = useState({ 
    name: '', 
    email: '', 
    cargo: 'Administrador Senior',
    setupCode: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Security check: 
    // 1. Check if it matches the environment key
    // 2. Or allow the specific dev email (henri199@gmail.com)
    const expectedKey = (import.meta as any).env.VITE_SETUP_KEY || 'admin123';
    const isDev = formData.email === 'henri199@gmail.com';
    
    if (formData.setupCode !== expectedKey && !isDev) {
      setError('Chave de segurança inválida. Entre em contato com o administrador do servidor.');
      setLoading(false);
      return;
    }

    await signUp({
      name: formData.name,
      email: formData.email,
      role: 'administrador',
      status: 'ativo',
      cargo: formData.cargo
    });
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px]">
      <Card className="w-full max-w-md p-10 flex flex-col items-center gap-8 shadow-2xl border-none ring-1 ring-slate-200">
        <div className="flex flex-col items-center gap-4">
          <div className="w-20 h-20 bg-blue-600 rounded-[2.5rem] flex items-center justify-center shadow-2xl shadow-blue-200 animate-bounce">
            <UserPlus className="text-white w-10 h-10" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-black tracking-tighter text-slate-900 leading-none">PRIMEIRO ACESSO</h1>
            <p className="text-slate-500 text-xs font-medium mt-3">Configuração do Administrador Mestre</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-5">
          <div className="flex flex-col gap-4">
            <Input 
              label="Seu Nome Completo" 
              placeholder="Ex: João da Silva"
              required
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
            />
            <Input 
              label="Seu E-mail de Acesso" 
              placeholder="Ex: joao@manoelviana.rs.gov.br"
              type="email"
              required
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
            />
             <Input 
              label="Seu Cargo" 
              placeholder="Ex: Prefeito, Chefe de TI"
              required
              value={formData.cargo}
              onChange={e => setFormData({ ...formData, cargo: e.target.value })}
            />
            <div className="relative">
              <div className="absolute inset-x-0 -top-3 flex justify-center">
                <span className="bg-white px-2 text-[9px] font-black text-blue-600 uppercase tracking-widest leading-none">Segurança</span>
              </div>
              <Input 
                label="Chave de Ativação" 
                placeholder="Código de segurança do sistema"
                type="password"
                required={formData.email !== 'henri199@gmail.com'}
                value={formData.setupCode}
                onChange={e => setFormData({ ...formData, setupCode: e.target.value })}
                error={error}
              />
            </div>
          </div>
          
          <Button type="submit" loading={loading} icon={UserCheck} className="h-14 text-lg bg-blue-600 hover:bg-blue-700 shadow-blue-200">
            CRIAR CONTA ADMIN
          </Button>
        </form>

        <div className="flex flex-col gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">
           A chave padrão é <code className="text-blue-600">admin123</code> (alterável nas configs do servidor).
           <br />
           Seu e-mail dev tem acesso automático.
        </div>
      </Card>
    </div>
  );
}

function LoginScreen() {
  const { signIn, isFirstUser } = useAuth();
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
                className="text-xs text-slate-400 hover:text-slate-900 font-bold p-2 text-left bg-slate-50 rounded-lg border border-transparent hover:border-slate-200 transition-all text-center"
              >
                Pelo menos um Administrador deve ser cadastrado primeiro.
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
  const { user, loading, isFirstUser } = useAuth();

  useEffect(() => {
    seedDatabase().catch(err => {
      console.error("Erro ao inicializar banco de dados:", err);
    });
  }, []);

  // Tarefa de limpeza invisível (Limpar concluídas com 0 itens)
  useEffect(() => {
    async function cleanupEmptyInspections() {
      if (!user) return; // run when authenticated
      try {
        const allInspections = await db.inspections.toArray();
        const completed = allInspections.filter(i => i.status === 'concluida' || i.status === 'finalizada');
        
        for (const insp of completed) {
          const count = await db.assets.where('inspectionId').equals(insp.id).count();
          if (count === 0) {
            console.log(`Removendo vistoria órfã/vazia: ${insp.id}`);
            await db.inspections.delete(insp.id);
            try { await deleteDoc(doc(firestore, 'inspections', insp.id)); } catch(e){}
          }
        }
      } catch (err) {
        console.error("Erro na limpeza automática:", err);
      }
    }
    cleanupEmptyInspections();
  }, [user]);

  // Se tem public view ID na URL, ignora qualquer auth loading e mostra direto.
  if (publicViewId) {
    return <PublicView id={publicViewId} onBack={() => {
      window.history.replaceState({}, '', window.location.pathname);
      window.location.reload();
    }} />;
  }

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

  if (isFirstUser) return <SetupScreen />;

  return user ? <Dashboard /> : <LoginScreen />;
}

import { InspectionPublicView as PublicView } from './components/InspectionPublicView';

import { SyncToast } from './components/UI';

export default function App() {
  return (
    <AuthProvider>
      <Main />
      <SyncToast />
    </AuthProvider>
  );
}
