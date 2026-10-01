/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { ToastProvider, useToast } from './lib/ToastContext';
import { Dashboard } from './components/Dashboard';
import { Card, Button, Input, Alert } from './components/UI';
import { Building2, LogIn, ShieldCheck, UserPlus, UserCheck, Search, Mail, Key, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { seedDatabase } from './lib/seed';
import { db } from './lib/db';
import { supabase } from './lib/supabase'; // Nosso Supabase oficial
import { getAuth, sendPasswordResetEmail, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from './lib/firebase';

import { PublicInspectionView } from './components/PublicInspectionView';
import { PublicScannerView } from './components/PublicScannerView';
import { SyncToast } from './components/UI';

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
  const { signIn } = useAuth(); // Traz a função de login original do seu sistema
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState('');

  // Função para Login com Google
  const handleGoogleAuth = async () => {
    setLoading(true);
    setError(null);
    setResetMessage('');
    try {
      const success = await signIn(); // Chama o popup do Google
      if (!success) {
        setError('Acesso negado. Esta conta do Google não possui permissão no sistema. Solicite acesso ao Administrador.');
      }
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        setError('O login com Google foi cancelado.');
      } else {
        setError('Falha no login com Google: ' + (err.message || 'Erro de conexão.'));
      }
    } finally {
      setLoading(false);
    }
  };

  // Função para E-mail / Senha
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResetMessage('');

    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError('Este e-mail já possui uma senha. Tente fazer login na aba "Entrar".');
      } else if (err.code === 'auth/invalid-login-credentials' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        setError('E-mail ou senha incorretos. Verifique as suas credenciais.');
      } else if (err.code === 'auth/weak-password') {
        setError('A senha deve ter pelo menos 6 caracteres.');
      } else {
        setError('Ocorreu um erro ao processar a solicitação: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const targetEmail = String(email || '').trim();
    if (!targetEmail) {
      setError('Por favor, digite o seu e-mail no campo acima primeiro.');
      return;
    }
    setLoading(true);
    setError('');
    setResetMessage('');
    try {
      const { getAuth, sendPasswordResetEmail } = await import('firebase/auth');
      const currentAuth = getAuth();
      await sendPasswordResetEmail(currentAuth, targetEmail);
      setResetMessage('Se o e-mail estiver cadastrado, você receberá um link de recuperação (verifique o SPAM).');
    } catch (err: any) {
      if (err?.code === 'auth/invalid-email') {
        setError('O formato do e-mail é inválido.');
      } else {
        setError(String(err?.message || 'Falha na comunicação com o servidor. Tente novamente.'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans relative overflow-hidden bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:24px_24px]">
      
      {/* Elementos de Fundo Estilizados */}
      <div className="absolute top-[0%] left-[-10%] w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none"></div>

      <Card className="w-full max-w-[420px] bg-white rounded-[2.5rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] border border-slate-100 p-8 md:p-10 relative z-10 animate-in fade-in zoom-in-95 duration-700">
        
        {/* Cabeçalho do Login */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-20 h-20 bg-slate-900 rounded-[1.5rem] flex items-center justify-center shadow-2xl shadow-slate-900/20 mb-6 transform rotate-6 hover:rotate-0 transition-transform duration-500">
            <ShieldCheck className="w-10 h-10 text-indigo-400 -rotate-6" />
          </div>
          <h1 className="text-3xl font-display font-extrabold text-slate-900 tracking-tight leading-none mb-3 uppercase">Patrimônio 360</h1>
          <div className="flex items-center justify-center gap-3">
            <span className="w-8 h-[1px] bg-slate-200"></span>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.4em]">Manoel Viana</span>
            <span className="w-8 h-[1px] bg-slate-200"></span>
          </div>
        </div>

        {/* MENSAGENS DE ERRO / SUCESSO */}
        {error && (
          <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl flex items-center gap-3 text-rose-600 animate-in shake mb-6">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p className="text-[11px] font-bold leading-tight">{error}</p>
          </div>
        )}

        {resetMessage && (
          <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl flex items-center gap-3 text-emerald-700 animate-in slide-in-from-top-2 mb-6">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <p className="text-[11px] font-bold leading-tight">{resetMessage}</p>
          </div>
        )}

        {/* BOTÃO DO GOOGLE (Administradores) */}
        <button
          type="button"
          onClick={handleGoogleAuth}
          disabled={loading}
          className="w-full h-14 bg-white border border-slate-200 text-slate-700 font-black text-[11px] uppercase tracking-widest rounded-2xl shadow-sm hover:bg-slate-50 flex items-center justify-center gap-3 transition-all mb-6 disabled:opacity-50"
        >
          <svg className="w-5 h-5" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/>
            <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/>
            <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"/>
            <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/>
          </svg>
          Continuar com Google
        </button>

        <div className="relative py-2 mb-6">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
          <div className="relative flex justify-center text-[9px] uppercase font-black text-slate-300 bg-white px-4 tracking-[0.3em]">Ou use E-mail e Senha</div>
        </div>

        {/* Abas Indutivas (Agentes e Comissões) */}
        <div className="flex p-1 bg-slate-100 rounded-2xl mb-6 relative shadow-inner">
          <button
            type="button"
            onClick={() => { setIsRegistering(false); setError(null); setResetMessage(''); }}
            className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all duration-300 flex items-center justify-center gap-2 ${!isRegistering ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <LogIn className="w-4 h-4" /> Entrar
          </button>
          <button
            type="button"
            onClick={() => { setIsRegistering(true); setError(null); setResetMessage(''); }}
            className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all duration-300 flex items-center justify-center gap-2 ${isRegistering ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <UserPlus className="w-4 h-4" /> 1º Acesso
          </button>
        </div>

        {/* Formulário Principal */}
        <form onSubmit={handleAuth} className="flex flex-col gap-4">
          
          {isRegistering && (
            <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl flex gap-3 text-emerald-700 animate-in slide-in-from-top-2 mb-2">
               <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" />
               <p className="text-[11px] font-medium leading-relaxed">
                 Insira o e-mail cadastrado pelo administrador e <strong>crie a sua senha pessoal</strong> abaixo.
               </p>
            </div>
          )}

          <div className="flex flex-col gap-1.5 relative group">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
            <input
              type="email"
              required
              placeholder="E-mail Institucional"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-12 pr-4 h-14 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition-all placeholder:text-slate-400"
            />
          </div>

          <div className="flex flex-col gap-1 relative group">
            <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
            <input
              type="password"
              required
              placeholder={isRegistering ? "Crie uma senha (min. 6 carac.)" : "Sua senha de acesso"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-12 pr-4 h-14 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition-all placeholder:text-slate-400"
            />
            {!isRegistering && (
              <button 
                type="button" 
                onClick={handleForgotPassword}
                disabled={loading}
                className="text-[10px] text-slate-400 hover:text-indigo-600 font-black uppercase tracking-widest text-right px-2 mt-2 transition-colors"
              >
                Esqueci minha senha
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`mt-4 w-full h-14 rounded-2xl flex items-center justify-center gap-2 text-[11px] font-black uppercase tracking-widest text-white shadow-xl transition-all duration-300 ${isRegistering ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/30' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/30'} disabled:opacity-70 disabled:cursor-not-allowed`}
          >
            {loading ? (
              <span className="animate-pulse">A Processar...</span>
            ) : (
              <>
                {isRegistering ? 'Ativar Credencial' : 'Acessar Sistema'}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="relative py-6">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
          <div className="relative flex justify-center text-[9px] uppercase font-black text-slate-300 bg-white px-4 tracking-[0.3em]">Cidadão</div>
        </div>

        <Button 
          type="button"
          variant="secondary"
          onClick={() => window.location.href = '?view=scanner'}
          icon={Search}
          className="w-full h-14 border-2 border-slate-50 text-[10px] font-black uppercase tracking-[0.1em] rounded-2xl text-slate-400 hover:text-indigo-600 hover:bg-indigo-50/50 hover:border-indigo-100 transition-all shadow-sm"
        >
          Portal da Transparência
        </Button>
      </Card>
      
      <div className="fixed bottom-8 text-[9px] font-black text-slate-400 uppercase tracking-widest opacity-30 pointer-events-none text-center px-6">
        © 2026 Patrimônio 360 - Secretaria de Administração
      </div>
    </div>
  );
}

function Main() {
  const { user, loading, isFirstUser } = useAuth();
  
  const [routeInfo, setRouteInfo] = useState<{ id: string | null; mode: 'vistoria' | 'local' | 'scanner' | null }>(() => getRouteInfo());

  function getRouteInfo() {
    const fullUrl = window.location.href;
    
    const vistoriaMatch = fullUrl.match(/vistoria\/([a-zA-Z0-9_-]+)/);
    if (vistoriaMatch && vistoriaMatch[1]) {
      return { id: vistoriaMatch[1], mode: 'vistoria' as const };
    }
    
    const localMatch = fullUrl.match(/local\/([a-zA-Z0-9_-]+)/);
    if (localMatch && localMatch[1]) {
      return { id: localMatch[1], mode: 'local' as const };
    }
    
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
      window.scrollTo(0, 0);
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

  // Limpeza de vistorias vazias usando Supabase
  useEffect(() => {
    async function cleanupEmptyInspections() {
      if (!user) return;
      try {
        const allInspections = await db.inspections.toArray();
        const completed = allInspections.filter(i => i.status === 'concluida' || i.status === 'finalizada');
        
        for (const insp of completed) {
          const count = await db.assets.where('inspectionId').equals(insp.id).count();
          if (count === 0) {
            console.log(`Removendo vistoria órfã/vazia: ${insp.id}`);
            await db.inspections.delete(insp.id);
            try { 
              await supabase.from('inspections').delete().eq('id', insp.id); 
            } catch(e){}
          }
        }
      } catch (err) {
        console.error("Erro na limpeza automática:", err);
      }
    }
    cleanupEmptyInspections();
  }, [user]);

  if (routeInfo.mode === 'scanner') {
    return <PublicScannerView onBack={() => {
       setRouteInfo({ id: null, mode: null });
       window.history.replaceState({}, '', '/');
    }} />;
  }

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

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Main />
        <SyncToast />
      </ToastProvider>
    </AuthProvider>
  );
}