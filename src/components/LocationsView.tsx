
/**
 * PATRI360 - Sistema de Auditoria e Gestão Patrimonial
 * Copyright (c) 2026 [Alexandre Barreto Menna Prefeitura de Manoel Viana]. Todos os direitos reservados.
 *
 * Este software é confidencial e propriedade intelectual exclusiva do autor.
 * É estritamente proibida a reprodução, cópia, distribuição, modificação, 
 * engenharia reversa ou uso não autorizado deste código-fonte, no todo ou em parte, 
 * sem o consentimento prévio, expresso e por escrito do detentor dos direitos.
 * * Protegido nos termos da Lei de Proteção de Programas de Computador.
 */


import React, { useState, MouseEvent } from 'react';
import { Card, Button, Input, Select } from './UI';
import { Building2, Plus, ArrowRight, Trash2, AlertCircle, X, Search, History, Calendar, CheckSquare, Map, ShieldCheck, Edit2, Database, MapPin, RotateCcw, Settings, ChevronDown, ChevronUp } from 'lucide-react';
import { db, generateId, Inspection, Location } from '../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { cn, formatDate } from '../lib/utils';
import { useAuth } from '../lib/AuthContext';
import { syncLocation, syncInspection, pushLocalChanges, forceFullSyncRecovery, hardResetAndRescue } from '../lib/syncService';
import { db as firestore, auth } from '../lib/firebase';
import { QRCodePrintCard } from './QRCodePrintCard';
import { doc, deleteDoc } from 'firebase/firestore';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { recreateFisioRoom } from '../lib/seed';
import { motion, AnimatePresence } from 'motion/react';

// Fix Leaflet marker icons in React (vite)
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

export function LocationsView({ onSelectInspection }: { onSelectInspection: (id: string) => void }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'administrador' || user?.role === 'prefeito' || user?.email === 'henri199@gmail.com' || auth.currentUser?.email === 'henri199@gmail.com';
  const isManager = isAdmin || user?.role === 'responsavel';
  const isCommittee = isManager || user?.role === 'vistoriador';

  const locations = useLiveQuery(() => db.locations.filter(l => !l.deleted).toArray());
  const inspections = useLiveQuery(() => db.inspections.filter(i => !i.deleted).toArray());
  const assets = useLiveQuery(() => db.assets.filter(a => !a.deleted).toArray());
  
  const [showTrashBin, setShowTrashBin] = useState(false);
  const [showAdminTools, setShowAdminTools] = useState(false); // NOVO: Controla a área de ferramentas admin
  const [trashTab, setTrashTab] = useState<'locations' | 'inspections' | 'assets'>('locations');
  const deletedLocations = useLiveQuery(() => db.locations.filter(l => !!l.deleted).toArray());
  const deletedInspections = useLiveQuery(() => db.inspections.filter(i => !!i.deleted).toArray());
  const deletedAssets = useLiveQuery(() => db.assets.filter(a => !!a.deleted).toArray());

  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [displayLimit, setDisplayLimit] = useState(20);
  const [isAdding, setIsAdding] = useState(false);
  const [showHistoryFor, setShowHistoryFor] = useState<string | null>(null);
  const [showQRCodeFor, setShowQRCodeFor] = useState<{id: string, name: string} | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteInspectionConfirmId, setDeleteInspectionConfirmId] = useState<string | null>(null);
  const [blockingError, setBlockingError] = useState<{id: string, message: string} | null>(null);
  const [newLoc, setNewLoc] = useState({ name: '', description: '', latitude: '', longitude: '', parentId: '' });
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [activeParentId, setActiveParentId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeParentLocation = useLiveQuery(() => activeParentId ? db.locations.get(activeParentId) : undefined, [activeParentId]);

  const handleEditLocation = (loc: Location) => {
    setNewLoc({
      name: loc.name,
      description: loc.description,
      latitude: loc.latitude?.toString() || '',
      longitude: loc.longitude?.toString() || '',
      parentId: loc.parentId || ''
    });
    setEditingLocationId(loc.id);
    setIsAdding(true);
  };

  const getLatestStatusCount = (locId: string) => {
    const locInspections = inspections?.filter(i => i.locationId === locId);
    if (!locInspections || locInspections.length === 0) return null;
    
    const sorted = [...locInspections].sort((a, b) => b.date - a.date);
    const latest = sorted[0];
    const assetCount = assets?.filter(a => a.inspectionId === latest.id).length || 0;
    return { status: latest.status, assetCount };
  };

  const getDepartmentStats = (parentId: string) => {
    const children = locations?.filter(l => l.parentId === parentId) || [];
    let totalAssets = 0, emAndamento = 0, concluidas = 0, finalizadas = 0;

    const parentStatus = getLatestStatusCount(parentId);
    if (parentStatus) {
      totalAssets += parentStatus.assetCount;
      if (parentStatus.status === 'em_andamento') emAndamento++;
      else if (parentStatus.status === 'concluida') concluidas++;
      else if (parentStatus.status === 'finalizada') finalizadas++;
    }

    children.forEach(c => {
      const s = getLatestStatusCount(c.id);
      if (s) {
        totalAssets += s.assetCount;
        if (s.status === 'em_andamento') emAndamento++;
        else if (s.status === 'concluida') concluidas++;
        else if (s.status === 'finalizada') finalizadas++;
      }
    });

    return {
      childrenCount: children.length,
      totalAssets, emAndamento, concluidas, finalizadas,
      hasAny: emAndamento > 0 || concluidas > 0 || finalizadas > 0
    };
  };

  const allFilteredLocations = locations?.filter(loc => {
    const matchesSearch = loc.name.toLowerCase().includes(searchTerm.toLowerCase()) || loc.description.toLowerCase().includes(searchTerm.toLowerCase());
    if (searchTerm) return matchesSearch;
    if (!activeParentId) return !loc.parentId;
    else return loc.parentId === activeParentId;
  });

  const displayedLocations = searchTerm ? allFilteredLocations : allFilteredLocations?.slice(0, displayLimit);

  const handleStartInspection = async (locationId: string) => {
    const existing = await db.inspections.where({ locationId }).filter(i => i.status !== 'finalizada').reverse().first();
    if (existing) {
      const confirmContinue = window.confirm("Existe uma vistoria pendente neste local. Deseja CONTINUAR de onde parou?\n\n(Clique em CANCELAR se quiser excluir a atual e começar uma NOVA do zero)");
      if (confirmContinue) {
        onSelectInspection(existing.id);
        return;
      } else {
        const confirmClear = window.confirm("🗑️ ATENÇÃO: Deseja apagar permanentemente a vistoria pendente para iniciar uma nova?");
        if (confirmClear) {
           const now = Date.now();
           const assetsToClear = await db.assets.where('inspectionId').equals(existing.id).toArray();
           for (const asset of assetsToClear) {
             await db.assets.update(asset.id, { deleted: true, needsSync: 1, updatedAt: now });
           }
           await db.inspections.update(existing.id, { deleted: true, needsSync: 1, updatedAt: now });
           pushLocalChanges();
        } else { return; }
      }
    }

    const history = await db.inspections.where('locationId').equals(locationId).toArray();
    const lastFinalized = history.filter(i => i.status === 'finalizada').sort((a, b) => b.date - a.date)[0];

    const id = generateId();
    await db.inspections.add({ id, locationId, date: Date.now(), participants: [], status: 'em_andamento', needsSync: 1 });
    try { await syncInspection(id); } catch(e) {}

    if (lastFinalized) {
      const previousAssets = await db.assets.where('inspectionId').equals(lastFinalized.id).toArray();
      if (previousAssets.length > 0) {
        const clonedAssets = previousAssets.map(asset => ({
          ...asset, id: generateId(), inspectionId: id, createdBy: user?.userId || 'sistema', createdAt: Date.now(), needsSync: 1
        }));
        await db.assets.bulkAdd(clonedAssets);
        pushLocalChanges();
      }
    }
    onSelectInspection(id);
  };

  const handleSaveLocation = async () => {
    if (!newLoc.name.trim() || isSubmitting) return;
    setIsSubmitting(true);

    try {
      const targetName = newLoc.name.trim().toLowerCase();
      const localDuplicate = await db.locations.filter(l => !l.deleted && l.id !== editingLocationId && l.name.trim().toLowerCase() === targetName).first();

      if (localDuplicate) {
        alert(`Já existe um ambiente ou secretaria cadastrada com o nome "${newLoc.name.trim()}".`);
        setIsSubmitting(false);
        return;
      }

      try {
        const { collection, getDocs } = await import('firebase/firestore');
        const querySnapshot = await getDocs(collection(firestore, 'locations'));
        let fireduplicate = false;
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          if (doc.id !== editingLocationId && !data.deleted && (data.name || '').trim().toLowerCase() === targetName) {
            fireduplicate = true;
          }
        });
        if (fireduplicate) {
          alert(`Atenção: Já existe um ambiente cadastrado na nuvem com o nome "${newLoc.name.trim()}".`);
          setIsSubmitting(false);
          return;
        }
      } catch (e) {
        console.warn("Offline: A validação prosseguirá com o banco local");
      }

      const lat = newLoc.latitude ? parseFloat(newLoc.latitude) : undefined;
      const lng = newLoc.longitude ? parseFloat(newLoc.longitude) : undefined;
      
      const locationData = {
        name: newLoc.name.trim(), description: newLoc.description, needsSync: 1,
        ...(newLoc.parentId ? { parentId: newLoc.parentId } : {}),
        ...(lat && lng ? { latitude: lat, longitude: lng } : {})
      };

      if (editingLocationId) {
        await db.locations.update(editingLocationId, locationData);
        try { await syncLocation(editingLocationId); } catch(e) {}
      } else {
        const locId = generateId();
        await db.locations.add({ id: locId, ...locationData });
        try { await syncLocation(locId); } catch(e) {}
      }
      
      pushLocalChanges();
      setNewLoc({ name: '', description: '', latitude: '', longitude: '', parentId: '' });
      setEditingLocationId(null);
      setIsAdding(false);
    } catch (err: any) {
      alert(`Ocorreu um erro ao salvar o local: ${err.message || err}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteLocation = async (locId: string, locName: string) => {
    const inspectionIds = (await db.inspections.where('locationId').equals(locId).filter(i => !i.deleted).toArray()).map(i => i.id);
    let assetCount = 0;
    if (inspectionIds.length > 0) {
      assetCount = await db.assets.where('inspectionId').anyOf(inspectionIds).filter(a => !a.deleted).count();
    }

    if (assetCount > 0) {
      setBlockingError({ id: locId, message: `Este local possui ${assetCount} itens registrados e não pode ser removido.` });
      setTimeout(() => setBlockingError(null), 3000);
      setDeleteConfirmId(null);
      return;
    }

    const now = Date.now();
    if (inspectionIds.length > 0) {
      for (const invId of inspectionIds) await db.inspections.update(invId, { deleted: true, needsSync: 1, updatedAt: now });
    }
    await db.locations.update(locId, { deleted: true, needsSync: 1, updatedAt: now });
    setDeleteConfirmId(null);
    pushLocalChanges();
  };

  const handleDeleteInspection = async (e: MouseEvent, inspectionId: string) => {
    e.stopPropagation();
    try {
      const assetsCount = await db.assets.where('inspectionId').equals(inspectionId).filter(a => !a.deleted).count();
      if (assetsCount > 0) {
        alert("Esta vistoria possui itens e não pode ser excluída.");
        setDeleteInspectionConfirmId(null);
        return;
      }
      await db.inspections.update(inspectionId, { deleted: true, needsSync: 1, updatedAt: Date.now() });
      setDeleteInspectionConfirmId(null);
      pushLocalChanges();
    } catch (err) { alert("Ocorreu um erro ao excluir a vistoria."); }
  };

  const handleDeleteAllEmptyInspections = async (locId: string) => {
    const locInspections = inspections?.filter(i => i.locationId === locId && !i.deleted) || [];
    let deletedCount = 0;
    const now = Date.now();
    for (const insp of locInspections) {
      const assetsCount = await db.assets.where('inspectionId').equals(insp.id).filter(a => !a.deleted).count();
      if (assetsCount === 0) {
        await db.inspections.update(insp.id, { deleted: true, needsSync: 1, updatedAt: now });
        deletedCount++;
      }
    }
    if (deletedCount > 0) { pushLocalChanges(); alert(`${deletedCount} vistoria(s) vazia(s) marcadas para remoção.`); } 
    else { alert("Nenhuma vistoria vazia encontrada para este local."); }
  };

  const handleRestoreLocation = async (locId: string) => {
    try {
      await db.locations.update(locId, { deleted: false, needsSync: 1, updatedAt: Date.now() });
      const relatedInspections = await db.inspections.where('locationId').equals(locId).toArray();
      let restoredInspectionsCount = 0, restoredAssetsCount = 0;
      for (const i of relatedInspections) {
        if (i.deleted) {
          await db.inspections.update(i.id, { deleted: false, needsSync: 1, updatedAt: Date.now() });
          restoredInspectionsCount++;
        }
        const relatedAssets = await db.assets.where('inspectionId').equals(i.id).toArray();
        for (const a of relatedAssets) {
          if (a.deleted) {
            await db.assets.update(a.id, { deleted: false, needsSync: 1, updatedAt: Date.now() });
            restoredAssetsCount++;
          }
        }
      }
      pushLocalChanges();
      return { success: true, restoredInspectionsCount, restoredAssetsCount };
    } catch (err) { return { success: false, error: err }; }
  };

  const handleRestoreInspection = async (inspId: string) => {
    try {
      await db.inspections.update(inspId, { deleted: false, needsSync: 1, updatedAt: Date.now() });
      let parentRestored = false;
      const insp = await db.inspections.get(inspId);
      if (insp) {
        const loc = await db.locations.get(insp.locationId);
        if (loc && loc.deleted) {
          await db.locations.update(loc.id, { deleted: false, needsSync: 1, updatedAt: Date.now() });
          parentRestored = true;
        }
        const relatedAssets = await db.assets.where('inspectionId').equals(inspId).toArray();
        for (const a of relatedAssets) {
          if (a.deleted) await db.assets.update(a.id, { deleted: false, needsSync: 1, updatedAt: Date.now() });
        }
      }
      pushLocalChanges();
      return { success: true, parentRestored };
    } catch (err) { return { success: false, error: err }; }
  };

  const handleRestoreAsset = async (assetId: string) => {
    try {
      await db.assets.update(assetId, { deleted: false, needsSync: 1, updatedAt: Date.now() });
      let hierarchyRestored = false;
      const asset = await db.assets.get(assetId);
      if (asset) {
        const insp = await db.inspections.get(asset.inspectionId);
        if (insp) {
          if (insp.deleted) {
            await db.inspections.update(insp.id, { deleted: false, needsSync: 1, updatedAt: Date.now() });
            hierarchyRestored = true;
          }
          const loc = await db.locations.get(insp.locationId);
          if (loc && loc.deleted) {
            await db.locations.update(loc.id, { deleted: false, needsSync: 1, updatedAt: Date.now() });
            hierarchyRestored = true;
          }
        }
      }
      pushLocalChanges();
      return { success: true, hierarchyRestored };
    } catch (err) { return { success: false, error: err }; }
  };

  const handleRecoverFisioRoomDirect = async () => {
    try {
      await recreateFisioRoom();
      alert("🩺 Excelente! A Sala de Fisioterapia e todos os seus itens foram restabelecidos com sucesso no banco de dados e sincronizados.");
      pushLocalChanges();
    } catch (err: any) { alert(`Erro técnico: ${err.message || err}`); }
  };

  const handleClearTrashBin = async () => {
    if (!window.confirm("⚠️ Deseja ESVAZIAR a lixeira permanentemente do dispositivo? Isso apagará os rascunhos locais que foram excluídos.")) return;
    try {
      await db.locations.filter(l => !!l.deleted).delete();
      await db.inspections.filter(i => !!i.deleted).delete();
      await db.assets.filter(a => !!a.deleted).delete();
      alert("Lixeira local limpa com sucesso!");
    } catch (err) { console.error(err); }
  };

  const handleAddLocation = () => {
    setNewLoc({ name: '', description: '', latitude: '', longitude: '', parentId: activeParentId || '' });
    setEditingLocationId(null);
    setIsAdding(true);
  };

  return (
    <div className="flex flex-col gap-10 animate-in fade-in duration-700 pb-20 px-1 relative">
      
      {/* 🚀 MODAL DE ADICIONAR / EDITAR LOCALIZAÇÃO (CLEAN UI) */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-[200] flex flex-col bg-slate-900/40 backdrop-blur-sm md:p-6 md:justify-center md:items-center">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full h-full md:h-auto md:max-h-[90vh] md:max-w-3xl flex flex-col overflow-hidden rounded-none md:rounded-[2.5rem] border-none shadow-[0_40px_100px_-20px_rgba(0,0,0,0.3)] bg-white relative z-10"
            >
              {/* Header Fixo */}
              <div className="flex items-center justify-between p-8 bg-slate-900 text-white shadow-xl z-20 shrink-0">
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center border border-white/20">
                    <Building2 className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex flex-col">
                    <h3 className="font-display font-bold text-2xl uppercase tracking-tight text-white leading-none">
                      {editingLocationId ? 'Editar Ambiente' : 'Novo Ambiente'}
                    </h3>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">
                      Estrutura Organizacional • Manoel Viana
                    </span>
                  </div>
                </div>
                <button onClick={() => { setIsAdding(false); setEditingLocationId(null); }} className="p-3 rounded-2xl bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-all border border-white/10">
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Corpo do Formulário */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-8 lg:p-12 flex flex-col gap-8 bg-white pb-32">
                <div className="flex flex-col gap-2">
                  <Input label="Nome da Unidade" placeholder="Ex: Secretaria de Saúde, Gabinete..." value={newLoc.name} onChange={e => setNewLoc({...newLoc, name: e.target.value})} autoFocus className="text-xl h-16 px-6" />
                </div>
                <div className="flex flex-col gap-2">
                  <Input label="Endereço / Descrição" placeholder="Rua Central, nº 123 ou Finalidade da sala" value={newLoc.description} onChange={e => setNewLoc({...newLoc, description: e.target.value})} className="h-16 px-6" />
                </div>
                
                <div className="flex flex-col gap-2">
                  <Select 
                    label="Vincular a uma Secretaria (Opcional)"
                    value={newLoc.parentId}
                    onChange={e => setNewLoc({...newLoc, parentId: e.target.value})}
                    disabled={!!activeParentId && !editingLocationId}
                    className="h-16 px-6 cursor-pointer"
                    options={[
                      { value: '', label: 'Nenhum (Tornar esta unidade uma Secretaria raiz)' },
                      ...(locations || [])
                        .filter(l => l.id !== editingLocationId && !l.parentId) // Mostra apenas pais para evitar 3 níveis confusos
                        .map(l => ({ value: l.id, label: l.name }))
                    ]}
                  />
                  {activeParentId && !editingLocationId && (
                    <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg w-fit mt-1">Vinculação travada automaticamente pela navegação atual.</span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <Input label="Latitude (Mapa)" placeholder="-29.5878" type="number" step="any" value={newLoc.latitude} onChange={e => setNewLoc({...newLoc, latitude: e.target.value})} className="h-14 px-4" />
                  <Input label="Longitude (Mapa)" placeholder="-55.4828" type="number" step="any" value={newLoc.longitude} onChange={e => setNewLoc({...newLoc, longitude: e.target.value})} className="h-14 px-4" />
                </div>
              </div>

              {/* Footer Fixo */}
              <div className="absolute bottom-0 inset-x-0 p-8 pt-4 bg-white border-t border-slate-100 flex items-center gap-4 z-30">
                <Button variant="secondary" onClick={() => { setIsAdding(false); setEditingLocationId(null); }} className="flex-1 h-16 rounded-2xl text-[10px] uppercase font-black tracking-widest">
                  Cancelar
                </Button>
                <Button 
                  onClick={handleSaveLocation} 
                  disabled={isSubmitting || !newLoc.name.trim()} 
                  icon={ShieldCheck} 
                  variant="accent"
                  className={cn("flex-1 h-16 rounded-2xl text-[10px] uppercase font-black tracking-widest shadow-xl", (isSubmitting || !newLoc.name.trim()) && "opacity-60 cursor-not-allowed")} 
                >
                  {isSubmitting ? 'SALVANDO...' : editingLocationId ? 'ATUALIZAR UNIDADE' : 'SALVAR UNIDADE'}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL QR CODE */}
      {showQRCodeFor && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 animate-in fade-in duration-200">
           <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowQRCodeFor(null)} />
           <div className="relative animate-in zoom-in-95 duration-300">
             <QRCodePrintCard id={showQRCodeFor.id} name={showQRCodeFor.name} type="local" />
             <button onClick={() => setShowQRCodeFor(null)} className="absolute -top-4 -right-4 w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg text-slate-400 hover:text-slate-900 transition-colors border border-slate-100">
               <X className="w-5 h-5" />
             </button>
           </div>
        </div>
      )}

      {/* MODAL DE HISTÓRICO */}
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
                     onClick={() => { setShowHistoryFor(null); onSelectInspection(insp.id); }}
                     className="flex items-center justify-between p-6 bg-white border border-slate-100 rounded-[2rem] hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-900/5 transition-all cursor-pointer group"
                   >
                     <div className="flex items-center gap-5">
                        <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center border transition-all shadow-sm", insp.status === 'finalizada' ? "bg-emerald-50 border-emerald-100 text-emerald-600" : insp.status === 'em_andamento' ? "bg-indigo-50 border-indigo-100 text-indigo-600" : "bg-amber-50 border-amber-100 text-amber-600")}>
                          {insp.status === 'finalizada' ? <ShieldCheck className="w-6 h-6" /> : <Calendar className="w-6 h-6" />}
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-lg font-display font-extrabold text-slate-900 tracking-tight leading-none">{formatDate(insp.date).split(',')[0]}</span>
                          <div className="flex items-center gap-3">
                             <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{insp.status.replace('_', ' ')}</span>
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
                                 <button onClick={(e) => handleDeleteInspection(e, insp.id)} className="bg-rose-600 text-white text-[10px] font-black px-4 py-2 rounded-xl shadow-lg shadow-rose-600/20 uppercase tracking-widest">Sim</button>
                                 <button onClick={(e) => { e.stopPropagation(); setDeleteInspectionConfirmId(null); }} className="bg-slate-200 text-slate-600 text-[10px] font-black px-4 py-2 rounded-xl">Não</button>
                              </div>
                           ) : (
                             <button onClick={(e) => { e.stopPropagation(); setDeleteInspectionConfirmId(insp.id); }} className="p-3 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-2xl transition-all" title="Excluir Vistoria Vazia">
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
                      <div className="w-20 h-20 bg-white rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-sm"><History className="w-10 h-10 opacity-20" /></div>
                      <p className="font-extrabold tracking-tight text-xl text-slate-900 mb-1">Sem histórico de vistorias</p>
                      <p className="text-slate-400 text-sm font-medium">Este local ainda não passou por auditorias.</p>
                   </div>
                )}
             </div>
             
             <div className="p-10 bg-white border-t border-slate-100 shrink-0 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-6">
                {isManager && (
                  <button onClick={() => handleDeleteAllEmptyInspections(showHistoryFor)} className="text-[10px] font-black text-slate-400 hover:text-rose-600 uppercase tracking-widest px-6 py-3 bg-slate-50 hover:bg-rose-50 rounded-2xl transition-all border border-transparent hover:border-rose-100">
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

      {/* LIXEIRA MODAL */}
      {showTrashBin && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-10 pointer-events-none">
          <div className="absolute inset-0 bg-slate-900/45 backdrop-blur-sm pointer-events-auto" onClick={() => setShowTrashBin(false)} />
          <Card className="w-full max-w-4xl max-h-[85vh] flex flex-col p-0 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 pointer-events-auto rounded-[3rem] border-none bg-white font-sans">
             <div className="p-8 bg-emerald-950 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                   <div className="w-14 h-14 bg-white/10 rounded-[1.5rem] flex items-center justify-center border border-white/10">
                      <Trash2 className="w-7 h-7 text-emerald-300" />
                   </div>
                   <div className="flex flex-col">
                      <h3 className="font-display font-extrabold text-2xl tracking-tight leading-none text-white">Lixeira de Segurança</h3>
                      <span className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em] mt-3">Restauração de Ambientes, Auditorias e Patrimônios Deletados</span>
                   </div>
                </div>
                <button onClick={() => setShowTrashBin(false)} className="p-3 hover:bg-white/10 rounded-2xl transition-colors text-white border-none bg-transparent cursor-pointer">
                   <X className="w-7 h-7" />
                </button>
             </div>

             {/* Smart Action Notification for Physiotherapy Suite */}
             {(() => {
                const hasFisio = deletedLocations?.some(l => l.name.toLowerCase().includes('fisio')) || deletedAssets?.some(a => a.name.toLowerCase().includes('fisio')) || deletedInspections?.some(i => i.id.toLowerCase().includes('fisio'));
                if (!hasFisio) return null;
                return (
                  <div className="px-8 mt-6 shrink-0">
                     <div className="p-5 bg-amber-500/10 border border-amber-500/20 rounded-[2rem] flex flex-col md:flex-row items-start md:items-center justify-between gap-5 animate-in slide-in-from-top-4 duration-300">
                       <div className="flex items-start gap-4">
                         <div className="p-3 bg-amber-500 text-white rounded-2xl shadow-lg shadow-amber-500/10"><AlertCircle className="w-6 h-6 animate-pulse" /></div>
                         <div>
                           <h4 className="font-display font-extrabold text-amber-950 uppercase tracking-widest text-xs">Itens da Sala Fisioterapia Encontrados</h4>
                           <p className="text-amber-800 text-[11px] font-bold mt-1 max-w-xl">Detectamos registros da "Sala Fisio" na lixeira! Clique para recuperar toda a sala, vistorias e seus múltiplos bens associados.</p>
                         </div>
                       </div>
                       <button
                         onClick={async () => {
                           const fisioLocs = deletedLocations?.filter(l => l.name.toLowerCase().includes('fisio')) || [];
                           for (const l of fisioLocs) await handleRestoreLocation(l.id);
                           const fisioAssets = deletedAssets?.filter(a => a.name.toLowerCase().includes('fisio')) || [];
                           for (const a of fisioAssets) await handleRestoreAsset(a.id);
                           alert("Fisioterapia e itens vinculados restaurados com sucesso!");
                           pushLocalChanges();
                         }}
                         className="px-6 py-3 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-md shrink-0 border-none cursor-pointer"
                       >Restaurar Tudo do Físio</button>
                     </div>
                  </div>
                );
             })()}

             {/* Tab Switcher */}
             <div className="px-8 mt-6 flex gap-2 border-b border-slate-100 shrink-0 pb-4">
                <button onClick={() => setTrashTab('locations')} className={cn("px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer border-none", trashTab === 'locations' ? "bg-emerald-950 text-white shadow-lg shadow-emerald-950/20" : "bg-slate-50 text-slate-500 hover:bg-slate-100")}>
                   Ambientes ({deletedLocations?.length || 0})
                </button>
                <button onClick={() => setTrashTab('inspections')} className={cn("px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer border-none", trashTab === 'inspections' ? "bg-emerald-950 text-white shadow-lg shadow-emerald-950/20" : "bg-slate-50 text-slate-500 hover:bg-slate-100")}>
                   Vistorias ({deletedInspections?.length || 0})
                </button>
                <button onClick={() => setTrashTab('assets')} className={cn("px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer border-none", trashTab === 'assets' ? "bg-emerald-950 text-white shadow-lg shadow-emerald-950/20" : "bg-slate-50 text-slate-500 hover:bg-slate-100")}>
                   Itens de Patrimônio ({deletedAssets?.length || 0})
                </button>
             </div>

             {/* Tab Content */}
             <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-4 custom-scrollbar bg-slate-50/50 min-h-[300px]">
                {trashTab === 'locations' && (
                  <>
                    {deletedLocations?.map(loc => (
                      <div key={loc.id} className="p-6 bg-white border border-slate-100 rounded-[2rem] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-6 hover:shadow-lg transition-all">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 shrink-0"><Building2 className="w-6 h-6" /></div>
                          <div>
                            <h4 className="font-display font-bold text-slate-900 text-lg">{loc.name}</h4>
                            <p className="text-slate-400 text-xs mt-1">{loc.description || 'Sem descrição cadastrada'}</p>
                            <span className="inline-block mt-2 text-[8px] font-black uppercase tracking-widest bg-slate-100 text-slate-500 px-2 py-1 rounded-md">ID: {loc.id}</span>
                          </div>
                        </div>
                        <button onClick={async () => {
                            const res = await handleRestoreLocation(loc.id);
                            if (res.success) alert(`Local "${loc.name}" restaurado! Reativadas ${res.restoredInspectionsCount} vistorias e ${res.restoredAssetsCount} itens vinculados.`);
                          }}
                          className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all self-start md:self-center cursor-pointer border-none"
                        ><RotateCcw className="w-4 h-4" /> Restaurar</button>
                      </div>
                    ))}
                    {deletedLocations?.length === 0 && <div className="py-20 text-center text-slate-400 font-bold">Nenhum ambiente deletado na lixeira.</div>}
                  </>
                )}
                {trashTab === 'inspections' && (
                  <>
                    {deletedInspections?.map(insp => {
                      const locName = locations?.find(l => l.id === insp.locationId)?.name || 'Ambiente Desconhecido';
                      return (
                        <div key={insp.id} className="p-6 bg-white border border-slate-100 rounded-[2rem] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-6 hover:shadow-lg transition-all">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 shrink-0"><Calendar className="w-6 h-6" /></div>
                            <div>
                              <h4 className="font-display font-bold text-slate-900 text-base font-sans">Vistoria realizada em {formatDate(insp.date)}</h4>
                              <p className="text-slate-400 text-xs mt-1">Local correspondente: <strong className="text-slate-700">{locName}</strong></p>
                            </div>
                          </div>
                          <button onClick={async () => {
                              const res = await handleRestoreInspection(insp.id);
                              if (res.success) alert(`Vistoria restaurada com sucesso! ${res.parentRestored ? 'O local pai também foi reativado.' : ''}`);
                            }}
                            className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all self-start md:self-center cursor-pointer border-none"
                          ><RotateCcw className="w-4 h-4" /> Restaurar</button>
                        </div>
                      );
                    })}
                    {deletedInspections?.length === 0 && <div className="py-20 text-center text-slate-400 font-bold">Nenhuma vistoria deletada na lixeira.</div>}
                  </>
                )}
                {trashTab === 'assets' && (
                  <>
                    {deletedAssets?.map(asset => (
                      <div key={asset.id} className="p-6 bg-white border border-slate-100 rounded-[2rem] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-6 hover:shadow-lg transition-all">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 shrink-0"><CheckSquare className="w-6 h-6" /></div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-display font-bold text-slate-900 text-base">{asset.name}</h4>
                              <span className={cn("text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full", asset.condition === 'novo' && "bg-emerald-50 text-emerald-600 border border-emerald-100", asset.condition === 'bom' && "bg-blue-50 text-blue-600 border border-blue-100", asset.condition === 'regular' && "bg-amber-50 text-amber-600 border border-amber-100", asset.condition === 'inservivel' && "bg-rose-50 text-rose-600 border border-rose-100")}>{asset.condition}</span>
                            </div>
                            <p className="text-slate-400 text-xs mt-1">Nº Patrimônio: <strong className="text-slate-700">{asset.patrimonyNumber}</strong></p>
                          </div>
                        </div>
                        <button onClick={async () => {
                            const res = await handleRestoreAsset(asset.id);
                            if (res.success) alert(`Item de patrimônio "${asset.name}" restaurado! ${res.hierarchyRestored ? 'Toda a estrutura superior correspondente foi reativada!' : ''}`);
                          }}
                          className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all self-start md:self-center cursor-pointer border-none"
                        ><RotateCcw className="w-4 h-4" /> Restaurar</button>
                      </div>
                    ))}
                    {deletedAssets?.length === 0 && <div className="py-20 text-center text-slate-400 font-bold">Nenhum item patrimonial deletado na lixeira.</div>}
                  </>
                )}
             </div>

             <div className="p-10 bg-white border-t border-slate-100 shrink-0 flex flex-col md:flex-row items-center justify-between gap-6 font-sans">
                <button onClick={handleClearTrashBin} className="text-[10px] font-black text-rose-500 hover:text-white uppercase tracking-widest px-6 py-3 hover:bg-rose-600 border border-rose-500/20 rounded-2xl transition-all cursor-pointer bg-white">Esvaziar Lixeira Permanente</button>
                <button onClick={() => setShowTrashBin(false)} className="px-12 rounded-2xl uppercase font-black text-[10px] tracking-widest h-14 bg-emerald-950 hover:bg-emerald-900 text-white border-none cursor-pointer transition-colors">Fechar Lixeira</button>
             </div>
          </Card>
        </div>
      )}

      {/* HEADER DA PÁGINA (BREADCRUMBS & FERRAMENTAS ADMIN) */}
      <div className="flex flex-col gap-6 md:px-2">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 w-full">
          {/* Navegação Clean (Breadcrumbs) */}
          <div className="flex flex-col gap-5 w-full max-w-3xl">
            <div className="flex items-center gap-2 flex-wrap bg-white p-2 rounded-2xl border border-slate-100 shadow-sm w-fit">
              <button 
                onClick={() => setActiveParentId(null)}
                className={cn(
                  "flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all px-4 py-2 rounded-xl",
                  activeParentId ? "text-slate-500 hover:bg-slate-50 hover:text-slate-900" : "bg-slate-900 text-white shadow-md"
                )}
              >
                <MapPin className="w-4 h-4" /> Manoel Viana
              </button>
              {activeParentId && (
                <div className="flex items-center gap-2 animate-in slide-in-from-left-4 duration-300">
                  <ArrowRight className="w-4 h-4 text-slate-300" />
                  <span className="bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl border border-indigo-100 flex items-center gap-2 shadow-sm">
                    <Building2 className="w-4 h-4" /> {activeParentLocation?.name}
                  </span>
                </div>
              )}
            </div>

            {!activeParentId ? (
              <div className="flex flex-col gap-2">
                <h2 className="text-4xl font-display font-extrabold text-slate-900 tracking-tight">Secretarias & Departamentos</h2>
                <p className="text-sm font-medium text-slate-400 uppercase tracking-[0.2em] max-w-md">Escolha uma secretaria para gerenciar suas salas e arquivos.</p>
              </div>
            ) : (
              <div className="bg-indigo-600 text-white p-6 md:p-8 rounded-[2.5rem] shadow-2xl shadow-indigo-600/20 flex flex-col md:flex-row md:items-center justify-between gap-6 animate-in zoom-in-95 duration-500">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                      <Building2 className="w-6 h-6 text-white" />
                    </div>
                    <h2 className="text-2xl font-display font-extrabold tracking-tight">{activeParentLocation?.name}</h2>
                  </div>
                  <p className="text-indigo-100/60 text-[10px] font-black uppercase tracking-widest ml-13">{activeParentLocation?.description || 'Repartição Pública Principal'}</p>
                </div>
                
                <div className="flex items-center gap-4 shrink-0">
                  <div className="flex flex-col items-end gap-1">
                     <span className="text-[10px] font-black uppercase opacity-60">Status Consolidado</span>
                     <div className="bg-white/20 px-4 py-1.5 rounded-full border border-white/20 text-[10px] font-black uppercase tracking-widest">
                       {getDepartmentStats(activeParentId).totalAssets} Itens Totais
                     </div>
                  </div>
                  <div className="bg-amber-400 text-amber-900 px-6 py-4 rounded-2xl flex items-center gap-2 shadow-lg animate-in fade-in duration-500">
                    <AlertCircle className="w-5 h-5" />
                    <span className="text-[9px] font-black uppercase tracking-widest">Abra as salas abaixo para auditar</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Botão Retrátil de Admin */}
          {isAdmin && !activeParentId && (
            <div className="shrink-0 flex flex-col items-end">
              <button 
                onClick={() => setShowAdminTools(!showAdminTools)}
                className={cn(
                  "flex items-center gap-2 px-5 py-3 rounded-2xl transition-all font-black text-[10px] uppercase tracking-widest border",
                  showAdminTools ? "bg-slate-900 text-white border-slate-900 shadow-xl" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <Settings className="w-4 h-4" /> Ferramentas de Sistema
                {showAdminTools ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          )}
        </div>

        {/* Zona Expandida do Admin (Cofre) */}
        <AnimatePresence>
          {isAdmin && !activeParentId && showAdminTools && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap items-center gap-3 bg-slate-50 p-6 rounded-[2rem] border border-slate-200">
                <div className="w-full mb-2 flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2"><Settings className="w-4 h-4" /> Painel de Recuperação e Automação</span>
                    <span className="text-[9px] font-bold text-rose-500 bg-rose-50 border border-rose-100 px-3 py-1 rounded-lg uppercase tracking-widest">Acesso Restrito: TI e Administração</span>
                </div>
                <button onClick={() => forceFullSyncRecovery()} className="flex items-center gap-2 px-6 py-4 bg-slate-800 text-white rounded-xl hover:bg-slate-900 transition-all font-black text-[9px] uppercase tracking-widest shadow-md">
                  <Database className="w-4 h-4 text-sky-400" /> Forçar Sincronização
                </button>
                <button onClick={() => hardResetAndRescue()} className="flex items-center gap-2 px-6 py-4 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-all font-black text-[9px] uppercase tracking-widest shadow-md">
                  <AlertCircle className="w-4 h-4" /> Sincronização Profunda
                </button>
                <button onClick={handleRecoverFisioRoomDirect} className="flex items-center gap-2 px-6 py-4 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all font-black text-[9px] uppercase tracking-widest shadow-md">
                  <Building2 className="w-4 h-4 text-emerald-300" /> Restaurar Sala Fisio
                </button>
                <button onClick={() => setShowTrashBin(true)} className="flex items-center gap-2 px-6 py-4 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all font-black text-[9px] uppercase tracking-widest shadow-md">
                  <Trash2 className="w-4 h-4" /> Lixeira de Segurança ({(deletedLocations?.length || 0) + (deletedInspections?.length || 0) + (deletedAssets?.length || 0)})
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Barra de Filtros e Novo Item */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 w-full mt-4">
           <div className="flex items-center gap-4">
             <div className="bg-white p-1.5 rounded-2xl border border-slate-100 shadow-sm flex items-center self-center sm:self-auto">
                <button onClick={() => setViewMode('list')} className={cn("px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", viewMode === 'list' ? "bg-slate-900 text-white shadow-lg" : "bg-transparent text-slate-400 hover:text-slate-900")}>Lista</button>
                <button onClick={() => setViewMode('map')} className={cn("px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", viewMode === 'map' ? "bg-slate-900 text-white shadow-lg" : "bg-transparent text-slate-400 hover:text-slate-900")}>Mapa</button>
             </div>
             <div className="relative group flex-1 sm:w-80">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                <input 
                  type="text" 
                  placeholder="Pesquisar salas ou setores..." 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-12 pr-6 py-4 bg-white border border-slate-100 rounded-2xl text-sm font-bold text-slate-900 shadow-sm focus:ring-4 focus:ring-indigo-50 focus:border-indigo-200 focus:outline-none transition-all w-full"
                />
             </div>
           </div>
           
           {!isAdding && isCommittee && (
             <Button variant="accent" icon={Plus} onClick={handleAddLocation} className="rounded-2xl h-14 px-8 font-black uppercase tracking-widest text-[9px] shadow-xl shadow-indigo-600/20 w-full sm:w-auto shrink-0">
               {activeParentId ? 'NOVA SALA AQUI' : 'CADASTRAR SECRETARIA'}
             </Button>
           )}
        </div>
      </div>

      {viewMode === 'map' ? (
        <Card className="w-full h-[650px] p-0 overflow-hidden relative z-0 border-4 border-white shadow-[0_30px_100px_-20px_rgba(0,0,0,0.15)] rounded-[3rem]">
          <MapContainer center={[-29.5878, -55.4828]} zoom={12} style={{ height: '100%', width: '100%', zIndex: 0 }}>
            <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {allFilteredLocations?.filter(loc => loc.latitude && loc.longitude).map(loc => {
                const hasChildren = locations?.some(l => l.parentId === loc.id);
                const isParent = !loc.parentId || hasChildren;
                return (
                  <Marker key={loc.id} position={[loc.latitude!, loc.longitude!]}>
                    <Popup className="custom-popup">
                      <div className="flex flex-col gap-3 p-4 min-w-[240px]">
                         <div className="flex flex-col gap-1">
                            <h3 className="font-display font-bold text-slate-900 text-lg leading-tight uppercase tracking-tight">{loc.name}</h3>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{loc.description}</p>
                         </div>
                         <Button size="sm" variant={isParent ? "secondary" : "primary"} onClick={() => { if (isParent) { setViewMode('list'); setActiveParentId(loc.id); } else { handleStartInspection(loc.id); } }} className="mt-2 w-full text-[10px] font-black uppercase tracking-[0.2em] h-10 rounded-xl">
                           {isParent ? 'VER DEPARTAMENTOS' : (getLatestStatusCount(loc.id)?.status === 'em_andamento' ? 'CONTINUAR' : 'AUDITAR')}
                         </Button>
                      </div>
                    </Popup>
                  </Marker>
                );
            })}
          </MapContainer>
        </Card>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        <AnimatePresence mode="popLayout">
          {displayedLocations?.map(loc => {
            const stats = getLatestStatusCount(loc.id);
            const status = stats?.status;
            const hasChildren = locations?.some(l => l.parentId === loc.id);
            const isParent = !loc.parentId || hasChildren;
            const deptStats = isParent ? getDepartmentStats(loc.id) : null;
            
            return (
              <motion.div 
                key={loc.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.3 }}
              >
                <Card className={cn(
                  "group p-10 rounded-[3rem] flex flex-col justify-between h-full gap-8 transition-all duration-500 relative overflow-hidden hover:-translate-y-2 shadow-[0_8px_40px_-15px_rgba(0,0,0,0.03)]",
                  isParent 
                    ? "bg-indigo-50/40 border-2 border-indigo-100 hover:border-indigo-400 hover:shadow-indigo-900/10" 
                    : "bg-white border-2 border-slate-100 hover:border-indigo-300 hover:shadow-slate-900/10"
                )}>
                  {/* Parent badge indicator */}
                  {hasChildren && (
                    <div className="absolute top-0 right-0">
                      <div className="bg-indigo-600 text-white text-[8px] font-black uppercase tracking-[0.2em] px-5 py-2 rounded-bl-3xl shadow-lg">
                        Secretaria / Depto
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-6">
                    <div className="flex items-start justify-between">
                      <div className={cn(
                        "w-16 h-16 rounded-[1.5rem] flex items-center justify-center transition-all duration-700 border shadow-sm",
                        isParent
                          ? "bg-indigo-600 text-white border-indigo-500 shadow-indigo-200"
                          : "bg-slate-50 text-slate-400 border-slate-100 group-hover:bg-indigo-50 group-hover:text-indigo-600 group-hover:border-indigo-100 group-hover:shadow-indigo-600/10"
                      )}>
                        {isParent ? <Building2 className="w-7 h-7" /> : <MapPin className="w-6 h-6" />}
                      </div>
                      <div className="flex flex-col items-end gap-3">
                        {!isParent && status && (
                          <div className={cn(
                            "text-[9px] font-black uppercase tracking-[0.15em] px-4 py-1.5 rounded-full border shadow-sm transition-all",
                            status === 'em_andamento' ? "bg-indigo-50 text-indigo-600 border-indigo-100 ring-4 ring-indigo-500/5" :
                            status === 'concluida' ? "bg-amber-50 text-amber-600 border-amber-100 ring-4 ring-amber-500/5" :
                            "bg-emerald-50 text-emerald-600 border-emerald-100 ring-4 ring-emerald-500/5"
                          )}>
                            {status.replace('_', ' ')}
                          </div>
                        )}

                        {isParent && deptStats?.hasAny && (
                          <div className="flex flex-col items-end gap-1.5">
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Resumo Consolidado</span>
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              {deptStats.emAndamento > 0 && <span className="text-[9px] px-2 py-1 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100 font-bold shadow-sm">{deptStats.emAndamento} Em Aberto</span>}
                              {deptStats.concluidas > 0 && <span className="text-[9px] px-2 py-1 rounded-lg bg-amber-50 text-amber-600 border border-amber-100 font-bold shadow-sm">{deptStats.concluidas} Concluídas</span>}
                              {deptStats.finalizadas > 0 && <span className="text-[9px] px-2 py-1 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100 font-bold shadow-sm">{deptStats.finalizadas} Homologadas</span>}
                            </div>
                          </div>
                        )}

                        {isParent && !deptStats?.hasAny && deptStats && deptStats.childrenCount >= 0 && (
                          <div className="text-[9px] px-3 py-1.5 rounded-full border border-slate-200 bg-slate-50 text-slate-400 font-black uppercase tracking-widest shadow-sm">
                            {deptStats.childrenCount} Ambientes Internos
                          </div>
                        )}
                        {isCommittee && (
                          <div className="flex flex-col items-end gap-1">
                            {deleteConfirmId === loc.id ? (
                              <div className="flex items-center gap-2 animate-in slide-in-from-right-4 duration-300">
                                <button onClick={(e) => { e.stopPropagation(); handleDeleteLocation(loc.id, loc.name); }} className="bg-rose-600 text-white text-[9px] font-black px-4 py-2 rounded-xl shadow-lg shadow-rose-600/20 uppercase tracking-widest">Excluir</button>
                                <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(null); }} className="bg-white border border-slate-200 text-slate-400 hover:text-slate-700 text-[9px] font-black px-4 py-2 rounded-xl">Cancelar</button>
                              </div>
                            ) : blockingError?.id === loc.id ? (
                              <div className="flex items-center gap-2 bg-rose-50 border border-rose-100 px-4 py-2 rounded-xl animate-in shake duration-500 shadow-sm">
                                 <AlertCircle className="w-3 h-3 text-rose-500" />
                                 <span className="text-[9px] font-black text-rose-600 uppercase tracking-widest">Local com Itens</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300">
                                <button onClick={(e) => { e.stopPropagation(); handleEditLocation(loc); }} className="p-3 text-slate-300 hover:text-indigo-600 hover:bg-slate-50 rounded-2xl transition-all bg-white border border-transparent hover:border-slate-100 shadow-sm"><Edit2 className="w-4 h-4" /></button>
                                <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(loc.id); }} className="p-3 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-2xl transition-all bg-white border border-transparent hover:border-rose-100 shadow-sm"><Trash2 className="w-4 h-4" /></button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <h4 className="text-2xl font-display font-extrabold text-slate-900 tracking-tight leading-tight group-hover:text-indigo-600 transition-colors uppercase line-clamp-2">{loc.name}</h4>
                      </div>
                      {loc.parentId && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest bg-white shadow-sm px-3 py-1 rounded-md border border-slate-100">
                            Pai: {locations?.find(l => l.id === loc.parentId)?.name || '...'}
                          </span>
                        </div>
                      )}
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest line-clamp-2 mt-2 leading-relaxed">{loc.description}</p>
                    </div>
                  </div>

                  <div className="pt-2 flex flex-col gap-3 mt-auto">
                    {isParent ? (
                      <Button variant="accent" size="sm" onClick={() => setActiveParentId(loc.id)} className="w-full h-14 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg shadow-indigo-600/10 transition-all duration-700 flex items-center justify-center gap-3">
                        ABRIR REPARTIÇÃO <ArrowRight className="w-4 h-4 translate-x-1 group-hover:translate-x-2 transition-transform" />
                      </Button>
                    ) : (
                      <Button variant="accent" size="sm" onClick={() => handleStartInspection(loc.id)} className="w-full h-14 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg shadow-indigo-600/10 transition-all duration-700 flex items-center justify-center gap-3">
                        {status === 'em_andamento' ? 'CONTINUAR AUDITORIA' : status === 'concluida' ? 'REVISAR DOSSIÊ' : 'AUDITAR ESTE LOCAL'} <ArrowRight className="w-4 h-4 translate-x-1 group-hover:translate-x-2 transition-transform" />
                      </Button>
                    )}

                    <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2">
                      <button onClick={() => setShowHistoryFor(loc.id)} className="flex-1 flex items-center justify-center gap-2 text-[9px] font-black text-slate-500 hover:text-indigo-600 uppercase tracking-widest py-3 transition-all hover:bg-indigo-50 rounded-xl border border-transparent hover:border-indigo-100">
                         <History className="w-3.5 h-3.5" /> Dossiês Antigos
                      </button>

                      {isAdmin && (
                        <button onClick={() => setShowQRCodeFor({ id: loc.id, name: loc.name })} className="flex-1 flex items-center justify-center gap-2 text-[9px] font-black text-slate-500 hover:text-slate-900 uppercase tracking-widest py-3 hover:bg-slate-100 rounded-xl transition-all border border-transparent hover:border-slate-200">
                          <Search className="w-3.5 h-3.5" /> Etiqueta QR
                        </button>
                      )}
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {allFilteredLocations && allFilteredLocations.length > (displayedLocations?.length || 0) && !searchTerm && (
           <div className="col-span-full pt-4">
              <button onClick={() => setDisplayLimit(prev => prev + 20)} className="w-full py-6 bg-slate-50 hover:bg-slate-100 text-slate-500 font-bold uppercase tracking-[0.2em] text-[10px] rounded-[3rem] border-2 border-dashed border-slate-200 transition-all flex flex-col items-center gap-2 shadow-sm">
                Carregar mais ambientes
                <span className="text-[10px] opacity-40 font-black">({locations?.length} totais)</span>
              </button>
           </div>
        )}

        {!isAdding && allFilteredLocations?.length === 0 && (
          <div className="col-span-full py-32 flex flex-col items-center justify-center text-slate-300 border-2 border-dashed border-slate-100 rounded-[3rem] bg-white group shadow-sm">
             <Map className="w-16 h-16 opacity-20 mb-6 group-hover:scale-110 transition-transform duration-500 text-indigo-500" />
             <div className="text-center">
                <p className="font-display font-extrabold text-2xl text-slate-900 tracking-tight mb-2">Nenhum ambiente encontrado</p>
                <p className="text-slate-400 font-medium text-sm max-w-xs mx-auto">Tente ajustar seus filtros ou cadastre um novo local de vistoria.</p>
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