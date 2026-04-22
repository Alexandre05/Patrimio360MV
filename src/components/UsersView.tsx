import { Card, Button } from './UI';
import { UserPlus } from 'lucide-react';
import { db } from '../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { cn } from '../lib/utils';

export function UsersView() {
  const users = useLiveQuery(() => db.users.toArray());

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900">Membros da Comissão</h2>
        <Button variant="primary" size="sm" icon={UserPlus}>Cadastrar Membro</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {users?.map(u => (
          <Card key={u.userId} className="flex items-center gap-4">
             <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 uppercase font-black text-lg">
               {u.name.charAt(0)}
             </div>
             <div className="flex-1 flex flex-col">
                <span className="font-bold text-slate-900">{u.name}</span>
                <span className="text-xs text-slate-500 font-medium">{u.cargo}</span>
             </div>
             <div className="flex flex-col items-end gap-1">
                <span className={cn(
                  "text-[9px] font-black uppercase px-2 py-0.5 rounded-full",
                  u.role === 'prefeito' ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-600"
                )}>
                  {u.role}
                </span>
                <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest">{u.status}</span>
             </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
