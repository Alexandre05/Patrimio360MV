import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase'; // Nosso Supabase oficial
import { Inspection, Location, Asset } from '../lib/db';
import { formatDate } from '../lib/utils';
import { ShieldCheck, MapPin, Search, Box, CheckCircle2, AlertTriangle, AlertCircle, XCircle, Maximize2, X, Calendar, Landmark, Award, ShieldAlert, Sparkles, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../lib/AuthContext';

export function PublicInspectionView({ inspectionId: propId, locationId: propLocationId }: { inspectionId?: string; locationId?: string }) {
  const { signInAsGuest } = useAuth();
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [location, setLocation] = useState<Location | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    const initializeAndFetch = async () => {
      try {
        const { auth } = await import('../lib/firebase');
        if (!auth.currentUser) {
          await signInAsGuest();
        }

        let id = propId;
        let locId = propLocationId;

        if (!id && !locId) {
          const path = window.location.pathname;
          const hash = window.location.hash || '';
          
          const localMatch = path.match(/\/local\/([^\/]+)/) || hash.match(/\/local\/([^\/]+)/);
          const vistoriaMatch = path.match(/\/vistoria\/([^\/]+)/) || hash.match(/\/vistoria\/([^\/]+)/);

          if (localMatch && localMatch[1]) {
            locId = localMatch[1];
          } else if (vistoriaMatch && vistoriaMatch[1]) {
            id = vistoriaMatch[1];
          }
        }
        
        if (id) {
          await fetchDataByInspection(id);
        } else if (locId) {
          await fetchDataByLocation(locId);
        } else {
          setError("Link inválido. Certifique-se de que o QR Code está correto.");
          setLoading(false);
        }
      } catch (err: any) {
        console.error("Erro na inicialização pública:", err);
        setError(err.message || "Erro desconhecido ao carregar dados.");
        setLoading(false);
      }
    };

    initializeAndFetch();
  }, [propId, propLocationId]);

  const getDisplayDate = (insp: any) => {
    return insp.finalizedAt || insp.updatedAt || insp.date;
  };

  const fetchDataByLocation = async (locId: string) => {
    try {
      setLoading(true);
      setError(null);

      const { data: inspData, error: inspError } = await supabase
        .from('inspections')
        .select('*')
        .eq('locationId', locId)
        .eq('status', 'finalizada')
        .order('finalizedAt', { ascending: false })
        .limit(5);

      if (inspError) throw inspError;

      if (!inspData || inspData.length === 0) {
        const { data: locData } = await supabase.from('locations').select('*').eq('id', locId).single();

        if (locData) {
          setLocation({
            id: locData.id,
            name: locData.name,
            description: locData.description,
            latitude: locData.latitude,
            longitude: locData.longitude,
            parentId: locData.parentId
          });
          setError("Esta sala ainda não possui vistorias homologadas.");
        } else {
          setError("Localização não encontrada.");
        }
        setLoading(false);
        return;
      }

      const latestInsp = inspData[0];
      await fetchDataByInspection(latestInsp.id);
    } catch (err: any) {
      setError("Falha ao buscar dados do local. Verifique sua conexão.");
      setLoading(false);
    }
  };

  const fetchDataByInspection = async (id: string) => {
    try {
      setLoading(true);
      setError(null);

      const { data: inspData, error: inspError } = await supabase
        .from('inspections')
        .select('*')
        .eq('id', id)
        .single();

      if (inspError) {
        setError("Vistoria não encontrada.");
        setLoading(false);
        return;
      }

      setInspection({
        id: inspData.id,
        locationId: inspData.locationId,
        date: inspData.date,
        participants: inspData.participants,
        status: inspData.status,
        concludedBy: inspData.concludedBy,
        concludedAt: inspData.concludedAt,
        finalizedBy: inspData.finalizedBy,
        finalizedAt: inspData.finalizedAt,
        qrCodeData: inspData.qrCodeData
      });

      const { data: locData } = await supabase
        .from('locations')
        .select('*')
        .eq('id', inspData.locationId)
        .single();

      if (locData) {
        setLocation({
          id: locData.id,
          name: locData.name,
          description: locData.description,
          latitude: locData.latitude,
          longitude: locData.longitude,
          parentId: locData.parentId
        });
      }

      const { data: assetsData } = await supabase
        .from('assets')
        .select('*')
        .eq('inspectionId', id)
        .eq('deleted', false)
        .limit(3000);

      const loadedAssets = (assetsData || []).map(a => ({
        id: a.id,
        inspectionId: a.inspectionId,
        name: a.name,
        patrimonyNumber: a.patrimonyNumber,
        condition: a.condition,
        photos: a.photos,
        observations: a.observations,
        createdBy: a.createdBy,
        createdAt: a.createdAt,
        hash: a.hash,
        quantity: a.quantity
      })) as Asset[];
      
      setAssets(loadedAssets.sort((a, b) => b.createdAt - a.createdAt));
      
    } catch (err: any) {
      setError(`Erro ao carregar dados: ${err.message || "Erro desconhecido"}.`);
    } finally {
      setLoading(false);
    }
  };

  const conditionBadges: Record<string, { label: string, className: string, icon: any }> = {
    'novo': { label: 'Novo / Excelente', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
    'bom': { label: 'Bom Estado', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
    'regular': { label: 'Estado Regular', className: 'bg-amber-50 text-amber-700 border-amber-200', icon: AlertTriangle },
    'ruim': { label: 'Requer Manutenção', className: 'bg-rose-50 text-rose-700 border-rose-200', icon: AlertCircle },
    'inservivel': { label: 'Inservível / Descarte', className: 'bg-slate-100 text-slate-700 border-slate-300', icon: XCircle }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-white">
        <div className="flex flex-col items-center gap-5">
           <div className="w-16 h-16 rounded-3xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center animate-pulse">
              <Sparkles className="w-8 h-8 text-indigo-400 animate-spin" />
           </div>
           <p className="text-slate-400 font-display font-semibold tracking-wider text-sm uppercase">Carregando Dossiê Oficial...</p>
        </div>
      </div>
    );
  }

  if (error || !inspection) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center">
        <div className="bg-white p-10 rounded-[2.5rem] shadow-xl max-w-md w-full border border-slate-100 flex flex-col items-center">
           <div className="w-20 h-20 bg-rose-50 text-rose-600 rounded-3xl flex items-center justify-center mb-6 shadow-inner border border-rose-100">
              <ShieldAlert className="w-10 h-10" />
           </div>
           <h2 className="text-2xl font-display font-black text-slate-900 mb-2">Registro Indisponível</h2>
           <p className="text-slate-500 text-sm leading-relaxed mb-6 font-medium">{error || "O local solicitado não foi encontrado no servidor."}</p>
        </div>
      </div>
    );
  }

  if (inspection.status !== 'finalizada') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 text-center font-sans">
        <div className="w-20 h-20 bg-amber-50 text-amber-600 rounded-3xl flex items-center justify-center mb-6 shadow-sm border border-amber-100">
          <AlertCircle className="w-10 h-10" />
        </div>
        <h1 className="text-2xl font-display font-black text-slate-900 mb-3 tracking-tight">Homologação Pendente</h1>
        <p className="text-slate-500 max-w-sm leading-relaxed font-medium text-sm">
          Este ambiente encontra-se em auditoria interna e aguarda protocolagem oficial para publicação no Portal da Transparência.
        </p>
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
    <div className="min-h-screen bg-slate-50/70 font-sans pb-24">
      <AnimatePresence>
        {selectedImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 backdrop-blur-md"
            onClick={() => setSelectedImage(null)}
          >
            <motion.button 
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="absolute top-6 right-6 w-12 h-12 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center backdrop-blur-md transition-colors duration-200 shadow-2xl"
              onClick={() => setSelectedImage(null)}
            >
              <X className="w-6 h-6" />
            </motion.button>
            <motion.img 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              src={selectedImage} 
              alt="Evidência ampliada" 
              className="max-w-full max-h-[95vh] rounded-2xl shadow-2xl border border-white/10 object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Institucional de Luxo */}
      <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white pt-12 pb-28 px-6 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-[350px] opacity-30 pointer-events-none">
           <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/30 to-transparent blur-3xl"></div>
        </div>
        
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
        
        <div className="relative z-10 max-w-3xl mx-auto flex flex-col items-center text-center">
           <div className="w-20 h-20 bg-white/10 backdrop-blur-2xl border border-white/20 rounded-[2rem] flex items-center justify-center mb-6 shadow-2xl relative group">
              <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/30 to-emerald-500/30 rounded-[2rem] opacity-70"></div>
              <Landmark className="w-9 h-9 text-white relative z-10" strokeWidth={1.75} />
           </div>

           <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-full mb-4 text-emerald-400 text-[10px] font-black uppercase tracking-[0.2em] shadow-lg">
              <ShieldCheck className="w-4 h-4" />
              <span>Selo Oficial de Transparência</span>
           </div>

           <h1 className="text-3xl md:text-5xl font-display font-extrabold tracking-tight mb-3 text-white">Auditoria Patrimonial</h1>
           <p className="text-slate-400 font-medium mb-8 tracking-wide text-xs md:text-sm uppercase tracking-[0.2em]">Prefeitura Municipal de Manoel Viana • RS</p>
           
           <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-2 w-full max-w-xl shadow-2xl">
             <div className="bg-slate-900/60 rounded-2xl px-6 py-4 flex flex-col md:flex-row items-center justify-around gap-4 text-xs font-semibold">
               <div className="flex items-center gap-2.5 text-slate-300">
                 <Calendar className="w-4 h-4 text-indigo-400" />
                 <span>Homologado em: {formatDate(getDisplayDate(inspection))}</span>
               </div>
               <div className="hidden md:block w-px h-5 bg-white/10"></div>
               <div className="text-slate-400 font-mono text-[10px] tracking-widest truncate">
                 ID: {inspection.id.substring(0, 18)}...
               </div>
             </div>
           </div>
        </div>
      </div>

      {/* Conteúdo Principal com Elevação */}
      <div className="max-w-4xl mx-auto px-4 -mt-14 relative z-20 flex flex-col gap-8">
        {/* Card do Local Inspecionado */}
        <div className="bg-white rounded-[2.5rem] p-8 shadow-[0_20px_50px_rgba(0,0,0,0.06)] border border-slate-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
           <div className="flex items-center gap-5">
              <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shrink-0 border border-indigo-100/50 shadow-inner">
                <MapPin className="w-8 h-8" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Repartição / Setor Auditado</span>
                <h2 className="text-2xl lg:text-3xl font-display font-black text-slate-900 leading-tight">{location?.name || 'Local Desconhecido'}</h2>
                {location?.description && <p className="text-sm font-medium text-slate-500 mt-0.5">{location.description}</p>}
              </div>
           </div>
           
           <div className="bg-slate-900 text-white px-8 py-5 rounded-3xl shadow-xl shadow-slate-900/10 flex flex-col items-center shrink-0 w-full md:w-auto">
              <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Total Físico</span>
              <span className="text-4xl font-display font-black mt-0.5 leading-none">{stats.total}</span>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1">Bens Tombados</span>
           </div>
        </div>

        {/* Estatísticas e Condição do Acervo */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-6 rounded-[2rem] border border-emerald-100 shadow-sm flex items-center gap-5">
             <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0 border border-emerald-100"><CheckCircle2 className="w-7 h-7" /></div>
             <div className="flex flex-col">
                <span className="text-3xl font-display font-black text-slate-900 leading-none mb-1">{stats.bons}</span>
                <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Bens Conservados</span>
             </div>
          </div>
          
          <div className="bg-white p-6 rounded-[2rem] border border-amber-100 shadow-sm flex items-center gap-5">
             <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center shrink-0 border border-amber-100"><AlertTriangle className="w-7 h-7" /></div>
             <div className="flex flex-col">
                <span className="text-3xl font-display font-black text-slate-900 leading-none mb-1">{stats.regular}</span>
                <span className="text-[10px] font-black text-amber-700 uppercase tracking-widest">Estado Regular</span>
             </div>
          </div>

          <div className="bg-white p-6 rounded-[2rem] border border-rose-100 shadow-sm flex items-center gap-5">
             <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center shrink-0 border border-rose-100"><AlertCircle className="w-7 h-7" /></div>
             <div className="flex flex-col">
                <span className="text-3xl font-display font-black text-slate-900 leading-none mb-1">{stats.ruins}</span>
                <span className="text-[10px] font-black text-rose-700 uppercase tracking-widest">Requer Manutenção</span>
             </div>
          </div>
        </div>

        {/* Barra de Pesquisa Moderna */}
        <div className="flex flex-col gap-6">
          <div className="relative group">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
            <input 
              type="text" 
              placeholder="Pesquisar itens por nome, descrição ou número de tombo..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-16 pr-6 py-5 bg-white border border-slate-200/80 rounded-[2rem] text-sm font-semibold shadow-sm focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-600 focus:outline-none placeholder:text-slate-400 transition-all duration-300"
            />
          </div>

          {/* Listagem de Itens */}
          <div className="grid grid-cols-1 gap-4">
            {filteredAssets.map((asset) => {
              const conditionInfo = conditionBadges[asset.condition] || conditionBadges['bom'];
              const ConditionIcon = conditionInfo.icon;

              return (
                <div key={asset.id} className="bg-white rounded-[2rem] shadow-[0_10px_30px_rgba(0,0,0,0.03)] border border-slate-100 overflow-hidden flex flex-col md:flex-row hover:shadow-xl hover:border-slate-200 transition-all duration-300 group">
                   
                   {/* Fotos do Patrimônio */}
                   {asset.photos && asset.photos.length > 0 && (
                     <div 
                       className="w-full md:w-56 h-56 md:h-auto shrink-0 relative bg-slate-100 cursor-zoom-in group/photo overflow-hidden"
                       onClick={() => setSelectedImage(asset.photos[0])}
                     >
                        <img src={asset.photos[0]} alt={asset.name} className="w-full h-full object-cover transition-transform duration-500 group-hover/photo:scale-110" loading="lazy" />
                        <div className="absolute inset-0 bg-slate-900/20 transition-opacity flex items-center justify-center opacity-0 group-hover/photo:opacity-100 backdrop-blur-[2px]">
                           <div className="bg-white/90 p-3 rounded-2xl shadow-xl text-slate-800 transform scale-90 group-hover/photo:scale-100 transition-transform">
                              <Maximize2 className="w-5 h-5" />
                           </div>
                        </div>
                        {asset.photos.length > 1 && (
                          <div className="absolute bottom-3 right-3 bg-slate-900/80 backdrop-blur-md text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl shadow-lg">
                            +{asset.photos.length - 1} foto{asset.photos.length > 2 ? 's' : ''}
                          </div>
                        )}
                     </div>
                   )}

                   {/* Informações do Item */}
                   <div className="p-8 flex-1 flex flex-col justify-between gap-4">
                      <div className="flex flex-col gap-2">
                         <div className="flex flex-wrap items-start justify-between gap-4">
                            <h4 className="font-display font-extrabold text-slate-900 text-xl tracking-tight leading-tight flex-1">{asset.name}</h4>
                            <div className={`px-3.5 py-1.5 rounded-xl border flex items-center gap-2 text-[10px] font-black uppercase tracking-widest shrink-0 ${conditionInfo.className} shadow-sm`}>
                               <ConditionIcon className="w-4 h-4" />
                               {conditionInfo.label}
                            </div>
                         </div>

                         <div className="flex flex-wrap items-center gap-3 mt-1">
                            {asset.patrimonyNumber && (
                              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-50 text-slate-700 rounded-xl text-xs font-mono font-black border border-slate-200 shadow-sm">
                                 <span className="text-[9px] text-slate-400 uppercase tracking-widest">Tombo:</span>
                                 {asset.patrimonyNumber}
                              </div>
                            )}
                            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-black border border-indigo-100 shadow-sm">
                               <Layers className="w-3.5 h-3.5 text-indigo-500" />
                               <span>{asset.quantity || 1} unidade(s)</span>
                            </div>
                         </div>
                      </div>

                      {asset.observations && (
                        <div className="text-xs font-medium text-slate-600 bg-slate-50 p-4 rounded-2xl border border-slate-100 leading-relaxed">
                          <span className="font-bold uppercase tracking-widest text-[9px] text-slate-400 block mb-1">Observações Técnicas do Auditor:</span>
                          "{asset.observations}"
                        </div>
                      )}
                   </div>
                </div>
              );
            })}

            {filteredAssets.length === 0 && assets.length > 0 && (
              <div className="text-center py-16 px-6 bg-white rounded-[2rem] border border-slate-100 text-slate-400 shadow-sm">
                <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-bold text-xs uppercase tracking-widest">Nenhum item localizado com esta busca</p>
              </div>
            )}

            {assets.length === 0 && (
              <div className="text-center py-16 px-6 bg-white rounded-[2rem] border border-slate-100 text-slate-400 shadow-sm">
                <Box className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-bold text-xs uppercase tracking-widest">Nenhum item registrado neste local</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}