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
    <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-4 duration-500">
      <header className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-500 font-bold hover:text-slate-900 transition-colors">
          <ArrowLeft className="w-5 h-5" /> VOLTAR
        </button>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={() => markAllAsRead(user.userId)} className="text-xs font-bold text-blue-600">
            MARCAR TODAS COMO LIDAS
          </Button>
        )}
      </header>

      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold text-slate-900">Notificações</h2>
        <p className="text-sm text-slate-500">Avisos de vistorias e alertas de patrimônio</p>
      </div>

      <div className="flex flex-col gap-3">
        {notifications?.length === 0 ? (
          <Card className="flex flex-col items-center justify-center py-20 border-dashed border-2 border-slate-200 text-slate-400">
            <Bell className="w-12 h-12 opacity-10 mb-4" />
            <p className="font-medium">Nenhuma notificação por enquanto</p>
          </Card>
        ) : (
          notifications?.map(n => (
            <Card 
              key={n.id} 
              className={cn(
                "relative group flex gap-4 p-5 transition-all duration-300",
                !n.read ? "border-l-4 border-l-slate-900 bg-slate-50/50" : "opacity-80"
              )}
            >
              <div className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0",
                n.type === 'alerta' ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"
              )}>
                {n.type === 'alerta' ? <AlertTriangle className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
              </div>
              
              <div className="flex flex-col gap-1 flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">{n.title}</span>
                  <span className="text-[10px] text-slate-400 font-bold uppercase">{formatDate(n.date)}</span>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed pr-8">{n.message}</p>
                
                <div className="flex items-center gap-4 mt-2">
                  {!n.read && (
                    <button 
                      onClick={() => markAsRead(n.id)}
                      className="text-[10px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1"
                    >
                      <Check className="w-3 h-3" /> MARCAR COMO LIDA
                    </button>
                  )}
                  <button 
                    onClick={() => handleDelete(n.id)}
                    className="text-[10px] font-black text-slate-400 hover:text-red-500 uppercase tracking-widest flex items-center gap-1 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" /> EXCLUIR
                  </button>
                </div>
              </div>

              {!n.read && (
                <div className="absolute top-4 right-4 w-2 h-2 bg-slate-900 rounded-full" />
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
