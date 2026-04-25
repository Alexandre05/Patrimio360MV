import React, { useState, MouseEvent } from 'react';
import { Card, Button, Input } from './UI';
import { Building2, Plus, ArrowRight, Trash2, AlertCircle, X, Search, History, Calendar, CheckSquare, Map } from 'lucide-react';
import { db, generateId, Inspection } from '../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { cn, formatDate } from '../lib/utils';
import { useAuth } from '../lib/AuthContext';
import { syncLocation, syncInspection, pushLocalChanges } from '../lib/syncService';
import { db as firestore } from '../lib/firebase';
import { doc, deleteDoc } from 'firebase/firestore';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

// Fix Leaflet marker icons in React (vite)
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

export function LocationsView({ onSelectInspection }: { onSelectInspection: (id: string) => void }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'administrador' || user?.role === 'prefeito';
  const isManager = user?.role === 'administrador' || user?.role === 'responsavel' || user?.role === 'prefeito';

  const locations = useLiveQuery(() => db.locations.toArray());
  const inspections = useLiveQuery(() => db.inspections.toArray());
  const assets = useLiveQuery(() => db.assets.toArray());
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [showHistoryFor, setShowHistoryFor] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteInspectionConfirmId, setDeleteInspectionConfirmId] = useState<string | null>(null);
  const [blockingError, setBlockingError] = useState<{id: string, message: string} | null>(null);
  const [newLoc, setNewLoc] = useState({ name: '', description: '', latitude: '', longitude: '' });

  const getLatestStatus = (locId: string) => {
    const locInspections = inspections?.filter(i => i.locationId === locId);
    if (!locInspections || locInspections.length === 0) return null;
    
    // Prioridade: em_andamento > concluida > finalizada (pegando a mais relevante ou recente)
    const sorted = [...locInspections].sort((a, b) => b.date - a.date);
    return sorted[0].status;
  };

  const filteredLocations = locations?.filter(loc => 
    loc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    loc.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleStartInspection = async (locationId: string) => {
    // 1. Procurar vistoria pendente (qualquer uma que não esteja finalizada)
    const existing = await db.inspections
      .where({ locationId })
      .filter(i => i.status !== 'finalizada')
      .reverse()
      .first();

    if (existing) {
      const confirmContinue = window.confirm("Existe uma vistoria pendente neste local. Deseja CONTINUAR de onde parou?\n\n(Clique em CANCELAR se quiser excluir a atual e começar uma NOVA do zero)");
      if (confirmContinue) {
        onSelectInspection(existing.id);
        return;
      } else {
        const confirmClear = window.confirm("🗑️ ATENÇÃO: Deseja apagar permanentemente a vistoria pendente para iniciar uma nova?");
        if (confirmClear) {
           await db.assets.where('inspectionId').equals(existing.id).delete();
           await db.inspections.delete(existing.id);
           console.log("Vistoria pendente removida para novo teste");
        } else {
           return;
        }
      }
    }

    // 2. Clone assets from the last "finalizada" inspection for this location
    const history = await db.inspections.where('locationId').equals(locationId).toArray();
    const lastFinalized = history
      .filter(i => i.status === 'finalizada')
      .sort((a, b) => b.date - a.date)[0];

    // 3. Criar nova única v2
    const id = generateId();
    await db.inspections.add({
      id,
      locationId,
      date: Date.now(),
      participants: [],
      status: 'em_andamento'
    });
    try { await syncInspection(id); } catch(e) { console.error(e) }

    // 4. Herança de Patrimônio: Inject assets into the new inspection
    if (lastFinalized) {
      const previousAssets = await db.assets.where('inspectionId').equals(lastFinalized.id).toArray();
      if (previousAssets.length > 0) {
        const clonedAssets = previousAssets.map(asset => ({
          ...asset, // Copy general properties
          id: generateId(),
          inspectionId: id, // Point to the new inspection
          createdBy: user?.userId || 'sistema',
          createdAt: Date.now(),
          needsSync: true
        }));
        await db.assets.bulkAdd(clonedAssets);
        // Trigger background sync for these new assets
        pushLocalChanges();
      }
    }

    onSelectInspection(id);
  };

  const handleAddLocation = async () => {
    if (!newLoc.name.trim()) return;
    const locId = generateId();
    const lat = newLoc.latitude ? parseFloat(newLoc.latitude) : undefined;
    const lng = newLoc.longitude ? parseFloat(newLoc.longitude) : undefined;
    
    await db.locations.add({
      id: locId,
      name: newLoc.name,
      description: newLoc.description,
      ...(lat && lng ? { latitude: lat, longitude: lng } : {})
    });
    try { await syncLocation(locId); } catch(e) { console.error("Sync error", e) }
    setNewLoc({ name: '', description: '', latitude: '', longitude: '' });
    setIsAdding(false);
  };

  const handleDeleteLocation = async (locId: string, locName: string) => {
    // 1. Encontrar todas as vistorias deste local
    const inspectionIds = (await db.inspections.where('locationId').equals(locId).toArray()).map(i => i.id);
    
    // 2. Verificar se existe algum item em qualquer uma dessas vistorias
    let assetCount = 0;
    if (inspectionIds.length > 0) {
      assetCount = await db.assets.where('inspectionId').anyOf(inspectionIds).count();
    }

    if (assetCount > 0) {
      setBlockingError({
        id: locId,
        message: `Este local possui ${assetCount} itens registrados e não pode ser removido.`
      });
      setTimeout(() => setBlockingError(null), 3000);
      setDeleteConfirmId(null);
      return;
    }

    // Excluir vistorias vazias primeiro
    if (inspectionIds.length > 0) {
      for (const invId of inspectionIds) {
        try { await deleteDoc(doc(firestore, 'inspections', invId)); } catch(e) {}
      }
      await db.inspections.bulkDelete(inspectionIds);
    }
    // Excluir o local
    try { await deleteDoc(doc(firestore, 'locations', locId)); } catch(e) {}
    await db.locations.delete(locId);
    setDeleteConfirmId(null);
  };

  const handleDeleteInspection = async (e: MouseEvent, inspectionId: string) => {
    e.stopPropagation();
    try {
      const assetsCount = await db.assets.where('inspectionId').equals(inspectionId).count();
      
      if (assetsCount > 0) {
        alert("Esta vistoria possui itens e não pode ser excluída.");
        setDeleteInspectionConfirmId(null);
        return;
      }

      try { await deleteDoc(doc(firestore, 'inspections', inspectionId)); } catch(e) {}
      await db.inspections.delete(inspectionId);
      setDeleteInspectionConfirmId(null);
    } catch (err) {
      console.error("Erro ao excluir vistoria:", err);
      alert("Ocorreu um erro ao excluir a vistoria.");
    }
  };

  const handleDeleteAllEmptyInspections = async (locId: string) => {
    const locInspections = inspections?.filter(i => i.locationId === locId) || [];
    let deletedCount = 0;
    
    for (const insp of locInspections) {
      const assetsCount = await db.assets.where('inspectionId').equals(insp.id).count();
      if (assetsCount === 0) {
        try { await deleteDoc(doc(firestore, 'inspections', insp.id)); } catch(e) {}
        await db.inspections.delete(insp.id);
        deletedCount++;
      }
    }
    
    if (deletedCount > 0) {
      alert(`${deletedCount} vistoria(s) vazia(s) removida(s), incluindo homologadas.`);
    } else {
      alert("Nenhuma vistoria vazia encontrada para este local.");
    }
  };

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-700 pb-20">
      {showHistoryFor && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-10 pointer-events-none">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm pointer-events-auto" onClick={() => setShowHistoryFor(null)} />
          <Card className="w-full max-w-2xl max-h-[80vh] flex flex-col p-0 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 pointer-events-auto rounded-[3rem] border-none">
             <div className="p-8 bg-slate-900 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                   <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center">
                      <History className="w-6 h-6 text-white" />
                   </div>
                   <div className="flex flex-col">
                      <h3 className="font-black text-xl uppercase tracking-tight">Histórico de Vistorias</h3>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mt-1">
                        {locations?.find(l => l.id === showHistoryFor)?.name}
                      </span>
                   </div>
                </div>
                <button onClick={() => setShowHistoryFor(null)} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                   <X className="w-6 h-6" />
                </button>
             </div>
             
             <div className="flex-1 overflow-y-auto p-6 md:p-8 flex flex-col gap-3">
                {inspections?.filter(i => i.locationId === showHistoryFor)
                  .sort((a, b) => b.date - a.date)
                  .map(insp => (
                   <div 
                     key={insp.id}
                     onClick={() => {
                       setShowHistoryFor(null);
                       onSelectInspection(insp.id);
                     }}
                     className="flex items-center justify-between p-5 bg-slate-50 border border-slate-100 rounded-3xl hover:bg-white hover:border-slate-200 hover:shadow-lg transition-all cursor-pointer group"
                   >
                     <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center border transition-all",
                          insp.status === 'finalizada' ? "bg-emerald-50 border-emerald-100 text-emerald-600" : 
                          insp.status === 'em_andamento' ? "bg-blue-50 border-blue-100 text-blue-600" :
                          "bg-amber-50 border-amber-100 text-amber-600"
                        )}>
                          {insp.status === 'finalizada' ? <CheckSquare className="w-5 h-5" /> : <Calendar className="w-5 h-5" />}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-black text-slate-900 uppercase tracking-tight">
                            {formatDate(insp.date).split(',')[0]}
                          </span>
                          <div className="flex items-center gap-2">
                             <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                                {insp.status.replace('_', ' ')}
                             </span>
                             {(assets || []).filter(a => a.inspectionId === insp.id).length === 0 && (
                               <span className="text-[8px] font-black text-rose-500 uppercase tracking-tighter bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">Vazia</span>
                             )}
                          </div>
                        </div>
                     </div>
                     <div className="flex items-center gap-3">
                       {isManager && (assets || []).filter(a => a.inspectionId === insp.id).length === 0 && (
                         <div className="flex items-center gap-1">
                           {deleteInspectionConfirmId === insp.id ? (
                              <div className="flex items-center gap-1 animate-in slide-in-from-right-2 duration-300">
                                 <button 
                                   onClick={(e) => handleDeleteInspection(e, insp.id)}
                                   className="bg-rose-600 text-white text-[8px] font-black px-2 py-1.5 rounded-lg shadow-sm"
                                 >
                                   SIM
                                 </button>
                                 <button 
                                   onClick={(e) => { e.stopPropagation(); setDeleteInspectionConfirmId(null); }}
                                   className="bg-slate-200 text-slate-500 text-[8px] font-black px-2 py-1.5 rounded-lg"
                                 >
                                   NÃO
                                 </button>
                              </div>
                           ) : (
                             <button 
                               onClick={(e) => { e.stopPropagation(); setDeleteInspectionConfirmId(insp.id); }}
                               className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                               title="Excluir Vistoria Vazia"
                             >
                               <Trash2 className="w-4 h-4" />
                             </button>
                           )}
                         </div>
                       )}
                       <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-slate-900 transition-all group-hover:translate-x-1" />
                     </div>
                   </div>
                ))}
                {inspections?.filter(i => i.locationId === showHistoryFor).length === 0 && (
                   <div className="py-20 text-center text-slate-300">
                      <AlertCircle className="w-12 h-12 mx-auto opacity-20 mb-4" />
                      <p className="font-bold tracking-widest text-[10px] uppercase">Nenhuma vistoria anterior</p>
                   </div>
                )}
             </div>
             
             <div className="p-6 bg-slate-50 border-t border-slate-100 shrink-0 flex items-center justify-between">
                {isManager && (
                  <button 
                    onClick={() => handleDeleteAllEmptyInspections(showHistoryFor)}
                    className="text-[9px] font-black text-rose-500 hover:text-rose-600 uppercase tracking-widest px-4 py-2 bg-rose-50 hover:bg-rose-100 rounded-xl transition-all"
                  >
                    Excluir Vazias
                  </button>
                )}
                <Button onClick={() => handleStartInspection(showHistoryFor)} variant="accent" icon={Plus} className="rounded-2xl px-8 uppercase font-black text-[10px] tracking-widest h-12 shadow-xl shadow-blue-600/20">
                  Nova Vistoria Agora
                </Button>
             </div>
          </Card>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Localizações</h2>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] leading-none">Gestão de prédios e repartições</span>
        </div>
        
        <div className="flex items-center gap-3">
           <Button 
             variant={viewMode === 'map' ? 'primary' : 'secondary'} 
             icon={Map} 
             onClick={() => setViewMode(viewMode === 'map' ? 'list' : 'map')} 
             className="rounded-2xl h-12 shadow-xl"
           >
             {viewMode === 'map' ? 'VER LISTA' : 'VER MAPA'}
           </Button>
           <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-slate-900 transition-colors" />
              <input 
                type="text" 
                placeholder="Buscar local..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-11 pr-6 py-3 bg-white border border-slate-100 rounded-2xl text-sm font-bold text-slate-900 shadow-sm focus:ring-2 focus:ring-slate-900 focus:outline-none transition-all w-full md:w-64"
              />
           </div>
           {!isAdding && isAdmin && (
             <Button variant="accent" icon={Plus} onClick={() => setIsAdding(true)} className="rounded-2xl h-12 shadow-xl shadow-slate-900/10">
               NOVO LOCAL
             </Button>
           )}
        </div>
      </div>

      {viewMode === 'map' ? (
        <Card className="w-full h-[600px] p-0 overflow-hidden relative z-0 border-2 shadow-2xl rounded-[2.5rem]">
          <MapContainer center={[-29.5878, -55.4828]} zoom={12} style={{ height: '100%', width: '100%', zIndex: 0 }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {filteredLocations?.filter(loc => loc.latitude && loc.longitude).map(loc => (
                <Marker key={loc.id} position={[loc.latitude!, loc.longitude!]}>
                  <Popup>
                    <div className="flex flex-col gap-2 p-1 min-w-[200px]">
                       <h3 className="font-bold text-slate-900 text-base">{loc.name}</h3>
                       <p className="text-xs text-slate-500">{loc.description}</p>
                       <Button 
                         size="sm"
                         variant="primary"
                         onClick={() => handleStartInspection(loc.id)}
                         className="mt-2 w-full text-[10px]"
                       >
                         {getLatestStatus(loc.id) === 'em_andamento' ? 'CONTINUAR' : 'CRIAR / REVISAR'}
                       </Button>
                    </div>
                  </Popup>
                </Marker>
            ))}
          </MapContainer>
        </Card>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isAdding && (
          <Card className="p-8 border-2 border-slate-900 ring-8 ring-slate-900/5 animate-in zoom-in-95 duration-300 rounded-[2.5rem] flex flex-col gap-6 relative z-10">
            <div className="flex items-center justify-between">
               <h3 className="font-black text-slate-900 uppercase tracking-tight">Cadastrar Prédio</h3>
               <button onClick={() => setIsAdding(false)} className="p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-400">
                  <X className="w-5 h-5" />
               </button>
            </div>
            <Input label="Nome da Unidade" placeholder="Ex: Secretaria de Saúde" value={newLoc.name} onChange={e => setNewLoc({...newLoc, name: e.target.value})} />
            <Input label="Endereço / Descrição" placeholder="Rua Central, nº 123" value={newLoc.description} onChange={e => setNewLoc({...newLoc, description: e.target.value})} />
            <div className="flex gap-4">
              <Input label="Latitude (Opcional)" placeholder="-29.5878" type="number" step="any" value={newLoc.latitude} onChange={e => setNewLoc({...newLoc, latitude: e.target.value})} />
              <Input label="Longitude (Opcional)" placeholder="-55.4828" type="number" step="any" value={newLoc.longitude} onChange={e => setNewLoc({...newLoc, longitude: e.target.value})} />
            </div>
            <Button onClick={handleAddLocation} icon={CheckCircle2} className="h-14 font-black tracking-widest text-lg rounded-[1.2rem]" variant="accent">
               CONFIRMAR
            </Button>
          </Card>
        )}

        {filteredLocations?.map(loc => {
          const status = getLatestStatus(loc.id);
          return (
            <Card key={loc.id} className="group p-8 rounded-[2.5rem] flex flex-col gap-6 border-slate-50 hover:border-slate-200 transition-all duration-500 hover:shadow-2xl hover:shadow-slate-200/50 relative overflow-hidden">
              <div className="flex items-start justify-between">
                <div className="w-14 h-14 bg-slate-50 group-hover:bg-slate-900 rounded-2xl flex items-center justify-center transition-all duration-500 text-slate-400 group-hover:text-white shadow-sm">
                  <Building2 className="w-7 h-7" />
                </div>
                <div className="flex flex-col items-end gap-2">
                  {status && (
                    <div className={cn(
                      "text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border",
                      status === 'em_andamento' ? "bg-blue-50 text-blue-600 border-blue-100" :
                      status === 'concluida' ? "bg-amber-50 text-amber-600 border-amber-100" :
                      "bg-emerald-50 text-emerald-600 border-emerald-100"
                    )}>
                      {status.replace('_', ' ')}
                    </div>
                  )}
                  {isAdmin && (
                    <div className="flex flex-col items-end gap-1">
                      {deleteConfirmId === loc.id ? (
                        <div className="flex items-center gap-1 animate-in slide-in-from-right-4 duration-300">
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDeleteLocation(loc.id, loc.name); }}
                            className="bg-rose-600 text-white text-[8px] font-black px-3 py-1.5 rounded-lg shadow-lg shadow-rose-600/20 uppercase"
                          >
                            Sim
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(null); }}
                            className="bg-slate-100 text-slate-400 text-[8px] font-black px-3 py-1.5 rounded-lg uppercase"
                          >
                            Não
                          </button>
                        </div>
                      ) : blockingError?.id === loc.id ? (
                        <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-lg animate-in shake duration-500">
                           <AlertCircle className="w-3 h-3 text-rose-500" />
                           <span className="text-[8px] font-bold text-rose-600 uppercase tracking-tighter">Local com Itens</span>
                        </div>
                      ) : (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmId(loc.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all duration-300"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex flex-col">
                <span className="text-xl font-black text-slate-900 tracking-tight leading-tight group-hover:text-blue-600 transition-colors uppercase">{loc.name}</span>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">{loc.description}</span>
              </div>

              <div className="pt-2 flex flex-col gap-3">
                <Button 
                  variant="secondary" 
                  size="sm" 
                  onClick={() => handleStartInspection(loc.id)}
                  className="w-full h-12 rounded-xl text-[10px] font-black uppercase tracking-widest group-hover:bg-slate-900 group-hover:text-white transition-all duration-500"
                >
                  {status === 'em_andamento' ? 'CONTINUAR VISTORIA' : status === 'concluida' ? 'REVISAR VISTORIA' : 'CRIAR VISTORIA'} <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                
                <button 
                  onClick={() => setShowHistoryFor(loc.id)}
                  className="flex items-center justify-center gap-2 text-[10px] font-black text-slate-400 hover:text-slate-900 uppercase tracking-widest py-2 transition-all"
                >
                   <History className="w-4 h-4" /> Histórico Completo
                </button>
              </div>
            </Card>
          );
        })}

        {!isAdding && filteredLocations?.length === 0 && (
          <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-300">
             <AlertCircle className="w-12 h-12 opacity-20 mb-4" />
             <p className="font-bold tracking-widest text-xs uppercase text-slate-400">Nenhuma localização encontrada</p>
          </div>
        )}
      </div>
      )}
    </div>
  );
}

// Re-using local Lucide icon wrapper just in case
function CheckCircle2(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/>
    </svg>
  );
}
