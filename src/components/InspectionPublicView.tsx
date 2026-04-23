import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { Card } from './UI';
import { Building2, ArrowLeft, History, ShieldCheck, Box, X, Maximize2, User, Calendar, CheckCircle2 } from 'lucide-react';
import { formatDate, cn } from '../lib/utils';

export function InspectionPublicView({ id, onBack }: { id: string, onBack: () => void }) {
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const inspection = useLiveQuery(() => db.inspections.get(id), [id]);
  const location = useLiveQuery(() => inspection ? db.locations.get(inspection.locationId) : undefined, [inspection]);
  const assets = useLiveQuery(() => db.assets.where('inspectionId').equals(id).toArray(), [id]);
  
  // Fetch users involved in the inspection for audit trail
  const auditors = useLiveQuery(() => db.users.toArray());

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

  const finalizer = auditors?.find(u => u.userId === inspection.finalizedBy);
  const concluder = auditors?.find(u => u.userId === inspection.concludedBy);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col animate-in fade-in duration-700 font-sans selection:bg-blue-100">
      {/* Lightbox for Photos */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-[100] bg-slate-900/95 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
           <button 
             onClick={() => setSelectedPhoto(null)}
             className="absolute top-6 right-6 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-all backdrop-blur-xl"
           >
             <X className="w-6 h-6" />
           </button>
           <img 
             src={selectedPhoto} 
             className="max-w-full max-h-[85vh] rounded-3xl shadow-2xl animate-in zoom-in-95 duration-500 border-4 border-white/10" 
             alt="Vistoria" 
           />
        </div>
      )}

      <header className="bg-white/80 backdrop-blur-xl border-b border-slate-100 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white shadow-lg shadow-slate-900/10">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] leading-none mb-1">Transparência Ativa</h1>
            <p className="text-sm font-black text-slate-900 tracking-tight uppercase">PATRI-MV • Auditoria Pública</p>
          </div>
        </div>
        <button onClick={onBack} className="w-10 h-10 hover:bg-slate-50 rounded-xl text-slate-400 hover:text-slate-900 transition-all flex items-center justify-center">
          <ArrowLeft className="w-5 h-5" />
        </button>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full p-6 md:p-10 flex flex-col gap-10 pb-24">
        {/* Hero Card */}
        <div className="relative group">
          <div className="absolute inset-0 bg-blue-600 rounded-[3rem] blur-3xl opacity-10 group-hover:opacity-20 transition-opacity" />
          <div className="bg-slate-900 rounded-[3rem] p-8 md:p-14 text-white relative overflow-hidden shadow-2xl border border-white/5">
            <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-10">
               <div className="flex-1">
                  <div className="flex items-center gap-3 mb-6">
                    <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest bg-emerald-400/10 px-4 py-2 rounded-xl border border-emerald-400/20 flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Homologada Pelo Prefeito
                    </span>
                  </div>
                  <h2 className="text-4xl md:text-5xl font-black tracking-tighter uppercase leading-tight mb-4">{location.name}</h2>
                  <p className="text-slate-400 text-lg font-medium max-w-2xl">{location.description}</p>
               </div>
               
               <div className="grid grid-cols-2 gap-4 md:flex md:flex-col shrink-0">
                  <div className="bg-white/5 backdrop-blur-md rounded-3xl p-5 border border-white/10">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Data Vistoria</span>
                    <span className="font-mono text-xl font-bold tracking-tighter">{formatDate(inspection.date).split(',')[0]}</span>
                  </div>
                  <div className="bg-white/5 backdrop-blur-md rounded-3xl p-5 border border-white/10">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Total Bens</span>
                    <span className="font-mono text-xl font-bold tracking-tighter">{assets?.length || 0} Itens</span>
                  </div>
               </div>
            </div>
            <Building2 className="absolute -bottom-20 -right-20 w-80 h-80 text-white/5 rotate-12" />
          </div>
        </div>

        {/* Audit Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-2">
           <div className="flex items-center gap-4 bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
             <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400">
                <User className="w-6 h-6" />
             </div>
             <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Responsável pela Validação</span>
                <span className="text-sm font-black text-slate-900 uppercase tracking-tight">
                  {finalizer?.name || 'Prefeito/Responsável'}
                </span>
                <span className="text-[9px] font-bold text-slate-500 uppercase">{finalizer?.cargo || 'Gabinete'}</span>
             </div>
           </div>
           <div className="flex items-center gap-4 bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
             <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400">
                <Calendar className="w-6 h-6" />
             </div>
             <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data de Homologação</span>
                <span className="text-sm font-black text-slate-900 uppercase tracking-tight">
                  {inspection.finalizedAt ? formatDate(inspection.finalizedAt) : '---'}
                </span>
                <span className="text-[9px] font-bold text-slate-500 uppercase">Selo de Autenticidade Ativo</span>
             </div>
           </div>
        </div>

        {/* Asset List with Improved UI */}
        <div className="flex flex-col gap-8">
          <div className="flex items-center justify-between border-b-2 border-slate-900 pb-4">
            <div className="flex flex-col">
              <h3 className="font-black text-2xl text-slate-900 uppercase tracking-tight flex items-center gap-3">
                <Box className="w-7 h-7 text-blue-600" /> Inventário de Bens
              </h3>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Conferência Física Detalhada</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
            {assets?.map(asset => (
              <Card key={asset.id} className="p-0 overflow-hidden border-slate-100 hover:border-slate-300 hover:shadow-2xl transition-all duration-500 flex flex-col md:flex-row rounded-[2.5rem] bg-white group h-full">
                {/* Photo Preview Container */}
                <div className="w-full md:w-48 h-64 md:h-auto bg-slate-100 shrink-0 relative overflow-hidden">
                   {asset.photos && asset.photos.length > 0 ? (
                      <>
                        <img 
                          src={asset.photos[0]} 
                          alt={asset.name} 
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
                        />
                        <button 
                          onClick={() => setSelectedPhoto(asset.photos[0])}
                          className="absolute inset-0 bg-slate-900/20 group-hover:bg-slate-900/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all text-white backdrop-blur-[2px]"
                        >
                           <Maximize2 className="w-6 h-6 scale-75 group-hover:scale-100 transition-transform" />
                        </button>
                        {asset.photos.length > 1 && (
                          <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-md px-2 py-1 rounded-lg text-[9px] font-black text-slate-900 shadow-xl border border-white/20">
                            +{asset.photos.length - 1} FOTOS
                          </div>
                        )}
                      </>
                   ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 gap-2">
                        <Camera className="w-10 h-10 opacity-20" />
                        <span className="text-[9px] font-black uppercase tracking-widest">Sem Imagem</span>
                      </div>
                   )}
                </div>

                <div className="flex-1 p-8 flex flex-col">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex flex-col flex-1">
                      <h4 className="font-black text-xl text-slate-900 leading-tight uppercase tracking-tight group-hover:text-blue-600 transition-colors">
                        {asset.name}
                      </h4>
                      <div className="flex items-center gap-2 mt-2">
                         <div className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                         <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.1em]">PATR: {asset.patrimonyNumber || 'SEM PLACA'}</span>
                      </div>
                    </div>
                    
                    <div className={cn(
                      "px-3 py-1.5 rounded-xl border-2 text-[9px] font-black uppercase tracking-widest shrink-0 shadow-sm",
                      asset.condition === 'novo' ? "bg-emerald-50 border-emerald-100 text-emerald-600" :
                      asset.condition === 'bom' ? "bg-blue-50 border-blue-100 text-blue-600" :
                      asset.condition === 'regular' ? "bg-amber-50 border-amber-100 text-amber-600" :
                      "bg-rose-50 border-rose-100 text-rose-600"
                    )}>
                      {asset.condition}
                    </div>
                  </div>

                  {asset.observations && (
                    <div className="bg-slate-50 rounded-2xl p-4 mt-auto">
                       <p className="text-xs text-slate-500 leading-relaxed font-medium italic">
                         "{asset.observations}"
                       </p>
                    </div>
                  )}

                  {/* Tiny audit strip */}
                  <div className="mt-4 pt-4 border-t border-slate-50 flex items-center justify-between text-[8px] font-black text-slate-300 uppercase tracking-[0.2em]">
                     <span>Controle Interno MV</span>
                     <span>ID: {asset.id.slice(0, 8)}</span>
                  </div>
                </div>
              </Card>
            ))}
            
            {assets?.length === 0 && (
              <div className="col-span-full py-24 flex flex-col items-center justify-center text-slate-300 border-4 border-dashed border-slate-100 rounded-[4rem] group hover:border-slate-200 transition-all">
                 <div className="w-20 h-20 bg-slate-50 rounded-[2rem] flex items-center justify-center mb-6 transition-transform group-hover:rotate-12">
                   <History className="w-10 h-10 opacity-20" />
                 </div>
                 <p className="text-sm font-black uppercase tracking-[0.3em] text-slate-400">Ambiente Vazio</p>
                 <span className="text-[10px] font-medium text-slate-400 mt-2">Nenhum bem patrimonial vinculado a este local.</span>
              </div>
            )}
          </div>
        </div>

        {/* Certification Footer */}
        <div className="bg-emerald-600 rounded-[3rem] p-10 md:p-14 text-white flex flex-col md:flex-row items-center gap-10 relative overflow-hidden shadow-2xl shadow-emerald-200">
           <div className="w-24 h-24 bg-white/20 rounded-[2.5rem] flex items-center justify-center shrink-0 backdrop-blur-xl border border-white/20">
              <ShieldCheck className="w-12 h-12" />
           </div>
           <div className="flex flex-col gap-3 text-center md:text-left relative z-10">
              <h4 className="text-2xl font-black uppercase tracking-tight">Selo de Auditoria Manoel Viana</h4>
              <p className="text-emerald-100 text-sm leading-relaxed max-w-3xl font-medium">
                Este registro digital é uma cópia fiel da vistoria física realizada por agentes públicos. 
                As informações aqui contidas, incluindo as evidências fotográficas, servem como base para o controle patrimonial, 
                auditorias externas e prestação de contas à sociedade.
              </p>
           </div>
           <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-[0.03] rounded-full -translate-y-1/2 translate-x-1/2" />
        </div>
      </main>
      
      <footer className="py-12 bg-slate-900 text-center flex flex-col items-center gap-4">
         <div className="flex items-center gap-2">
           <ShieldCheck className="w-4 h-4 text-white" />
           <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">PATRI-MV</span>
         </div>
         <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-loose">
           Portal da Transparência Patrimonial<br/>
           Manoel Viana - RS • Brasil
         </p>
      </footer>
    </div>
  );
}

// Re-import missing Camera icon or ensure it's in the main UI
import { Camera } from 'lucide-react';

