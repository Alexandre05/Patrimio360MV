import { Card } from './UI';
import { BarChart3, TrendingUp, AlertCircle, FileText, Download } from 'lucide-react';
import { db } from '../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { cn } from '../lib/utils';

export function ReportsView() {
  const assets = useLiveQuery(() => db.assets.toArray());
  const inspections = useLiveQuery(() => db.inspections.toArray());

  const stats = {
    totalItens: assets?.length || 0,
    ruins: assets?.filter(a => a.condition === 'ruim' || a.condition === 'inservivel').length || 0,
    finalizadas: inspections?.filter(i => i.status === 'finalizada').length || 0,
    semPatrimonio: assets?.filter(a => !a.patrimonyNumber).length || 0
  };

  return (
    <div className="flex flex-col gap-10 animate-in fade-in duration-700 pb-20">
      <div className="flex flex-col gap-2 px-2">
        <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Painel Analítico</h2>
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] leading-none">Consolidado Geral de Ativos</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="relative overflow-hidden rounded-[2.5rem] bg-slate-900 p-10 text-white shadow-2xl shadow-slate-900/20 group">
           <div className="relative z-10 flex flex-col gap-6">
              <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-sm border border-white/10 transition-transform group-hover:scale-110 duration-500">
                 <TrendingUp className="w-7 h-7 text-white" />
              </div>
              <div className="flex flex-col">
                 <span className="text-6xl font-black tracking-tighter leading-none stat-value">{stats.totalItens}</span>
                 <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 mt-4">Total de Bens Tombados</span>
              </div>
           </div>
           <BarChart3 className="absolute -bottom-10 -right-10 w-48 h-48 text-white/5 transform rotate-12 transition-transform group-hover:scale-125 duration-700" />
        </div>

        <div className="relative overflow-hidden rounded-[2.5rem] bg-rose-600 p-10 text-white shadow-2xl shadow-rose-600/20 group">
           <div className="relative z-10 flex flex-col gap-6">
              <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-sm border border-white/10 transition-transform group-hover:scale-110 duration-500">
                 <AlertCircle className="w-7 h-7 text-white" />
              </div>
              <div className="flex flex-col">
                 <span className="text-6xl font-black tracking-tighter leading-none stat-value">{stats.ruins}</span>
                 <span className="text-[11px] font-black uppercase tracking-[0.2em] text-rose-200 mt-4">Itens em Estado Crítico</span>
              </div>
           </div>
           <AlertCircle className="absolute -bottom-10 -right-10 w-48 h-48 text-white/5 transform -rotate-12 transition-transform group-hover:scale-125 duration-700" />
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between px-2">
           <div className="flex flex-col">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-[0.2em]">Exportação de Dados</h3>
              <span className="text-[10px] font-bold text-slate-400">Emissão de registros oficiais</span>
           </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
           <ReportAction title="Lista de Inservíveis" description="Bens para leilão ou descarte" icon={FileText} color="rose" />
           <ReportAction title="Por Localização" description="Planilha completa por sala" icon={FileText} color="blue" />
           <ReportAction title="Sem Patrimônio" description="Itens para etiquetagem" icon={FileText} color="amber" />
        </div>
      </div>
    </div>
  );
}

function ReportAction({ title, description, icon: Icon, color = 'blue' }: { title: string, description: string, icon: any, color?: string }) {
  const colorClasses = {
    rose: "bg-rose-50 text-rose-600 border-rose-100",
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    amber: "bg-amber-50 text-amber-600 border-amber-100",
  }[color] || "bg-slate-50 text-slate-600 border-slate-100";

  return (
    <Card className="p-8 flex flex-col gap-6 rounded-[2.5rem] border-slate-50 hover:border-slate-200 cursor-pointer group transition-all duration-500 hover:shadow-2xl hover:shadow-slate-200/50">
       <div className={cn("w-16 h-16 rounded-[1.5rem] flex items-center justify-center transition-all duration-500 group-hover:bg-slate-900 group-hover:text-white", colorClasses)}>
          <Icon className="w-8 h-8 transition-transform group-hover:rotate-12" />
       </div>
       <div className="flex flex-col">
          <span className="font-black text-slate-900 text-lg uppercase tracking-tight leading-tight group-hover:text-blue-600 transition-colors">{title}</span>
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2">{description}</span>
       </div>
       <div className="pt-2">
          <button className="flex items-center gap-2 text-[10px] font-black text-slate-900 uppercase tracking-widest opacity-0 -translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-500">
            EMITIR PDF <Download className="w-3 h-3" />
          </button>
       </div>
    </Card>
  );
}
