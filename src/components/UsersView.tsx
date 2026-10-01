import React, { useState } from 'react';
import { Card, Button, Input, Select } from './UI';
import { UserPlus, Trash2, Edit2, X, ShieldCheck, Mail, Briefcase, Key, Shield, UserCog, CheckCircle2, AlertCircle } from 'lucide-react';
import { db, User, generateId } from '../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { cn } from '../lib/utils';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase'; // Nosso Supabase oficial

export function UsersView() {
  const { user: currentUser } = useAuth();
  const users = useLiveQuery(() => db.users.filter(u => !u.deleted).toArray());
  const [isAdding, setIsAdding] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [formData, setFormData] = useState<Partial<User>>({
    name: '',
    email: '',
    role: 'vistoriador',
    status: 'ativo'
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email) return;
    setLoading(true);

    try {
      let saveId = editingUserId || generateId();

      // Payload perfeitamente alinhado com o banco de dados (camelCase, sem colunas fantasmas)
      const userData = {
        userId: saveId,
        name: formData.name,
        email: formData.email,
        role: formData.role || 'vistoriador',
        status: 'ativo',
        updatedAt: Date.now(),
        deleted: false
      };

      // 1. Salva na Nuvem (Supabase)
      const { error: upsertError } = await supabase
        .from('users')
        .upsert(userData, { onConflict: 'userId' });

      if (upsertError) {
        throw new Error(upsertError.message);
      }

      // 2. Salva Localmente (Dexie)
      if (editingUserId) {
        await db.users.update(editingUserId, userData as any);
      } else {
        await db.users.put(userData as any);
      }

      setSuccessMsg(editingUserId ? "Credenciais atualizadas com sucesso!" : "Novo agente cadastrado com sucesso!");
      setTimeout(() => setSuccessMsg(null), 3000);
      resetForm();
    } catch (err: any) {
      console.error("Erro ao salvar usuário:", err);
      alert("Houve um erro ao processar o cadastro: " + (err.message || 'Erro desconhecido'));
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (user: User) => {
    setEditingUserId(user.userId);
    setFormData(user);
    setIsAdding(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (userId: string) => {
    if (userId === currentUser?.userId) {
      alert("Operação bloqueada: Você não pode excluir a sua própria sessão ativa.");
      setDeleteConfirmId(null);
      return;
    }
    
    try {
      // Exclusão lógica (soft delete) e atualização na nuvem
      await supabase.from('users').update({ deleted: true, updatedAt: Date.now() }).eq('userId', userId);
      await db.users.update(userId, { deleted: true, updatedAt: Date.now() });
      setDeleteConfirmId(null);
    } catch (err) {
      console.error("Erro ao deletar usuário:", err);
      alert("Erro ao remover agente. Verifique sua conexão.");
    }
  };

  const resetForm = () => {
    setIsAdding(false);
    setEditingUserId(null);
    setFormData({ name: '', email: '', role: 'vistoriador', status: 'ativo' });
  };

  const roleColors: Record<string, string> = {
    'administrador': 'bg-slate-900 text-white border-slate-900 shadow-lg shadow-slate-900/20',
    'responsavel': 'bg-indigo-50 text-indigo-600 border-indigo-200 shadow-sm',
    'vistoriador': 'bg-white text-slate-500 border-slate-200 shadow-sm',
    'prefeito': 'bg-emerald-50 text-emerald-600 border-emerald-200 shadow-sm'
  };

  const roleLabels: Record<string, string> = {
    'administrador': 'Admin Sênior',
    'responsavel': 'Gestor de Setor',
    'vistoriador': 'Auditor/Vistoriador',
    'prefeito': 'Autoridade Municipal'
  };

  return (
    <div className="flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-5xl mx-auto pb-20">
      
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-2">
        <div className="flex items-center gap-5">
           <div className="w-16 h-16 bg-white rounded-[1.5rem] flex items-center justify-center shadow-xl shadow-slate-200/50 border border-slate-100 shrink-0">
              <UserCog className="w-8 h-8 text-indigo-600" />
           </div>
           <div className="flex flex-col gap-1">
             <h2 className="text-3xl font-display font-extrabold text-slate-900 tracking-tight leading-none uppercase">Comissão de Auditores</h2>
             <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
               Gestão de Credenciais e Acessos ao Sistema
             </span>
           </div>
        </div>
        
        {!isAdding && (
          <Button 
            variant="accent" 
            icon={UserPlus} 
            onClick={() => setIsAdding(true)} 
            className="rounded-[1.25rem] shadow-xl shadow-indigo-600/20 h-14 px-8 transition-all duration-300 uppercase tracking-widest font-black text-[10px]"
          >
            Autorizar Novo Agente
          </Button>
        )}
      </div>

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-[1.5rem] flex items-center gap-4 text-emerald-600 animate-in slide-in-from-top-4 shadow-xl shadow-emerald-500/5">
           <CheckCircle2 className="w-6 h-6 shrink-0" />
           <p className="text-xs font-bold uppercase tracking-widest flex-1">{successMsg}</p>
        </div>
      )}

      {/* Formulário Profissional */}
      {isAdding && (
        <Card className="p-8 md:p-10 border-none bg-slate-900 text-white rounded-[2.5rem] shadow-2xl transition-all duration-500 relative overflow-hidden animate-in zoom-in-95">
          <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none transform translate-x-8 -translate-y-8">
            <Shield className="w-64 h-64 text-white" />
          </div>
          
          <div className="relative z-10 flex flex-col gap-8">
            <div className="flex items-center justify-between border-b border-white/10 pb-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg border border-indigo-500">
                   <Key className="w-6 h-6 text-white" />
                </div>
                <div className="flex flex-col gap-1">
                  <h3 className="font-display font-bold text-2xl uppercase tracking-tight leading-none">
                    {editingUserId ? 'Atualizar Credenciais' : 'Nova Autorização'}
                  </h3>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Emissão de acesso ao painel de transparência
                  </span>
                </div>
              </div>
              <button 
                type="button"
                onClick={resetForm} 
                className="w-10 h-10 flex items-center justify-center bg-white/5 hover:bg-rose-500 hover:text-white text-slate-400 rounded-xl transition-all duration-300 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-1">
                   <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Identificação Oficial</label>
                   <Input 
                     placeholder="Ex: Nome Completo do Servidor"
                     value={formData.name}
                     onChange={e => setFormData({ ...formData, name: e.target.value })}
                     className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 rounded-2xl h-14 focus:border-indigo-400 focus:ring-indigo-400/20"
                     required
                   />
                </div>
                <div className="flex flex-col gap-1">
                   <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">E-mail Institucional</label>
                   <Input 
                     placeholder="Ex: servidor@manoelviana.rs.gov.br"
                     type="email"
                     value={formData.email}
                     onChange={e => setFormData({ ...formData, email: e.target.value })}
                     className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 rounded-2xl h-14 focus:border-indigo-400 focus:ring-indigo-400/20"
                     required
                   />
                </div>
              </div>
              
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-1">
                   <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Nível de Permissão (Role)</label>
                   <Select 
                     value={formData.role}
                     onChange={e => setFormData({ ...formData, role: e.target.value as User['role'] })}
                     className="bg-slate-800 border-white/10 text-white rounded-2xl h-14 focus:border-indigo-400"
                     options={[
                       { value: 'vistoriador', label: 'Vistoriador (Comissão Básica)' },
                       { value: 'responsavel', label: 'Gestor (Responsável por Setor)' },
                       { value: 'administrador', label: 'Administrador (Acesso Total)' },
                     ]}
                   />
                </div>
                
                <div className="flex items-center gap-3 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl mt-2">
                   <ShieldCheck className="w-5 h-5 text-indigo-400 shrink-0" />
                   <p className="text-[10px] font-medium text-indigo-200 leading-relaxed uppercase tracking-wider">
                     O nível de acesso determina quais módulos e ferramentas de edição este agente poderá visualizar no sistema.
                   </p>
                </div>
              </div>

              <div className="md:col-span-2 flex flex-col-reverse sm:flex-row justify-end gap-3 mt-4 pt-6 border-t border-white/10">
                <Button 
                  type="button" 
                  variant="secondary"
                  onClick={resetForm} 
                  className="px-8 h-14 rounded-2xl text-[10px] font-black uppercase tracking-widest border-white/10 bg-transparent text-slate-300 hover:bg-white/5 hover:text-white"
                >
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  variant="accent" 
                  loading={loading}
                  className="px-10 h-14 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-600/30"
                >
                  {editingUserId ? 'Salvar Configurações' : 'Emitir Credencial'}
                </Button>
              </div>
            </form>
          </div>
        </Card>
      )}

      {/* Grid de Agentes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {users?.map(u => (
          <div 
            key={u.userId} 
            className="flex flex-col sm:flex-row sm:items-center gap-5 p-6 bg-white border border-slate-100 rounded-[2rem] shadow-sm hover:shadow-xl hover:border-indigo-100 transition-all duration-300 group relative overflow-hidden"
          >
            {/* Avatar Elegante */}
            <div className="w-16 h-16 bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] flex items-center justify-center text-slate-400 group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-600 transition-all duration-500 font-display font-black text-2xl uppercase group-hover:rotate-3 shrink-0 shadow-sm">
              {u.name.charAt(0)}
            </div>

            <div className="flex-1 flex flex-col min-w-0">
              <div className="flex items-center gap-3">
                <h4 className="font-bold text-slate-900 tracking-tight text-lg truncate pr-2">{u.name}</h4>
              </div>
              <div className="flex flex-col text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1.5 gap-1.5">
                <span className="flex items-center gap-2 truncate">
                  <Mail className="w-3.5 h-3.5 opacity-50 shrink-0" /> {u.email}
                </span>
              </div>
              
              {/* Badge de Cargo integrado na base */}
              <div className="mt-4 flex items-center">
                 <div className={cn(
                   "text-[9px] font-black uppercase px-3 py-1.5 rounded-xl border flex items-center gap-1.5",
                   roleColors[u.role] || roleColors['vistoriador']
                 )}>
                   {u.role === 'administrador' && <ShieldCheck className="w-3 h-3" />}
                   {roleLabels[u.role] || 'Agente'}
                 </div>
              </div>
            </div>
            
            {/* Controlos Laterais */}
            <div className="flex flex-row sm:flex-col items-end gap-2 absolute top-6 right-6 sm:static">
              {deleteConfirmId === u.userId ? (
                <div className="flex items-center gap-2 animate-in fade-in duration-200">
                  <button 
                    onClick={() => handleDelete(u.userId)}
                    className="h-10 px-4 bg-rose-600 text-white text-[10px] font-black rounded-xl shadow-lg uppercase tracking-widest hover:bg-rose-700 transition-all cursor-pointer"
                  >
                    Excluir
                  </button>
                  <button 
                    onClick={() => setDeleteConfirmId(null)}
                    className="w-10 h-10 flex items-center justify-center bg-slate-100 text-slate-400 rounded-xl hover:bg-slate-200 hover:text-slate-600 transition-all cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 opacity-100 sm:opacity-0 sm:translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
                  <button 
                    onClick={() => handleEdit(u)} 
                    title="Editar Agente"
                    className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all border border-slate-100 hover:border-indigo-100 bg-slate-50 cursor-pointer shadow-sm"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => setDeleteConfirmId(u.userId)} 
                    title="Remover Agente"
                    className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all border border-slate-100 hover:border-rose-100 bg-slate-50 cursor-pointer shadow-sm"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {users?.length === 0 && (
         <div className="py-20 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-[3rem] bg-white shadow-sm mt-4">
            <UserCog className="w-12 h-12 opacity-20 mb-4" />
            <p className="font-bold tracking-widest text-xs uppercase">Nenhum agente cadastrado no sistema</p>
         </div>
      )}
    </div>
  );
}