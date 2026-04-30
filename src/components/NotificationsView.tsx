import { Card, Button } from './UI';
import { Bell, AlertTriangle, Clock, Check, Trash2, ArrowLeft } from 'lucide-react';
import { db, Notification } from '../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../lib/AuthContext';
import { formatDate } from '../lib/utils';
import { markAsRead, markAllAsRead } from '../lib/NotificationService';
import { cn } from '../lib/utils';

export function NotificationsView({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const notifications = useLiveQuery(
    () => user ? db.notifications.where('targetUserId').equals(user.userId).reverse().sortBy('date') : [],
    [user]
  );

  const unreadCount = notifications?.filter(n => !n.read).length || 0;

  const handleDelete = async (id: string) => {
    await db.notifications.delete(id);
  };

  if (!user) return null;

  return (
    <div className="flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <header className="flex items-center justify-between px-2">
        <button onClick={onBack} className="flex items-center gap-3 text-slate-400 font-black text-[10px] tracking-[0.2em] hover:text-slate-900 transition-all group">
          <div className="w-10 h-10 bg-white border border-slate-100 rounded-xl flex items-center justify-center group-hover:-translate-x-1 transition-transform">
            <ArrowLeft className="w-5 h-5" />
          </div>
          VOLTAR AO DASHBOARD
        </button>
        {unreadCount > 0 && (
          <button 
            onClick={() => markAllAsRead(user.userId)} 
            className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-6 py-3 rounded-2xl border border-indigo-100 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
          >
            MARCAR TODAS COMO LIDAS
          </button>
        )}
      </header>

      <div className="flex flex-col gap-2 px-2">
        <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">Central de Alertas</h2>
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Monitoramento de vistorias e integridade física dos ativos</span>
      </div>

      <div className="flex flex-col gap-4">
        {notifications?.length === 0 ? (
          <Card className="flex flex-col items-center justify-center py-24 border-none bg-white rounded-[2.5rem] shadow-sm">
            <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mb-6">
              <Bell className="w-10 h-10 text-slate-200" />
            </div>
            <p className="font-black text-slate-300 uppercase tracking-[0.3em] text-xs">Sem notificações no momento</p>
          </Card>
        ) : (
          notifications?.map(n => (
            <Card 
              key={n.id} 
              className={cn(
                "relative group flex gap-6 p-8 transition-all duration-700 rounded-[2.5rem] border-slate-50 bg-white hover:shadow-2xl hover:shadow-indigo-500/5",
                !n.read ? "ring-2 ring-indigo-600/5 shadow-indigo-500/10" : "opacity-60"
              )}
            >
              <div className={cn(
                "w-16 h-16 rounded-[1.5rem] flex items-center justify-center shrink-0 shadow-lg transition-transform group-hover:scale-110 duration-500",
                n.type === 'alerta' ? "bg-rose-500 text-white shadow-rose-500/20" : "bg-indigo-500 text-white shadow-indigo-500/20"
              )}>
                {n.type === 'alerta' ? <AlertTriangle className="w-7 h-7" /> : <Clock className="w-7 h-7" />}
              </div>
              
              <div className="flex flex-col gap-3 flex-1 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="font-black text-slate-900 text-lg uppercase tracking-tight leading-none">{n.title}</span>
                    {!n.read && <span className="w-2 h-2 bg-indigo-600 rounded-full animate-pulse" />}
                  </div>
                  <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest bg-slate-50 px-3 py-1 rounded-lg border border-slate-100">{formatDate(n.date)}</span>
                </div>
                <p className="text-sm text-slate-500 leading-relaxed font-medium line-clamp-2 md:line-clamp-none pr-6">{n.message}</p>
                
                <div className="flex items-center gap-6 mt-2 pt-4 border-t border-slate-50">
                  {!n.read && (
                    <button 
                      onClick={() => markAsRead(n.id)}
                      className="text-[9px] font-black text-indigo-600 hover:text-indigo-700 uppercase tracking-widest flex items-center gap-2 transition-colors"
                    >
                      <Check className="w-4 h-4" /> MARCAR COMO LIDA
                    </button>
                  )}
                  <button 
                    onClick={() => handleDelete(n.id)}
                    className="text-[9px] font-black text-slate-300 hover:text-rose-500 uppercase tracking-widest flex items-center gap-2 transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-4 h-4" /> EXCLUIR REGISTRO
                  </button>
                </div>
              </div>

              {!n.read && (
                <div className="absolute top-8 right-8 w-1 h-1 bg-indigo-600 rounded-full pointer-events-none" />
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
