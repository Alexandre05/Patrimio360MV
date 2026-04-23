import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as dexie } from '../lib/db';
import { db as firestore } from '../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { Card } from './UI';
import { Building2, ArrowLeft, History, ShieldCheck, Box, X, Maximize2, User, Calendar, CheckCircle2, Camera, Info, Share2 } from 'lucide-react';
import { formatDate, cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export function InspectionPublicView({ id, onBack }: { id: string, onBack: () => void }) {
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [cloudInspection, setCloudInspection] = useState<any>(null);
  const [cloudLocation, setCloudLocation] = useState<any>(null);
  const [cloudAssets, setCloudAssets] = useState<any[]>([]);
  const [isLoadingCloud, setIsLoadingCloud] = useState(true);

  const localInspection = useLiveQuery(() => dexie.inspections.get(id), [id]);
  const localLocation = useLiveQuery(() => localInspection ? dexie.locations.get(localInspection.locationId) : undefined, [localInspection]);
  const localAssets = useLiveQuery(() => dexie.assets.where('inspectionId').equals(id).toArray(), [id]);
  const localAuditors = useLiveQuery(() => dexie.users.toArray());

  useEffect(() => {
    async function fetchFromCloud() {
      if (localInspection) {
        setIsLoadingCloud(false);
        return;
      }

      try {
        const inspRef = doc(firestore, 'inspections', id);
        const inspSnap = await getDoc(inspRef);
        
        if (inspSnap.exists()) {
          const inspData = inspSnap.data();
          setCloudInspection({ id: inspSnap.id, ...inspData });

          // Fetch Location
          if (inspData.locationId) {
            const locRef = doc(firestore, 'locations', inspData.locationId);
            const locSnap = await getDoc(locRef);
            if (locSnap.exists()) {
              setCloudLocation({ id: locSnap.id, ...locSnap.data() });
            }
          }

          // Fetch Assets
          const assetsQuery = query(collection(firestore, 'assets'), where('inspectionId', '==', id));
          const assetsSnap = await getDocs(assetsQuery);
          const assetsList = assetsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setCloudAssets(assetsList);
        }
      } catch (err) {
        console.error("Erro ao buscar dados na nuvem:", err);
      } finally {
        setIsLoadingCloud(false);
      }
    }

    fetchFromCloud();
  }, [id, localInspection]);

  const inspection = localInspection || cloudInspection;
  const location = localLocation || cloudLocation;
  const assets = localAssets?.length ? localAssets : cloudAssets;
  const auditors = localAuditors;

  if (isLoadingCloud) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 text-center bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px]">
        <div className="w-10 h-10 border-4 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Buscando auditoria na nuvem...</p>
      </div>
    );
  }

  if (!inspection || !location) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 text-center bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px]">
        <div className="bg-white p-12 rounded-[3.5rem] shadow-2xl shadow-slate-200 border border-slate-100 flex flex-col items-center max-w-sm">
           <div className="w-20 h-20 bg-amber-50 rounded-[2rem] flex items-center justify-center mb-8 rotate-3 transition-transform hover:rotate-0">
              <ShieldCheck className="w-10 h-10 text-amber-500" />
           </div>
           <h1 className="text-2xl font-black text-slate-900 tracking-tighter uppercase leading-tight">Dados Não Localizados</h1>
           <p className="text-slate-500 text-[10px] font-bold mt-4 leading-relaxed uppercase tracking-widest">
             Esta vistoria existe, mas ainda não foi sincronizada com a nuvem ou foi excluída.
           </p>
           
           <div className="w-full h-px bg-slate-100 my-8" />

           <div className="bg-slate-50 p-6 rounded-3xl w-full text-left">
              <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest block mb-2">Alternativa Offline</span>
              <p className="text-[10px] text-slate-500 font-bold leading-relaxed">
                Se os dados não estiverem na nuvem, use o backup manual: No computador, exporte o arquivo em <span className="text-slate-900">CONFIGURAÇÕES</span> e importe-o neste celular.
              </p>
           </div>
           
           <button onClick={onBack} className="mt-10 w-full h-14 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-slate-900/20 active:scale-95 transition-all">
             VOLTAR AO INÍCIO
           </button>
        </div>
      </div>
    );
  }

  const finalizer = auditors?.find(u => u.userId === inspection.finalizedBy);
  const concluder = auditors?.find(u => u.userId === inspection.concludedBy);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans selection:bg-blue-100 selection:text-blue-900 overflow-x-hidden">
      {/* Lightbox for Photos */}
      <AnimatePresence>
        {selectedPhoto && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-slate-900/95 backdrop-blur-xl flex items-center justify-center p-4"
          >
            <motion.button 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-6 right-6 w-14 h-14 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-all backdrop-blur-3xl border border-white/10 z-10"
            >
              <X className="w-8 h-8" />
            </motion.button>
            <motion.img 
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              src={selectedPhoto} 
              className="max-w-full max-h-[90vh] rounded-[2.5rem] shadow-[0_0_100px_rgba(0,0,0,0.5)] border-4 border-white/10 object-contain" 
              alt="Vistoria Detalhe" 
            />
          </motion.div>
        )}
      </AnimatePresence>

      <header className="bg-white/80 backdrop-blur-2xl border-b border-slate-100 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
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
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative group"
        >
          <div className="absolute inset-0 bg-blue-600 rounded-[4rem] blur-[100px] opacity-10 group-hover:opacity-20 transition-opacity duration-1000" />
          <div className="bg-slate-900 rounded-[4rem] p-10 md:p-16 text-white relative overflow-hidden shadow-[0_40px_100px_-20px_rgba(15,23,42,0.4)] border border-white/5">
            <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-12">
               <div className="flex-1">
                  <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                    className="flex items-center gap-3 mb-8"
                  >
                    <span className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em] bg-emerald-400/10 px-5 py-2.5 rounded-2xl border border-emerald-400/20 flex items-center gap-2.5 shadow-[0_0_20px_rgba(52,211,153,0.1)]">
                      <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" /> Homologação Digital Ativa
                    </span>
                  </motion.div>
                  <motion.h2 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="text-5xl md:text-7xl font-black tracking-[-0.04em] uppercase leading-[0.9] mb-6"
                  >
                    {location.name}
                  </motion.h2>
                  <motion.p 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="text-slate-400 text-xl font-medium max-w-2xl leading-relaxed"
                  >
                    {location.description}
                  </motion.p>
               </div>
               
               <motion.div 
                 initial={{ opacity: 0, scale: 0.95 }}
                 animate={{ opacity: 1, scale: 1 }}
                 transition={{ delay: 0.5 }}
                 className="grid grid-cols-2 gap-5 md:flex md:flex-col shrink-0"
               >
                  <div className="bg-white/5 backdrop-blur-2xl rounded-[2.5rem] p-7 border border-white/10 shadow-inner group/stat hover:bg-white/[0.08] transition-colors">
                    <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.15em] block mb-2">Auditado Em</span>
                    <span className="font-mono text-2xl font-bold tracking-tighter text-white">{formatDate(inspection.date).split(',')[0]}</span>
                  </div>
                  <div className="bg-white/5 backdrop-blur-2xl rounded-[2.5rem] p-7 border border-white/10 shadow-inner group/stat hover:bg-white/[0.08] transition-colors">
                    <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.15em] block mb-2">Itens Registrados</span>
                    <span className="font-mono text-2xl font-bold tracking-tighter text-blue-400">{assets?.length || 0} Itens</span>
                  </div>
               </motion.div>
            </div>
            <Building2 className="absolute -bottom-24 -right-24 w-96 h-96 text-white/[0.03] rotate-12 pointer-events-none" />
          </div>
        </motion.div>

        {/* Audit Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
           <motion.div 
             initial={{ opacity: 0, x: -20 }}
             animate={{ opacity: 1, x: 0 }}
             transition={{ delay: 0.6 }}
             className="flex items-center gap-5 bg-white p-8 rounded-[3rem] border border-slate-100 shadow-[0_10px_40px_-15px_rgba(0,0,0,0.05)] hover:shadow-xl transition-shadow group"
           >
             <div className="w-16 h-16 bg-slate-50 rounded-[1.5rem] flex items-center justify-center text-slate-300 group-hover:text-slate-900 transition-colors">
                <User className="w-8 h-8" />
             </div>
             <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Autoridade Validadora</span>
                <span className="text-lg font-black text-slate-900 uppercase tracking-tight">
                  {finalizer?.name || 'Gabinete do Prefeito'}
                </span>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{finalizer?.cargo || 'Transparência Municipal'}</span>
             </div>
           </motion.div>

           <motion.div 
             initial={{ opacity: 0, x: 20 }}
             animate={{ opacity: 1, x: 0 }}
             transition={{ delay: 0.6 }}
             className="flex items-center gap-5 bg-white p-8 rounded-[3rem] border border-slate-100 shadow-[0_10px_40px_-15px_rgba(0,0,0,0.05)] hover:shadow-xl transition-shadow group"
           >
             <div className="w-16 h-16 bg-slate-50 rounded-[1.5rem] flex items-center justify-center text-slate-300 group-hover:text-slate-900 transition-colors">
                <Calendar className="w-8 h-8" />
             </div>
             <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Data da Homologação</span>
                <span className="text-lg font-black text-slate-900 uppercase tracking-tight">
                  {inspection.finalizedAt ? formatDate(inspection.finalizedAt) : 'Processo Finalizado'}
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                  <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Controle Ativo</span>
                </div>
             </div>
           </motion.div>
        </div>

        {/* Asset List with Staggered Grid */}
        <div className="flex flex-col gap-10 mt-6">
          <div className="flex items-center justify-between border-b-2 border-slate-900 pb-6 ml-2">
            <div className="flex flex-col">
              <h3 className="font-black text-3xl text-slate-900 uppercase tracking-tighter flex items-center gap-4">
                <Box className="w-9 h-9 text-blue-600" /> Detalhamento do Inventário
              </h3>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.3em] mt-2">Conferência Física e Digital de Bens Públicos</p>
            </div>
          </div>

          <motion.div 
            initial="hidden"
            animate="show"
            variants={{
              hidden: { opacity: 0 },
              show: {
                opacity: 1,
                transition: { staggerChildren: 0.1, delayChildren: 0.8 }
              }
            }}
            className="grid grid-cols-1 md:grid-cols-2 gap-8"
          >
            {assets?.map(asset => (
              <motion.div
                key={asset.id}
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  show: { opacity: 1, y: 0 }
                }}
              >
                <Card className="p-0 overflow-hidden border-slate-100 hover:border-slate-300 hover:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.1)] transition-all duration-700 flex flex-col md:flex-row rounded-[3rem] bg-white group h-full">
                  {/* Photo Preview Container */}
                  <div className="w-full md:w-56 h-72 md:h-auto bg-slate-100 shrink-0 relative overflow-hidden">
                     {asset.photos && asset.photos.length > 0 ? (
                        <>
                          <img 
                            src={asset.photos[0]} 
                            alt={asset.name} 
                            className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" 
                          />
                          <button 
                            onClick={() => setSelectedPhoto(asset.photos[0])}
                            className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-500 text-white backdrop-blur-[2px]"
                          >
                             <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-xl border border-white/30 scale-75 group-hover:scale-100 transition-transform duration-500">
                               <Maximize2 className="w-5 h-5" />
                             </div>
                          </button>
                          {asset.photos.length > 1 && (
                            <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-2xl px-3 py-1.5 rounded-xl text-[10px] font-black text-slate-900 shadow-2xl border border-white/20">
                              +{asset.photos.length - 1} EVIDÊNCIAS
                            </div>
                          )}
                        </>
                     ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-200 bg-slate-50 gap-3">
                          <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center shadow-inner">
                            <Camera className="w-8 h-8 opacity-20" />
                          </div>
                          <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">Sem Registro Fotográfico</span>
                        </div>
                     )}
                  </div>

                  <div className="flex-1 p-10 flex flex-col">
                    <div className="flex items-start justify-between gap-6 mb-6">
                      <div className="flex flex-col flex-1">
                        <div className="flex items-center gap-2 mb-2">
                           <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                           <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">PATR: {asset.patrimonyNumber || 'NÃO PLAQUETADO'}</span>
                        </div>
                        <h4 className="font-black text-2xl text-slate-900 leading-tight uppercase tracking-[-0.02em] group-hover:text-blue-600 transition-colors duration-500">
                          {asset.name}
                        </h4>
                      </div>
                      
                      <div className={cn(
                        "px-4 py-2 rounded-2xl border-2 text-[10px] font-black uppercase tracking-[0.15em] shrink-0 shadow-sm",
                        asset.condition === 'novo' ? "bg-emerald-50 border-emerald-100 text-emerald-600" :
                        asset.condition === 'bom' ? "bg-blue-50 border-blue-100 text-blue-600" :
                        asset.condition === 'regular' ? "bg-amber-50 border-amber-100 text-amber-600" :
                        "bg-rose-50 border-rose-100 text-rose-600"
                      )}>
                        {asset.condition}
                      </div>
                    </div>

                    {asset.observations ? (
                      <div className="bg-slate-50 rounded-3xl p-6 mt-auto border border-slate-100 group-hover:bg-blue-50/30 group-hover:border-blue-100 transition-colors duration-500">
                         <div className="flex items-center gap-2 mb-2">
                            <Info className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Observações Técnicas</span>
                         </div>
                         <p className="text-sm text-slate-600 leading-relaxed font-medium">
                           "{asset.observations}"
                         </p>
                      </div>
                    ) : (
                      <div className="mt-auto pt-6 flex items-center gap-3 text-slate-300">
                        <div className="h-px flex-1 bg-slate-100" />
                        <span className="text-[9px] font-black uppercase tracking-[0.3em]">Integridade Ok</span>
                        <div className="h-px flex-1 bg-slate-100" />
                      </div>
                    )}

                    {/* Technical footer for asset */}
                    <div className="mt-6 pt-5 border-t border-slate-50 flex items-center justify-between text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">
                       <div className="flex items-center gap-2">
                          <div className="w-1 h-1 bg-slate-300 rounded-full" />
                          <span>Manoel Viana Asset Registry</span>
                       </div>
                       <span>#{asset.id.slice(0, 8)}</span>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </motion.div>

          {assets?.length === 0 && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-32 flex flex-col items-center justify-center text-slate-300 border-4 border-dashed border-slate-100 rounded-[5rem] group hover:border-blue-100 transition-all duration-700 bg-white/50"
            >
               <div className="w-24 h-24 bg-white rounded-[2.5rem] flex items-center justify-center mb-8 shadow-[0_20px_50px_rgba(0,0,0,0.05)] group-hover:rotate-12 transition-transform duration-700">
                 <History className="w-12 h-12 text-slate-400 opacity-30" />
               </div>
               <p className="text-lg font-black uppercase tracking-[0.4em] text-slate-400">Sala sem Movimentação</p>
               <span className="text-sm font-medium text-slate-400 mt-3 opacity-60">Esta unidade ainda não possui bens vinculados a esta auditoria.</span>
            </motion.div>
          )}
        </div>

        {/* Certification Seal - The Grand Finale */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="bg-emerald-600 rounded-[4rem] p-12 md:p-20 text-white flex flex-col md:flex-row items-center gap-12 relative overflow-hidden shadow-2xl shadow-emerald-200 mt-10 group"
        >
           <div className="w-28 h-28 bg-white/10 rounded-[3rem] flex items-center justify-center shrink-0 backdrop-blur-3xl border border-white/20 group-hover:scale-110 transition-transform duration-700">
              <ShieldCheck className="w-14 h-14" />
           </div>
           <div className="flex flex-col gap-4 text-center md:text-left relative z-10">
              <h4 className="text-3xl md:text-4xl font-black uppercase tracking-tight leading-none text-emerald-50">Selo de Integridade MV</h4>
              <p className="text-emerald-50/80 text-base md:text-lg leading-relaxed max-w-3xl font-medium">
                Este certificado digital garante que a conferência destes bens foi realizada publicamente 
                pela equipe técnica da Prefeitura Municipal de Manoel Viana. 
                Cada foto e registro possui um hash de segurança que impede adulterações retroativas.
              </p>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-6 mt-4">
                 <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-300" />
                    <span className="text-xs font-black uppercase tracking-widest text-emerald-100">Auditado</span>
                 </div>
                 <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-300" />
                    <span className="text-xs font-black uppercase tracking-widest text-emerald-100">Fotos Autênticas</span>
                 </div>
                 <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-300" />
                    <span className="text-xs font-black uppercase tracking-widest text-emerald-100">Transparência Total</span>
                 </div>
              </div>
           </div>
           <Building2 className="absolute -bottom-24 -right-24 w-80 h-80 text-white/[0.05] rotate-12" />
        </motion.div>
      </main>
      
      <footer className="py-20 bg-slate-900 text-center flex flex-col items-center gap-8 relative overflow-hidden">
         <div className="flex items-center gap-3 relative z-10">
           <ShieldCheck className="w-6 h-6 text-white" />
           <span className="text-xs font-black text-white uppercase tracking-[0.4em]">PATRI-MV • AUDITORIA PÚBLICA</span>
         </div>
         <p className="text-xs font-bold text-slate-500 uppercase tracking-[0.2em] leading-loose relative z-10">
           Governo Municipal de Manoel Viana - RS<br/>
           Secretaria de Administração e Patrimônio<br/>
           Versão 2026.4 • Transparência Ativa
         </p>
         <button 
           onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
           className="w-14 h-14 bg-white/5 rounded-full flex items-center justify-center text-white hover:bg-white/10 transition-colors border border-white/5 relative z-10"
         >
           <ArrowLeft className="w-5 h-5 rotate-90" />
         </button>
         <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-600/5 blur-[150px] rounded-full pointer-events-none" />
      </footer>
    </div>
  );
}

// No separate re-import needed

