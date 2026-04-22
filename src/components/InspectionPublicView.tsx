import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { Card } from './UI';
import { Building2, ArrowLeft, History, ShieldCheck, Box } from 'lucide-react';
import { formatDate } from '../lib/utils';

export function InspectionPublicView({ id, onBack }: { id: string, onBack: () => void }) {
  const inspection = useLiveQuery(() => db.inspections.get(id), [id]);
  const location = useLiveQuery(() => inspection ? db.locations.get(inspection.locationId) : undefined, [inspection]);
  const assets = useLiveQuery(() => db.assets.where('inspectionId').equals(id).toArray(), [id]);

  if (!inspection || !location) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <Building2 className="w-12 h-12 text-slate-200 mb-4" />
        <h1 className="text-xl font-bold text-slate-900">Vistoria não encontrada</h1>
        <p className="text-slate-500 text-sm mt-2">O QR Code pode estar inválido ou os dados ainda não foram sincronizados.</p>
        <button onClick={onBack} className="mt-6 text-slate-900 font-bold flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> VOLTAR AO LOGIN
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col animate-in fade-in duration-700">
      <header className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Consulta Pública</h1>
            <p className="text-sm font-bold text-slate-900">PATRI-MV • Patrimônio</p>
          </div>
        </div>
        <button onClick={onBack} className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full p-6 flex flex-col gap-8 pb-20">
        <div className="bg-slate-900 rounded-[2.5rem] p-10 text-white relative overflow-hidden shadow-2xl">
           <div className="relative z-10">
              <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest bg-emerald-400/10 px-3 py-1 rounded-full border border-emerald-400/20">Vistoria Validada</span>
              <h2 className="text-3xl font-black tracking-tighter mt-4 uppercase">{location.name}</h2>
              <p className="text-slate-400 text-sm mt-2">{location.description}</p>
              
              <div className="flex flex-wrap items-center gap-8 mt-10">
                <div className="flex flex-col">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Data do Inventário</span>
                  <span className="font-mono text-lg font-bold">{formatDate(inspection.date).split(',')[0]}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Total de Itens</span>
                  <span className="font-mono text-lg font-bold">{assets?.length || 0}</span>
                </div>
              </div>
           </div>
           <Building2 className="absolute -bottom-10 -right-10 w-64 h-64 text-white/5 rotate-12" />
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <h3 className="font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
              <Box className="w-5 h-5 text-blue-600" /> Itens Registrados
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {assets?.map(asset => (
              <Card key={asset.id} className="p-6 rounded-3xl flex flex-col gap-3 group border-slate-100 hover:border-slate-200 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex flex-col flex-1">
                    <span className="font-black text-slate-900 leading-tight">{asset.name}</span>
                    <span className="text-[10px] font-mono text-slate-400 mt-1 uppercase">Patr: {asset.patrimonyNumber || 'N/A'}</span>
                  </div>
                  <span className="text-[9px] font-black uppercase text-slate-500 bg-slate-50 px-2 py-1 rounded-md border border-slate-100 shrink-0">
                    {asset.condition}
                  </span>
                </div>
                {asset.photos && asset.photos.length > 0 && (
                  <div className="flex gap-2 mt-1">
                    {asset.photos.map((photo, i) => (
                      <div key={i} className="w-12 h-12 rounded-lg overflow-hidden border border-slate-100 shadow-sm shrink-0">
                        <img src={photo} alt="" className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}
                {asset.observations && (
                  <p className="text-xs text-slate-400 italic leading-relaxed">
                    "{asset.observations}"
                  </p>
                )}
              </Card>
            ))}
            {assets?.length === 0 && (
              <div className="col-span-full py-16 flex flex-col items-center justify-center text-slate-300 border-2 border-dashed border-slate-200 rounded-[2rem]">
                 <History className="w-8 h-8 opacity-20 mb-3" />
                 <p className="text-xs font-bold uppercase tracking-widest">Sem itens registrados</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-3xl p-6 flex items-start gap-4">
           <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white shrink-0">
              <ShieldCheck className="w-6 h-6" />
           </div>
           <div className="flex flex-col gap-1">
              <h4 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Certificação Oficial</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Esta lista representa o estado oficial do patrimônio público desta unidade conforme vistoria realizada e validada pela comissão competente de Manoel Viana.
              </p>
           </div>
        </div>
      </main>
      
      <footer className="p-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
         © 2024 PATRI-MV • Sistema de Gestão Patrimonial
      </footer>
    </div>
  );
}
