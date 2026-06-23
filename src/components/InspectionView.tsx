import React, { useState, useRef } from 'react';
import { Card, Button, Input, Select, Textarea } from './UI';
import { useOnlineStatus } from '../lib/hooks';
import { ArrowLeft, Plus, Image as ImageIcon, Trash2, Camera, UserPlus, Save, CheckCircle2, History, Eye, PlayCircle, ArrowRight, X, Edit2, Search, ShieldCheck, AlertCircle, Home, ChevronLeft, ChevronRight, Zap, Copy, Database, Signature, Mic, Filter } from 'lucide-react';
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
import { db as firestore, auth } from '../lib/firebase';
import { doc, deleteDoc, collection, query, where, getDocs } from 'firebase/firestore';
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
  
  const filteredAssets = allVisibleAssets.filter(asset => 
    ((asset.name || '').toLowerCase().includes(searchTermAssets.toLowerCase()) || 
    (asset.patrimonyNumber || '').toLowerCase().includes(searchTermAssets.toLowerCase())) &&
    (conditionFilter === 'all' || 
     (conditionFilter === 'bom' && (asset.condition === 'bom' || asset.condition === 'novo')) ||
     (conditionFilter === 'regular' && (asset.condition === 'regular' || asset.condition === 'ruim')) ||
     (conditionFilter === 'inservivel' && asset.condition === 'inservivel') ||
     (asset.condition === conditionFilter))
  );

  const displayedAssets = searchTermAssets 
    ? filteredAssets 
    : filteredAssets?.slice(0, displayLimit);

  const unsyncedAssetsCount = assets?.filter(a => a.needsSync === 1 || a.needsSync === true as any).length || 0;

  React.useEffect(() => {
    const fetchSignature = async () => {
      if (!id || !isOnline) return;

      const isPublic = inspection?.status === 'finalizada';
      const isAuthenticated = !!auth.currentUser;

      if (!isPublic && !isAuthenticated) return;

      try {
        const sigDoc = await getDocs(query(collection(firestore, 'sector_inspections'), where('inspectionId', '==', id)));
        if (!sigDoc.empty) {
          const data = sigDoc.docs[0].data();
          setSectorSignature({
            responsibleName: data.responsibleName,
            signatureBase64: data.signatureBase64,
            signedAt: data.signedAt
          });
        }
      } catch (err: any) {
        if (err.message?.includes('permissions')) {
          console.info("Assinatura restrita: Aguardando homologação do dossiê.");
        } else {
          console.warn("Falha ao recuperar assinatura:", err);
        }
      }
    };
    fetchSignature();
  }, [id, isOnline, inspection?.status]);

  const fileInputRef = useRef<HTMLInputElement>(null);
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
    if (!newItem.name || !user || isLocked) return;

    const hash = generateAssetHash(newItem.name, newItem.patrimonyNumber, inspection?.locationId || '');
    
    if (transferCandidate && !editingAssetId) {
      try {
        const confirmTransfer = window.confirm(`Deseja TRANSFERIR o patrimônio ${transferCandidate.patrimonyNumber} para esta localização? ele será removido do local original.`);
        if (confirmTransfer) {
          await db.assets.update(transferCandidate.id, {
            inspectionId: id,
            hash: hash,
            needsSync: 1,
            condition: newItem.condition,
            observations: newItem.observations,
            quantity: newItem.quantity
          });
          setNewItem({ name: '', patrimonyNumber: '', condition: 'bom', observations: '', photos: [], quantity: 1 });
          setIsAdding(false);
          setTransferCandidate(null);
          toast("Item transferido com sucesso!", "success", "Transferência");
          pushLocalChanges();
          return;
        }
      } catch (err) {
        console.error("Erro na transferência:", err);
        toast("Não foi possível transferir o item.", "error");
        setError("Não foi possível transferir o item.");
      }
    }

    if (!editingAssetId) {
      if (newItem.patrimonyNumber) {
        let globalExisting = await db.assets.where('patrimonyNumber').equals(newItem.patrimonyNumber).first();
        
        if (!globalExisting && isOnline) {
          try {
            const q = query(collection(firestore, 'assets'), where('patrimonyNumber', '==', newItem.patrimonyNumber));
            const snap = await getDocs(q);
            if (!snap.empty) {
               globalExisting = snap.docs[0].data() as Asset;
            }
          } catch(e) { console.warn('Offline, skipping remote patrimony check'); }
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
             const q = query(collection(firestore, 'assets'), where('hash', '==', hash));
             const snap = await getDocs(q);
             if (!snap.empty) {
                existingHash = snap.docs[0].data() as Asset;
             }
          } catch(e) { console.warn('Offline, skipping remote hash check'); }
        }

        if (existingHash) {
          setDuplicateWarning("Este item já está cadastrado nesta sala. Edite o registro existente para alterar a quantidade.");
          return;
        }
      }
    }

    if (editingAssetId) {
      await db.assets.update(editingAssetId, {
        name: newItem.name,
        patrimonyNumber: newItem.patrimonyNumber,
        condition: newItem.condition,
        observations: newItem.observations,
        photos: newItem.photos,
        hash: hash,
        needsSync: 1,
        quantity: newItem.quantity
      });
      toast("Registro atualizado!", "success", "Item Editado");
    } else {
      const assetId = generateId();
      await db.assets.add({
        id: assetId,
        inspectionId: id,
        name: newItem.name,
        patrimonyNumber: newItem.patrimonyNumber,
        condition: newItem.condition,
        photos: newItem.photos, 
        observations: newItem.observations,
        createdBy: user.userId,
        createdAt: Date.now(),
        hash: hash,
        needsSync: 1,
        quantity: newItem.quantity
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
    setTimeout(() => {
      setIsAdding(true);
    }, 150);
  };

  const handleDeleteAsset = async (assetId: string) => {
    if (!isCommittee) {
      setError("Apenas membros da comissão podem excluir itens registrados.");
      return;
    }
    if (confirmDeleteId !== assetId) {
      setConfirmDeleteId(assetId);
      return;
    }

    try {
      await db.assets.update(assetId, { 
        deleted: true, 
        needsSync: 1, 
        updatedAt: Date.now() 
      });
      setConfirmDeleteId(null);
      pushLocalChanges();
    } catch (err: any) {
      console.error("Erro ao deletar item:", err);
      setError("Não foi possível excluir o item.");
    }
  };

  const handleEditAsset = (asset: Asset) => {
    setNewItem({
      name: asset.name,
      patrimonyNumber: asset.patrimonyNumber || '',
      condition: asset.condition,
      observations: asset.observations,
      photos: asset.photos || [],
      quantity: asset.quantity || 1
    });
    setEditingAssetId(asset.id);
    setIsAdding(true);
  };

  const handleCloneAsset = (asset: Asset) => {
    setNewItem({
      name: asset.name,
      patrimonyNumber: '',
      condition: asset.condition,
      observations: asset.observations,
      photos: asset.photos || [],
      quantity: 1
    });
    setEditingAssetId(null);
    setIsAdding(true);
  };

  const handleVoiceDictation = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Seu navegador não suporta digitação por voz.');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    setIsListening(true);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setNewItem(prev => ({ 
        ...prev, 
        observations: prev.observations ? prev.observations + ' ' + transcript : transcript 
      }));
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
        return {
          asset: a,
          inspection: insp,
          location: loc
        }
      }));

      const validHistory = historyData.filter(h => h !== null).sort((a, b) => b!.inspection.date - a!.inspection.date);
      setAssetHistory(validHistory as any);
    } catch(e) {
      console.error(e);
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
          setNewItem(prev => ({
            ...prev,
            photos: [...prev.photos, compressedBase64].slice(-4)
          }));
        } catch (err) {
          console.error("Erro ao processar imagem:", err);
          setError("Falha ao otimizar foto.");
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removePhoto = (index: number) => {
    setNewItem(prev => ({
      ...prev,
      photos: prev.photos.filter((_, i) => i !== index)
    }));
  };

  const handleConclude = async (force: boolean = false) => {
    if (!id || isConcluding) return;
    
    if (!isConfirmingConclude && !force) {
      setIsConfirmingConclude(true);
      return;
    }

    setIsConcluding(true);
    setError(null);
    console.log("Tentando concluir vistoria ID:", id);
    
    try {
      const assetsCount = await db.assets.where('inspectionId').equals(id).count();
      if (assetsCount === 0) {
        throw new Error("Não é possível concluir uma vistoria sem itens registrados.");
      }

      const current = await db.inspections.get(id);
      if (!current) {
        throw new Error(`Vistoria ${id} não encontrada no banco local.`);
      }

      await db.inspections.put({
        ...current,
        status: 'concluida',
        concludedBy: user?.userId,
        concludedAt: Date.now(),
        needsSync: 1
      });
      
      console.log("Status atualizado para 'concluida'.");
      
      await syncInspection(id);
      await pushLocalChanges();
      
      await new Promise(resolve => setTimeout(resolve, 400));
      setIsConfirmingConclude(false);
      
    } catch (err: any) {
      console.error("Erro crítico ao concluir:", err);
      setError(`Erro técnico: ${err.message || 'Falha na gravação'}`);
    } finally {
      setIsConcluding(false);
    }
  };

  const handleFinalize = async () => {
    if (!user || (user.role !== 'prefeito' && user.role !== 'responsavel' && user.role !== 'administrador')) {
      setError("Apenas o Prefeito, Responsável ou Administrador podem homologar vistorias.");
      return;
    }

    if (!id || isFinalizing) return;

    if (!isConfirmingFinalize) {
      setIsConfirmingFinalize(true);
      setError(null);
      return;
    }

    setIsFinalizing(true);
    setError(null);
    console.log("Iniciando homologação da vistoria:", id);

    try {
      const current = await db.inspections.get(id);
      if (!current) throw new Error("Vistoria não encontrada.");

      const qrCodeDataPayload = `https://patrimonio360-75ade.web.app/vistoria/${id}`;

      await db.inspections.put({
        ...current,
        status: 'finalizada',
        finalizedBy: user.userId,
        finalizedAt: Date.now(),
        qrCodeData: qrCodeDataPayload,
        needsSync: 1
      });
      
      const assets = await db.assets.where('inspectionId').equals(id).toArray();
      for (const asset of assets) {
        await db.assets.update(asset.id, { isPublic: true, needsSync: 1 });
      }
      
      await syncInspection(id);
      await pushLocalChanges();
      
      generatePDF();
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
    if (!isManager) {
      setError("Apenas administradores podem reabrir vistorias concluídas.");
      return;
    }
    if (!id || isReopening) return;

    if (!isConfirmingReopen) {
      setIsConfirmingReopen(true);
      setError(null);
      return;
    }

    setIsReopening(true);
    setError(null);
    console.log("Reabrindo vistoria:", id);

    try {
      const current = await db.inspections.get(id);
      if (!current) throw new Error("Vistoria não encontrada.");

      await db.inspections.put({
        ...current,
        status: 'em_andamento'
      });
      
      await new Promise(resolve => setTimeout(resolve, 400));
      setIsConfirmingReopen(false);
    } catch (err: any) {
      console.error("Erro ao reabrir vistoria:", err);
      setError(`Erro ao reabrir: ${err.message || 'Erro desconhecido'}`);
    } finally {
      setIsReopening(false);
    }
  };

  const handleDeleteInspection = async () => {
    if (!id || isDeletingInspection) return;
    
    if (!isConfirmingDeleteInspection) {
      setIsConfirmingDeleteInspection(true);
      setError(null);
      return;
    }

    setIsDeletingInspection(true);
    setError(null);
    try {
      const now = Date.now();
      const assetsToSoftDelete = await db.assets.where('inspectionId').equals(id).toArray();
      for (const asset of assetsToSoftDelete) {
        await db.assets.update(asset.id, { deleted: true, needsSync: 1, updatedAt: now });
      }

      await db.inspections.update(id, { deleted: true, needsSync: 1, updatedAt: now });
      
      console.log("Vistoria marcada para exclusão:", id);
      pushLocalChanges();
      onBack();
    } catch (err: any) {
      console.error("Erro ao excluir vistoria:", err);
      setError(`Erro ao excluir: ${err.message || 'Falha no banco de dados'}`);
    } finally {
      setIsDeletingInspection(false);
      setIsConfirmingDeleteInspection(false);
    }
  };

  const handleTransfer = async (targetLocationId: string) => {
    if (!transferAssetId || isTransferring || !user) return;
    setIsTransferring(true);
    try {
      let idsToTransfer: string[] = [];
      
      if (transferAssetId === 'batch') {
        idsToTransfer = selectedAssetIds;
      } else if (transferAssetId === 'all') {
        idsToTransfer = assets?.map(a => a.id) || [];
      } else {
        idsToTransfer = [transferAssetId];
      }
      
      if (idsToTransfer.length === 0) throw new Error("Nenhum item para transferir");

      let targetInspection = await db.inspections
        .where({ locationId: targetLocationId })
        .filter(i => i.status === 'em_andamento')
        .reverse()
        .first();

      if (!targetInspection) {
        const newId = generateId();
        await db.inspections.add({
          id: newId,
          locationId: targetLocationId,
          date: Date.now(),
          participants: [],
          status: 'em_andamento'
        });
        targetInspection = await db.inspections.get(newId);
      }

      if (!targetInspection) throw new Error("Falha ao preparar destino");

      for (const assetId of idsToTransfer) {
        const asset = await db.assets.get(assetId);
        if (!asset) continue;

        const newHash = generateAssetHash(asset.name, asset.patrimonyNumber, targetLocationId);
        
        const existingInTarget = await db.assets.where('hash').equals(newHash).first();
        if (existingInTarget) {
          console.warn(`Item ${asset.name} já existe no destino, pulando...`);
          continue;
        }

        await db.assets.update(assetId, {
          inspectionId: targetInspection.id,
          hash: newHash,
          needsSync: 1,
          updatedAt: Date.now()
        });
      }

      setSuccessMessage(`${idsToTransfer.length} item(ns) transferido(s) para ${allLocations?.find(l => l.id === targetLocationId)?.name}`);
      setTransferAssetId(null);
      setIsBatchMode(false);
      setSelectedAssetIds([]);
    } catch (err: any) {
      console.error("Erro na transferência:", err);
      setError(err.message || "Erro ao transferir item");
    } finally {
      setIsTransferring(false);
    }
  };

  // --- GERADOR DE PDF ELEGANTE E CORRIGIDO ---
  const generatePDF = async () => {
    try {
      setError(null);
      const doc = new jsPDF();
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('Relatório de Vistoria Patrimonial', 14, 22);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Local Inspecionado: ${location?.name}`, 14, 32);
      
      const getTimestampMs = (val: any) => {
        if (!val) return 0;
        if (typeof val === 'number') return val;
        if (typeof val.toMillis === 'function') return val.toMillis();
        if (val.seconds) return val.seconds * 1000;
        const parsed = new Date(val).getTime();
        return isNaN(parsed) ? 0 : parsed;
      };

      const finalDateToShow = getTimestampMs(inspection?.finalizedAt || inspection?.updatedAt || inspection?.date);
      doc.text(`Data de Emissão: ${formatDate(finalDateToShow)}`, 14, 38);
      
      if (inspection?.concludedBy) {
        doc.text(`Vistoriador Responsável: ${inspection.concludedBy === user?.userId ? user?.name : 'Identificado no Sistema'}`, 14, 44);
      } else {
        doc.text(`Vistoriador Responsável: ${user?.name}`, 14, 44);
      }
      
      if (inspection?.status === 'finalizada') {
        doc.text(`Homologado por: ${inspection.finalizedBy === user?.userId ? user?.name : 'Autoridade Municipal'}`, 14, 50);
      }

      // SOMA REAL DAS QUANTIDADES PARA O PDF
      const totalUnidadesAbsolutas = assets?.reduce((acc, curr) => acc + (Number(curr.quantity) || 1), 0) || 0;
      const totalTiposDiferentes = assets?.length || 0;

      // Painel Elegante
      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(14, 56, 182, 14, 3, 3, 'FD');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(`RESUMO DO INVENTÁRIO:`, 18, 65);
      
      doc.setFont('helvetica', 'normal');
      doc.text(`Total de Bens Catalogados: ${totalUnidadesAbsolutas} unidade(s) físicas`, 68, 65);
      
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(`(${totalTiposDiferentes} registros distintos)`, 148, 65);
      doc.setTextColor(0);

      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text('Este documento contém um QR Code DINÂMICO. A leitura em tempo real sempre exibirá a versão mais atualizada.', 14, 76);
      doc.setTextColor(0);

      const tableData = assets?.map(a => [
        a.name,
        a.patrimonyNumber || '-',
        a.condition,
        `${a.quantity || 1} u.`,
        a.observations || '-'
      ]);

      autoTable(doc, {
        head: [['Item', 'Patrimônio', 'Estado', 'Qtd', 'Obs']],
        body: tableData,
        startY: 84,
        theme: 'grid',
        headStyles: { fillColor: [15, 23, 42], fontStyle: 'bold' }
      });

      let finalY = (doc as any).lastAutoTable.finalY + 15;
      
      if (finalY > 220) {
        doc.addPage();
        finalY = 25;
      }

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('SELO PERMANENTE DE TRANSPARÊNCIA:', 14, finalY);
      
      const qrSvg = document.querySelector('#qr-code-dynamic svg');
      if (qrSvg) {
        const svgData = new XMLSerializer().serializeToString(qrSvg);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
        
        await new Promise((resolve) => {
          img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx?.drawImage(img, 0, 0);
            doc.addImage(canvas.toDataURL('image/png'), 'PNG', 14, finalY + 5, 38, 38);
            resolve(null);
          };
        });
      }

      if (sectorSignature) {
        doc.setLineWidth(0.5);
        doc.setDrawColor(0, 0, 0);
        doc.line(110, finalY + 25, 190, finalY + 25);
        
        doc.addImage(sectorSignature.signatureBase64, 'PNG', 125, finalY + 5, 50, 18);
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(sectorSignature.responsibleName.toUpperCase(), 150, finalY + 31, { align: 'center' });
        
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text('RESPONSÁVEL PELO SETOR (ATESTADO DE CIÊNCIA)', 150, finalY + 36, { align: 'center' });
      }

      try {
        doc.save(`Vistoria_${location?.name}_${new Date().toLocaleDateString()}.pdf`);
      } catch (saveErr) {
        console.warn("doc.save falhou, abrindo em nova aba:", saveErr);
        const blob = doc.output('blob');
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      }
    } catch (err: any) {
      console.error("Erro ao gerar PDF:", err);
      setError(`Erro ao gerar PDF: ${err.message || 'Falha desconhecida'}`);
    }
  };

  const handlePrintQRCode = (type: 'vistoria' | 'local' = 'local') => {
    try {
      const qrData = type === 'local' 
        ? `https://patrimonio360-75ade.web.app/local/${location?.id}`
        : inspection?.qrCodeData;

      if (!qrData) return;

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        setError("O navegador bloqueou a janela de impressão. Por favor, permita popups.");
        return;
      }

      const qrSvg = document.querySelector(type === 'local' ? '#qr-code-dynamic svg' : '#qr-code-container svg')?.outerHTML || '';
      
      printWindow.document.write(`
        <html>
          <head>
            <title>QR Code ${type === 'local' ? 'Permanente' : 'Vistoria'} - ${location?.name}</title>
            <style>
              body { font-family: sans-serif; display: flex; flex-direction: column; items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; background: #f8fafc; }
              .card { border: 4px solid #1e293b; padding: 50px; border-radius: 40px; background: white; box-shadow: 0 20px 50px rgba(0,0,0,0.1); max-width: 400px; }
              .gov-header { font-size: 10px; font-weight: 900; color: #64748b; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 20px; }
              h1 { margin: 10px 0; font-size: 28px; color: #0f172a; font-weight: 900; }
              .qr { margin: 30px 0; padding: 20px; background: white; border: 1px solid #e2e8f0; border-radius: 20px; }
              .type-badge { background: ${type === 'local' ? '#4f46e5' : '#10b981'}; color: white; padding: 6px 12px; rounded: 20px; font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; border-radius: 10px; margin-bottom: 15px; display: inline-block; }
              .footer-text { font-size: 11px; color: #94a3b8; font-weight: bold; margin-top: 10px; }
              .dynamic-badge { color: #4f46e5; border: 1px solid #e0e7ff; background: #f5f3ff; padding: 8px; border-radius: 12px; font-size: 10px; margin-top: 15px; font-weight: bold; }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="gov-header">Patrimônio Público</div>
              <div class="type-badge">${type === 'local' ? 'Selo Permanente' : 'Selo de Vistoria'}</div>
              <h1>${location?.name}</h1>
              <div class="qr">${qrSvg}</div>
              <p class="footer-text">Controle Social de Bens Municipais</p>
              ${type === 'local' ? '<div class="dynamic-badge">Este código não expira e será atualizado em cada nova vistoria homologada.</div>' : ''}
              <p style="font-size: 8px; color: #cbd5e1; margin-top: 20px;">ID: ${type === 'local' ? location?.id : inspection?.id}</p>
            </div>
            <script>
              setTimeout(() => { window.print(); window.close(); }, 500);
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } catch (err: any) {
      console.error("Erro ao imprimir:", err);
      setError("Erro ao preparar a impressão do QR Code.");
    }
  };

  if (!inspection || !location) return null;

  const isFinalized = inspection.status === 'finalizada';
  const isConcluded = inspection.status === 'concluida';
  const isLocked = isFinalized || (isConcluded && !isCommittee) || hasSubLocations; 

  const handleStartSubInspection = async (subLocId: string) => {
    const existing = await db.inspections.where({ locationId: subLocId }).filter(i => !i.deleted && i.status !== 'finalizada').first();
    if (existing) {
       onBack(); 
    }
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
          console.log("Vistoria vazia marcada para exclusão ao voltar.");
        }
      }
    }
    onBack();
  };

  return (
    <div className="flex flex-col gap-10 animate-in fade-in slide-in-from-right-4 duration-700 pb-24">
      {error && (
        <div className="bg-rose-50 border border-rose-100 p-5 rounded-[1.5rem] flex items-center gap-4 text-rose-600 animate-in slide-in-from-top-4 duration-500 shadow-xl shadow-rose-500/5">
           <AlertCircle className="w-6 h-6 shrink-0" />
           <p className="text-xs font-bold uppercase tracking-widest flex-1">{error}</p>
           <button onClick={() => setError(null)} className="p-2 hover:bg-rose-100 rounded-xl transition-colors">
              <X className="w-5 h-5" />
           </button>
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
          <button 
            onClick={handleBack} 
            className="flex items-center gap-2 text-slate-400 font-bold text-[10px] uppercase tracking-widest hover:text-slate-900 transition-all group w-fit"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" /> Voltar ao Painel
          </button>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <h2 className="text-3xl lg:text-4xl font-display font-extrabold text-slate-900 tracking-tight leading-none truncate">
                {location.name}
              </h2>
              <div className={cn(
                "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.2em] shadow-sm",
                isFinalized ? "bg-emerald-100 text-emerald-700" : isConcluded ? "bg-indigo-100 text-indigo-700" : "bg-blue-100 text-blue-700"
              )}>
                {isFinalized ? "Homologada" : isConcluded ? "Concluída" : "Em Aberto"}
              </div>
            </div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-widest mt-1">
              {location.description || "Auditoria Patrimonial Municipal"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!isLocked && isCommittee && (
            <div className="flex items-center">
              {isConfirmingDeleteInspection ? (
                <div className="flex items-center gap-2 bg-rose-50 border border-rose-100 p-1.5 rounded-2xl animate-in slide-in-from-right-4 duration-300">
                  <button 
                    onClick={handleDeleteInspection}
                    disabled={isDeletingInspection}
                    className="px-4 py-2 bg-rose-600 text-white rounded-xl shadow-lg shadow-rose-600/20 hover:bg-rose-700 transition-all font-black text-[10px] uppercase tracking-widest"
                  >
                    {isDeletingInspection ? "..." : "EXCLUIR"}
                  </button>
                  <button 
                    onClick={() => setIsConfirmingDeleteInspection(false)}
                    className="p-2 text-slate-400 hover:text-slate-900 rounded-xl transition-all"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => setIsConfirmingDeleteInspection(true)}
                  className="p-3 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-2xl transition-all"
                  title="Excluir Auditoria"
                >
                  <Trash2 className="w-6 h-6" />
                </button>
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
               <div className="w-16 h-16 bg-white/10 rounded-[2rem] flex items-center justify-center backdrop-blur-md border border-white/10 shadow-xl">
                  <Building2 className="w-8 h-8 text-white" />
               </div>
               <div className="flex flex