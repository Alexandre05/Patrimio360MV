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
    <div className="flex flex-col gap-8 animate-in fade-in duration-500 max-w-5xl mx-auto pb-16">
      {/* Header and Add Button */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Comissão de Auditores</h2>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
            Gestão de acessos e permissões administrativas
          </span>
        </div>
        {!isAdding && (
          <Button 
            variant="accent" 
            icon={UserPlus} 
            onClick={() => setIsAdding(true)} 
            className="rounded-3xl shadow-xl hover:shadow-indigo-500/20 px-8 py-4 transition-all duration-300 uppercase tracking-widest font-bold text-xs"
          >
            Adicionar Agente
          </Button>
        )}
      </div>

      {/* Add / Edit Form Card */}
      {isAdding && (
        <Card className="p-8 md:p-10 border-none bg-indigo-600 text-white rounded-3xl shadow-xl transition-all duration-300 relative overflow-hidden animate-in zoom-in-95 duration-300">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
            <ShieldCheck className="w-56 h-56 text-white -rotate-12" />
          </div>
          <div className="relative z-10 flex flex-col gap-8">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <h3 className="font-extrabold text-xl uppercase tracking-tight">
                  {editingUserId ? 'Editar Credenciais' : 'Novas Credenciais'}
                </h3>
                <span className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest">
                  Preencha os dados de acesso do servidor público
                </span>
              </div>
              <button 
                onClick={resetForm} 
                className="w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-2xl transition-all duration-300 border border-white/10"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col gap-4">
                <Input 
                  label="Nome Completo" 
                  placeholder="Ex: João da Silva"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="bg-indigo-500/30 border-indigo-400/20 text-white placeholder:text-indigo-200 rounded-2xl focus:border-white focus:ring-white/10"
                  required
                />
                <Input 
                  label="E-mail Institucional (Google Auth)" 
                  placeholder="Ex: joao@manoelviana.rs.gov.br"
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  className="bg-indigo-500/30 border-indigo-400/20 text-white placeholder:text-indigo-200 rounded-2xl focus:border-white focus:ring-white/10"
                  required
                />
              </div>
              
              <div className="flex flex-col gap-4">
                <Input 
                  label="Cargo / Função" 
                  placeholder="Ex: Secretário de Administração"
                  value={formData.cargo}
                  onChange={e => setFormData({ ...formData, cargo: e.target.value })}
                  className="bg-indigo-500/30 border-indigo-400/20 text-white placeholder:text-indigo-200 rounded-2xl focus:border-white focus:ring-white/10"
                />
                <Select 
                  label="Privilégios no Sistema"
                  value={formData.role}
                  onChange={e => setFormData({ ...formData, role: e.target.value as User['role'] })}
                  className="bg-indigo-500/30 border-indigo-400/20 text-white rounded-2xl focus:border-white"
                  options={[
                    { value: 'vistoriador', label: 'Vistoriador (Comissão)' },
                    { value: 'responsavel', label: 'Responsável (Setor)' },
                    { value: 'administrador', label: 'Administrador Sênior' },
                  ]}
                />
              </div>

              {!editingUserId && (
                <div className="md:col-span-2 bg-indigo-700/30 p-6 rounded-3xl border border-white/5 flex flex-col md:flex-row items-center gap-6">
                  <div className="flex flex-col gap-1 md:w-1/3">
                    <span className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest">Senha Provisória</span>
                    <p className="text-[10px] font-medium text-indigo-300 leading-relaxed uppercase">
                      Se preenchido, o usuário poderá logar com email e senha. Caso contrário, apenas via Google Auth (Recomendado).
                    </p>
                  </div>
                  <div className="flex-1 w-full">
                    <Input 
                      placeholder="Mínimo 6 caracteres"
                      type="text"
                      className="bg-white/10 border-white/10 text-white placeholder:text-indigo-300 h-14 text-center text-md font-mono tracking-widest rounded-2xl"
                      value={formData.password}
                      onChange={e => setFormData({ ...formData, password: e.target.value })}
                    />
                  </div>
                </div>
              )}

              <div className="md:col-span-2 flex justify-end gap-3 mt-4">
                <button 
                  type="button" 
                  onClick={resetForm} 
                  className="px-6 h-12 rounded-2xl text-[10px] font-bold uppercase tracking-wider text-indigo-100 hover:text-white transition-all duration-300"
                >
                  Cancelar
                </button>
                <Button 
                  type="submit" 
                  variant="secondary" 
                  className="px-10 h-12 rounded-3xl text-xs font-bold uppercase tracking-widest shadow-xl text-indigo-600 bg-white hover:bg-indigo-50 border-none transition-all duration-300"
                >
                  {editingUserId ? 'Salvar Alterações' : 'Concluir Cadastro'}
                </Button>
              </div>
            </form>
          </div>
        </Card>
      )}

      {/* Users List Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {users?.map(u => (
          <Card 
            key={u.userId} 
            className="flex items-center gap-6 p-6 group hover:shadow-xl transition-all duration-300 border-slate-100 bg-white rounded-3xl shadow-sm relative overflow-hidden"
          >
            {/* User Initial Circle */}
            <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-3xl flex items-center justify-center text-slate-400 group-hover:bg-slate-900 group-hover:text-white transition-all duration-300 font-extrabold text-xl uppercase group-hover:rotate-6 shrink-0">
              {u.name.charAt(0)}
            </div>

            {/* User Info */}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-slate-900 tracking-tight text-lg line-clamp-1">{u.name}</span>
                {u.role === 'administrador' && <ShieldCheck className="w-4.5 h-4.5 text-indigo-600 shrink-0" />}
              </div>
              <div className="flex flex-col text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2 gap-1.5">
                <span className="flex items-center gap-1.5 leading-none truncate">
                  <Mail className="w-3.5 h-3.5 opacity-40 shrink-0" /> {u.email}
                </span>
                <span className="flex items-center gap-1.5 leading-none truncate">
                  <Briefcase className="w-3.5 h-3.5 opacity-40 shrink-0" /> {u.cargo || 'Comissão Oficial'}
                </span>
              </div>
            </div>
            
            {/* Status badges & Actions */}
            <div className="flex flex-col items-end gap-3 min-w-[110px] relative z-10 shrink-0">
              <div className={cn(
                "text-[9px] font-black uppercase px-3 py-1 rounded-xl border-2 shadow-sm transition-all duration-300",
                u.role === 'administrador' ? "bg-slate-900 text-white border-slate-900 group-hover:bg-indigo-600 group-hover:border-indigo-600" : 
                u.role === 'responsavel' ? "bg-indigo-50 text-indigo-600 border-indigo-100" :
                "bg-slate-50 text-slate-500 border-slate-100"
              )}>
                {u.role === 'administrador' ? 'Admin Sênior' : u.role === 'responsavel' ? 'Gestor' : 'Vistoriador'}
              </div>
              
              {deleteConfirmId === u.userId ? (
                <div className="flex items-center gap-1.5 animate-in slide-in-from-right-4 duration-200">
                  <button 
                    onClick={() => handleDelete(u.userId)}
                    className="h-8 px-4 bg-rose-600 text-white text-[10px] font-extrabold rounded-xl shadow-md uppercase tracking-wider hover:bg-rose-700 transition-colors"
                  >
                    OK
                  </button>
                  <button 
                    onClick={() => setDeleteConfirmId(null)}
                    className="h-8 px-3 bg-slate-100 text-slate-400 text-[10px] font-bold rounded-xl uppercase hover:bg-slate-200 transition-colors"
                  >
                    X
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-3 group-hover:translate-x-0">
                  <button 
                    onClick={() => handleEdit(u)} 
                    className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-2xl transition-all duration-300 border border-transparent hover:border-indigo-100 shadow-sm bg-white"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => setDeleteConfirmId(u.userId)} 
                    className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-2xl transition-all duration-300 border border-transparent hover:border-rose-100 shadow-sm bg-white"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
            
            {/* Decorative Background Icon */}
            <Briefcase className="absolute -bottom-6 -right-6 w-20 h-20 text-slate-50 opacity-0 group-hover:opacity-100 transition-opacity duration-700 -z-0" />
          </Card>
        ))}
      </div>
    </div>
  );
}

