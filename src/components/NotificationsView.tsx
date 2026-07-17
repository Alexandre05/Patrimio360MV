import React, { useState } from 'react';
import { Card } from './UI';
import { Bell, AlertTriangle, Clock, Check, Trash2, ArrowLeft, CheckCircle2, ShieldAlert } from 'lucide-react';
import { db } from '../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../lib/AuthContext';
import { formatDate, cn } from '../lib/utils';
import { markAsRead, markAllAsRead } from '../lib/NotificationService';
import { motion, AnimatePresence } from 'motion/react';

export function NotificationsView({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  
  const notifications = useLiveQuery(
    () => user ? db.notifications.where('targetUserId').equals(user.userId).reverse().sortBy('date') : [],
    [user]
  );

  const unreadCount = notifications?.filter(n => !n.read).length || 0;
  
  const filteredNotifications = notifications?.filter(n => {
    if (filter === 'unread') return !n.read;
    return true;
  });

  const handleDelete = async (id: string) => {
    await db.notifications.delete(id);
  };

  if (!user) return null;

  return (
    <div className="flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      
      {/* HEADER DE NAVEGAÇÃO */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
        <button onClick={onBack} className="flex items-center gap-3 text-slate-400 font-black text-[10px] tracking-[0.2em] hover:text-slate-900 transition-all group w-fit">
          <div className="w-10 h-10 bg-white border border-slate-100 rounded-xl flex items-center justify-center shadow-sm group-hover:-translate-x-1 transition-transform">
            <ArrowLeft className="w-5 h-5" />
          </div>
          VOLTAR AO PAINEL
        </button>
        
        {unreadCount > 0 && (
          <button 
            onClick={() => markAllAsRead(user.userId)} 
            className="flex items-center gap-2 text-[10px] font-black text-indigo-600 bg-white px-6 py-3 rounded-2xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50 hover:shadow-lg hover:shadow-indigo-500/10 transition-all shadow-sm group"
          >
            <CheckCircle2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
            MARCAR TODAS COMO LIDAS
          </button>
        )}
      </header>

      {/* TÍTULO E ABAS DE FILTRO */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 px-2">
        <div className="flex flex-col gap-2">
          <h2 className="text-4xl font-display font-black text-slate-900 tracking-tighter uppercase leading-none">Central de Alertas</h2>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Monitoramento inteligente de auditorias e ativos</span>
        </div>
        
        {/* Filtros Clean UI */}
        <div className="flex items-center gap-2 bg-slate-100/50 p-1.5 rounded-2xl border border-slate-100 w-fit">
           <button 
             onClick={() => setFilter('all')}
             className={cn(
               "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
               filter === 'all' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
             )}
           >
             Todos os Alertas
           </button>
           <button 
             onClick={() => setFilter('unread')}
             className={cn(
               "flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
               filter === 'unread' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
             )}
           >
             Não Lidos
             {unreadCount > 0 && (
               <span className={cn("px-2 py-0.5 rounded-md text-[9px] leading-none", filter === 'unread' ? "bg-indigo-100 text-indigo-700" : "bg-slate-200 text-slate-500")}>
                 {unreadCount}
               </span>
             )}
           </button>
        </div>
      </div>

      {/* LISTA DE NOTIFICAÇÕES */}
      <div className="flex flex-col gap-4">
        {!filteredNotifications || filteredNotifications.length === 0 ? (
          <Card className="flex flex-col items-center justify-center py-32 border-none bg-white rounded-[3rem] shadow-[0_20px_50px_-15px_rgba(0,0,0,0.02)]">
            <div className="w-24 h-24 bg-slate-50 rounded-[2rem] flex items-center justify-center mb-6">
              {filter === 'unread' ? <CheckCircle2 className="w-10 h-10 text-emerald-400" /> : <Bell className="w-10 h-10 text-slate-300" />}
            </div>
            <h3 className="font-display font-black text-2xl text-slate-800 tracking-tight mb-2">
              {filter === 'unread' ? 'Tudo em dia!' : 'Caixa Vazia'}
            </h3>
            <p className="font-medium text-slate-400 text-sm max-w-sm text-center">
              {filter === 'unread' 
                ? 'Você não possui nenhum alerta pendente de leitura no momento.' 
                : 'Não há registos de alertas ou lembretes no sistema.'}
            </p>
          </Card>
        ) : (
          <AnimatePresence mode="popLayout">
            {filteredNotifications.map(n => (
              <motion.div
                key={n.id}
                layout
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <Card 
                  className={cn(
                    "relative group flex flex-col md:flex-row gap-6 p-6 lg:p-8 transition-all duration-500 rounded-[2rem] bg-white border",
                    !n.read 
                      ? "border-indigo-100 shadow-xl shadow-indigo-500/5 ring-1 ring-indigo-50/50" 
                      : "border-slate-100 shadow-sm opacity-70 hover:opacity-100"
                  )}
                >
                  {/* Ícone */}
                  <div className={cn(
                    "w-16 h-16 rounded-[1.5rem] flex items-center justify-center shrink-0 shadow-lg transition-transform group-hover:rotate-6 duration-500",
                    n.type === 'alerta' ? "bg-rose-50 text-rose-500 border border-rose-100" : "bg-indigo-50 text-indigo-500 border border-indigo-100"
                  )}>
                    {n.type === 'alerta' ? <ShieldAlert className="w-7 h-7" /> : <Clock className="w-7 h-7" />}
                  </div>
                  
                  {/* Conteúdo */}
                  <div className="flex flex-col justify-center flex-1 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-3">
                        <span className="font-black text-slate-900 text-lg uppercase tracking-tight leading-none">{n.title}</span>
                        {!n.read && <span className="px-2 py-0.5 bg-rose-500 text-white text-[8px] font-black uppercase tracking-widest rounded-md animate-pulse">Novo</span>}
                      </div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                        {formatDate(n.date)}
                      </span>
                    </div>
                    
                    <p className="text-sm text-slate-500 leading-relaxed font-medium max-w-4xl">{n.message}</p>
                    
                    {/* Ações (Mostra ao passar o rato ou se for mobile) */}
                    <div className="flex items-center gap-4 mt-6 pt-4 border-t border-slate-50 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-300">
                      {!n.read && (
                        <button 
                          onClick={() => markAsRead(n.id)}
                          className="px-4 py-2 bg-indigo-50 rounded-xl text-[9px] font-black text-indigo-600 hover:bg-indigo-600 hover:text-white uppercase tracking-widest flex items-center gap-2 transition-colors"
                        >
                          <Check className="w-4 h-4" /> Marcar como lida
                        </button>
                      )}
                      <button 
                        onClick={() => handleDelete(n.id)}
                        className="px-4 py-2 bg-slate-50 rounded-xl text-[9px] font-black text-slate-400 hover:text-rose-600 hover:bg-rose-50 uppercase tracking-widest flex items-center gap-2 transition-all"
                      >
                        <Trash2 className="w-4 h-4" /> Excluir
                      </button>
                    </div>
                  </div>

                  {/* Indicador lateral sutil de não lido */}
                  {!n.read && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-12 bg-indigo-500 rounded-r-full" />
                  )}
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}