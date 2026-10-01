import React, { useState, useRef } from 'react';
import { Card, Button, Input, Select, Textarea } from './UI';
import { useOnlineStatus } from '../lib/hooks';
import { ArrowLeft, Plus, Image as ImageIcon, Trash2, Camera, UserPlus, Save, CheckCircle2, History, Eye, PlayCircle, ArrowRight, X, Edit2, Search, ShieldCheck, AlertCircle, Home, ChevronLeft, ChevronRight, Zap, Copy, Database, Signature, Mic, Filter, ArrowRightLeft } from 'lucide-react';
import { db, Asset, generateAssetHash, generateId, AssetCondition, InspectionStatus, Inspection, Location } from '../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/ToastContext';
import { formatDate, cn } from '../lib/utils';
import { QRCodeSVG } from 'qrcode.react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { compressImage } from '../lib/image';
import { pushLocalChanges, syncInspection } from '../lib/syncService';
import { auth } from '../lib/firebase';
import { supabase } from '../lib/supabase';
import { SectorInspectionSignOffModal } from './SectorInspectionSignOffModal';

export function InspectionView({ id, onBack }: { id: string, onBack: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const isAdmin = user?.role === 'administrador' || user?.role === 'prefeito' || user?.email === 'henri199@gmail.com' || auth.currentUser?.email === 'henri199@gmail.com';
  const isManager = isAdmin || user?.role === 'responsavel';
  const isCommittee = isManager || user?.role === 'vistoriador';
  const isOnline = useOnlineStatus();
  
  const inspection = useLiveQuery(() => db.inspections.get(id), [id]);
  const location = useLiveQuery(() => inspection ? db.locations.get(inspection.locationId) : undefined, [inspection]);
  const assets = useLiveQuery(() => db.assets.where('inspectionId').equals(id).filter(a => !a.deleted).toArray(), [id]);

  const allLocations = useLiveQuery(() => db.locations.toArray());
  const subLocations = React.useMemo(() => {
    if (!location || !allLocations) return [];
    return allLocations.filter(l => l.parentId === location.id && !l.deleted);
  }, [allLocations, location]);
  const hasSubLocations = subLocations.length > 0;

  const aggregatedSubAssets = useLiveQuery(async () => {
    if (!hasSubLocations || !subLocations) return [];
    const subLocationIds = subLocations.map(sl => sl.id);
    const latestInspectionIds: string[] = [];

    for (const subLocId of subLocationIds) {
      const inspectionsForLoc = await db.inspections
        .where('locationId').equals(subLocId)
        .filter(i => !i.deleted)
        .toArray();

      if (inspectionsForLoc.length > 0) {
        inspectionsForLoc.sort((a, b) => b.date - a.date);
        latestInspectionIds.push(inspectionsForLoc[0].id);
      }
    }
    if (latestInspectionIds.length === 0) return [];
    return await db.assets.where('inspectionId').anyOf(latestInspectionIds).filter(a => !a.deleted).toArray();
  }, [hasSubLocations, subLocations]);

  const allVisibleAssets = hasSubLocations 
    ? [...(assets || []), ...(aggregatedSubAssets || [])]
    : (assets || []);

  React.useEffect(() => {
    const fetchSupabaseAssetsIfNeeded = async () => {
      if (!id || !isOnline || !location) return;
      try {
        const allRelevantLocationIds = [location.id];
        if (subLocations) {
          subLocations.forEach(sl => allRelevantLocationIds.push(sl.id));
        }

        const { data: cloudInspections } = await supabase
          .from('inspections')
          .select('id')
          .in('locationId', allRelevantLocationIds);

        if (cloudInspections && cloudInspections.length > 0) {
          const inspIds = cloudInspections.map(i => i.id);

          const { data: cloudAssets, error } = await supabase
            .from('assets')
            .select('*')
            .in('inspectionId', inspIds);

          if (cloudAssets && !error && cloudAssets.length > 0) {
            for (const ca of cloudAssets) {
              const localAsset = await db.assets.get(ca.id);
              if (!localAsset) {
                await db.assets.put({
                  id: ca.id,
                  inspectionId: ca.inspectionId,
                  name: ca.name,
                  patrimonyNumber: ca.patrimonyNumber || '',
                  condition: ca.condition,
                  observations: ca.observations || '',
                  photos: ca.photos || [],
                  hash: ca.hash || '',
                  quantity: ca.quantity || 1,
                  isPublic: ca.isPublic ?? true,
                  needsSync: 0,
                  createdBy: ca.createdBy || user?.userId || 'sistema',
                  createdAt: ca.createdAt || Date.now()
                });
              }
            }
          }
        }
      } catch (err) {
        console.warn("Aviso na sincronização de download:", err);
      }
    };
    fetchSupabaseAssetsIfNeeded();
  }, [id, isOnline, location?.id, user?.userId, subLocations?.length]);

  const totalFisicoItens = assets?.reduce((acc, a) => acc + Number(a.quantity || 1), 0) || 0;
  const allVisibleTotalFisico = allVisibleAssets?.reduce((acc, a) => acc + Number(a.quantity || 1), 0) || 0;
  
  const [searchTermAssets, setSearchTermAssets] = useState('');
  const [conditionFilter, setConditionFilter] = useState('all');
  const [isListening, setIsListening] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(20);
  const [isAdding, setIsAdding] = useState(false);
  const [isConcluding, setIsConcluding] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isReopening, setIsReopening] = useState(false);
  const [isConfirmingConclude, setIsConfirmingConclude] = useState(false);
  const [isConfirmingFinalize, setIsConfirmingFinalize] = useState(false);
  const [isConfirmingReopen, setIsConfirmingReopen] = useState(false);
  const [isDeletingInspection, setIsDeletingInspection] = useState(false);
  const [isConfirmingDeleteInspection, setIsConfirmingDeleteInspection] = useState(false);
  const [isSignOffModalOpen, setIsSignOffModalOpen] = useState(false);
  const [transferAssetId, setTransferAssetId] = useState<string | null>(null);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [isTransferring, setIsTransferring] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transferCandidate, setTransferCandidate] = useState<Asset | null>(null);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [historyAsset, setHistoryAsset] = useState<Asset | null>(null);
  const [assetHistory, setAssetHistory] = useState<{ asset: Asset, inspection: Inspection, location: Location }[] | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [sectorSignature, setSectorSignature] = useState<{ responsibleName: string, signatureBase64: string, signedAt: number } | null>(null);

  const filteredAssets = allVisibleAssets.filter(asset => 
    ((asset.name || '').toLowerCase().includes(searchTermAssets.toLowerCase()) || 
    (asset.patrimonyNumber || '').toLowerCase().includes(searchTermAssets.toLowerCase())) &&
    (conditionFilter === 'all' || 
     (conditionFilter === 'bom' && (asset.condition === 'bom' || asset.condition === 'novo')) ||
     (conditionFilter === 'regular' && (asset.condition === 'regular' || asset.condition === 'ruim')) ||
     (conditionFilter === 'inservivel' && asset.condition === 'inservivel') ||
     (asset.condition === conditionFilter))
  );

  const displayedAssets = searchTermAssets ? filteredAssets : filteredAssets?.slice(0, displayLimit);

  React.useEffect(() => {
    const fetchSignature = async () => {
      if (!id) return;
      try {
        const { data, error } = await supabase
          .from('sector_inspections')
          .select('responsibleName, signatureBase64, signedAt')
          .eq('inspectionId', id)
          .maybeSingle();

        if (data && !error) {
          setSectorSignature({
            responsibleName: data.responsibleName,
            signatureBase64: data.signatureBase64,
            signedAt: data.signedAt
          });
        }
      } catch (err: any) {}
    };
    fetchSignature();
  }, [id]);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const patrimonyRef = useRef<HTMLInputElement>(null);
  const conditionRef = useRef<HTMLSelectElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);
  const obsRef = useRef<HTMLTextAreaElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);

  const formRefs = [nameRef, patrimonyRef, conditionRef, quantityRef, obsRef, addButtonRef];

  const navigateFields = (direction: 'next' | 'prev') => {
    const currentIndex = formRefs.findIndex(ref => ref.current === document.activeElement);
    if (currentIndex === -1) return;
    if (direction === 'next') {
      const nextIndex = (currentIndex + 1) % formRefs.length;
      formRefs[nextIndex].current?.focus();
    } else {
      const prevIndex = (currentIndex - 1 + formRefs.length) % formRefs.length;
      formRefs[prevIndex].current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, fieldIndex: number) => {
    const isTextarea = e.currentTarget.tagName === 'TEXTAREA';
    const isInput = e.currentTarget.tagName === 'INPUT';
    const canMoveRight = !isInput && !isTextarea || (e.currentTarget as any).selectionEnd === (e.currentTarget as any).value?.length;
    const canMoveLeft = !isInput && !isTextarea || (e.currentTarget as any).selectionStart === 0;

    if (e.key === 'ArrowRight' && canMoveRight) {
      navigateFields('next');
    } else if (e.key === 'ArrowLeft' && canMoveLeft) {
      navigateFields('prev');
    } else if (e.key === 'Enter' && !isTextarea) {
      e.preventDefault();
      if (fieldIndex === formRefs.length - 1) {
        handleAddItem();
      } else {
        navigateFields('next');
      }
    }
  };

  const [locationNames, setLocationNames] = useState<Record<string, string>>({});

  React.useEffect(() => {
    const fetchLocNames = async () => {
      const inspIds = [...new Set(allVisibleAssets.map(a => a.inspectionId))];
      const mappings: Record<string, string> = {};
      for (const iId of inspIds) {
        if (iId === id) {
          mappings[iId] = location?.name || '';
        } else {
          const insp = await db.inspections.get(iId);
          if (insp) {
            const loc = await db.locations.get(insp.locationId);
            if (loc) mappings[iId] = loc.name;
          }
        }
      }
      setLocationNames(prev => ({ ...prev, ...mappings }));
    };
    if (allVisibleAssets.length > 0) fetchLocNames();
  }, [allVisibleAssets.length, id, location?.name]);

  const [newItem, setNewItem] = useState({
    name: '',
    patrimonyNumber: '',
    condition: 'bom' as AssetCondition,
    observations: '',
    photos: [] as string[],
    quantity: 1
  });

  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  React.useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  const handleAddItem = async () => {
    if (!newItem.name || !user) return; 

    const hash = generateAssetHash(newItem.name, newItem.patrimonyNumber, inspection?.locationId || '');
    
    if (transferCandidate && !editingAssetId) {
      try {
        const confirmTransfer = window.confirm(`Deseja TRANSFERIR o patrimônio ${transferCandidate.patrimonyNumber} para esta localização?`);
        if (confirmTransfer) {
          await db.assets.update(transferCandidate.id, {
            inspectionId: id, hash: hash, needsSync: 1, condition: newItem.condition, observations: newItem.observations, quantity: Number(newItem.quantity) || 1
          });
          setNewItem({ name: '', patrimonyNumber: '', condition: 'bom', observations: '', photos: [], quantity: 1 });
          setIsAdding(false);
          setTransferCandidate(null);
          toast("Item transferido com sucesso!", "success", "Transferência");
          pushLocalChanges();
          return;
        }
      } catch (err) {
        toast("Não foi possível transferir o item.", "error");
        setError("Não foi possível transferir o item.");
      }
    }

    if (!editingAssetId) {
      if (newItem.patrimonyNumber) {
        let globalExisting = await db.assets.where('patrimonyNumber').equals(newItem.patrimonyNumber).first();
        if (!globalExisting && isOnline) {
          try {
            const { data: cloudAsset } = await supabase.from('assets').select('*').eq('patrimonyNumber', newItem.patrimonyNumber).maybeSingle();
            if (cloudAsset) {
               globalExisting = {
                 id: cloudAsset.id, inspectionId: cloudAsset.inspectionId, name: cloudAsset.name, patrimonyNumber: cloudAsset.patrimonyNumber,
                 condition: cloudAsset.condition, observations: cloudAsset.observations, photos: cloudAsset.photos, hash: cloudAsset.hash, quantity: cloudAsset.quantity
               } as Asset;
            }
          } catch(e) {}
        }

        if (globalExisting) {
          if (globalExisting.inspectionId === id) {
              setDuplicateWarning(`O patrimônio ${newItem.patrimonyNumber} já foi cadastrado nesta vistoria.`);
              return;
          }
          const otherInsp = await db.inspections.get(globalExisting.inspectionId);
          const otherLoc = otherInsp ? await db.locations.get(otherInsp.locationId) : null;
          setTransferCandidate(globalExisting);
          setDuplicateWarning(`O patrimônio ${newItem.patrimonyNumber} já está vinculado ao local "${otherLoc?.name || 'outro setor'}".`);
          return;
        }
      } else {
        let existingHash = await db.assets.where('hash').equals(hash).first();
        if (!existingHash && isOnline) {
          try {
             const { data: cloudHash } = await supabase.from('assets').select('*').eq('hash', hash).maybeSingle();
             if (cloudHash) {
                existingHash = {
                  id: cloudHash.id, inspectionId: cloudHash.inspectionId, name: cloudHash.name, patrimonyNumber: cloudHash.patrimonyNumber,
                  condition: cloudHash.condition, observations: cloudHash.observations, photos: cloudHash.photos, hash: cloudHash.hash, quantity: cloudHash.quantity
                } as Asset;
             }
          } catch(e) {}
        }
        if (existingHash) {
          setDuplicateWarning("Este item já está cadastrado nesta sala. Edite o registro existente para alterar a quantidade.");
          return;
        }
      }
    }

    if (editingAssetId) {
      await db.assets.update(editingAssetId, {
        name: newItem.name, patrimonyNumber: newItem.patrimonyNumber, condition: newItem.condition,
        observations: newItem.observations, photos: newItem.photos, hash: hash, needsSync: 1, quantity: Number(newItem.quantity) || 1
      });
      toast("Registro atualizado!", "success", "Item Editado");
    } else {
      const assetId = generateId();
      await db.assets.add({
        id: assetId, inspectionId: id, name: newItem.name, patrimonyNumber: newItem.patrimonyNumber,
        condition: newItem.condition, photos: newItem.photos, observations: newItem.observations,
        createdBy: user.userId, createdAt: Date.now(), hash: hash, needsSync: 1, quantity: Number(newItem.quantity) || 1
      });
      toast("Item adicionado à vistoria!", "success", "Novo Patrimônio");
    }

    pushLocalChanges();
    setNewItem({ name: '', patrimonyNumber: '', condition: 'bom', observations: '', photos: [], quantity: 1 });
    setIsAdding(false);
    setEditingAssetId(null);
    setDuplicateWarning(null);
  };

  const handleSaveAndContinue = async () => {
    await handleAddItem();
    setTimeout(() => setIsAdding(true), 150);
  };

  const handleDeleteAsset = async (assetId: string) => {
    if (!isCommittee) { setError("Apenas membros da comissão podem excluir itens registrados."); return; }
    if (confirmDeleteId !== assetId) { setConfirmDeleteId(assetId); return; }
    try {
      await db.assets.update(assetId, { deleted: true, needsSync: 1, updatedAt: Date.now() });
      setConfirmDeleteId(null);
      pushLocalChanges();
    } catch (err: any) { setError("Não foi possível excluir o item."); }
  };

  const handleEditAsset = (asset: Asset) => {
    setNewItem({ name: asset.name, patrimonyNumber: asset.patrimonyNumber || '', condition: asset.condition, observations: asset.observations, photos: asset.photos || [], quantity: asset.quantity || 1 });
    setEditingAssetId(asset.id);
    setIsAdding(true);
  };

  const handleCloneAsset = (asset: Asset) => {
    setNewItem({ name: asset.name, patrimonyNumber: '', condition: asset.condition, observations: asset.observations, photos: asset.photos || [], quantity: 1 });
    setEditingAssetId(null);
    setIsAdding(true);
  };

  const handleVoiceDictation = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { alert('Seu navegador não suporta digitação por voz.'); return; }
    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    setIsListening(true);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setNewItem(prev => ({ ...prev, observations: prev.observations ? prev.observations + ' ' + transcript : transcript }));
      setIsListening(false);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

  const loadHistory = async (asset: Asset) => {
    setHistoryAsset(asset);
    setIsLoadingHistory(true);
    setAssetHistory(null);
    try {
      let assetsQuery: Asset[] = [];
      if (asset.patrimonyNumber) {
        assetsQuery = await db.assets.where('patrimonyNumber').equals(asset.patrimonyNumber).toArray();
      } else {
        assetsQuery = await db.assets.where('name').equals(asset.name).toArray();
      }
      const otherAssets = assetsQuery.filter(a => a.id !== asset.id && a.inspectionId !== asset.inspectionId);
      const historyData = await Promise.all(otherAssets.map(async (a) => {
        const insp = await db.inspections.get(a.inspectionId);
        if (!insp) return null;
        const loc = await db.locations.get(insp.locationId);
        if (!loc) return null;
        return { asset: a, inspection: insp, location: loc }
      }));
      const validHistory = historyData.filter(h => h !== null).sort((a, b) => b!.inspection.date - a!.inspection.date);
      setAssetHistory(validHistory as any);
    } catch(e) {
      setAssetHistory([]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file: any) => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const rawBase64 = reader.result as string;
          const compressedBase64 = await compressImage(rawBase64, 1000, 0.7);
          setNewItem(prev => {
            if (prev.photos.includes(compressedBase64)) return prev;
            return { ...prev, photos: [...prev.photos, compressedBase64].slice(-4) };
          });
        } catch (err) { setError("Falha ao otimizar foto."); }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removePhoto = (index: number) => {
    setNewItem(prev => ({ ...prev, photos: prev.photos.filter((_, i) => i !== index) }));
  };

  const handleConclude = async (force: boolean = false) => {
    if (!id || isConcluding) return;
    if (!isConfirmingConclude && !force) { setIsConfirmingConclude(true); return; }
    setIsConcluding(true);
    setError(null);
    try {
      const assetsCount = await db.assets.where('inspectionId').equals(id).count();
      if (assetsCount === 0) throw new Error("Não é possível concluir uma vistoria sem itens registrados.");
      const current = await db.inspections.get(id);
      if (!current) throw new Error(`Vistoria ${id} não encontrada no banco local.`);

      await db.inspections.put({ ...current, status: 'concluida', concludedBy: user?.userId, concludedAt: Date.now(), needsSync: 1 });
      
      const admins = await db.users.filter(u => u.role === 'administrador' || u.role === 'vistoriador').toArray();
      for (const admin of admins) {
        if (admin.userId !== user?.userId) {
          await db.notifications.add({ id: generateId(), type: 'sistema', title: 'Setor Vistoriado!', message: `O setor "${location?.name}" acaba de concluir a auditoria.`, date: Date.now(), read: false, targetUserId: admin.userId, relatedId: id });
        }
      }

      await syncInspection(id);
      await pushLocalChanges();
      await new Promise(resolve => setTimeout(resolve, 400));
      setIsConfirmingConclude(false);
    } catch (err: any) { setError(`Erro técnico: ${err.message || 'Falha na gravação'}`); } 
    finally { setIsConcluding(false); }
  };

  const handleFinalize = async () => {
    if (!user || (user.role !== 'prefeito' && user.role !== 'responsavel' && user.role !== 'administrador')) {
      setError("Apenas o Prefeito, Responsável ou Administrador podem homologar vistorias.");
      return;
    }
    if (!id || isFinalizing) return;
    if (!isConfirmingFinalize) { setIsConfirmingFinalize(true); setError(null); return; }

    setIsFinalizing(true);
    setError(null);

    try {
      const current = await db.inspections.get(id);
      if (!current) throw new Error("Vistoria não encontrada.");

      const qrCodeDataPayload = `https://patrimonio360-75ade.web.app/local/${location?.id}`;

      await db.inspections.put({
        ...current,
        status: 'finalizada',
        finalizedBy: user.userId,
        finalizedAt: Date.now(),
        qrCodeData: qrCodeDataPayload,
        needsSync: 1
      });

      const assetsList = await db.assets.where('inspectionId').equals(id).toArray();
      for (const asset of assetsList) {
        await db.assets.update(asset.id, { isPublic: true, needsSync: 1 });
      }

      toast("A submeter dados para a nuvem...", "info");
      await pushLocalChanges();
      
      generatePDF();
      toast("Homologação sincronizada e QR Code ativado!", "success");
      
      await new Promise(resolve => setTimeout(resolve, 400));
      setIsConfirmingFinalize(false);
    } catch (err: any) {
      console.error("Erro ao finalizar vistoria:", err);
      setError(`Erro ao finalizar: ${err.message || 'Erro desconhecido'}`);
    } finally {
      setIsFinalizing(false);
    }
  };

  const handleReopen = async () => {
    if (!isManager) { setError("Apenas administradores podem reabrir vistorias concluídas."); return; }
    if (!id || isReopening) return;
    if (!isConfirmingReopen) { setIsConfirmingReopen(true); setError(null); return; }
    
    setIsReopening(true);
    setError(null);
    toast("A resgatar dados da nuvem...", "info");

    try {
      const current = await db.inspections.get(id);
      if (!current) throw new Error("Vistoria não encontrada.");

      if (isOnline) {
        const { data: cloudAssets } = await supabase.from('assets').select('*').eq('inspectionId', id);
        if (cloudAssets && cloudAssets.length > 0) {
          for (const ca of cloudAssets) {
            const localAsset = await db.assets.get(ca.id);
            if (!localAsset) {
              await db.assets.put({
                id: ca.id,
                inspectionId: ca.inspectionId,
                name: ca.name,
                patrimonyNumber: ca.patrimonyNumber || '',
                condition: ca.condition,
                observations: ca.observations || '',
                photos: ca.photos || [],
                hash: ca.hash || '',
                quantity: ca.quantity || 1,
                isPublic: ca.isPublic ?? true,
                needsSync: 0,
                createdBy: ca.createdBy || user?.userId || 'sistema',
                createdAt: ca.createdAt || Date.now(),
                updatedAt: ca.updatedAt || Date.now(),
                deleted: ca.deleted || false
              });
            }
          }
        }
      }

      await db.inspections.put({ ...current, status: 'em_andamento', needsSync: 1 });
      await pushLocalChanges(); 
      
      await new Promise(resolve => setTimeout(resolve, 400));
      setIsConfirmingReopen(false);
      toast("Vistoria reaberta com sucesso!", "success");
    } catch (err: any) { 
      setError(`Erro ao reabrir: ${err.message || 'Erro desconhecido'}`); 
    } finally { 
      setIsReopening(false); 
    }
  };

  const handleDeleteInspection = async () => {
    if (!id || isDeletingInspection) return;
    if (!isConfirmingDeleteInspection) { setIsConfirmingDeleteInspection(true); setError(null); return; }
    setIsDeletingInspection(true);
    setError(null);
    try {
      const now = Date.now();
      const assetsToSoftDelete = await db.assets.where('inspectionId').equals(id).toArray();
      for (const asset of assetsToSoftDelete) { await db.assets.update(asset.id, { deleted: true, needsSync: 1, updatedAt: now }); }
      await db.inspections.update(id, { deleted: true, needsSync: 1, updatedAt: now });
      pushLocalChanges();
      onBack();
    } catch (err: any) { setError(`Erro ao excluir: ${err.message || 'Falha no banco de dados'}`); } finally { setIsDeletingInspection(false); setIsConfirmingDeleteInspection(false); }
  };

  const handleTransfer = async (targetLocationId: string) => {
    if (!transferAssetId || isTransferring || !user) return;
    setIsTransferring(true);
    try {
      let idsToTransfer: string[] = [];
      if (transferAssetId === 'batch') { idsToTransfer = selectedAssetIds; } 
      else if (transferAssetId === 'all') { idsToTransfer = assets?.map(a => a.id) || []; } 
      else { idsToTransfer = [transferAssetId]; }
      
      if (idsToTransfer.length === 0) throw new Error("Nenhum item para transferir");
      let targetInspection = await db.inspections.where({ locationId: targetLocationId }).filter(i => i.status === 'em_andamento').reverse().first();

      // 🛡️ A CORREÇÃO MÁGICA: Adicionamos needsSync: 1 e as datas para a nuvem aceitar a vistoria nova!
    if (!targetInspection) {
        const newId = generateId();
        await db.inspections.add({ 
           id: newId, 
           locationId: targetLocationId, 
           date: Date.now(), 
           participants: [], 
           status: 'em_andamento',
           needsSync: 1,
           createdAt: Date.now(),
           updatedAt: Date.now(),
           createdBy: user.userId
        } as any); // 🛡️ ADICIONAMOS "as any" AQUI PARA O TYPESCRIPT DEIXAR PASSAR
        targetInspection = await db.inspections.get(newId);
      } else {
        // Se a vistoria já existia localmente, forçamos o envio dela também para destrancar a fila!
        await db.inspections.update(targetInspection.id, { needsSync: 1, updatedAt: Date.now() });
      }
      if (!targetInspection) throw new Error("Falha ao preparar destino");

      for (const assetId of idsToTransfer) {
        const asset = await db.assets.get(assetId);
        if (!asset) continue;
        const newHash = generateAssetHash(asset.name, asset.patrimonyNumber, targetLocationId);
        const existingInTarget = await db.assets.where('hash').equals(newHash).first();
        if (existingInTarget) continue;
        await db.assets.update(assetId, { inspectionId: targetInspection!.id, hash: newHash, needsSync: 1, updatedAt: Date.now() });
      }

      setSuccessMessage(`${idsToTransfer.length} item(ns) transferido(s) para ${allLocations?.find(l => l.id === targetLocationId)?.name}`);
      setTransferAssetId(null);
      setIsBatchMode(false);
      setSelectedAssetIds([]);
      
      // Empurramos logo as alterações para forçar a sincronização da vistoria nova!
      pushLocalChanges();
      
    } catch (err: any) { setError(err.message || "Erro ao transferir item"); } finally { setIsTransferring(false); }
  };

  const generatePDF = async () => {
    try {
      setError(null);
      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text('Relatório de Vistoria Patrimonial', 14, 22);
      
      doc.setFontSize(11);
      doc.text(`Local: ${location?.name}`, 14, 32);
      const getPDFDisplayDate = (insp: any) => {
        const finalDate = insp?.finalizedAt || insp?.updatedAt || insp?.date;
        if (!finalDate) return 0;
        if (typeof finalDate === 'number') return finalDate;
        if (typeof finalDate.toMillis === 'function') return finalDate.toMillis();
        if (finalDate.seconds) return finalDate.seconds * 1000;
        return new Date(finalDate).getTime() || 0;
      };
      doc.text(`Data: ${formatDate(getPDFDisplayDate(inspection))}`, 14, 38);
      
      if (inspection?.concludedBy) { doc.text(`Vistoriador: ${inspection.concludedBy === user?.userId ? user?.name : 'Identificado no Sistema'}`, 14, 44); } 
      else { doc.text(`Responsável: ${user?.name}`, 14, 44); }
      
      if (inspection?.status === 'finalizada') { doc.text(`Homologado por: ${inspection.finalizedBy === user?.userId ? user?.name : 'Autoridade Municipal'}`, 14, 50); }

      doc.setFontSize(10);
      doc.setTextColor(50);
      doc.text(`Total de Registros: ${allVisibleAssets.length} | Total Fisico (Soma das Qtds): ${allVisibleTotalFisico}`, 14, 58);

      const qrData = `https://patrimonio360-75ade.web.app/local/${location?.id}`;
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text('Este documento contém um QR Code DINÂMICO vinculado ao SETOR.', 14, 64);
      doc.text('A leitura deste código sempre exibirá a auditoria mais recente homologada.', 14, 69);
      doc.setTextColor(0);

      const tableData = allVisibleAssets?.map(a => [
        a.name, String(Number(a.quantity || 1)), a.patrimonyNumber || (a as any).code || '-', a.condition, a.observations || '-'
      ]);

      autoTable(doc, { head: [['Item', 'Qtd', 'Patrimônio', 'Estado', 'Obs']], body: tableData, startY: 74, theme: 'grid' });

      if (sectorSignature) {
        const finalY = (doc as any).lastAutoTable.finalY + 15;
        doc.setFontSize(10);
        doc.text('RESPONSÁVEL PELO SETOR (ATÉSTADO DE CIÊNCIA):', 14, finalY);
        doc.setFontSize(11);
        doc.text(sectorSignature.responsibleName.toUpperCase(), 14, finalY + 7);
        doc.addImage(sectorSignature.signatureBase64, 'PNG', 14, finalY + 10, 40, 15);
      }

      if (true) { 
        const qrY = sectorSignature ? (doc as any).lastAutoTable.finalY + 35 : (doc as any).lastAutoTable.finalY + 15;
        if (qrY < 230) {
          doc.setFontSize(10); doc.setFont('helvetica', 'bold');
          doc.text('SELO PERMANENTE DE TRANSPARÊNCIA (PORTA DO SETOR):', 14, qrY);
          const qrSvg = document.querySelector('#qr-code-dynamic svg');
          if (qrSvg) {
            const svgData = new XMLSerializer().serializeToString(qrSvg);
            const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
            const img = new Image(); img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
            await new Promise((resolve) => {
              img.onload = () => {
                canvas.width = img.width; canvas.height = img.height; ctx?.drawImage(img, 0, 0);
                doc.addImage(canvas.toDataURL('image/png'), 'PNG', 14, qrY + 5, 40, 40);
                resolve(null);
              };
            });
          }
        }
      }
      try { doc.save(`Vistoria_${location?.name}_${new Date().toLocaleDateString()}.pdf`); } 
      catch (saveErr) { const blob = doc.output('blob'); window.open(URL.createObjectURL(blob), '_blank'); }
    } catch (err: any) { setError(`Erro ao gerar PDF: ${err.message || 'Falha desconhecida'}`); }
  };

 const handlePrintQRCode = (type: 'vistoria' | 'local' = 'local') => {
    try {
      const qrData = type === 'local' ? `https://patrimonio360-75ade.web.app/local/${location?.id}` : inspection?.qrCodeData;
      if (!qrData) return;
      const printWindow = window.open('', '_blank');
      if (!printWindow) { setError("O navegador bloqueou a janela de impressão. Por favor, permita popups."); return; }
      const qrSvg = document.querySelector(type === 'local' ? '#qr-code-dynamic svg' : '#qr-code-container svg')?.outerHTML || '';
      
      printWindow.document.write(`
        <html>
          <head>
            <title>QR Code ${type === 'local' ? 'Permanente' : 'Vistoria'} - ${location?.name}</title>
            <style>
              body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                display: flex; 
                flex-direction: column; 
                align-items: center; 
                justify-content: center; 
                min-height: 100vh; 
                margin: 0; 
                text-align: center; 
                background: #f8fafc; 
              }
              .card { 
                border: 3px solid #1e293b; 
                padding: 30px; 
                border-radius: 24px; 
                background: white; 
                box-shadow: 0 10px 30px rgba(0,0,0,0.05); 
                width: 100%;
                max-width: 320px;
                box-sizing: border-box;
              }
              .gov-header { 
                font-size: 9px; 
                font-weight: 900; 
                color: #64748b; 
                text-transform: uppercase; 
                letter-spacing: 2px; 
                margin-bottom: 12px; 
              }
              h1 { 
                margin: 8px 0; 
                font-size: 22px; 
                color: #0f172a; 
                font-weight: 950; 
                word-break: break-word;
              }
              .qr { 
                margin: 20px 0; 
                padding: 10px; 
                background: white; 
                border: 1px solid #e2e8f0; 
                border-radius: 16px; 
                display: flex;
                justify-content: center;
              }
              .qr svg {
                width: 180px !important;
                height: 180px !important;
                max-width: 100% !important;
                height: auto !important;
              }
              .type-badge { 
                background: ${type === 'local' ? '#4f46e5' : '#10b981'}; 
                color: white; 
                padding: 4px 10px; 
                font-size: 8px; 
                font-weight: 900; 
                text-transform: uppercase; 
                letter-spacing: 1px; 
                border-radius: 8px; 
                margin-bottom: 10px; 
                display: inline-block; 
              }
              .footer-text { 
                font-size: 10px; 
                color: #94a3b8; 
                font-weight: bold; 
                margin-top: 8px; 
              }
              .dynamic-badge { 
                color: #4f46e5; 
                border: 1px solid #e0e7ff; 
                background: #f5f3ff; 
                padding: 6px; 
                border-radius: 10px; 
                font-size: 9px; 
                margin-top: 12px; 
                font-weight: bold; 
              }
              @media print {
                body { background: white; }
                .card { border: 2px solid #000; box-shadow: none; }
              }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="gov-header">Patrimônio Público</div>
              <div class="type-badge">${type === 'local' ? 'Selo Permanente' : 'Selo de Vistoria'}</div>
              <h1>${location?.name}</h1>
              <div class="qr">${qrSvg}</div>
              <p class="footer-text">Controle Social de Bens Municipais</p>
              ${type === 'local' ? '<div class="dynamic-badge">Este código não expira e atualiza a cada nova vistoria homologada.</div>' : ''}
            </div>
            <script>setTimeout(() => { window.print(); window.close(); }, 600);</script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } catch (err: any) { setError("Erro ao preparar a impressão do QR Code."); }
  };

  if (!inspection || !location) return null;

  const isLocked = inspection.status === 'finalizada' || (inspection.status === 'concluida' && !isCommittee);
  const isAddBlocked = hasSubLocations; 
  const isFinalized = inspection.status === 'finalizada';
  const isConcluded = inspection.status === 'concluida';

  const handleStartSubInspection = async (subLocId: string) => {
    const existing = await db.inspections.where({ locationId: subLocId }).filter(i => !i.deleted && i.status !== 'finalizada').first();
    if (existing) { onBack(); }
  };

  const handleBack = async () => {
    if (inspection?.status === 'em_andamento') {
      const assetsCount = await db.assets.where('inspectionId').equals(id).count();
      if (assetsCount === 0) {
        const discard = window.confirm("🗑️ VISTORIA VAZIA: Deseja descartar esta vistoria antes de sair?\n\n(Se você clicar em OK, a vistoria será apagada. Se clicar em CANCELAR, ela ficará salva como rascunho)");
        if (discard) {
          const now = Date.now();
          await db.inspections.update(id, { deleted: true, needsSync: 1, updatedAt: now });
          pushLocalChanges();
        }
      }
    }
    onBack();
  };

  const childLocations = allLocations?.filter(l => l.parentId === location.id && !l.deleted) || [];
  const otherLocations = allLocations?.filter(l => l.id !== location.id && l.parentId !== location.id && !l.deleted) || [];

  return (
    <div className="flex flex-col gap-10 animate-in fade-in slide-in-from-right-4 duration-700 pb-24">
      {error && (
        <div className="bg-rose-50 border border-rose-100 p-5 rounded-[1.5rem] flex items-center gap-4 text-rose-600 animate-in slide-in-from-top-4 duration-500 shadow-xl shadow-rose-500/5">
           <AlertCircle className="w-6 h-6 shrink-0" />
           <p className="text-xs font-bold uppercase tracking-widest flex-1">{error}</p>
           <button onClick={() => setError(null)} className="p-2 hover:bg-rose-100 rounded-xl transition-colors"><X className="w-5 h-5" /></button>
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-[1.5rem] flex items-center gap-4 text-emerald-600 animate-in slide-in-from-top-4 duration-500 shadow-xl shadow-emerald-500/5">
           <CheckCircle2 className="w-6 h-6 shrink-0" />
           <p className="text-xs font-bold uppercase tracking-widest flex-1">{successMessage}</p>
        </div>
      )}

      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex flex-col gap-4">
          <button onClick={handleBack} className="flex items-center gap-2 text-slate-400 font-bold text-[10px] uppercase tracking-widest hover:text-slate-900 transition-all group w-fit">
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" /> Voltar ao Painel
          </button>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <h2 className="text-3xl lg:text-4xl font-display font-extrabold text-slate-900 tracking-tight leading-none truncate">{location.name}</h2>
              <div className={cn("px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.2em] shadow-sm", isFinalized ? "bg-emerald-100 text-emerald-700" : isConcluded ? "bg-indigo-100 text-indigo-700" : "bg-blue-100 text-blue-700")}>
                {isFinalized ? "Homologada" : isConcluded ? "Concluída" : "Em Aberto"}
              </div>
            </div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-widest mt-1">{location.description || "Auditoria Patrimonial Municipal"}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!isLocked && isCommittee && (
            <div className="flex items-center">
              {isConfirmingDeleteInspection ? (
                <div className="flex items-center gap-2 bg-rose-50 border border-rose-100 p-1.5 rounded-2xl animate-in slide-in-from-right-4 duration-300">
                  <button onClick={handleDeleteInspection} disabled={isDeletingInspection} className="px-4 py-2 bg-rose-600 text-white rounded-xl shadow-lg shadow-rose-600/20 hover:bg-rose-700 transition-all font-black text-[10px] uppercase tracking-widest">
                    {isDeletingInspection ? "..." : "EXCLUIR"}
                  </button>
                  <button onClick={() => setIsConfirmingDeleteInspection(false)} className="p-2 text-slate-400 hover:text-slate-900 rounded-xl transition-all"><X className="w-5 h-5" /></button>
                </div>
              ) : (
                <button onClick={() => setIsConfirmingDeleteInspection(true)} className="p-3 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-2xl transition-all" title="Excluir Auditoria"><Trash2 className="w-6 h-6" /></button>
              )}
            </div>
          )}
          {isOnline && (
            <div className="flex flex-col items-end leading-none px-4 py-2 bg-white border border-slate-100 rounded-2xl shadow-sm">
               <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest text-emerald-600">Conectado</span>
            </div>
          )}
        </div>
      </header>

      <div className="relative overflow-hidden rounded-[2.5rem] bg-slate-900 px-8 lg:px-12 py-10 lg:py-16 text-white shadow-2xl shadow-slate-300/30">
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4 mb-2">
               <div className="w-16 h-16 bg-white/10 rounded-[2rem] flex items-center justify-center backdrop-blur-md border border-white/10 shadow-xl"><Building2 className="w-8 h-8 text-white" /></div>
               <div className="flex flex-col">
                  <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] leading-none mb-2">{hasSubLocations ? 'Visão Consolidada' : 'Local em Auditoria'}</span>
                  <h1 className="text-4xl lg:text-5xl font-display font-extrabold tracking-tight leading-none">{location.name}</h1>
               </div>
            </div>
            <p className="text-slate-400 text-lg font-medium max-w-lg leading-relaxed">{location.description}</p>
          </div>
          
          <div className="grid grid-cols-3 gap-6 lg:gap-12">
             <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Início</span>
                <span className="font-display text-2xl font-black tracking-tight text-white">{formatDate(inspection.date).split(',')[0]}</span>
             </div>
             <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Itens {hasSubLocations ? 'Totais' : ''}</span>
                <span className="font-display text-2xl font-black tracking-tight text-white">{allVisibleTotalFisico}</span>
             </div>
             <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Status</span>
                <span className={cn("font-display text-2xl font-black tracking-tight uppercase", isFinalized ? "text-emerald-400" : isConcluded ? "text-indigo-400" : "text-blue-400")}>
                  {hasSubLocations ? 'GERAL' : inspection.status.split('_')[0]}
                </span>
             </div>
          </div>
        </div>
        <Building2 className="absolute -bottom-20 -right-20 w-96 h-96 text-white/5 transform rotate-12 pointer-events-none" />
      </div>

      {isConcluded && !isFinalized && (
        <div className="bg-white border border-indigo-100 rounded-[2rem] p-8 flex flex-col md:flex-row items-center gap-8 animate-in slide-in-from-top-4 duration-500 shadow-[0_20px_50px_-15px_rgba(99,102,241,0.1)]">
           <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center text-white shadow-xl shadow-indigo-600/20 shrink-0"><History className="w-10 h-10" /></div>
           <div className="flex flex-col gap-2 flex-1 text-center md:text-left">
              <h3 className="text-2xl font-display font-extrabold text-slate-900 tracking-tight">Dossiê em Aguardo</h3>
              <p className="text-slate-500 font-medium leading-relaxed">Esta auditoria foi concluída pela comissão de vistoria. Agora, o Prefeito ou Responsável Legal deve homologar o documento para gerar o selo oficial de transparência.</p>
              {sectorSignature && (
                <div className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-4">
                  <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-indigo-600 border border-slate-100"><Signature className="w-5 h-5" /></div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest leading-none mb-1">Responsável Setorial</span>
                    <span className="text-sm font-bold text-slate-700">{sectorSignature.responsibleName}</span>
                  </div>
                  <div className="ml-auto"><img src={sectorSignature.signatureBase64} alt="Assinatura" className="h-10 opacity-70 grayscale hover:grayscale-0 transition-all" /></div>
                </div>
              )}
           </div>
           <div className="flex items-center gap-2"><div className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border border-indigo-100">Pendente Homologação</div></div>
        </div>
      )}

      {hasSubLocations && (
        <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-4 duration-700">
           <div className="flex items-center justify-between ml-2">
              <div className="flex flex-col">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Ambientes Internos</h3>
                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mt-1">Gavetas/Salas desta repartição</span>
              </div>
           </div>
           <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {subLocations?.map(sl => (
                <button key={sl.id} onClick={onBack} className="bg-white border border-slate-100 p-6 rounded-3xl hover:border-indigo-300 hover:shadow-xl hover:shadow-indigo-600/5 transition-all text-left flex flex-col gap-3 group">
                   <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-all"><Home className="w-5 h-5" /></div>
                   <div className="flex flex-col">
                      <span className="text-xs font-black text-slate-900 group-hover:text-indigo-600 transition-colors uppercase truncate">{sl.name}</span>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Ver Itens</span>
                   </div>
                </button>
              ))}
           </div>
           
           <div className="bg-amber-50 border border-amber-100 p-6 rounded-[2rem] flex flex-col md:flex-row items-center gap-6 shadow-xl shadow-amber-500/5">
              <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-lg text-amber-500 shrink-0"><AlertCircle className="w-7 h-7" /></div>
              <div className="flex flex-col gap-1 text-center md:text-left">
                <span className="text-sm font-black text-amber-900 uppercase tracking-tight">Bloqueio de Inclusão Direta</span>
                <p className="text-[11px] font-medium text-amber-600 leading-relaxed uppercase tracking-widest">Este local é um <span className="font-bold">Agrupador</span>. Para manter a organização, os novos itens devem ser cadastrados dentro das salas/gavetas específicas listadas acima.</p>
              </div>
           </div>
        </div>
      )}
      
      {isFinalized && (
        <div className="flex flex-col gap-8 animate-in zoom-in-95 duration-700">
          <Card className="flex flex-col lg:flex-row items-center gap-12 p-8 lg:p-12 border-emerald-100 bg-white group hover:shadow-[0_30px_70px_-20px_rgba(16,185,129,0.15)] transition-all duration-700 rounded-[3rem]">
            <div id="qr-code-container" className="p-8 bg-slate-50 rounded-[3rem] border border-slate-100 shadow-inner group-hover:bg-white transition-all duration-700 flex flex-col items-center gap-4 shrink-0">
              <QRCodeSVG value={inspection.qrCodeData || ''} size={180} />
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Certificado Digital</span>
                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mt-2">{formatDate(inspection.date).split(',')[0]}</span>
              </div>
            </div>
            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-3">
                 <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-emerald-500/20"><ShieldCheck className="w-7 h-7" /></div>
                    <h3 className="font-display font-extrabold text-3xl text-slate-900 tracking-tight leading-none uppercase">Selo de Transparência</h3>
                 </div>
                 <p className="text-lg text-slate-500 leading-relaxed font-medium max-w-xl">
                   Este ambiente foi <span className="text-emerald-600 font-bold">Blindado Digitalmente</span>. Ao escanear este QR Code, a sociedade civil e os auditores terão acesso imediato aos {totalFisicoItens} itens tombados nesta sala.
                 </p>
                 {sectorSignature && (
                    <div className="mt-2 p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100 flex items-center gap-4">
                      <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-emerald-600"><Signature className="w-5 h-5" /></div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase text-emerald-700/50 tracking-widest leading-none mb-1">Atestado por</span>
                        <span className="text-sm font-bold text-slate-700">{sectorSignature.responsibleName}</span>
                      </div>
                      <div className="ml-auto bg-white/50 p-1 rounded-lg"><img src={sectorSignature.signatureBase64} alt="Assinatura" className="h-8" /></div>
                    </div>
                 )}
              </div>
              
              <div className="flex flex-wrap gap-4">
                 <div id="qr-code-container" className="hidden"><QRCodeSVG value={inspection.qrCodeData || ''} size={512} level="H" /></div>
                 <div id="qr-code-dynamic" className="hidden"><QRCodeSVG value={`https://patrimonio360-75ade.web.app/local/${location.id}`} size={512} level="H" /></div>

                 <Button variant="accent" size="sm" onClick={generatePDF} icon={Save} className="px-8 md:px-10 h-16 text-[10px] uppercase tracking-widest rounded-2xl">Baixar Dossiê (PDF)</Button>
                 
                 <div className="flex flex-1 gap-2">
                    <Button variant="outline" onClick={() => handlePrintQRCode('local')} icon={ImageIcon} className="flex-1 h-16 border-indigo-100 text-indigo-600 font-black text-[10px] uppercase tracking-widest hover:bg-indigo-50 rounded-2xl bg-white">QR Permanente</Button>
                    <Button variant="outline" onClick={() => handlePrintQRCode('vistoria')} icon={Database} className="flex-1 h-16 border-slate-200 text-slate-500 font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 rounded-2xl bg-white">Etiqueta Data</Button>
                 </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Assets List */}
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 px-2">
          <div className="flex flex-col">
            <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">Inventário Local</h2>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mt-1">Lista de bens conferidos</span>
          </div>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-slate-900 transition-colors" />
              <input type="text" placeholder="Buscar item ou patrimônio..." value={searchTermAssets} onChange={e => setSearchTermAssets(e.target.value)} className="pl-11 pr-6 py-2.5 bg-white border border-slate-100 rounded-xl text-sm font-bold text-slate-900 shadow-sm focus:ring-2 focus:ring-slate-900 focus:outline-none transition-all w-full sm:w-64" />
            </div>
            {!isLocked && (
                <div className="flex items-center gap-2">
                {isCommittee && (
                  <>
                    <Button variant="outline" size="sm" icon={ArrowRightLeft} onClick={() => setTransferAssetId('all')} className="rounded-xl px-4 h-11 border-amber-100 text-amber-600 bg-amber-50 hover:bg-amber-100 transition-all font-black text-[10px] uppercase tracking-widest">Mover Tudo</Button>
                    <Button variant="outline" size="sm" icon={isBatchMode ? X : ArrowRightLeft} onClick={() => { setIsBatchMode(!isBatchMode); setSelectedAssetIds([]); }} className={cn("rounded-xl px-4 h-11 transition-all", isBatchMode ? "border-rose-200 text-rose-500 bg-rose-50" : "border-slate-100 text-slate-400")}>{isBatchMode ? 'Mover Vários' : 'Selecionar'}</Button>
                  </>
                )}
                {!isAddBlocked && (
                   <Button variant="accent" size="sm" icon={Plus} onClick={() => setIsAdding(true)} className="rounded-xl px-8 h-11 shadow-xl shadow-blue-600/10">ADICIONAR ITEM</Button>
                )}
              </div>
            )}
          </div>
        </div>

        {isBatchMode && selectedAssetIds.length > 0 && (
          <div className="bg-amber-600 p-6 rounded-[2rem] flex items-center justify-between shadow-xl shadow-amber-600/20 animate-in slide-in-from-top-4">
            <div className="flex items-center gap-4 text-white">
               <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center"><ArrowRightLeft className="w-6 h-6" /></div>
               <div className="flex flex-col">
                  <span className="text-lg font-black tracking-tight leading-none">Transferência em Massa</span>
                  <span className="text-[10px] font-bold opacity-80 uppercase tracking-widest mt-1">{selectedAssetIds.length} Itens Selecionados</span>
               </div>
            </div>
            <Button variant="accent" className="bg-white text-amber-600 hover:bg-slate-50 font-black uppercase text-[10px] px-8 h-12 rounded-xl" onClick={() => setTransferAssetId('batch')}>Escolher Destino</Button>
          </div>
        )}

        {isAdding && (
          <div className="fixed inset-0 z-[200] flex flex-col bg-slate-900/40 backdrop-blur-sm md:p-6 md:justify-center md:items-center animate-in fade-in duration-300">
            <Card className="w-full h-full md:h-auto md:max-h-[90vh] md:max-w-4xl flex flex-col overflow-hidden rounded-none md:rounded-[2.5rem] border-none shadow-[0_40px_100px_-20px_rgba(0,0,0,0.3)] relative z-10 p-0 bg-white">
               
               <div className="flex items-center justify-between p-8 bg-slate-900 text-white shadow-xl z-20 shrink-0">
                  <div className="flex items-center gap-5">
                    <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center border border-white/20"><Plus className="w-6 h-6 text-white" /></div>
                    <div className="flex flex-col">
                       <h3 className="font-display font-bold text-2xl uppercase tracking-tight text-white leading-none">{editingAssetId ? 'Editar Detalhes' : 'Novo Registro'}</h3>
                       <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Inventário Digital • Manoel Viana</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                     <button type="button" onClick={() => { setIsAdding(false); setEditingAssetId(null); setDuplicateWarning(null); }} className="p-3 rounded-2xl bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-all border border-white/10"><X className="w-6 h-6" /></button>
                  </div>
               </div>
               
               <div className="flex-1 overflow-y-auto custom-scrollbar p-8 lg:p-12 flex flex-col gap-10 bg-white pb-32">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col">
                      <label className="text-[10px] font-bold text-slate-900 uppercase tracking-widest ml-1">Descrição do Patrimônio</label>
                      <span className="text-slate-400 text-[9px] ml-1 mb-2 font-medium">O que é este item? Ex: Cadeira giratória preta</span>
                    </div>
                   <Input ref={nameRef} placeholder="Ex: Mesa de Escritório, Cadeira de Rodas..." value={newItem.name} onChange={e => { setNewItem({...newItem, name: e.target.value}); if (duplicateWarning) { setDuplicateWarning(null); setTransferCandidate(null); } }} onKeyDown={e => handleKeyDown(e, 0)} error={duplicateWarning || undefined} autoFocus className="text-xl h-16 px-6" />
                   {duplicateWarning && (
                     <div className="flex flex-col gap-4 p-6 bg-rose-50 border border-rose-100 rounded-[1.5rem] animate-in fade-in slide-in-from-top-2">
                        <div className="flex items-center gap-3 text-rose-600 font-bold text-sm"><AlertCircle className="w-6 h-6 shrink-0"/> <span className="leading-tight">{duplicateWarning}</span></div>
                        {transferCandidate && (<Button variant="accent" onClick={handleAddItem} className="bg-rose-600 hover:bg-rose-700 h-14 rounded-xl text-[10px] font-black uppercase tracking-widest">Confirmar Transferência para este Local</Button>)}
                     </div>
                   )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col"><label className="text-[10px] font-bold text-slate-900 uppercase tracking-widest ml-1">Etiq. Patrimônio</label><span className="text-slate-400 text-[9px] ml-1 mb-2 font-medium">Número da plaqueta de tombo (se houver)</span></div>
                      <Input ref={patrimonyRef} placeholder="Nº de Registro" value={newItem.patrimonyNumber} onChange={e => setNewItem({...newItem, patrimonyNumber: e.target.value})} onKeyDown={e => handleKeyDown(e, 1)} className="text-lg h-16 px-6 font-mono tracking-widest" />
                    </div>

                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col"><label className="text-[10px] font-bold text-slate-900 uppercase tracking-widest ml-1">Estado Físico</label><span className="text-slate-400 text-[9px] ml-1 mb-2 font-medium">Qual a condição de uso atual do bem?</span></div>
                      <Select ref={conditionRef} value={newItem.condition} onChange={e => setNewItem({...newItem, condition: e.target.value as any})} onKeyDown={e => handleKeyDown(e, 2)} className="h-16 px-6 text-sm" options={[ { value: 'bom', label: 'Bom Estado' }, { value: 'regular', label: 'Regular' }, { value: 'ruim', label: 'Ruim (Requer Manutenção)' }, { value: 'inservivel', label: 'Inservível (Descarte)' } ]} />
                    </div>

                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col"><label className="text-[10px] font-bold text-slate-900 uppercase tracking-widest ml-1">Quantidade</label><span className="text-slate-400 text-[9px] ml-1 mb-2 font-medium">Quantos itens idênticos no local?</span></div>
                      <Input ref={quantityRef} type="number" value={newItem.quantity?.toString()} onChange={e => setNewItem({...newItem, quantity: Math.max(1, parseInt(e.target.value) || 1)})} onKeyDown={e => handleKeyDown(e, 3)} min={1} className="text-center font-bold text-lg h-16 shadow-sm" />
                    </div>
                  </div>

                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col">
                        <div className="flex items-center justify-between pb-1 pr-1 w-full">
                          <label className="text-[10px] font-bold text-slate-900 uppercase tracking-widest ml-1">Observações Técnicas</label>
                          <button type="button" onClick={handleVoiceDictation} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all cursor-pointer", isListening ? "bg-rose-500 border-rose-500 text-white animate-pulse" : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600")} title="Digitar por voz (API Web Speech)"><Mic className={cn("w-3.5 h-3.5", isListening && "text-white animate-bounce")} />{isListening ? "Ouvindo..." : "Ditado por Voz"}</button>
                        </div>
                        <span className="text-slate-400 text-[9px] ml-1 mb-2 font-medium">Anote avarias, faltas de peças ou necessidade de descarte.</span>
                     </div>
                    <Textarea ref={obsRef} placeholder="Identificou avarias ou detalhes específicos? Descreva aqui..." value={newItem.observations} onChange={e => setNewItem({...newItem, observations: e.target.value})} onKeyDown={e => handleKeyDown(e, 4)} className="text-base p-6 min-h-[160px] resize-none" />
                  </div>

                  {/* 📷 Seção de Evidências Fotográficas */}
                  <div className="flex flex-col gap-6">
                    <div className="flex items-center justify-between"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Evidências Fotográficas ({newItem.photos.length}/4)</label></div>

                    {newItem.photos.length > 0 && (
                      <div className="flex flex-wrap gap-6">
                        {newItem.photos.map((photo, index) => (
                          <div key={index} className="relative w-32 h-32 rounded-[1.5rem] overflow-hidden border-2 border-slate-100 shadow-sm group cursor-pointer" onClick={() => setPreviewPhoto(photo)}>
                             <img src={photo} alt="" className="w-full h-full object-cover hover:opacity-80 transition-all" />
                             <button onClick={(e) => { e.stopPropagation(); removePhoto(index); }} className="absolute top-2 right-2 bg-rose-600 text-white p-2 rounded-xl shadow-lg opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <label className="py-8 px-6 border-2 border-dashed border-indigo-200 bg-indigo-50/40 rounded-[2rem] flex flex-col items-center gap-3 text-indigo-600 hover:bg-indigo-50 transition-all group cursor-pointer shadow-sm">
                         <Camera className="w-8 h-8 transition-transform group-hover:scale-110" />
                         <span className="text-[10px] font-black uppercase tracking-widest">Tirar Foto (Câmera Direta)</span>
                         <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoCapture} />
                      </label>
                      <label className="py-8 px-6 border-2 border-dashed border-slate-200 rounded-[2rem] flex flex-col items-center gap-3 text-slate-500 hover:bg-slate-50 transition-all group cursor-pointer shadow-sm">
                         <ImageIcon className="w-8 h-8 transition-transform group-hover:scale-110" />
                         <span className="text-[10px] font-black uppercase tracking-widest">Escolher da Galeria</span>
                         <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoCapture} />
                      </label>
                    </div>
                  </div>
               </div>

               {/* Footer Fixo */}
               <div className="absolute bottom-0 inset-x-0 p-8 pt-4 bg-white border-t border-slate-100 flex items-center gap-4 z-30">
                    <Button variant="secondary" onClick={() => { setIsAdding(false); setEditingAssetId(null); setDuplicateWarning(null); }} className="flex-1 h-16 rounded-2xl text-[10px] uppercase font-black tracking-widest">Cancelar</Button>
                   <Button ref={addButtonRef} variant={editingAssetId ? "accent" : "outline"} onClick={handleAddItem} onKeyDown={e => handleKeyDown(e, 5)} disabled={!newItem.name} className="flex-1 h-16 rounded-2xl text-[10px] uppercase font-black tracking-widest border-slate-200">{editingAssetId ? 'Salvar Alterações' : 'Salvar e Fechar'}</Button>
                   {!editingAssetId && (<Button variant="accent" onClick={handleSaveAndContinue} disabled={!newItem.name} className="flex-1 h-16 rounded-2xl text-[10px] uppercase font-black tracking-widest shadow-xl shadow-indigo-500/20"><Plus className="w-4 h-4 mr-2" /> Salvar e Novo</Button>)}
               </div>
            </Card>
          </div>
        )}

         {/* Barra de Filtro Semafórico Visual */}
         <div className="flex flex-wrap items-center justify-between gap-5 bg-white border border-slate-100 p-5 rounded-[2rem] px-8 select-none shadow-sm mb-4">
            <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[1.25rem] bg-indigo-50 border border-indigo-100/40 flex items-center justify-center text-indigo-500"><Filter className="w-5 h-5" /></div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest leading-none">Filtro Rápido Estado</span>
              <span className="text-slate-400 text-[8px] font-bold uppercase tracking-widest mt-1">Conformidade do Acervo</span>
            </div>
           </div>
           <div className="flex flex-wrap gap-2">
             <button type="button" onClick={() => setConditionFilter('all')} className={cn("px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all cursor-pointer", conditionFilter === 'all' ? "bg-slate-900 border-slate-900 text-white shadow-xl shadow-slate-900/15" : "bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-600")}>Todos ({allVisibleTotalFisico})</button>
             <button type="button" onClick={() => setConditionFilter('bom')} className={cn("px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border flex items-center gap-2.5 transition-all cursor-pointer", conditionFilter === 'bom' ? "bg-emerald-600 border-emerald-600 text-white shadow-xl" : "bg-emerald-50/50 border-emerald-100 hover:bg-emerald-50 text-emerald-600")}><span className={cn("w-2 h-2 rounded-full", conditionFilter === 'bom' ? "bg-white" : "bg-emerald-500")} />Bons ({allVisibleAssets.filter(a => a.condition === 'bom' || a.condition === 'novo').reduce((acc, a) => acc + (a.quantity || 1), 0)})</button>
             <button type="button" onClick={() => setConditionFilter('regular')} className={cn("px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border flex items-center gap-2.5 transition-all cursor-pointer", conditionFilter === 'regular' ? "bg-amber-500 border-amber-500 text-white shadow-xl" : "bg-amber-50/50 border-amber-100 hover:bg-amber-50 text-amber-600")}><span className={cn("w-2 h-2 rounded-full", conditionFilter === 'regular' ? "bg-white" : "bg-amber-500")} />Regulares/Ruins ({allVisibleAssets.filter(a => a.condition === 'regular' || a.condition === 'ruim').reduce((acc, a) => acc + (a.quantity || 1), 0)})</button>
             <button type="button" onClick={() => setConditionFilter('inservivel')} className={cn("px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border flex items-center gap-2.5 transition-all cursor-pointer", conditionFilter === 'inservivel' ? "bg-rose-500 border-rose-500 text-white shadow-xl" : "bg-rose-50/50 border-rose-100 hover:bg-rose-50 text-rose-600")}><span className={cn("w-2 h-2 rounded-full", conditionFilter === 'inservivel' ? "bg-white" : "bg-rose-500")} />Inservíveis ({allVisibleAssets.filter(a => a.condition === 'inservivel').reduce((acc, a) => acc + (a.quantity || 1), 0)})</button>
           </div>
         </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {displayedAssets?.map(asset => (
            <Card key={asset.id} className={cn("flex flex-col gap-6 group hover:shadow-2xl hover:-translate-y-1 transition-all duration-500 rounded-[2rem] p-8 border-slate-100 bg-white relative", isBatchMode && selectedAssetIds.includes(asset.id) && "ring-4 ring-amber-500 border-amber-200")}>
              {isBatchMode && (
                <div className="absolute top-6 left-6 z-10"><input type="checkbox" className="w-8 h-8 rounded-lg text-amber-600 focus:ring-amber-500 border-slate-300 transition-all cursor-pointer shadow-sm" checked={selectedAssetIds.includes(asset.id)} onChange={(e) => { if (e.target.checked) { setSelectedAssetIds(prev => [...prev, asset.id]); } else { setSelectedAssetIds(prev => prev.filter(id => id !== asset.id)); } }} /></div>
              )}
              <div className={cn("flex items-start justify-between", isBatchMode && "pl-10")}>
                <div className="flex flex-col gap-1 pr-12">
                  <h4 className="font-display font-extrabold text-xl text-slate-900 group-hover:text-indigo-600 transition-colors tracking-tight leading-tight">{asset.name}</h4>
                  <div className="flex flex-wrap items-center gap-3 mt-2">
                     <div className="flex items-center gap-2 px-2 py-1 bg-slate-50 border border-slate-100 rounded-lg"><span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Patr.</span><span className="text-xs text-slate-700 font-mono font-black">{asset.patrimonyNumber || 'N/A'}</span></div>
                     <div className="flex items-center gap-2 px-2 py-1 bg-slate-50 border border-slate-100 rounded-lg"><span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Qtd</span><span className="text-xs text-slate-700 font-black">{asset.quantity || 1}</span></div>
                     {hasSubLocations && locationNames[asset.inspectionId] && (<div className="flex items-center gap-2 px-2 py-1 bg-indigo-50 border border-indigo-100 rounded-lg"><Home className="w-3 h-3 text-indigo-400" /><span className="text-[9px] text-indigo-600 font-black uppercase tracking-widest">{locationNames[asset.inspectionId]}</span></div>)}
                  </div>
                </div>
                <div className={cn("px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all", asset.condition === 'bom' ? "bg-emerald-50 text-emerald-600 border-emerald-100 shadow-sm" : asset.condition === 'regular' ? "bg-amber-50 text-amber-600 border-amber-100 shadow-sm" : "bg-rose-50 text-rose-600 border-rose-100 shadow-sm")}>{asset.condition || 'Não Inf.'}</div>
              </div>
              <div className="h-px bg-slate-50" />
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <p className="text-sm text-slate-500 font-medium leading-relaxed flex-1">{asset.observations || "Sem detalhes adicionais registrados."}</p>
                <div className="flex flex-col gap-4">
                  <div className="flex -space-x-3 justify-end">
                    {(asset.photos && asset.photos.length > 0) ? (
                      asset.photos.map((photo, i) => (<div key={i} className="w-14 h-14 rounded-2xl bg-white border-2 border-slate-50 flex items-center justify-center overflow-hidden shadow-lg transform hover:scale-110 hover:z-30 transition-all cursor-pointer" onClick={() => setPreviewPhoto(photo)}><img src={photo} alt="" className="w-full h-full object-cover hover:opacity-80 transition-all" /></div>))
                    ) : (<div className="w-14 h-14 rounded-2xl bg-slate-50 border-2 border-white flex items-center justify-center shadow-sm"><ImageIcon className="w-5 h-5 text-slate-300" /></div>)}
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    {isBatchMode ? ( <div className="h-11 flex items-center"><span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Em Seleção</span></div> ) : (
                      <>
                        <button onClick={() => loadHistory(asset)} className="p-3 bg-white text-slate-400 hover:text-indigo-600 rounded-2xl border border-slate-100 hover:border-indigo-100 shadow-sm transition-all" title="Histórico"><History className="w-5 h-5" /></button>
                        {!isLocked && (
                          <>
                            <button onClick={() => handleCloneAsset(asset)} className="p-3 bg-white text-slate-400 hover:text-emerald-600 rounded-2xl border border-slate-100 hover:border-emerald-100 shadow-sm transition-all" title="Clonagem Rápida (Zero Digitação)"><Copy className="w-5 h-5" /></button>
                            <button onClick={() => handleEditAsset(asset)} className="p-3 bg-white text-slate-400 hover:text-blue-600 rounded-2xl border border-slate-100 hover:border-blue-100 shadow-sm transition-all"><Edit2 className="w-5 h-5" /></button>
                            <button onClick={() => setConfirmDeleteId(asset.id)} className="p-3 bg-white text-slate-400 hover:text-rose-600 rounded-2xl border border-slate-100 hover:border-rose-100 shadow-sm transition-all"><Trash2 className="w-5 h-5" /></button>
                            {isCommittee && (<button onClick={() => setTransferAssetId(asset.id)} className="p-3 bg-white text-slate-400 hover:text-amber-600 rounded-2xl border border-slate-100 hover:border-amber-100 shadow-sm transition-all" title="Transferir Item"><ArrowRightLeft className="w-5 h-5" /></button>)}
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
          {filteredAssets && filteredAssets.length > (displayedAssets?.length || 0) && !searchTermAssets && (
             <div className="col-span-full pt-4"><button onClick={() => setDisplayLimit(prev => prev + 20)} className="w-full py-6 bg-slate-50 hover:bg-slate-100 text-slate-500 font-bold uppercase tracking-[0.2em] text-[10px] rounded-[2rem] border-2 border-dashed border-slate-200 transition-all flex flex-col items-center gap-2">Carregar mais itens<span className="text-[10px] opacity-40 font-black">({totalFisicoItens} totais)</span></button></div>
          )}
          {assets?.length === 0 && !isAdding && (
             <div className="col-span-full py-16 px-8 lg:py-24 lg:px-16 flex flex-col items-center justify-center border-2 border-dashed border-slate-100 rounded-[3.5rem] bg-slate-50/20 group animate-in fade-in duration-1000">
                <div className="max-w-2xl w-full flex flex-col items-center gap-10">
                  <div className="flex flex-col items-center text-center gap-4">
                    <div className="w-20 h-20 bg-indigo-600 rounded-[2rem] flex items-center justify-center shadow-2xl shadow-indigo-600/20 mb-2 transform group-hover:scale-110 group-hover:rotate-6 transition-all duration-700"><ShieldCheck className="w-10 h-10 text-white" /></div>
                    <h3 className="font-display font-black text-3xl lg:text-4xl text-slate-900 tracking-tight leading-tight">Pronto para iniciar a auditoria?</h3>
                    <p className="text-slate-500 font-medium text-lg leading-relaxed">Siga os passos abaixo para catalogar os bens deste ambiente com precisão.</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
                    {[ { icon: Plus, title: "Adicionar Item", desc: "Toque no botão e descreva o objeto." }, { icon: Database, title: "Identificar", desc: "Informe a etiqueta e o estado do bem." }, { icon: Camera, title: "Fotografar", desc: "Registre avarias ou faltas de peças." } ].map((step, idx) => (
                      <div key={idx} className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col items-center text-center gap-4 hover:shadow-xl hover:border-indigo-100 transition-all duration-500"><div className="w-12 h-12 bg-slate-50 text-indigo-600 rounded-2xl flex items-center justify-center"><step.icon className="w-6 h-6" /></div><div className="flex flex-col gap-1"><h4 className="font-black text-[10px] uppercase tracking-widest text-slate-900">{step.title}</h4><p className="text-xs text-slate-400 font-medium leading-relaxed">{step.desc}</p></div></div>
                    ))}
                  </div>
                  <Button variant="accent" size="lg" onClick={() => setIsAdding(true)} className="w-full max-w-sm h-20 rounded-[1.5rem] font-display font-black text-lg lg:text-xl uppercase tracking-[0.2em] shadow-2xl shadow-indigo-600/30 hover:scale-[1.02] transition-all">COMEÇAR AGORA</Button>
                </div>
             </div>
          )}
        </div>
      </div>

      {/* Footer Controls */}
      <div className="mt-16 flex flex-col gap-6 max-w-xl mx-auto w-full">
        {!isFinalized && (
          <>
            {inspection.status === 'em_andamento' ? (
              <div className="flex flex-col gap-4">
                {(assets?.length || 0) === 0 && (
                  <div className="bg-amber-50 border border-amber-100 p-6 rounded-[1.5rem] flex items-center gap-4 text-amber-700 animate-in slide-in-from-bottom-4 duration-500 shadow-xl shadow-amber-900/5"><AlertCircle className="w-6 h-6 shrink-0" /><p className="text-xs font-bold uppercase tracking-widest leading-relaxed">Adicione ao menos um item válido para habilitar a conclusão da vistoria.</p></div>
                )}
                <div className="flex flex-col gap-3">
                  <Button disabled={(assets?.length || 0) === 0} className={cn("h-24 text-xl font-display font-black uppercase tracking-[0.2em] shadow-[0_30px_60px_-15px_rgba(79,70,229,0.3)] rounded-[2rem] transition-all duration-700", (assets?.length || 0) === 0 ? "bg-slate-100 text-slate-400 border-slate-200 grayscale shadow-none" : "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/30 hover:scale-[1.02]")} icon={Signature} onClick={() => setIsSignOffModalOpen(true)}>Encerrar Vistoria do Setor</Button>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mt-2"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-relaxed text-center">Ao encerrar, o responsável pelo setor assinará o Termo de Responsabilidade digitalmente.</p></div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {(user?.role === 'prefeito' || user?.role === 'responsavel' || user?.role === 'administrador') && (
                  <div className="flex flex-col gap-3">
                    <Button className={cn("h-24 text-xl font-display font-black uppercase tracking-[0.2em] shadow-[10px_30px_80px_-20px_rgba(99,102,241,0.4)] rounded-[2rem] transition-all duration-700 animate-pulse", isConfirmingFinalize ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20 animate-none ring-8 ring-emerald-500/10" : "bg-slate-900 border-none hover:scale-[1.02]")} icon={isConfirmingFinalize ? ShieldCheck : Save} onClick={handleFinalize} loading={isFinalizing}>{isConfirmingFinalize ? "Protocolar Homologação?" : "Homologar Dossiê"}</Button>
                    {isConfirmingFinalize && (<button onClick={() => setIsConfirmingFinalize(false)} className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-rose-500 transition-colors py-2">Manter apenas Concluída</button>)}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {(isConcluded || isFinalized) && isManager && (
          <div className="flex flex-col gap-3">
            <Button variant="outline" className={cn("h-16 font-bold uppercase tracking-widest rounded-2xl transition-all duration-500 bg-white border-2", isConfirmingReopen ? "bg-rose-50 border-rose-600 text-rose-600 ring-4 ring-rose-500/5 text-[10px]" : "border-slate-100 text-slate-900 text-[10px]")} icon={isConfirmingReopen ? AlertCircle : History} onClick={handleReopen} loading={isReopening}>{isConfirmingReopen ? "Reabrir para Novas Vistorias?" : "Reabrir Edição do Inventário"}</Button>
            {isConfirmingReopen && (<button onClick={() => setIsConfirmingReopen(false)} className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors py-1">Cancelar</button>)}
          </div>
        )}

        {!isFinalized && (<p className="text-[10px] font-bold text-center text-slate-400 uppercase tracking-widest px-12 leading-relaxed opacity-60">O encerramento imobiliza os registros locais. A homologação autentica o dossiê perante o controle interno municipal.</p>)}
      </div>

      {transferAssetId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-10">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setTransferAssetId(null)} />
          <Card className="w-full max-w-lg flex flex-col p-8 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 rounded-[3rem] border-none bg-white relative z-10 text-slate-900">
             <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4"><div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center"><ArrowRightLeft className="w-6 h-6 text-indigo-600" /></div><div className="flex flex-col"><h3 className="font-black text-xl uppercase tracking-tight">Transferir Item</h3><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mt-1">Mudar de localização</span></div></div>
                <button onClick={() => setTransferAssetId(null)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors"><X className="w-6 h-6 text-slate-400" /></button>
             </div>
             
             <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                {childLocations.length > 0 && (
                  <>
                    <p className="text-[10px] font-black text-indigo-500 mt-2 uppercase tracking-widest flex items-center gap-2">
                      <Home className="w-3 h-3" /> Ambientes Filhos (Deste Setor)
                    </p>
                    {childLocations.map(loc => (
                      <button key={loc.id} onClick={() => handleTransfer(loc.id)} disabled={isTransferring} className="flex flex-col p-4 bg-indigo-50 border border-indigo-100 rounded-2xl hover:bg-indigo-600 hover:text-white group transition-all text-left">
                         <span className="font-black text-sm uppercase tracking-tight transition-colors">{loc.name}</span>
                         <span className="text-[10px] text-indigo-400 group-hover:text-indigo-200 transition-colors mt-1">{loc.description || 'Sem descrição'}</span>
                      </button>
                    ))}
                    <div className="h-px bg-slate-100 my-2" />
                  </>
                )}

                <p className="text-[10px] font-black text-slate-400 mt-2 uppercase tracking-widest">Outros Locais e Secretarias</p>
                {otherLocations.length === 0 && <span className="text-xs text-slate-400 italic">Nenhum outro local cadastrado.</span>}
                {otherLocations.map(loc => (
                  <button key={loc.id} onClick={() => handleTransfer(loc.id)} disabled={isTransferring} className="flex flex-col p-4 bg-slate-50 border border-slate-100 rounded-2xl hover:bg-slate-900 hover:text-white group transition-all text-left">
                     <span className="font-black text-sm uppercase tracking-tight transition-colors">{loc.name}</span>
                     <span className="text-[10px] text-slate-400 group-hover:text-slate-500 transition-colors mt-1">{loc.description || 'Sem descrição'}</span>
                  </button>
                ))}
             </div>
             {isTransferring && (<div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center rounded-[3rem]"><div className="flex flex-col items-center gap-3"><div className="w-10 h-10 border-4 border-slate-900 border-t-transparent rounded-full animate-spin"></div><span className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em]">Processando...</span></div></div>)}
          </Card>
        </div>
      )}

      {historyAsset && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 md:p-10">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setHistoryAsset(null)} />
          <Card className="w-full max-w-2xl flex flex-col p-8 md:p-10 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 rounded-[3rem] border-none bg-white relative z-10 text-slate-900 max-h-[90vh]">
            <div className="flex items-center justify-between mb-8 pb-6 border-b border-slate-100">
               <div className="flex items-center gap-4"><div className="w-14 h-14 bg-emerald-100 rounded-[1.5rem] flex items-center justify-center border border-emerald-200"><History className="w-7 h-7 text-emerald-600" /></div><div className="flex flex-col"><h3 className="font-black text-2xl uppercase tracking-tight text-slate-900 leading-none">Histórico</h3><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mt-2">{historyAsset.name} {historyAsset.patrimonyNumber ? `(Nº ${historyAsset.patrimonyNumber})` : ''}</span></div></div>
               <button onClick={() => setHistoryAsset(null)} className="p-3 hover:bg-slate-100 rounded-2xl transition-colors border border-transparent hover:border-slate-200"><X className="w-6 h-6 text-slate-400" /></button>
            </div>
            <div className="flex flex-col gap-4 overflow-y-auto custom-scrollbar flex-1 pr-2">
               {isLoadingHistory ? (<div className="py-20 flex flex-col items-center justify-center"><div className="w-8 h-8 border-4 border-slate-200 border-t-emerald-500 rounded-full animate-spin"></div><span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-4">Carregando histórico...</span></div>) : !assetHistory || assetHistory.length === 0 ? (<div className="py-20 flex flex-col items-center justify-center text-slate-300"><History className="w-12 h-12 opacity-20 mb-4" /><p className="font-bold tracking-widest text-xs uppercase text-slate-400">Nenhum registro anterior encontrado</p></div>) : (
                 <div className="relative border-l-2 border-slate-100 ml-4 py-2 space-y-8">
                   {assetHistory.map((entry, idx) => (
                     <div key={idx} className="relative pl-6">
                       <div className="absolute -left-[9px] top-1 w-4 h-4 bg-white border-2 border-slate-300 rounded-full z-10"></div>
                       <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 self-start px-2 py-0.5 rounded-lg mb-1">{formatDate(entry.inspection.date)}</span>
                          <h4 className="font-black text-base text-slate-900 tracking-tight leading-tight">{entry.location.name}</h4>
                          <span className="text-sm font-semibold text-slate-500">Condição: <span className="uppercase text-slate-700">{entry.asset.condition}</span></span>
                          {(entry.asset.quantity && entry.asset.quantity > 1) ? (<span className="text-xs font-semibold text-slate-400">Qtd: {entry.asset.quantity}</span>) : null}
                          {entry.asset.observations && (<p className="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl mt-2 border border-slate-100 italic">"{entry.asset.observations}"</p>)}
                       </div>
                     </div>
                   ))}
                 </div>
               )}
            </div>
          </Card>
        </div>
      )}

      {isSignOffModalOpen && (
        <SectorInspectionSignOffModal isOpen={isSignOffModalOpen} onClose={() => setIsSignOffModalOpen(false)} inspection={inspection} location={location} assets={assets || []} onComplete={async () => { setIsSignOffModalOpen(false); await handleConclude(true); }} />
      )}

      {previewPhoto && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 md:p-10" onClick={() => setPreviewPhoto(null)}>
          <div className="absolute inset-0 bg-slate-900/95 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-4xl flex items-center justify-center">
            <button onClick={(e) => { e.stopPropagation(); setPreviewPhoto(null); }} className="absolute -top-12 right-0 md:-right-12 p-2 bg-white/10 hover:bg-rose-500 text-white rounded-full transition-colors"><X className="w-6 h-6" /></button>
            <img src={previewPhoto} alt="Visualização ampliada" className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl" onClick={e => e.stopPropagation()} />
          </div>
        </div>
      )}
    </div>
  );
}

function Building2(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>
    </svg>
  );
}