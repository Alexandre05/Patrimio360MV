import React, { useState } from 'react';
import { Card, Button, Input, Select } from './UI';
import { UserPlus, Trash2, Edit2, X, ShieldCheck, Mail, Briefcase } from 'lucide-react';
import { db, User, generateId } from '../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { cn } from '../lib/utils';

export function UsersView() {
  const users = useLiveQuery(() => db.users.toArray());
  const [isAdding, setIsAdding] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<User>>({
    name: '',
    email: '',
    role: 'vistoriador',
    cargo: '',
    status: 'ativo'
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email) return;

    try {
      if (editingUserId) {
        await db.users.update(editingUserId, formData);
      } else {
        await db.users.add({
          ...(formData as User),
          userId: generateId(),
          status: 'ativo'
        });
      }
      resetForm();
    } catch (err) {
      console.error("Erro ao salvar usuário:", err);
    }
  };

  const handleEdit = (user: User) => {
    setEditingUserId(user.userId);
    setFormData(user);
    setIsAdding(true);
  };

  const handleDelete = async (userId: string) => {
    if (confirm("Deseja realmente remover este membro?")) {
      await db.users.delete(userId);
    }
  };

  const resetForm = () => {
    setIsAdding(false);
    setEditingUserId(null);
    setFormData({
      name: '',
      email: '',
      role: 'vistoriador',
      cargo: '',
      status: 'ativo'
    });
  };

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-500 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Membros da Comissão</h2>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mt-1">Gestão de acessos e permissões</span>
        </div>
        {!isAdding && (
          <Button variant="accent" size="sm" icon={UserPlus} onClick={() => setIsAdding(true)} className="rounded-xl px-6 h-12 shadow-xl shadow-slate-900/10 uppercase tracking-widest font-black text-[10px]">
            Novo Membro
          </Button>
        )}
      </div>

      {isAdding && (
        <Card className="p-8 border-2 border-slate-900 animate-in zoom-in-95 duration-300 rounded-[2.5rem]">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-black text-slate-900 text-lg uppercase tracking-tight">
              {editingUserId ? 'Editar Membro' : 'Novo Membro'}
            </h3>
            <button onClick={resetForm} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <Input 
                label="Nome Completo" 
                placeholder="Ex: Pedro Silva"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                required
              />
              <Input 
                label="E-mail de Acesso" 
                placeholder="Ex: pedro@exemplo.com"
                type="email"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>
            
            <div className="space-y-4">
              <Input 
                label="Cargo / Função" 
                placeholder="Ex: Secretário, Monitor..."
                value={formData.cargo}
                onChange={e => setFormData({ ...formData, cargo: e.target.value })}
              />
              <Select 
                label="Nível de Acesso"
                value={formData.role}
                onChange={e => setFormData({ ...formData, role: e.target.value as User['role'] })}
                options={[
                  { value: 'vistoriador', label: 'Vistoriador (Comissão)' },
                  { value: 'responsavel', label: 'Responsável (Patrimônio)' },
                  { value: 'administrador', label: 'Administrador Geral' },
                ]}
              />
            </div>

            <div className="md:col-span-2 flex justify-end gap-3 pt-4 border-t border-slate-100 mt-4">
               <Button type="button" variant="secondary" onClick={resetForm} className="rounded-xl px-8 uppercase font-black text-[10px] tracking-widest">Cancelar</Button>
               <Button type="submit" variant="accent" className="rounded-xl px-12 h-14 uppercase font-black text-[10px] tracking-widest shadow-2xl shadow-slate-900/20">
                 {editingUserId ? 'Salvar Alterações' : 'Cadastrar Membro'}
               </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {users?.map(u => (
          <Card key={u.userId} className="flex items-center gap-5 p-6 group hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-500 border-slate-50">
             <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-[1.5rem] flex items-center justify-center text-slate-400 group-hover:bg-slate-900 group-hover:text-white transition-all duration-500 font-black text-xl uppercase shadow-inner">
               {u.name.charAt(0)}
             </div>
              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-black text-slate-900 tracking-tight text-lg line-clamp-1">{u.name}</span>
                  {u.role === 'administrador' && <ShieldCheck className="w-4 h-4 text-slate-900 shrink-0" />}
                </div>
                <div className="flex flex-col text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                  <span className="flex items-center gap-1.5"><Mail className="w-3 h-3" /> {u.email}</span>
                  <span className="flex items-center gap-1.5 mt-0.5"><Briefcase className="w-3 h-3" /> {u.cargo || 'Comissão'}</span>
                </div>
             </div>
             <div className="flex flex-col items-end gap-3">
                <div className={cn(
                  "text-[9px] font-black uppercase px-3 py-1 rounded-full border shadow-sm",
                  u.role === 'administrador' ? "bg-slate-900 text-white border-slate-900" : 
                  u.role === 'responsavel' ? "bg-blue-50 text-blue-700 border-blue-100" :
                  "bg-slate-50 text-slate-600 border-slate-100"
                )}>
                  {u.role === 'administrador' ? 'Administrador' : u.role === 'responsavel' ? 'Responsável' : 'Vistoriador'}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                   <button onClick={() => handleEdit(u)} className="p-2 text-slate-300 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-all">
                    <Edit2 className="w-4 h-4" />
                   </button>
                   <button onClick={() => handleDelete(u.userId)} className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all">
                    <Trash2 className="w-4 h-4" />
                   </button>
                </div>
             </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
