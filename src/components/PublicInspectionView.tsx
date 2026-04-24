import React, { useState, useEffect } from 'react';
import { db as firestore } from '../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { Inspection, Location, Asset } from '../lib/db';
import { formatDate } from '../lib/utils';
import { ShieldCheck, MapPin, Search, Box, CheckCircle2, AlertTriangle, AlertCircle, XCircle } from 'lucide-react';

export function PublicInspectionView({ id: propId }: { id?: string }) {
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [location, setLocation] = useState<Location | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    let id = propId;
    if (!id) {
      // Extract ID from URL
      const parts = window.location.pathname.split('/');
      const idIndex = parts.indexOf('vistoria');
      if (idIndex !== -1 && parts[idIndex + 1]) {
        id = parts[idIndex + 1];
      }
    }
    
    if (id) {
      fetchData(id);
    } else {
      setError("Link inválido.");
      setLoading(false);
    }
  }, [propId]);

  const fetchData = async (id: string) => {
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

      const assetsQuery = query(collection(firestore, 'assets'), where('inspectionId', '==', inspSnap.id));
      const assetsSnap = await getDocs(assetsQuery);
      const loadedAssets = assetsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Asset));
      setAssets(loadedAssets.sort((a, b) => b.createdAt - a.createdAt));
      
    } catch (err: any) {
      console.error(err);
      setError("Erro ao carregar dados da vistoria.");
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
    total: assets.length,
    bons: assets.filter(a => a.condition === 'bom' || a.condition === 'novo').length,
    ruins: assets.filter(a => a.condition === 'ruim' || a.condition === 'inservivel').length,
    regular: assets.filter(a => a.condition === 'regular').length
  };

  const filteredAssets = assets.filter(asset => 
    (asset.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (asset.patrimonyNumber || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-20">
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
           <p className="text-emerald-100 font-medium tracking-wide text-sm bg-black/10 px-4 py-1.5 rounded-full inline-block">
             ID: {inspection.id.slice(0, 12).toUpperCase()}
           </p>
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
                    <span className="font-semibold text-slate-700">{formatDate(inspection.createdAt)}</span>
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
           </div>
        </div>

        {/* Assets List */}
        <div>
          <div className="flex items-center justify-between mb-4 px-2">
            <h3 className="text-lg font-bold text-slate-800 tracking-tight flex items-center gap-2">
              <Box className="w-5 h-5 text-emerald-500" />
              Itens Patrimoniais ({assets.length})
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
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold border border-slate-200">
                         Nº {asset.patrimonyNumber}
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
                   <div className="flex gap-2 overflow-x-auto snap-x pb-2 [&::-webkit-scrollbar]:hidden">
                     {asset.photos.map((photo, idx) => (
                       <div key={idx} className="rounded-2xl shrink-0 w-[85%] overflow-hidden aspect-video relative outline outline-1 outline-slate-100 snap-center">
                          <img src={photo} alt={`${asset.name} - Foto ${idx + 1}`} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
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
