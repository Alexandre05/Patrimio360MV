import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { Card } from './UI';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend 
} from 'recharts';
import { ShieldCheck, AlertCircle, CheckCircle2, TrendingUp, Building2, ClipboardList } from 'lucide-react';

export function InventoryDashboard() {
  const assets = useLiveQuery(() => db.assets.filter(a => !a.deleted).toArray());
  const locations = useLiveQuery(() => db.locations.filter(l => !l.deleted).toArray());
  const inspections = useLiveQuery(() => db.inspections.filter(i => !i.deleted).toArray());

  if (!assets || !locations) return null;

  // 1. Data per condition
  const conditionData = [
    { name: 'Novo', value: assets.filter(a => a.condition === 'novo').reduce((acc, item) => acc + (item.quantity || 1), 0), color: '#10b981' },
    { name: 'Bom', value: assets.filter(a => a.condition === 'bom').reduce((acc, item) => acc + (item.quantity || 1), 0), color: '#3b82f6' },
    { name: 'Regular', value: assets.filter(a => a.condition === 'regular').reduce((acc, item) => acc + (item.quantity || 1), 0), color: '#f59e0b' },
    { name: 'Ruim', value: assets.filter(a => a.condition === 'ruim').reduce((acc, item) => acc + (item.quantity || 1), 0), color: '#f97316' },
    { name: 'Inservivel', value: assets.filter(a => a.condition === 'inservivel').reduce((acc, item) => acc + (item.quantity || 1), 0), color: '#ef4444' },
  ].filter(d => d.value > 0);

  // 2. Assets per Location (Top 5)
  const locationStats = locations.map(loc => {
    // Find latest inspection for this location
    const locInspections = inspections?.filter(i => i.locationId === loc.id);
    const latestInsp = locInspections?.sort((a, b) => b.date - a.date)[0];
    const locAssetsCount = assets.filter(a => a.inspectionId === latestInsp?.id).reduce((acc, item) => acc + (item.quantity || 1), 0);
    
    return {
      name: loc.name,
      count: locAssetsCount
    };
  }).sort((a, b) => b.count - a.count).slice(0, 5);

  const totalAssets = assets.reduce((acc, item) => acc + (item.quantity || 1), 0);
  const criticalAssets = assets.filter(a => a.condition === 'ruim' || a.condition === 'inservivel').reduce((acc, item) => acc + (item.quantity || 1), 0);
  const goodAssets = assets.filter(a => a.condition === 'novo' || a.condition === 'bom').reduce((acc, item) => acc + (item.quantity || 1), 0);
  const healthScore = totalAssets > 0 ? Math.round((goodAssets / totalAssets) * 100) : 0;

  return (
    <div className="flex flex-col gap-10 animate-in fade-in duration-700">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-8 bg-indigo-600 text-white rounded-[2.5rem] shadow-xl shadow-indigo-600/20 border-none flex flex-col gap-4">
          <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
            <TrendingUp className="w-7 h-7 text-white" />
          </div>
          <div>
            <span className="text-6xl font-display font-black leading-none">{healthScore}%</span>
            <p className="text-indigo-100 text-xs font-bold uppercase tracking-widest mt-2">Índice de Saúde Patrimonial</p>
          </div>
          <p className="text-white/60 text-[10px] font-medium leading-relaxed">
            Percentual de bens em estado Novo ou Bom em relação ao total auditado.
          </p>
        </Card>

        <Card className="p-8 bg-white border-slate-100 rounded-[2.5rem] shadow-sm flex flex-col gap-4">
          <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-500">
            <AlertCircle className="w-7 h-7" />
          </div>
          <div>
            <span className="text-5xl font-display font-black text-slate-900 leading-none">{criticalAssets}</span>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-2">Itens Críticos / Inservíveis</p>
          </div>
          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-rose-500 rounded-full" 
              style={{ width: `${totalAssets > 0 ? (criticalAssets / totalAssets) * 100 : 0}%` }}
            />
          </div>
        </Card>

        <Card className="p-8 bg-white border-slate-100 rounded-[2.5rem] shadow-sm flex flex-col gap-4">
          <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-500">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <div>
            <span className="text-5xl font-display font-black text-slate-900 leading-none">{totalAssets}</span>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-2">Patrimônio Auditado</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-black uppercase tracking-widest leading-none">
              Ativo
            </div>
            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Sincronizado na Nuvem</span>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="p-10 rounded-[3rem] border-slate-100 shadow-sm bg-white flex flex-col gap-8">
          <div className="flex flex-col">
            <h3 className="text-lg font-black text-slate-900 leading-none">Estado de Conservação</h3>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">Distribuição total de bens</p>
          </div>
          
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={conditionData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {conditionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '20px', 
                    border: 'none', 
                    boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
                    fontSize: '12px',
                    fontWeight: '900',
                    textTransform: 'uppercase',
                    letterSpacing: '1px'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {conditionData.map((item) => (
              <div key={item.name} className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                <div className="flex flex-col leading-none">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-900">{item.name}</span>
                  <span className="text-[10px] font-bold text-slate-400 mt-1">{item.value} itens</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-10 rounded-[3rem] border-slate-100 shadow-sm bg-white flex flex-col gap-8">
          <div className="flex flex-col">
            <h3 className="text-lg font-black text-slate-900 leading-none">Densidade por Setor</h3>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">Onde estão os bens</p>
          </div>

          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={locationStats}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 900, fill: '#64748b' }}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 900, fill: '#64748b' }}
                />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ 
                    borderRadius: '20px', 
                    border: 'none', 
                    boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
                    fontSize: '12px',
                    fontWeight: '900'
                  }}
                />
                <Bar dataKey="count" fill="#4f46e5" radius={[10, 10, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-col gap-4">
            {locationStats.map((loc, index) => (
              <div key={loc.name} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-400 font-bold text-[10px]">
                    {index + 1}
                  </div>
                  <span className="text-xs font-bold text-slate-700">{loc.name}</span>
                </div>
                <span className="text-xs font-black text-indigo-600">{loc.count} ITENS</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col ml-2">
          <h3 className="text-lg font-black text-slate-900 leading-none">Últimas Auditorias Concluídas</h3>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">Atividade recente da equipe de vistoria</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {inspections?.filter(i => i.status === 'finalizada').sort((a,b) => b.date - a.date).slice(0, 3).map(insp => {
            const loc = locations.find(l => l.id === insp.locationId);
            return (
              <Card key={insp.id} className="p-6 bg-white border-slate-100 rounded-[2rem] shadow-sm flex flex-col gap-4 group hover:border-indigo-100 transition-all">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all">
                    <ClipboardList className="w-5 h-5" />
                  </div>
                  <span className="bg-emerald-50 text-emerald-600 text-[8px] font-black uppercase px-2 py-1 rounded-lg tracking-widest">Homologada</span>
                </div>
                <div className="flex flex-col">
                  <h4 className="font-bold text-slate-900 text-sm truncate">{loc?.name || 'Local Desconhecido'}</h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 tracking-widest">{new Date(insp.date).toLocaleDateString()}</p>
                </div>
              </Card>
            );
          })}
          {(!inspections || inspections.filter(i => i.status === 'finalizada').length === 0) && (
            <div className="col-span-full py-12 text-center text-slate-300 font-black uppercase text-[10px] tracking-widest bg-slate-50 border-2 border-dashed border-slate-100 rounded-[2rem]">
              Nenhum dossiê homologado no período.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
