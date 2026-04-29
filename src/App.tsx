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
  const { signUp } = useAuth();
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

    try {
      const success = await signUp({
        name: formData.name,
        email: formData.email,
        role: 'administrador',
        status: 'ativo',
        cargo: formData.cargo
      }, formData.password || undefined);

      if (!success) {
        setError('Ocorreu um erro ao criar a conta. Verifique os dados ou tente com o Google Auth.');
      }
    } catch (e: any) {
      setError(e.message || 'Falha ao registrar.');
    }
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
            <Input 
              label="Senha de Acesso (Opcional)" 
              placeholder="Deixe em branco para forçar o uso do Google Auth"
              type="password"
              value={formData.password}
              onChange={e => setFormData({ ...formData, password: e.target.value })}
            />
            <div className="relative mt-2">
              <div className="absolute inset-x-0 -top-3 flex justify-center">
                <span className="bg-white px-2 text-[9px] font-black text-blue-600 uppercase tracking-widest leading-none">Chave de Ativação Geral</span>
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
          ? 'Não encontramos nenhum cadastro ativo com este e-mail.' 
          : 'Acesso negado. A conta do Google selecionada não possui acesso. Solicite o cadastro a um administrador.'
        );
      }
    } catch (err: any) {
      if (err.code === 'auth/invalid-login-credentials' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('E-mail ou senha incorretos.');
      } else if (err.code === 'auth/unauthorized-domain') {
        setError('Este domínio não está autorizado no Firebase. Adicione o domínio do app no Firebase Console em Authentication > Settings > Authorized domains, ou abra o app em uma nova guia.');
      } else if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        setError('O login com o Google foi cancelado ou a janela foi fechada.');
      } else {
        setError('Falha no login: ' + (err.message || 'Erro de conexão.'));
      }
    }
    
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    if (!emailInput) {
      setError('Por favor, digite seu e-mail acima primeiro e então clique aqui.');
      return;
    }
    setLoading(true);
    setError('');
    setResetMessage('');
    try {
      const auth = getAuth();
      await sendPasswordResetEmail(auth, emailInput);
      setResetMessage('E-mail de recuperação de senha enviado! Verifique sua caixa de entrada.');
    } catch (err: any) {
      setError('Não foi possível enviar o e-mail de recuperação. Tente novamente mais tarde.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-6 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:16px_16px]">
      <Card className="w-full max-w-md p-10 flex flex-col items-center gap-8 shadow-2xl border-none ring-1 ring-border bg-card">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-primary rounded-[2rem] flex items-center justify-center shadow-lg shadow-primary/20 rotate-3">
            <ShieldCheck className="text-white w-8 h-8 -rotate-3" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-black tracking-tighter text-primary leading-none">PATRI-MV</h1>
            <span className="text-[9px] font-black text-text-muted uppercase tracking-[0.2em]">Manoel Viana</span>
            <p className="text-text-muted text-xs font-medium mt-3">Sistema de Gestão de Patrimônio Público</p>
          </div>
        </div>

        <div className="w-full flex flex-col gap-5">
           {error && (
             <div className="bg-rose-50 text-rose-600 p-4 rounded-xl text-sm font-bold border border-rose-200 text-center">
               {error}
             </div>
           )}

           {resetMessage && (
             <div className="bg-primary/10 text-primary p-4 rounded-xl text-sm font-bold border border-primary/20 text-center">
               {resetMessage}
             </div>
           )}

           {useEmail ? (
             <form onSubmit={handleLogin} className="flex flex-col gap-4">
                <Input 
                  label="E-mail" 
                  type="email" 
                  value={emailInput} 
                  onChange={(e) => setEmailInput(e.target.value)} 
                  required 
                />
                <Input 
                  label="Senha" 
                  type="password" 
                  value={passwordInput} 
                  onChange={(e) => setPasswordInput(e.target.value)} 
                  required 
                />
                <Button type="submit" loading={loading} icon={LogIn} variant="primary" className="h-14 text-lg shadow-xl shadow-primary/20 border-2 border-transparent mt-2">
                  ENTRAR
                </Button>
                <div className="flex flex-col items-center gap-2 mt-2">
                  <button 
                    type="button" 
                    onClick={handleForgotPassword}
                    disabled={loading}
                    className="text-xs text-text-muted hover:text-primary font-bold transition-colors"
                  >
                    Esqueci minha senha
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setUseEmail(false)} 
                    className="text-xs text-text-muted hover:text-primary font-bold mt-2 transition-colors"
                  >
                    ← Voltar para login com Google
                  </button>
                </div>
             </form>
           ) : (
             <>
               <Button onClick={() => handleLogin()} loading={loading} icon={LogIn} variant="primary" className="h-14 text-lg shadow-xl shadow-primary/20 border-2 border-transparent">
                 ACESSAR COM GOOGLE
               </Button>
               <button 
                  type="button" 
                  onClick={() => setUseEmail(true)} 
                  className="text-xs text-text-muted hover:text-primary font-bold text-center mt-2"
                >
                  Acesso de Administrador / Dev
               </button>
             </>
           )}
           
           <div className="relative py-2">
             <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border"></div></div>
             <div className="relative flex justify-center text-[10px] uppercase font-black text-text-muted bg-card px-4">Ou</div>
           </div>

           <Button 
             type="button"
             variant="outline"
             onClick={() => {
                window.location.href = '?view=scanner';
             }}
             icon={Search}
             className="h-12 border-border text-primary hover:text-primary-light"
           >
             CONSULTAR QR CODE PÚBLICO
           </Button>
        </div>

        <div className="flex flex-col gap-4 w-full">
           <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border"></div></div>
              <div className="relative flex justify-center text-[10px] uppercase font-black text-text-muted tracking-widest"><span className="bg-card px-4">Dica</span></div>
           </div>
           <div className="text-xs text-text-muted text-center leading-relaxed">
             Para acesso de desenvolvedor, habilite o provedor de E-mail/Senha no Firebase Console.
           </div>
        </div>

        <div className="flex items-center gap-2 text-[10px] font-bold text-text-muted uppercase tracking-widest">
           <ShieldCheck className="w-4 h-4" /> Acesso Seguro
        </div>
      </Card>
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
