import React, { useState, useEffect } from 'react';
import { db as firestore } from '../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { Inspection, Location, Asset } from '../lib/db';
import { formatDate } from '../lib/utils';
import { ShieldCheck, MapPin, Search, Box, CheckCircle2, AlertTriangle, AlertCircle, XCircle, Maximize2, X, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export function PublicInspectionView({ inspectionId: propId, locationId: propLocationId }: { inspectionId?: string; locationId?: string }) {
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [location, setLocation] = useState<Location | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    let id = propId;
    let locId = propLocationId;

    if (!id && !locId) {
      // Extract from URL if not through props
      const path = window.location.pathname;
      const hash = window.location.hash || '';
      
      // More robust regex-based path detection
      const localMatch = path.match(/\/local\/([^\/]+)/) || hash.match(/\/local\/([^\/]+)/);
      const vistoriaMatch = path.match(/\/vistoria\/([^\/]+)/) || hash.match(/\/vistoria\/([^\/]+)/);

      if (localMatch && localMatch[1]) {
        locId = localMatch[1];
      } else if (vistoriaMatch && vistoriaMatch[1]) {
        id = vistoriaMatch[1];
      }
    }
    
    if (id) {
      fetchDataByInspection(id);
    } else if (locId) {
      fetchDataByLocation(locId);
    } else {
      setError("Link inválido. Certifique-se de que o QR Code está correto.");
      setLoading(false);
    }
  }, [propId, propLocationId]);

  const fetchDataByLocation = async (locId: string) => {
    try {
      setLoading(true);
      setError(null);

      // Find latest finalized inspection for this location
      // We must explicitly filter by status to match security rules for list operations
      const inspQuery = query(
        collection(firestore, 'inspections'),
        where('locationId', '==', locId),
        where('status', '==', 'finalizada'),
        limit(5)
      );

      const inspSnap = await getDocs(inspQuery);
      
      const finishedInspections = inspSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as Inspection))
        .sort((a, b) => (b.finalizedAt || 0) - (a.finalizedAt || 0));

      if (finishedInspections.length === 0) {
        // Find location info anyway to show a better error
        const locRef = doc(firestore, 'locations', locId);
        const locSnap = await getDoc(locRef);
        if (locSnap.exists()) {
          setLocation({ id: locSnap.id, ...locSnap.data() } as Location);
          setError("Esta sala ainda não possui vistorias homologadas.");
        } else {
          setError("Localização não encontrada.");
        }
        setLoading(false);
        return;
      }

      const latestInsp = finishedInspections[0];
      await fetchDataByInspection(latestInsp.id);
    } catch (err: any) {
      console.error("fetchDataByLocation error:", err);
      if (err.message && err.message.toLowerCase().includes('permission')) {
        setError("Acesso negado. Esta vistoria pode não estar publicada.");
      } else if (err.message && err.message.includes('index')) {
        setError("Erro de configuração (índice ausente). O administrador precisa criar o índice no Firebase.");
      } else {
        setError("Falha ao buscar dados do local. Verifique sua conexão.");
      }
      setLoading(false);
    }
  };

  const fetchDataByInspection = async (id: string) => {
    try {
      setLoading(true);
      setError(null);

      const inspRef = doc(firestore, 'inspections', id);
      const inspSnap = await getDoc(inspRef);

      if (!inspSnap.exists()) {
        setError("Vistoria não encontrada.");
        setLoading(false);
        return;
      }

      const inspData = inspSnap.data() as Inspection;
      setInspection({ id: inspSnap.id, ...inspData });

      const locRef = doc(firestore, 'locations', inspData.locationId);
      const locSnap = await getDoc(locRef);
      if (locSnap.exists()) {
        setLocation({ id: locSnap.id, ...locSnap.data() } as Location);
      }

      const assetsQuery = query(
        collection(firestore, 'assets'), 
        where('inspectionId', '==', inspSnap.id),
        limit(100)
      );
      const assetsSnap = await getDocs(assetsQuery);
      const loadedAssets = assetsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Asset));
      
      setAssets(loadedAssets.sort((a, b) => b.createdAt - a.createdAt));
      
    } catch (err: any) {
      console.error("fetchDataByInspection error:", err);
      const technicalInfo = err.code || err.message || "Erro desconhecido";
      if (err.message && err.message.toLowerCase().includes('permission')) {
        setError(`Acesso negado (${technicalInfo}). Verifique se a vistoria foi finalizada.`);
      } else if (err.message && err.message.includes('index')) {
        setError(`Erro de índice (${technicalInfo}). O administrador precisa criar o índice no Firebase.`);
      } else {
        setError(`Erro ao carregar dados (${technicalInfo}).`);
      }
    } finally {
      setLoading(false);
    }
  };

  const conditionColors: Record<string, string> = {
    'novo': 'bg-emerald-100 text-emerald-800 border-emerald-200',
    'bom': 'bg-blue-100 text-blue-800 border-blue-200',
    'regular': 'bg-amber-100 text-amber-800 border-amber-200',
    'ruim': 'bg-orange-100 text-orange-800 border-orange-200',
    'inservivel': 'bg-rose-100 text-rose-800 border-rose-200'
  };

  const getConditionIcon = (condition: string) => {
    switch (condition) {
       case 'novo': return <CheckCircle2 className="w-4 h-4" />;
       case 'bom': return <CheckCircle2 className="w-4 h-4" />;
       case 'regular': return <AlertTriangle className="w-4 h-4" />;
       case 'ruim': return <AlertCircle className="w-4 h-4" />;
       case 'inservivel': return <XCircle className="w-4 h-4" />;
       default: return <CheckCircle2 className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4 animate-pulse">
           <Search className="w-12 h-12 text-emerald-500 animate-spin" />
           <p className="text-emerald-700 font-medium">Buscando informações da vistoria...</p>
        </div>
      </div>
    );
  }

  if (error || !inspection) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center">
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full border border-rose-100">
           <div className="w-16 h-16 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8" />
           </div>
           <h2 className="text-2xl font-bold text-slate-800 mb-2">Ops!</h2>
           <p className="text-slate-600 font-medium">{error || "Vistoria não encontrada"}</p>
        </div>
      </div>
    );
  }

  if (inspection.status !== 'finalizada') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 text-center font-sans">
        <div className="w-20 h-20 bg-amber-100 text-amber-600 rounded-3xl flex items-center justify-center mb-6 shadow-xl shadow-amber-200/50">
          <AlertCircle className="w-10 h-10" />
        </div>
        <h1 className="text-2xl font-black text-slate-900 mb-2">Vistoria em Processamento</h1>
        <p className="text-slate-500 max-w-xs leading-relaxed font-medium">
          Esta vistoria ainda não foi homologada pela administração e não está disponível para visualização pública no momento.
        </p>
        <div className="mt-8 pt-8 border-t border-slate-200">
           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Patri-MV • Manoel Viana/RS</p>
        </div>
      </div>
    );
  }

  const stats = {
    total: assets.reduce((acc, curr) => acc + (curr.quantity || 1), 0),
    bons: assets.filter(a => a.condition === 'bom' || a.condition === 'novo').reduce((acc, curr) => acc + (curr.quantity || 1), 0),
    ruins: assets.filter(a => a.condition === 'ruim' || a.condition === 'inservivel').reduce((acc, curr) => acc + (curr.quantity || 1), 0),
    regular: assets.filter(a => a.condition === 'regular').reduce((acc, curr) => acc + (curr.quantity || 1), 0)
  };

  const filteredAssets = assets.filter(asset => 
    (asset.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (asset.patrimonyNumber || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-20">
      <AnimatePresence>
        {selectedImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm"
            onClick={() => setSelectedImage(null)}
          >
            <motion.button 
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="absolute top-6 right-6 w-12 h-12 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center backdrop-blur-md transition-colors"
              onClick={() => setSelectedImage(null)}
            >
              <X className="w-6 h-6" />
            </motion.button>
            <motion.img 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              src={selectedImage} 
              alt="Imagem ampliada" 
              className="max-w-full max-h-[90vh] rounded-2xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Banner */}
      <div className="bg-emerald-600 text-white pt-12 pb-24 px-6 rounded-b-[3rem] shadow-lg relative overflow-hidden">
        {/* Abstract pattern background */}
        <div className="absolute inset-0 opacity-10">
          <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid-pattern" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M0 40V0H40V40z" fill="none" />
                <path d="M0 40L40 0M20 40L40 20M0 20L20 0" stroke="currentColor" strokeWidth="2" strokeOpacity="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid-pattern)" />
          </svg>
        </div>

        <div className="relative z-10 max-w-lg mx-auto flex flex-col items-center text-center">
           <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mb-4 shadow-inner">
             <ShieldCheck className="w-8 h-8 text-white" />
           </div>
           <h1 className="text-3xl font-black tracking-tight mb-2 uppercase leading-none">Vistoria Homologada</h1>
           <div className="flex flex-col items-center gap-2">
             <p className="text-emerald-100 font-medium tracking-wide text-sm bg-black/10 px-4 py-1.5 rounded-full inline-block">
               ID: {inspection.id.slice(0, 12).toUpperCase()}
             </p>
             <div className="flex flex-col gap-1 mt-3">
               <div className="flex items-center gap-1.5 text-emerald-50 text-xs font-bold uppercase tracking-widest opacity-80">
                 <Calendar className="w-3.5 h-3.5" />
                 Realizada em {formatDate(inspection.date)}
               </div>
               {inspection.finalizedAt && (
                  <div className="flex items-center gap-1.5 text-emerald-100 text-xs font-bold uppercase tracking-widest opacity-90">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Homologada em {formatDate(inspection.finalizedAt)}
                  </div>
               )}
             </div>
           </div>
        </div>
      </div>

      {/* Content wrapper */}
      <div className="max-w-lg mx-auto px-4 -mt-16 relative z-20 flex flex-col gap-6">
        
        {/* Info Card */}
        <div className="bg-white rounded-3xl p-6 shadow-xl shadow-slate-200/50 border border-slate-100">
           <div className="flex flex-col gap-4">
              <div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Localização Inspecionada</span>
                <div className="flex items-center gap-3 mt-1">
                  <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-800 leading-tight">{location?.name || 'Local Desconhecido'}</h2>
                    {location?.description && <p className="text-sm text-slate-500 line-clamp-1">{location.description}</p>}
                  </div>
                </div>
              </div>

              <div className="h-px bg-slate-100 w-full" />

              <div className="flex justify-between items-center px-1">
                 <div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Data da Vistoria</span>
                    <span className="font-semibold text-slate-700">{formatDate(inspection.date)}</span>
                 </div>
                 <div className="text-right">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Status</span>
                    {inspection.status === 'finalizada' ? (
                      <span className="inline-flex items-center gap-1 font-bold text-emerald-600 text-sm">
                        <CheckCircle2 className="w-4 h-4" /> Finalizada
                      </span>
                    ) : (
                      <span className="font-bold text-amber-500 text-sm">{inspection.status.replace('_', ' ')}</span>
                    )}
                 </div>
              </div>

              {(inspection.concludedAt || inspection.finalizedAt) && (
                <>
                   <div className="h-px bg-slate-100 w-full" />
                   <div className="flex justify-between items-center px-1 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      {inspection.concludedAt && (
                         <div>
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Concluída (Técnico)</span>
                            <span className="font-bold text-slate-600 text-xs">{formatDate(inspection.concludedAt)}</span>
                         </div>
                      )}
                      {inspection.finalizedAt && (
                         <div className="text-right">
                            <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest block">Homologada (Gestor)</span>
                            <span className="font-bold text-emerald-600 text-xs">{formatDate(inspection.finalizedAt)}</span>
                         </div>
                      )}
                   </div>
                </>
              )}
           </div>
        </div>

        {/* Assets List */}
        <div>
          <div className="flex items-center justify-between mb-4 px-2">
            <h3 className="text-lg font-bold text-slate-800 tracking-tight flex items-center gap-2">
              <Box className="w-5 h-5 text-emerald-500" />
              Itens Patrimoniais ({stats.total})
            </h3>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-6">
            <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-100 text-center shadow-sm">
              <span className="text-2xl font-black text-emerald-600">{stats.bons}</span>
              <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Bons/Novos</p>
            </div>
            <div className="bg-amber-50 p-3 rounded-2xl border border-amber-100 text-center shadow-sm">
              <span className="text-2xl font-black text-amber-600">{stats.regular}</span>
              <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Regulares</p>
            </div>
            <div className="bg-rose-50 p-3 rounded-2xl border border-rose-100 text-center shadow-sm">
              <span className="text-2xl font-black text-rose-600">{stats.ruins}</span>
              <p className="text-[10px] font-bold text-rose-800 uppercase tracking-wider">Críticos</p>
            </div>
          </div>

          <div className="relative mb-6">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar por nome ou nº de patrimônio..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3.5 bg-white border border-slate-200 rounded-2xl text-sm shadow-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none placeholder:text-slate-400"
            />
          </div>

          <div className="flex flex-col gap-4">
            {filteredAssets.map((asset) => (
              <div key={asset.id} className="bg-white rounded-[2rem] p-5 shadow-lg shadow-slate-200/50 border border-slate-100 overflow-hidden relative group">
                 {/* Top row */}
                 <div className="flex justify-between items-start gap-4 mb-4">
                    <div>
                      <h4 className="font-bold text-slate-800 text-lg leading-tight mb-1">{asset.name}</h4>
                      <div className="flex flex-wrap items-center gap-1.5">
                         {asset.patrimonyNumber && (
                           <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold border border-slate-200">
                              Nº {asset.patrimonyNumber}
                           </div>
                         )}
                         <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold border border-blue-100">
                            {asset.quantity || 1} Unidade{(asset.quantity || 1) !== 1 ? 's' : ''}
                         </div>
                      </div>
                    </div>
                    
                    <div className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider shrink-0 ${conditionColors[asset.condition] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                      {getConditionIcon(asset.condition)}
                      {asset.condition}
                    </div>
                 </div>

                 {asset.observations && (
                   <div className="mb-4 text-sm text-slate-600 bg-slate-50 p-3 rounded-2xl border border-slate-100 font-medium">
                     "{asset.observations}"
                   </div>
                 )}

                 {(asset.photos && asset.photos.length > 0) && (
                   <div className="flex gap-3 overflow-x-auto snap-x pb-2 [&::-webkit-scrollbar]:hidden">
                     {asset.photos.map((photo, idx) => (
                       <div 
                         key={idx} 
                         onClick={() => setSelectedImage(photo)}
                         className="rounded-2xl shrink-0 w-[85%] overflow-hidden aspect-video relative outline outline-1 outline-slate-100 snap-center cursor-zoom-in group/photo"
                       >
                          <img src={photo} alt={`${asset.name} - Foto ${idx + 1}`} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover/photo:scale-110" loading="lazy" />
                          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/photo:opacity-100 transition-opacity flex items-center justify-center">
                            <div className="bg-white/20 backdrop-blur-md p-3 rounded-full text-white">
                              <Maximize2 className="w-6 h-6" />
                            </div>
                          </div>
                       </div>
                     ))}
                   </div>
                 )}
              </div>
            ))}

            {filteredAssets.length === 0 && assets.length > 0 && (
              <div className="text-center py-10 px-6 bg-white rounded-3xl border border-slate-100 text-slate-500">
                <Search className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                <p className="font-medium">Nenhum item encontrado na busca.</p>
              </div>
            )}

            {assets.length === 0 && (
              <div className="text-center py-10 px-6 bg-white rounded-3xl border border-slate-100 text-slate-500">
                <Box className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p className="font-medium">Nenhum item registrado nesta vistoria.</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
