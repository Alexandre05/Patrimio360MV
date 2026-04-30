/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { Dashboard } from './components/Dashboard';
import { Card, Button, Input } from './components/UI';
import { Building2, LogIn, ShieldCheck, UserPlus, UserCheck, Search } from 'lucide-react';
import { seedDatabase } from './lib/seed';
import { db } from './lib/db';
import { db as firestore } from './lib/firebase';
import { doc, deleteDoc } from 'firebase/firestore';
import { getAuth, sendPasswordResetEmail } from 'firebase/auth';

import { PublicInspectionView } from './components/PublicInspectionView';

function SetupScreen() {
  const { signUp, isFirstUser } = useAuth();
  const [formData, setFormData] = useState({ 
    name: '', 
    email: '', 
    cargo: 'Administrador Senior',
    setupCode: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const expectedKey = (import.meta as any).env.VITE_SETUP_KEY;
    
    if (expectedKey && formData.setupCode !== expectedKey) {
      setError('Chave de segurança inválida.');
      setLoading(false);
      return;
    }

    try {
      const success = await signUp({
        name: formData.name,
        email: formData.email,
        role: 'administrador',
        status: 'ativo',
        cargo: formData.cargo
      }, formData.password || undefined);

      if (!success) {
        setError('Erro ao criar conta. Tente Google Auth.');
      }
    } catch (e: any) {
      setError(e.message || 'Falha ao registrar.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px]">
      <Card className="w-full max-w-lg p-12 flex flex-col items-center gap-10 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.15)] border-none rounded-[3.5rem] bg-white relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-indigo-600"></div>
        <div className="flex flex-col items-center gap-6">
          <div className="w-24 h-24 bg-indigo-600 rounded-[2.5rem] flex items-center justify-center shadow-2xl shadow-indigo-200 animate-in zoom-in duration-700">
            <UserPlus className="text-white w-12 h-12" />
          </div>
          <div className="text-center">
            <h1 className="text-4xl font-display font-black tracking-tight text-slate-900 leading-none">Bem-vindo ao Patri-MV</h1>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.3em] mt-4">Configuração do Administrador Geral</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-8">
          <div className="flex flex-col gap-5">
            <Input 
              label="Nome Completo" 
              placeholder="João da Silva"
              required
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
            />
            <Input 
              label="E-mail Institucional" 
              placeholder="joao@manoelviana.rs.gov.br"
              type="email"
              required
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
            />
             <Input 
              label="Cargo / Função" 
              placeholder="Ex: Prefeito, TI"
              required
              value={formData.cargo}
              onChange={e => setFormData({ ...formData, cargo: e.target.value })}
            />
            <Input 
              label="Senha de Acesso" 
              placeholder="Mínimo 6 caracteres"
              type="password"
              value={formData.password}
              onChange={e => setFormData({ ...formData, password: e.target.value })}
            />
            <div className="pt-4 border-t border-slate-100 mt-2">
              <Input 
                label="Chave de Ativação Master" 
                placeholder="Insira o código de segurança"
                type="password"
                required={!isFirstUser}
                value={formData.setupCode}
                onChange={e => setFormData({ ...formData, setupCode: e.target.value })}
                error={error}
              />
            </div>
          </div>
          
          <Button type="submit" loading={loading} icon={UserCheck} variant="accent" className="h-16 text-sm font-black tracking-[0.2em] rounded-2xl shadow-2xl shadow-indigo-600/20 uppercase">
            ATIVAR PLATAFORMA
          </Button>
          
          <button 
            type="button"
            onClick={() => {
              localStorage.setItem('not_first_user', 'true');
              window.location.reload();
            }}
            className="text-[10px] text-slate-400 hover:text-indigo-600 font-black uppercase tracking-widest text-center transition-colors"
          >
            Já possui uma conta de administrador? Faça Login
          </button>
        </form>

        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center leading-relaxed">
           Esta é a conta raiz do sistema.<br />Certifique-se de usar credenciais seguras.
        </p>
      </Card>
    </div>
  );
}

function LoginScreen() {
  const { signIn, isFirstUser } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [useEmail, setUseEmail] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetMessage, setResetMessage] = useState('');

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const success = useEmail ? await signIn(emailInput, passwordInput) : await signIn();
      if (!success) {
        setError(useEmail 
          ? 'Nenhum cadastro ativo com este e-mail.' 
          : 'Acesso negado. Esta conta do Google não possui permissão.'
        );
      }
    } catch (err: any) {
      if (err.code === 'auth/invalid-login-credentials' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('E-mail ou senha incorretos.');
      } else if (err.code === 'auth/unauthorized-domain') {
        setError('Domínio não autorizado. Verifique as configurações do Firebase ou abra em nova aba.');
      } else if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        setError('O login foi cancelado.');
      } else if (err.code === 'auth/network-request-failed' || err.message?.includes('ERRO DE REDE')) {
        setError('🚨 BLOQUEIO DE SEGURANÇA: O navegador impediu o Google Login. Por favor, clique em "ABRIR EM NOVA GUIA" no menu abaixo para acessar.');
      } else {
        setError('Falha no login: ' + (err.message || 'Erro de conexão.'));
      }
    }
    
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    if (!emailInput) {
      setError('Digite seu e-mail acima primeiro.');
      return;
    }
    setLoading(true);
    setError('');
    setResetMessage('');
    try {
      const auth = getAuth();
      await sendPasswordResetEmail(auth, emailInput);
      setResetMessage('Recuperação enviada! Verifique seu e-mail.');
    } catch (err: any) {
      setError('Não foi possível enviar a recuperação.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:24px_24px]">
      <Card className="w-full max-w-lg p-12 flex flex-col items-center gap-10 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.1)] border-none rounded-[3.5rem] bg-white relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-indigo-600"></div>
        <div className="flex flex-col items-center gap-6">
          <div className="w-20 h-20 bg-slate-900 rounded-[2rem] flex items-center justify-center shadow-2xl shadow-slate-200 rotate-6 transform hover:rotate-0 transition-transform duration-500">
            <ShieldCheck className="text-indigo-400 w-10 h-10 -rotate-6" />
          </div>
          <div className="text-center">
            <h1 className="text-4xl font-display font-black tracking-tight text-slate-900 leading-none uppercase">Patrimônio 360</h1>
            <div className="flex items-center justify-center gap-3 mt-4">
              <span className="w-10 h-[1px] bg-slate-200"></span>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">Manoel Viana</span>
              <span className="w-10 h-[1px] bg-slate-200"></span>
            </div>
          </div>
        </div>

        <div className="w-full flex flex-col gap-6">
           {error && (
             <div className="bg-rose-50 text-rose-600 p-6 rounded-2xl text-xs font-bold border border-rose-100 text-center animate-in shake duration-500 shadow-lg shadow-rose-900/5">
                {error}
             </div>
           )}

           {resetMessage && (
             <div className="bg-emerald-50 text-emerald-600 p-6 rounded-2xl text-xs font-bold border border-emerald-100 text-center shadow-lg shadow-emerald-900/5">
                {resetMessage}
             </div>
           )}

           {useEmail ? (
             <form onSubmit={handleLogin} className="flex flex-col gap-5">
                <Input 
                  label="E-mail Institucional" 
                  type="email" 
                  value={emailInput} 
                  onChange={(e) => setEmailInput(e.target.value)} 
                  required 
                />
                <div className="flex flex-col gap-1">
                  <Input 
                    label="Senha de Acesso" 
                    type="password" 
                    value={passwordInput} 
                    onChange={(e) => setPasswordInput(e.target.value)} 
                    required 
                  />
                  <button 
                    type="button" 
                    onClick={handleForgotPassword}
                    disabled={loading}
                    className="text-[10px] text-slate-400 hover:text-indigo-600 font-black uppercase tracking-widest text-right px-2 mt-1 transition-colors"
                  >
                    Esqueci minha senha?
                  </button>
                </div>
                <Button type="submit" loading={loading} icon={LogIn} variant="accent" className="h-16 text-sm font-black tracking-[0.2em] rounded-2xl shadow-2xl shadow-indigo-600/20 uppercase mt-2">
                  ENTRAR NO SISTEMA
                </Button>
                <button 
                  type="button" 
                  onClick={() => setUseEmail(false)} 
                  className="text-[10px] text-slate-400 hover:text-indigo-600 font-black uppercase tracking-widest text-center mt-4 transition-colors"
                >
                  ← Voltar para Google Auth
                </button>
             </form>
           ) : (
             <div className="flex flex-col gap-4">
               <Button onClick={() => handleLogin()} loading={loading} icon={LogIn} variant="accent" className="h-20 text-sm font-black tracking-[0.2em] rounded-2xl shadow-2xl shadow-indigo-600/25 uppercase">
                 ACESSAR COM CONTA GOOGLE
               </Button>
               <button 
                  type="button" 
                  onClick={() => setUseEmail(true)} 
                  className="text-[10px] text-slate-400 hover:text-indigo-600 font-black uppercase tracking-widest text-center mt-4 transition-colors"
                >
                  Acesso de Administrador / Dev
               </button>
             </div>
           )}
           
           <div className="relative py-4">
             <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
             <div className="relative flex justify-center text-[10px] uppercase font-black text-slate-300 bg-white px-6 tracking-[0.3em]">Ou</div>
           </div>

           <Button 
             type="button"
             variant="secondary"
             onClick={() => {
                window.location.href = '?view=scanner';
             }}
             icon={Search}
             className="h-16 border-2 border-slate-50 text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl text-slate-400 hover:text-indigo-600 hover:bg-indigo-50/10"
           >
             CONSULTAR PATRIMÔNIO PÚBLICO
           </Button>
        </div>

        <div className="flex items-center gap-3 text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">
           <ShieldCheck className="w-5 h-5 text-indigo-200" /> Criptografia End-to-End
        </div>
      </Card>
      
      <div className="fixed bottom-10 text-[10px] font-black text-slate-400 uppercase tracking-widest opacity-20 pointer-events-none">
        © 2026 Patrimônio 360 - Secretaria de Administração
      </div>
    </div>
  );
}

import { PublicScannerView } from './components/PublicScannerView';

function Main() {
  const { user, loading, isFirstUser } = useAuth();
  
  const [routeInfo, setRouteInfo] = useState<{ id: string | null; mode: 'vistoria' | 'local' | 'scanner' | null }>(() => getRouteInfo());

  function getRouteInfo() {
    const fullUrl = window.location.href;
    
    // Detect ID in either path, hash or query
    const vistoriaMatch = fullUrl.match(/vistoria\/([a-zA-Z0-9_-]+)/);
    if (vistoriaMatch && vistoriaMatch[1]) {
      return { id: vistoriaMatch[1], mode: 'vistoria' as const };
    }
    
    const localMatch = fullUrl.match(/local\/([a-zA-Z0-9_-]+)/);
    if (localMatch && localMatch[1]) {
      return { id: localMatch[1], mode: 'local' as const };
    }
    
    // Check search params as fallback
    const params = new URLSearchParams(window.location.search);
    const queryVistoria = params.get('vistoria');
    if (queryVistoria) return { id: queryVistoria, mode: 'vistoria' as const };
    
    const queryLocal = params.get('local');
    if (queryLocal) return { id: queryLocal, mode: 'local' as const };
    
    const queryViewId = params.get('view');
    if (queryViewId === 'scanner') return { id: 'public', mode: 'scanner' as const };
    
    return { id: null, mode: null };
  }

  useEffect(() => {
    const handleHashChange = () => {
      setRouteInfo(getRouteInfo());
      window.scrollTo(0, 0); // Reset scroll on route change
    };
    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('popstate', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('popstate', handleHashChange);
    };
  }, []);

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

  // Handle Public Scanner
  if (routeInfo.mode === 'scanner') {
    return <PublicScannerView onBack={() => {
       setRouteInfo({ id: null, mode: null });
       window.history.replaceState({}, '', '/');
    }} />;
  }

  // Se tem public view ID na URL (/vistoria/ ou /local/), renderiza a visão pública imediatamente.
  // Isso ignora a checagem de auth para visitantes e também exibe o relatório final mesmo para vistoriadores logados
  if (routeInfo.id) {
    return <PublicInspectionView 
      inspectionId={routeInfo.mode === 'vistoria' ? routeInfo.id : undefined} 
      locationId={routeInfo.mode === 'local' ? routeInfo.id : undefined} 
    />;
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

import { SyncToast } from './components/UI';

export default function App() {
  return (
    <AuthProvider>
      <Main />
      <SyncToast />
    </AuthProvider>
  );
}
