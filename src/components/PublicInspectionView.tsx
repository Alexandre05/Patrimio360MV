import React, { useState, useEffect } from 'react';
import { db as firestore } from '../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { Inspection, Location, Asset } from '../lib/db';
import { formatDate } from '../lib/utils';
import { ShieldCheck, MapPin, Search, Box, CheckCircle2, AlertTriangle, AlertCircle, XCircle, Maximize2, X, Calendar, Landmark } from 'lucide-react';
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
    'novo': 'bg-emerald-50 text-emerald-700 border-emerald-200',
    'bom': 'bg-emerald-50 text-emerald-700 border-emerald-200',
    'regular': 'bg-amber-50 text-amber-700 border-amber-200',
    'ruim': 'bg-rose-50 text-rose-700 border-rose-200',
    'inservivel': 'bg-rose-50 text-rose-700 border-rose-200'
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
           <Search className="w-12 h-12 text-blue-600 animate-spin" />
           <p className="text-blue-800 font-medium tracking-tight">Buscando informações oficiais...</p>
        </div>
      </div>
    );
  }

  if (error || !inspection) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center">
        <div className="bg-white p-8 rounded-2xl shadow-sm max-w-md w-full border border-rose-200">
           <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8" />
           </div>
           <h2 className="text-2xl font-bold text-slate-800 mb-2">Atenção</h2>
           <p className="text-slate-600 font-medium">{error || "Registro não localizado no sistema."}</p>
        </div>
      </div>
    );
  }

  if (inspection.status !== 'finalizada') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 text-center font-sans">
        <div className="w-20 h-20 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mb-6 shadow-sm border border-amber-200">
          <AlertCircle className="w-10 h-10" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2 tracking-tight">Análise em Andamento</h1>
        <p className="text-slate-600 max-w-sm leading-relaxed font-medium">
          Este registro ainda está sob análise da administração pública e aguarda homologação oficial para publicação na transparência.
        </p>
        <div className="mt-8 pt-8 border-t border-slate-200">
           <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Portal da Transparência</p>
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
              className="absolute top-6 right-6 w-12 h-12 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center backdrop-blur-md transition-colors duration-200"
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
              className="max-w-full max-h-[90vh] rounded-xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Banner - Ultra Modern GovTech Style */}
      <div className="bg-[#050B14] text-white pt-12 pb-24 px-6 relative overflow-hidden">
        {/* Deep, majestic top glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-[400px] opacity-40 pointer-events-none">
           <div className="absolute inset-0 bg-gradient-to-b from-blue-500/30 to-transparent blur-3xl"></div>
           <div className="absolute top-0 left-1/4 w-1/2 h-[200px] bg-blue-400/20 blur-[100px]"></div>
        </div>
        
        {/* Premium Grid Pattern */}
        <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
        
        <div className="relative z-10 max-w-2xl mx-auto flex flex-col items-center text-center">
           <div className="w-16 h-16 bg-white/5 backdrop-blur-xl border border-white/10 rounded-[1.25rem] flex items-center justify-center mb-6 shadow-2xl relative group">
             <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/20 to-emerald-500/20 rounded-[1.25rem] opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
             <Landmark className="w-8 h-8 text-blue-100" strokeWidth={1.5} />
           </div>
           <h1 className="text-3xl md:text-4xl font-display font-semibold tracking-tight mb-3 text-transparent bg-clip-text bg-gradient-to-b from-white to-white/70">Consulta de Patrimônio</h1>
           <p className="text-blue-200/80 font-medium mb-8 tracking-wide text-sm md:text-base">Portal da Transparência • Edição Oficial</p>
           
           <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-1 w-full md:w-auto overflow-hidden relative">
             <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-transparent to-emerald-500/10 opacity-50"></div>
             <div className="bg-slate-900/40 rounded-xl px-6 py-4 relative z-10">
               <div className="flex flex-col md:flex-row items-center gap-4 md:gap-6 text-sm">
                 <div className="flex items-center gap-2 text-blue-100/90">
                   <Calendar className="w-4 h-4 opacity-70" />
                   <span className="font-medium">Data-Base: {formatDate(inspection.date)}</span>
                 </div>
                 <div className="hidden md:block w-px h-5 bg-white/10"></div>
                 <div className="flex items-center gap-2 text-emerald-400 font-semibold drop-shadow-[0_0_15px_rgba(52,211,153,0.3)]">
                   <CheckCircle2 className="w-4 h-4" />
                   <span>Homologado Oficialmente</span>
                 </div>
               </div>
               <div className="mt-3 pt-3 border-t border-white/5">
                  <p className="text-[11px] text-white/40 font-mono tracking-widest uppercase">Protocolo: {inspection.id}</p>
               </div>
             </div>
           </div>
        </div>
      </div>

      {/* Content wrapper */}
      <div className="max-w-2xl mx-auto px-4 -mt-10 relative z-20 flex flex-col gap-6">
        
        {/* Info Card */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
           <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
              <div className="w-12 h-12 bg-slate-100 text-slate-600 rounded-xl flex items-center justify-center shrink-0 border border-slate-200">
                <MapPin className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">Local Inspecionado</p>
                <h2 className="text-xl font-bold text-slate-800 leading-tight">{location?.name || 'Local Desconhecido'}</h2>
                {location?.description && <p className="text-sm text-slate-500 mt-1">{location.description}</p>}
              </div>
              <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-xl border border-blue-100 flex flex-col items-center">
                 <span className="text-xs font-semibold uppercase">Itens</span>
                 <span className="text-2xl font-bold leading-none">{stats.total}</span>
              </div>
           </div>
        </div>

        {/* Status Highlights */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-white p-4 rounded-2xl border border-emerald-200 shadow-sm flex flex-col">
            <span className="text-3xl font-bold text-emerald-600 mb-1">{stats.bons}</span>
            <span className="text-xs font-bold text-emerald-800 uppercase">Conservado/Novo</span>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-amber-200 shadow-sm flex flex-col">
            <span className="text-3xl font-bold text-amber-600 mb-1">{stats.regular}</span>
            <span className="text-xs font-bold text-amber-800 uppercase">Estado Regular</span>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-rose-200 shadow-sm flex flex-col md:col-span-1 col-span-2">
            <span className="text-3xl font-bold text-rose-600 mb-1">{stats.ruins}</span>
            <span className="text-xs font-bold text-rose-800 uppercase">Requer Atenção</span>
          </div>
        </div>

        {/* Assets List */}
        <div className="mt-2">
          <div className="relative mb-6">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input 
              type="text" 
              placeholder="Pesquisar itens por nome ou código..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-2xl text-sm shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none placeholder:text-slate-400 transition-all duration-200"
            />
          </div>

          <div className="flex flex-col gap-4">
            {filteredAssets.map((asset) => (
              <div key={asset.id} className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200/60 overflow-hidden flex flex-col sm:flex-row hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-300 group">
                 
                 {/* Optional Photo Side */}
                 {asset.photos && asset.photos.length > 0 && (
                   <div 
                     className="w-full sm:w-48 h-48 sm:h-auto shrink-0 relative bg-slate-100 cursor-zoom-in group/photo"
                     onClick={() => setSelectedImage(asset.photos[0])}
                   >
                     <img src={asset.photos[0]} alt={asset.name} className="w-full h-full object-cover transition-transform duration-300 group-hover/photo:scale-105" loading="lazy" />
                     <div className="absolute inset-0 bg-black/10 transition-opacity flex items-center justify-center opacity-0 group-hover/photo:opacity-100">
                        <div className="bg-white/90 p-2 rounded-full shadow-sm text-slate-700">
                           <Maximize2 className="w-5 h-5" />
                        </div>
                     </div>
                     {asset.photos.length > 1 && (
                       <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-1 rounded-lg">
                         +{asset.photos.length - 1} foto{asset.photos.length > 2 ? 's' : ''}
                       </div>
                     )}
                   </div>
                 )}

                 {/* Content Side */}
                 <div className="p-5 flex-1 flex flex-col justify-center">
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                       <h4 className="font-bold text-slate-800 text-lg leading-tight flex-1">{asset.name}</h4>
                       <div className={`px-2.5 py-1 rounded-lg border flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide shrink-0 ${conditionColors[asset.condition] || 'bg-slate-50 text-slate-700 border-slate-200'}`}>
                         {getConditionIcon(asset.condition)}
                         {asset.condition}
                       </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mb-3">
                       {asset.patrimonyNumber && (
                         <div className="inline-flex items-center px-2.5 py-1 bg-slate-50 text-slate-600 rounded-lg text-[11px] font-mono font-semibold border border-slate-200">
                            Nº {asset.patrimonyNumber}
                         </div>
                       )}
                       <div className="inline-flex items-center px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-[11px] font-semibold border border-blue-100">
                          {asset.quantity || 1} unid.
                       </div>
                    </div>

                    {asset.observations && (
                      <div className="mt-2 text-sm text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                        {asset.observations}
                      </div>
                    )}
                 </div>
              </div>
            ))}

            {filteredAssets.length === 0 && assets.length > 0 && (
              <div className="text-center py-12 px-6 bg-white rounded-2xl border border-slate-200 text-slate-500 shadow-sm">
                <Search className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                <p className="font-medium">Nenhum item localizado com esta busca.</p>
              </div>
            )}

            {assets.length === 0 && (
              <div className="text-center py-12 px-6 bg-white rounded-2xl border border-slate-200 text-slate-500 shadow-sm">
                <Box className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                <p className="font-medium">Nenhum item registrado neste local.</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
