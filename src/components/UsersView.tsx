import React, { useState } from 'react';
import { Card, Button, Input, Select } from './UI';
import { UserPlus, Trash2, Edit2, X, ShieldCheck, Mail, Briefcase } from 'lucide-react';
import { db, User, generateId } from '../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { cn } from '../lib/utils';
import { useAuth } from '../lib/AuthContext';

export function UsersView() {
  const { user: currentUser } = useAuth();
  const users = useLiveQuery(() => db.users.toArray());
  const [isAdding, setIsAdding] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<User & { password?: string }>>({
    name: '',
    email: '',
    role: 'vistoriador',
    cargo: '',
    status: 'ativo',
    password: ''
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email) return;

    try {
      const { doc, setDoc } = await import('firebase/firestore');
      const { db: firestoreDB, firebaseConfigInfo } = await import('../lib/firebase');
      
      let saveId = editingUserId || generateId();

      if (!editingUserId && formData.password) {
        const { getAuth, createUserWithEmailAndPassword, signOut } = await import('firebase/auth');
        const { initializeApp, deleteApp } = await import('firebase/app');
        
        const secondaryAppName = "SecondaryApp_" + Date.now();
        const secondaryApp = initializeApp(firebaseConfigInfo, secondaryAppName);
        const secondaryAuth = getAuth(secondaryApp);
        
        try {
          const result = await createUserWithEmailAndPassword(secondaryAuth, formData.email, formData.password);
          saveId = result.user.uid;
          await signOut(secondaryAuth);
        } catch(e: any) {
          console.error("Erro ao registrar no Auth:", e);
          if (e.code === 'auth/admin-restricted-operation' || e.code === 'auth/operation-not-allowed') {
            alert("Não foi possível criar o usuário. O Firebase não permite criar contas com E-mail/Senha por segurança.");
          } else if (e.code === 'auth/email-already-in-use') {
            alert("Este E-mail já possui um registro de acesso.");
          } else {
            alert("Não foi possível criar o acesso: " + (e.message || "Erro desconhecido."));
            return;
          }
        } finally {
          try { await deleteApp(secondaryApp); } catch(err) { console.error("Error deleting secondary app", err) }
        }
      }

      const userData = {
        name: formData.name,
        email: formData.email,
        role: formData.role,
        cargo: formData.cargo,
        userId: saveId,
        status: 'ativo'
      };

      await setDoc(doc(firestoreDB, 'users', saveId), userData);
      
      if (editingUserId) {
        await db.users.update(editingUserId, userData as any);
      } else {
        await db.users.put(userData as User);
      }
      resetForm();
    } catch (err) {
      console.error("Erro ao salvar usuário:", err);
      alert("Houve um erro ao processar o cadastro.");
    }
  };

  const handleEdit = (user: User) => {
    setEditingUserId(user.userId);
    setFormData(user);
    setIsAdding(true);
  };

  const handleDelete = async (userId: string) => {
    if (userId === currentUser?.userId) {
      alert("Você não pode excluir sua própria conta.");
      setDeleteConfirmId(null);
      return;
    }
    
    try {
      const { doc, deleteDoc } = await import('firebase/firestore');
      const { db: firestoreDB } = await import('../lib/firebase');
      await deleteDoc(doc(firestoreDB, 'users', userId));
      await db.users.delete(userId);
      setDeleteConfirmId(null);
    } catch (err) {
      console.error("Erro ao deletar usuário:", err);
    }
  };

  const resetForm = () => {
    setIsAdding(false);
    setEditingUserId(null);
    setFormData({
      name: '', email: '', role: 'vistoriador', cargo: '', status: 'ativo', password: ''
    });
  };

  return (
    <div className="flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-5xl mx-auto pb-20">
      <div className="flex items-center justify-between px-2 leading-none">
        <div className="flex flex-col gap-2">
          <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Comissão de Auditores</h2>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] leading-none">Gestão de acessos e permissões administrativas</span>
        </div>
        {!isAdding && (
          <Button variant="accent" icon={UserPlus} onClick={() => setIsAdding(true)} className="rounded-2xl px-10 h-16 shadow-2xl shadow-indigo-600/20 uppercase tracking-widest font-black text-xs">
            Adicionar Agente
          </Button>
        )}
      </div>

      {isAdding && (
        <Card className="p-12 border-none shadow-[0_50px_100px_-20px_rgba(0,0,0,0.15)] animate-in zoom-in-95 duration-500 rounded-[3.5rem] bg-indigo-600 text-white overflow-hidden relative">
          <div className="absolute top-0 right-0 p-12 opacity-10 pointer-events-none">
             <ShieldCheck className="w-64 h-64 text-white -rotate-12" />
          </div>
          <div className="relative z-10 flex flex-col gap-10">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-2">
                <h3 className="font-black text-2xl uppercase tracking-tighter">
                  {editingUserId ? 'Editar Credenciais' : 'Novas Credenciais'}
                </h3>
                <span className="text-[10px] font-black text-indigo-200 uppercase tracking-widest">Preencha os dados do servidor público</span>
              </div>
              <button 
                onClick={resetForm} 
                className="w-12 h-12 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-2xl transition-all border border-white/10"
              >
                <X className="w-6 h-6 text-white" />
              </button>
            </div>

            <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="flex flex-col gap-6">
                <Input 
                  label="Nome Completo" 
                  placeholder="Ex: João da Silva"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="bg-indigo-500/50 border-indigo-400/30 text-white placeholder:text-indigo-200"
                  required
                />
                <Input 
                  label="E-mail Institucional" 
                  placeholder="Ex: joao@manoelviana.rs.gov.br"
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  className="bg-indigo-500/50 border-indigo-400/30 text-white placeholder:text-indigo-200"
                  required
                />
              </div>
              
              <div className="flex flex-col gap-6">
                <Input 
                  label="Cargo / Função" 
                  placeholder="Ex: Secretário de Administração"
                  value={formData.cargo}
                  onChange={e => setFormData({ ...formData, cargo: e.target.value })}
                  className="bg-indigo-500/50 border-indigo-400/30 text-white placeholder:text-indigo-200"
                />
                <Select 
                  label="Privilégios no Sistema"
                  value={formData.role}
                  onChange={e => setFormData({ ...formData, role: e.target.value as User['role'] })}
                  className="bg-indigo-500/60 border-indigo-400/30 text-white"
                  options={[
                    { value: 'vistoriador', label: 'Vistoriador (Comissão)' },
                    { value: 'responsavel', label: 'Responsável (Setor)' },
                    { value: 'administrador', label: 'Administrador Senior' },
                  ]}
                />
              </div>

              {!editingUserId && (
                <div className="md:col-span-2 bg-indigo-700/40 p-10 rounded-[2.5rem] border border-white/5 flex flex-col md:flex-row items-center gap-10">
                  <div className="flex flex-col gap-2 md:w-1/3">
                    <span className="text-[10px] font-black text-indigo-200 uppercase tracking-widest">Senha Provisória</span>
                    <p className="text-[10px] font-medium text-indigo-300 leading-relaxed uppercase">
                      Se preenchido, o usuário poderá logar com email e senha. Caso contrário, apenas via Google Auth.
                    </p>
                  </div>
                  <div className="flex-1 w-full">
                    <Input 
                      placeholder="Mínimo 6 caracteres"
                      type="text"
                      className="bg-white/10 border-white/10 text-white placeholder:text-indigo-300 h-16 text-center text-lg font-mono tracking-widest"
                      value={formData.password}
                      onChange={e => setFormData({ ...formData, password: e.target.value })}
                    />
                  </div>
                </div>
              )}

              <div className="md:col-span-2 flex justify-end gap-4 mt-4">
                 <button type="button" onClick={resetForm} className="px-10 h-16 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] text-indigo-200 hover:text-white transition-colors">Cancelar</button>
                 <Button type="submit" variant="secondary" className="px-16 h-16 rounded-2xl text-xs font-black uppercase tracking-[0.2em] shadow-2xl shadow-black/20 text-indigo-600 bg-white hover:bg-indigo-50">
                   {editingUserId ? 'Salvar Alterações' : 'Concluir Cadastro'}
                 </Button>
              </div>
            </form>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {users?.map(u => (
          <Card key={u.userId} className="flex items-center gap-6 p-8 group hover:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.08)] transition-all duration-700 border-slate-50 bg-white rounded-[2.5rem] shadow-sm relative overflow-hidden">
             <div className="w-20 h-20 bg-slate-50 border border-slate-100 rounded-[2rem] flex items-center justify-center text-slate-300 group-hover:bg-slate-900 group-hover:text-white transition-all duration-700 font-black text-2xl uppercase shadow-inner group-hover:rotate-6">
               {u.name.charAt(0)}
             </div>
              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex items-center gap-3">
                  <span className="font-black text-slate-900 tracking-tight text-xl line-clamp-1">{u.name}</span>
                  {u.role === 'administrador' && <ShieldCheck className="w-5 h-5 text-indigo-500 shrink-0" />}
                </div>
                <div className="flex flex-col text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2 gap-1.5">
                  <span className="flex items-center gap-2 leading-none"><Mail className="w-3.5 h-3.5 opacity-40 shrink-0" /> {u.email}</span>
                  <span className="flex items-center gap-2 leading-none"><Briefcase className="w-3.5 h-3.5 opacity-40 shrink-0" /> {u.cargo || 'Comissão Oficial'}</span>
                </div>
             </div>
             
             <div className="flex flex-col items-end gap-4 min-w-[110px] relative z-10">
                <div className={cn(
                   "text-[9px] font-black uppercase px-3.5 py-1.5 rounded-xl border-2 shadow-sm transition-colors duration-500",
                   u.role === 'administrador' ? "bg-slate-900 text-white border-slate-900 group-hover:bg-indigo-600 group-hover:border-indigo-600" : 
                   u.role === 'responsavel' ? "bg-indigo-50 text-indigo-600 border-indigo-100" :
                   "bg-slate-50 text-slate-500 border-slate-100"
                )}>
                  {u.role === 'administrador' ? 'Admin Senior' : u.role === 'responsavel' ? 'Gestor' : 'Vistoriador'}
                </div>
                
                {deleteConfirmId === u.userId ? (
                  <div className="flex items-center gap-2 animate-in slide-in-from-right-4 duration-300">
                    <button 
                      onClick={() => handleDelete(u.userId)}
                      className="h-10 px-5 bg-rose-600 text-white text-[10px] font-black rounded-xl shadow-xl shadow-rose-600/20 uppercase tracking-widest"
                    >
                      OK
                    </button>
                    <button 
                      onClick={() => setDeleteConfirmId(null)}
                      className="h-10 px-5 bg-slate-100 text-slate-400 text-[10px] font-black rounded-xl uppercase tracking-widest"
                    >
                      X
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-500 translate-x-4 group-hover:translate-x-0">
                    <button onClick={() => handleEdit(u)} className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all border border-transparent hover:border-indigo-100 shadow-sm bg-white">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => setDeleteConfirmId(u.userId)} className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all border border-transparent hover:border-rose-100 shadow-sm bg-white">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
             </div>
             
             {/* Decorative Background Icon */}
             <Briefcase className="absolute -bottom-6 -right-6 w-24 h-24 text-slate-50 opacity-0 group-hover:opacity-100 transition-opacity duration-1000 -z-0" />
          </Card>
        ))}
      </div>
    </div>
  );
}
