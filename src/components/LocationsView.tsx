import React, { useState, MouseEvent } from 'react';
import { Card, Button, Input } from './UI';
import { Building2, Plus, ArrowRight, Trash2, AlertCircle, X, Search, History, Calendar, CheckSquare, Map, ShieldCheck } from 'lucide-react';
import { db, generateId, Inspection } from '../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { cn, formatDate } from '../lib/utils';
import { useAuth } from '../lib/AuthContext';
import { syncLocation, syncInspection, pushLocalChanges } from '../lib/syncService';
import { db as firestore } from '../lib/firebase';
import { QRCodePrintCard } from './QRCodePrintCard';
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
  const isCommittee = isManager || user?.role === 'vistoriador';

  const locations = useLiveQuery(() => db.locations.toArray());
  const inspections = useLiveQuery(() => db.inspections.toArray());
  const assets = useLiveQuery(() => db.assets.toArray());
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [showHistoryFor, setShowHistoryFor] = useState<string | null>(null);
  const [showQRCodeFor, setShowQRCodeFor] = useState<{id: string, name: string} | null>(null);
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
    <div className="flex flex-col gap-10 animate-in fade-in duration-700 pb-20 px-1">
      {showQRCodeFor && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 animate-in fade-in duration-200">
           <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowQRCodeFor(null)} />
           <div className="relative animate-in zoom-in-95 duration-300">
             <QRCodePrintCard id={showQRCodeFor.id} name={showQRCodeFor.name} type="local" />
             <button 
               onClick={() => setShowQRCodeFor(null)} 
               className="absolute -top-4 -right-4 w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg text-slate-400 hover:text-slate-900 transition-colors border border-slate-100"
             >
               <X className="w-5 h-5" />
             </button>
           </div>
        </div>
      )}

      {showHistoryFor && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-10 pointer-events-none">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm pointer-events-auto" onClick={() => setShowHistoryFor(null)} />
          <Card className="w-full max-w-2xl max-h-[80vh] flex flex-col p-0 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 pointer-events-auto rounded-[3rem] border-none bg-white">
             <div className="p-8 bg-slate-900 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                   <div className="w-14 h-14 bg-white/10 rounded-[1.5rem] flex items-center justify-center border border-white/10">
                      <History className="w-7 h-7 text-white" />
                   </div>
                   <div className="flex flex-col">
                      <h3 className="font-display font-extrabold text-2xl tracking-tight leading-none">Histórico de Auditorias</h3>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-3">
                        {locations?.find(l => l.id === showHistoryFor)?.name}
                      </span>
                   </div>
                </div>
                <button onClick={() => setShowHistoryFor(null)} className="p-3 hover:bg-white/10 rounded-2xl transition-colors">
                   <X className="w-7 h-7" />
                </button>
             </div>
             
             <div className="flex-1 overflow-y-auto p-6 md:p-10 flex flex-col gap-4 custom-scrollbar bg-slate-50/50">
                {inspections?.filter(i => i.locationId === showHistoryFor)
                  .sort((a, b) => b.date - a.date)
                  .map(insp => (
                   <div 
                     key={insp.id}
                     onClick={() => {
                       setShowHistoryFor(null);
                       onSelectInspection(insp.id);
                     }}
                     className="flex items-center justify-between p-6 bg-white border border-slate-100 rounded-[2rem] hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-900/5 transition-all cursor-pointer group"
                   >
                     <div className="flex items-center gap-5">
                        <div className={cn(
                          "w-12 h-12 rounded-2xl flex items-center justify-center border transition-all shadow-sm",
                          insp.status === 'finalizada' ? "bg-emerald-50 border-emerald-100 text-emerald-600" : 
                          insp.status === 'em_andamento' ? "bg-indigo-50 border-indigo-100 text-indigo-600" :
                          "bg-amber-50 border-amber-100 text-amber-600"
                        )}>
                          {insp.status === 'finalizada' ? <ShieldCheck className="w-6 h-6" /> : <Calendar className="w-6 h-6" />}
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-lg font-display font-extrabold text-slate-900 tracking-tight leading-none">
                            {formatDate(insp.date).split(',')[0]}
                          </span>
                          <div className="flex items-center gap-3">
                             <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                {insp.status.replace('_', ' ')}
                             </span>
                             {(assets || []).filter(a => a.inspectionId === insp.id).length === 0 && (
                               <span className="text-[9px] font-black text-rose-500 uppercase tracking-widest bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-100">Dossiê Vazio</span>
                             )}
                          </div>
                        </div>
                     </div>
                     <div className="flex items-center gap-4">
                       {isManager && (assets || []).filter(a => a.inspectionId === insp.id).length === 0 && (
                         <div className="flex items-center">
                           {deleteInspectionConfirmId === insp.id ? (
                              <div className="flex items-center gap-2 animate-in slide-in-from-right-4 duration-300">
                                 <button 
                                   onClick={(e) => handleDeleteInspection(e, insp.id)}
                                   className="bg-rose-600 text-white text-[10px] font-black px-4 py-2 rounded-xl shadow-lg shadow-rose-600/20 uppercase tracking-widest"
                                 >
                                   Sim
                                 </button>
                                 <button 
                                   onClick={(e) => { e.stopPropagation(); setDeleteInspectionConfirmId(null); }}
                                   className="bg-slate-200 text-slate-600 text-[10px] font-black px-4 py-2 rounded-xl"
                                 >
                                   Não
                                 </button>
                              </div>
                           ) : (
                             <button 
                               onClick={(e) => { e.stopPropagation(); setDeleteInspectionConfirmId(insp.id); }}
                               className="p-3 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-2xl transition-all"
                               title="Excluir Vistoria Vazia"
                             >
                               <Trash2 className="w-5 h-5" />
                             </button>
                           )}
                         </div>
                       )}
                       <div className="p-3 bg-slate-50 rounded-2xl group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm">
                          <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                       </div>
                     </div>
                   </div>
                ))}
                {inspections?.filter(i => i.locationId === showHistoryFor).length === 0 && (
                   <div className="py-24 text-center text-slate-300">
                      <div className="w-20 h-20 bg-white rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-sm">
                        <History className="w-10 h-10 opacity-20" />
                      </div>
                      <p className="font-extrabold tracking-tight text-xl text-slate-900 mb-1">Sem histórico de vistorias</p>
                      <p className="text-slate-400 text-sm font-medium">Este local ainda não passou por auditorias.</p>
                   </div>
                )}
             </div>
             
             <div className="p-10 bg-white border-t border-slate-100 shrink-0 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-6">
                {isManager && (
                  <button 
                    onClick={() => handleDeleteAllEmptyInspections(showHistoryFor)}
                    className="text-[10px] font-black text-slate-400 hover:text-rose-600 uppercase tracking-widest px-6 py-3 bg-slate-50 hover:bg-rose-50 rounded-2xl transition-all border border-transparent hover:border-rose-100"
                  >
                    Excluir Auditorias Vazias
                  </button>
                )}
                <Button onClick={() => handleStartInspection(showHistoryFor)} variant="accent" icon={Plus} className="rounded-2xl px-12 uppercase font-black text-[10px] tracking-widest h-14 shadow-2xl shadow-indigo-600/20">
                  Iniciar Nova Vistoria
                </Button>
             </div>
          </Card>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 md:px-2">
        <div className="flex flex-col gap-2">
          <h2 className="text-4xl font-display font-extrabold text-slate-900 tracking-tight">Ambientes Auditorados</h2>
          <p className="text-sm font-medium text-slate-400 uppercase tracking-[0.2em] max-w-md">Gerencie repartições, prédios e salas para vistorias patrimoniais.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
           <div className="bg-white p-1.5 rounded-2xl border border-slate-100 shadow-sm flex items-center self-center sm:self-auto">
              <button 
                onClick={() => setViewMode('list')} 
                className={cn(
                  "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                  viewMode === 'list' ? "bg-slate-900 text-white shadow-lg" : "bg-transparent text-slate-400 hover:text-slate-900"
                )}
              >
                Lista
              </button>
              <button 
                onClick={() => setViewMode('map')} 
                className={cn(
                  "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                  viewMode === 'map' ? "bg-slate-900 text-white shadow-lg" : "bg-transparent text-slate-400 hover:text-slate-900"
                )}
              >
                Mapa
              </button>
           </div>

           <div className="relative group">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
              <input 
                type="text" 
                placeholder="Filtrar locais..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-12 pr-6 py-4 bg-white border border-slate-100 rounded-2xl text-sm font-bold text-slate-900 shadow-sm focus:ring-4 focus:ring-indigo-50 focus:border-indigo-200 focus:outline-none transition-all w-full sm:w-64"
              />
           </div>
           {!isAdding && isCommittee && (
             <Button variant="accent" icon={Plus} onClick={() => setIsAdding(true)} className="rounded-2xl h-14 px-8 font-black uppercase tracking-widest text-[9px] shadow-xl shadow-indigo-600/20">
               CADASTRAR UNIDADE
             </Button>
           )}
        </div>
      </div>

      {viewMode === 'map' ? (
        <Card className="w-full h-[650px] p-0 overflow-hidden relative z-0 border-none shadow-[0_30px_100px_-20px_rgba(0,0,0,0.1)] rounded-[3rem]">
          <MapContainer center={[-29.5878, -55.4828]} zoom={12} style={{ height: '100%', width: '100%', zIndex: 0 }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {filteredLocations?.filter(loc => loc.latitude && loc.longitude).map(loc => (
                <Marker key={loc.id} position={[loc.latitude!, loc.longitude!]}>
                  <Popup className="custom-popup">
                    <div className="flex flex-col gap-3 p-4 min-w-[240px]">
                       <div className="flex flex-col gap-1">
                          <h3 className="font-display font-bold text-slate-900 text-lg leading-tight uppercase tracking-tight">{loc.name}</h3>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{loc.description}</p>
                       </div>
                       <Button 
                         size="sm"
                         variant="primary"
                         onClick={() => handleStartInspection(loc.id)}
                         className="mt-2 w-full text-[10px] font-black uppercase tracking-[0.2em] h-10 rounded-xl"
                       >
                         {getLatestStatus(loc.id) === 'em_andamento' ? 'CONTINUAR' : 'AUDITAR'}
                       </Button>
                    </div>
                  </Popup>
                </Marker>
            ))}
          </MapContainer>
        </Card>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {isAdding && (
          <Card className="p-10 border-none shadow-[0_40px_100px_-20px_rgba(79,70,229,0.15)] ring-1 ring-indigo-100 animate-in zoom-in-95 duration-500 rounded-[3rem] flex flex-col gap-8 relative z-10 bg-white">
            <div className="flex items-center justify-between">
               <div className="flex flex-col">
                  <h3 className="font-display font-extrabold text-2xl text-slate-900 tracking-tight">Novo Ambiente</h3>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Identificação da unidade</p>
               </div>
               <button onClick={() => setIsAdding(false)} className="p-3 hover:bg-slate-50 rounded-2xl transition-colors text-slate-400 border border-transparent hover:border-slate-100">
                  <X className="w-6 h-6" />
               </button>
            </div>
            <div className="flex flex-col gap-5">
              <Input label="Nome da Unidade" placeholder="Ex: Secretaria de Saúde" value={newLoc.name} onChange={e => setNewLoc({...newLoc, name: e.target.value})} />
              <Input label="Endereço / Descrição" placeholder="Rua Central, nº 123" value={newLoc.description} onChange={e => setNewLoc({...newLoc, description: e.target.value})} />
              <div className="flex gap-4">
                <Input label="Latitude (Opcional)" placeholder="-29.5878" type="number" step="any" value={newLoc.latitude} onChange={e => setNewLoc({...newLoc, latitude: e.target.value})} />
                <Input label="Longitude (Opcional)" placeholder="-55.4828" type="number" step="any" value={newLoc.longitude} onChange={e => setNewLoc({...newLoc, longitude: e.target.value})} />
              </div>
            </div>
            <Button onClick={handleAddLocation} icon={ShieldCheck} className="h-16 font-black tracking-[0.2em] text-sm rounded-2xl shadow-xl shadow-indigo-600/20" variant="accent">
               SALVAR UNIDADE
            </Button>
          </Card>
        )}

        {filteredLocations?.map(loc => {
          const status = getLatestStatus(loc.id);
          return (
            <Card key={loc.id} className="group p-10 rounded-[3rem] flex flex-col gap-8 border-none shadow-[0_8px_40px_-15px_rgba(0,0,0,0.03)] hover:shadow-[0_30px_80px_-20px_rgba(79,70,229,0.12)] hover:-translate-y-2 transition-all duration-700 bg-white relative overflow-hidden">
              <div className="flex items-start justify-between">
                <div className="w-20 h-16 bg-slate-50 group-hover:bg-indigo-600 rounded-[1.5rem] flex items-center justify-center transition-all duration-700 text-slate-400 group-hover:text-white shadow-sm border border-slate-100 group-hover:border-indigo-600 group-hover:shadow-indigo-600/20">
                  <Building2 className="w-8 h-8" />
                </div>
                <div className="flex flex-col items-end gap-3">
                  {status && (
                    <div className={cn(
                      "text-[9px] font-black uppercase tracking-[0.15em] px-4 py-1.5 rounded-full border shadow-sm transition-all",
                      status === 'em_andamento' ? "bg-indigo-50 text-indigo-600 border-indigo-100 ring-4 ring-indigo-500/5" :
                      status === 'concluida' ? "bg-amber-50 text-amber-600 border-amber-100 ring-4 ring-amber-500/5" :
                      "bg-emerald-50 text-emerald-600 border-emerald-100 ring-4 ring-emerald-500/5"
                    )}>
                      {status.replace('_', ' ')}
                    </div>
                  )}
                  {isCommittee && (
                    <div className="flex flex-col items-end gap-1">
                      {deleteConfirmId === loc.id ? (
                        <div className="flex items-center gap-2 animate-in slide-in-from-right-4 duration-300">
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDeleteLocation(loc.id, loc.name); }}
                            className="bg-rose-600 text-white text-[9px] font-black px-4 py-2 rounded-xl shadow-lg shadow-rose-600/20 uppercase tracking-widest"
                          >
                            Excluir
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(null); }}
                            className="bg-slate-100 text-slate-400 text-[9px] font-black px-4 py-2 rounded-xl"
                          >
                            Manter
                          </button>
                        </div>
                      ) : blockingError?.id === loc.id ? (
                        <div className="flex items-center gap-2 bg-rose-50 border border-rose-100 px-4 py-2 rounded-xl animate-in shake duration-500 shadow-sm">
                           <AlertCircle className="w-3 h-3 text-rose-500" />
                           <span className="text-[9px] font-black text-rose-600 uppercase tracking-widest">Local com Itens</span>
                        </div>
                      ) : (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmId(loc.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-3 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-2xl transition-all duration-300"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex flex-col gap-2">
                <h4 className="text-2xl font-display font-extrabold text-slate-900 tracking-tight leading-tight group-hover:text-indigo-600 transition-colors uppercase">{loc.name}</h4>
                <p className="text-sm font-medium text-slate-400 uppercase tracking-widest line-clamp-1">{loc.description}</p>
              </div>

              <div className="pt-2 flex flex-col gap-4">
                <Button 
                  variant="secondary" 
                  size="sm" 
                  onClick={() => handleStartInspection(loc.id)}
                  className="w-full h-16 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] group-hover:bg-slate-900 group-hover:text-white group-hover:shadow-xl group-hover:shadow-slate-900/20 transition-all duration-700 flex items-center justify-center gap-3"
                >
                  {status === 'em_andamento' ? 'CONTINUAR AUDITORIA' : status === 'concluida' ? 'REVISAR DOSSIÊ' : 'INICIAR AUDITORIA'} <ArrowRight className="w-5 h-5 group-hover:translate-x-2 transition-transform" />
                </Button>
                
                <div className="flex flex-col gap-2">
                  <button 
                    onClick={() => setShowHistoryFor(loc.id)}
                    className="flex items-center justify-center gap-3 text-[9px] font-black text-slate-400 hover:text-slate-900 uppercase tracking-widest py-3 transition-all hover:bg-slate-50 rounded-xl"
                  >
                     <History className="w-4 h-4" /> Histórico de Dossiês
                  </button>

                  {isAdmin && (
                    <button 
                      onClick={() => setShowQRCodeFor({ id: loc.id, name: loc.name })}
                      className="flex items-center justify-center gap-3 text-[9px] font-black text-indigo-600 hover:text-indigo-800 uppercase tracking-widest py-3 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-all border border-indigo-100 ring-4 ring-indigo-500/0 hover:ring-indigo-500/5"
                    >
                      <Search className="w-4 h-4" /> Etiquetagem de Ambiente
                    </button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}

        {!isAdding && filteredLocations?.length === 0 && (
          <div className="col-span-full py-32 flex flex-col items-center justify-center text-slate-300 border-2 border-dashed border-slate-100 rounded-[3rem] bg-slate-50/20 group">
             <Map className="w-16 h-16 opacity-20 mb-6 group-hover:scale-110 transition-transform duration-500" />
             <div className="text-center">
                <p className="font-display font-extrabold text-2xl text-slate-900 tracking-tight mb-2">Nenhum ambiente encontrado</p>
                <p className="text-slate-400 font-medium max-w-xs mx-auto">Tente ajustar seus filtros ou cadastre um novo local de vistoria.</p>
             </div>
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
