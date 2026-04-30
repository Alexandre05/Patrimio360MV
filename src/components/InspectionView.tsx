import React, { useState, useRef } from 'react';
import { Card, Button, Input, Select, Textarea } from './UI';
import { useOnlineStatus } from '../lib/hooks';
import { ArrowLeft, Plus, Image as ImageIcon, Trash2, Camera, UserPlus, Save, CheckCircle2, History, Eye, PlayCircle, ArrowRight, X, Edit2, Search, ShieldCheck, AlertCircle, Home, ChevronLeft, ChevronRight, Zap, Copy, Database, Signature } from 'lucide-react';
import { db, Asset, generateAssetHash, generateId, AssetCondition, InspectionStatus, Inspection, Location } from '../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../lib/AuthContext';
import { formatDate, cn } from '../lib/utils';
import { QRCodeSVG } from 'qrcode.react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { compressImage } from '../lib/image';
import { pushLocalChanges, syncInspection } from '../lib/syncService';
import { db as firestore } from '../lib/firebase';
import { doc, deleteDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { SectorInspectionSignOffModal } from './SectorInspectionSignOffModal';

export function InspectionView({ id, onBack }: { id: string, onBack: () => void }) {
  const { user } = useAuth();
  const isManager = user?.role === 'administrador' || user?.role === 'responsavel' || user?.role === 'prefeito';
  const isCommittee = isManager || user?.role === 'vistoriador';
  const isOnline = useOnlineStatus();
  const inspection = useLiveQuery(() => db.inspections.get(id), [id]);
  const location = useLiveQuery(() => inspection ? db.locations.get(inspection.locationId) : undefined, [inspection]);
  const assets = useLiveQuery(() => db.assets.where('inspectionId').equals(id).toArray(), [id]);
  
  const [searchTermAssets, setSearchTermAssets] = useState('');
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
  
  // Fetch signature data when inspection changes
  React.useEffect(() => {
    const fetchSignature = async () => {
      if (!id || !isOnline) return;
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
      } catch (err) {
        console.warn("Signature fetch failed:", err);
      }
    };
    fetchSignature();
  }, [id, isOnline]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const patrimonyRef = useRef<HTMLInputElement>(null);
  const conditionRef = useRef<HTMLSelectElement>(null);
  const obsRef = useRef<HTMLTextAreaElement>(null);

  const formRefs = [nameRef, patrimonyRef, conditionRef, obsRef];

  const navigateFields = (direction: 'next' | 'prev') => {
    const currentIndex = formRefs.findIndex(ref => ref.current === document.activeElement);
    if (direction === 'next') {
      const nextIndex = (currentIndex + 1) % formRefs.length;
      formRefs[nextIndex].current?.focus();
    } else {
      const prevIndex = (currentIndex - 1 + formRefs.length) % formRefs.length;
      formRefs[prevIndex].current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, fieldIndex: number) => {
    if (e.key === 'ArrowRight' && (e.currentTarget as any).selectionEnd === (e.currentTarget as any).value?.length) {
      navigateFields('next');
    } else if (e.key === 'ArrowLeft' && (e.currentTarget as any).selectionStart === 0) {
      navigateFields('prev');
    } else if (e.key === 'Enter' && e.currentTarget.tagName !== 'TEXTAREA') {
      e.preventDefault();
      if (fieldIndex === formRefs.length - 2) { // Before Observations (which is a textarea)
         obsRef.current?.focus();
      } else if (fieldIndex === formRefs.length - 1) { // Current is Observations or we hit enter on a select
         handleAddItem();
      } else {
         navigateFields('next');
      }
    }
  };

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState(false);

  React.useEffect(() => {
    const handleStart = () => { setIsSyncing(true); setSyncError(false); };
    const handleEnd = (e: any) => { 
      setIsSyncing(false); 
      if (!e.detail?.success) setSyncError(true);
    };

    window.addEventListener('app-sync-start', handleStart);
    window.addEventListener('app-sync-end', handleEnd);
    return () => {
      window.removeEventListener('app-sync-start', handleStart);
      window.removeEventListener('app-sync-end', handleEnd);
    };
  }, []);

  const unsyncedAssetsCount = assets?.filter(a => a.needsSync).length || 0;

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
    
    // Check if we are transferring an existing asset
    if (transferCandidate && !editingAssetId) {
      try {
        const confirmTransfer = window.confirm(`Deseja TRANSFERIR o patrimônio ${transferCandidate.patrimonyNumber} para esta localização? ele será removido do local original.`);
        if (confirmTransfer) {
          await db.assets.update(transferCandidate.id, {
            inspectionId: id,
            hash: hash,
            needsSync: true,
            // Optionally update with new details provided in the form
            condition: newItem.condition,
            observations: newItem.observations,
            quantity: newItem.quantity
          });
          setSuccessMessage("Item transferido com sucesso!");
          setNewItem({ name: '', patrimonyNumber: '', condition: 'bom', observations: '', photos: [], quantity: 1 });
          setIsAdding(false);
          setTransferCandidate(null);
          pushLocalChanges();
          return;
        }
      } catch (err) {
        console.error("Erro na transferência:", err);
        setError("Não foi possível transferir o item.");
      }
    }

    // Duplication Check (only for new items)
    if (!editingAssetId) {
      if (newItem.patrimonyNumber) {
        // GLOBAL Patrimony check
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
        // Local Check (same location, no patrimony)
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
        needsSync: true,
        quantity: newItem.quantity
      });
      setSuccessMessage("Salvado com sucesso!");
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
        needsSync: true,
        quantity: newItem.quantity
      });
      setSuccessMessage("Adicionado com sucesso!");
    }

    // Trigger sync
    pushLocalChanges();

    setNewItem({ name: '', patrimonyNumber: '', condition: 'bom', observations: '', photos: [], quantity: 1 });
    setIsAdding(false);
    setEditingAssetId(null);
    setDuplicateWarning(null);
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
      const assetToRemove = await db.assets.get(assetId);
      
      // Cleanup photos from Storage if they are URLs
      if (assetToRemove?.photos) {
        const { deleteAssetPhoto } = await import('../lib/storageService');
        for (const photoUrl of assetToRemove.photos) {
          if (photoUrl.startsWith('http')) {
            await deleteAssetPhoto(photoUrl);
          }
        }
      }

      await db.assets.delete(assetId);
      try { await deleteDoc(doc(firestore, 'assets', assetId)); } catch(e) {}
      setConfirmDeleteId(null);
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
          // COMPRESS to avoid storage quota issues (now using 1000px since we hit Storage, not Firestore)
          const compressedBase64 = await compressImage(rawBase64, 1000, 0.7);
          setNewItem(prev => ({
            ...prev,
            photos: [...prev.photos, compressedBase64].slice(-4) // Limit to 4 photos
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

  const handleConclude = async () => {
    if (!id || isConcluding) return;
    
    // First click: ask for confirmation in-UI
    if (!isConfirmingConclude) {
      setIsConfirmingConclude(true);
      return;
    }

    setIsConcluding(true);
    setError(null);
    console.log("Tentando concluir vistoria ID:", id);
    
    try {
      // 0. Safety check: must have assets
      const assetsCount = await db.assets.where('inspectionId').equals(id).count();
      if (assetsCount === 0) {
        throw new Error("Não é possível concluir uma vistoria sem itens registrados.");
      }

      // 1. Verify existence check
      const current = await db.inspections.get(id);
      if (!current) {
        throw new Error(`Vistoria ${id} não encontrada no banco local.`);
      }

      // 2. Perform update using the most robust method (put)
      await db.inspections.put({
        ...current,
        status: 'concluida',
        concludedBy: user?.userId,
        concludedAt: Date.now()
      });
      
      console.log("Status atualizado para 'concluida'.");
      
      await syncInspection(id);
      await pushLocalChanges();
      
      // Safety delay for reaction
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

    // First click: ask for confirmation in-UI
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

      // Forçar o uso do domínio de produção para o QR Code
      const qrCodeDataPayload = `https://patrimonio360-75ade.web.app/vistoria/${id}`;

      await db.inspections.put({
        ...current,
        status: 'finalizada',
        finalizedBy: user.userId,
        finalizedAt: Date.now(),
        qrCodeData: qrCodeDataPayload
      });
      
      // Mark all assets as public for public view without O(N) get() in rules
      const assets = await db.assets.where('inspectionId').equals(id).toArray();
      for (const asset of assets) {
        await db.assets.update(asset.id, { isPublic: true, needsSync: true });
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

    // First click: ask for confirmation in-UI
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
      // 1. Apagar Itens primeiro
      await db.assets.where('inspectionId').equals(id).delete();
      // 2. Apagar Vistoria
      await db.inspections.delete(id);
      
      console.log("Vistoria excluída com sucesso:", id);
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
      const asset = await db.assets.get(transferAssetId);
      if (!asset) throw new Error("Item não encontrado");

      // 1. Procurar ou criar vistoria ativa no destino
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

      // 2. Atualizar o item
      const newHash = generateAssetHash(asset.name, asset.patrimonyNumber, targetLocationId);
      
      // Verificar se já existe no destino
      const existingInTarget = await db.assets.where('hash').equals(newHash).first();
      if (existingInTarget) {
        throw new Error("Já existe um item idêntico no local de destino");
      }

      await db.assets.update(transferAssetId, {
        inspectionId: targetInspection.id,
        hash: newHash,
        needsSync: true
      });

      setSuccessMessage(`Item transferido para ${allLocations?.find(l => l.id === targetLocationId)?.name}`);
      setTransferAssetId(null);
    } catch (err: any) {
      console.error("Erro na transferência:", err);
      setError(err.message || "Erro ao transferir item");
    } finally {
      setIsTransferring(false);
    }
  };

  const generatePDF = async () => {
    try {
      setError(null);
      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text('Relatório de Vistoria Patrimonial', 14, 22);
      
      doc.setFontSize(11);
      doc.text(`Local: ${location?.name}`, 14, 32);
      doc.text(`Data: ${formatDate(inspection?.date || 0)}`, 14, 38);
      
      // Show who concluded vs who authorized
      if (inspection?.concludedBy) {
        doc.text(`Vistoriador: ${inspection.concludedBy === user?.userId ? user?.name : 'Identificado no Sistema'}`, 14, 44);
      } else {
        doc.text(`Responsável: ${user?.name}`, 14, 44);
      }
      
      if (inspection?.status === 'finalizada') {
        doc.text(`Homologado por: ${inspection.finalizedBy === user?.userId ? user?.name : 'Autoridade Municipal'}`, 14, 50);
      }

      const tableData = assets?.map(a => [
        a.name,
        a.patrimonyNumber || '-',
        a.condition,
        a.observations || '-'
      ]);

      autoTable(doc, {
        head: [['Item', 'Patrimônio', 'Estado', 'Obs']],
        body: tableData,
        startY: sectorSignature ? 90 : 60,
        theme: 'grid'
      });

      // Add Sector Signature if available
      if (sectorSignature) {
        doc.setFontSize(10);
        doc.text('RESPONSÁVEL PELO SETOR (ATÉSTADO DE CIÊNCIA):', 14, 65);
        doc.setFontSize(11);
        doc.text(sectorSignature.responsibleName.toUpperCase(), 14, 72);
        doc.addImage(sectorSignature.signatureBase64, 'PNG', 14, 75, 40, 15);
      }

      // Add QR Code to the bottom if exists
      if (inspection?.qrCodeData) {
        const finalY = (doc as any).lastAutoTable.finalY + 10;
        if (finalY < 250) {
          doc.setFontSize(10);
          doc.text('Selo de Autenticidade (QR Code):', 14, finalY);
          
          // Get QR Code Image from SVG
          const qrSvg = document.querySelector('#qr-code-container svg');
          if (qrSvg) {
            const svgData = new XMLSerializer().serializeToString(qrSvg);
            const canvas = document.createElement('canvas');
            const svgSize = 160;
            canvas.width = svgSize;
            canvas.height = svgSize;
            const ctx = canvas.getContext('2d');
            const img = new Image();
            img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
            
            await new Promise((resolve) => {
              img.onload = () => {
                ctx?.drawImage(img, 0, 0);
                doc.addImage(canvas.toDataURL('image/png'), 'PNG', 14, finalY + 5, 40, 40);
                resolve(null);
              };
            });
          }
        }
      }

      try {
        doc.save(`Vistoria_${location?.name}_${new Date().toLocaleDateString()}.pdf`);
      } catch (saveErr) {
        console.warn("doc.save falhou, tentando abrir em aba nova:", saveErr);
        const blob = doc.output('blob');
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      }
    } catch (err: any) {
      console.error("Erro ao gerar PDF:", err);
      setError(`Erro ao gerar PDF: ${err.message || 'Falha desconhecida'}`);
    }
  };

  const handlePrintQRCode = () => {
    try {
      const qrData = inspection?.qrCodeData;
      if (!qrData) return;

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        setError("O navegador bloqueou a janela de impressão. Por favor, permita popups.");
        return;
      }

      const qrSvg = document.querySelector('#qr-code-container svg')?.outerHTML || '';
      
      printWindow.document.write(`
        <html>
          <head>
            <title>Imprimir QR Code - ${location?.name}</title>
            <style>
              body { font-family: sans-serif; display: flex; flex-direction: column; items-center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
              .card { border: 2px solid #000; padding: 40px; border-radius: 20px; }
              h1 { margin-bottom: 0px; font-size: 24px; }
              p { font-size: 14px; color: #666; margin-top: 5px; font-weight: bold; }
              .qr { margin: 20px 0; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>${location?.name}</h1>
              <p>PATRIMÔNIO PÚBLICO - MANOEL VIANA</p>
              <div class="qr">${qrSvg}</div>
              <p>ID: ${inspection?.id.slice(0, 12)}</p>
              <p style="color: #10b981; font-size: 11px;">DATA: ${formatDate(inspection?.date || 0)}</p>
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
  const isLocked = isFinalized || (isConcluded && !isCommittee); // Permitir que a comissão edite se estiver apenas concluída

  const handleBack = async () => {
    if (inspection?.status === 'em_andamento') {
      const assetsCount = await db.assets.where('inspectionId').equals(id).count();
      if (assetsCount === 0) {
        const discard = window.confirm("🗑️ VISTORIA VAZIA: Deseja descartar esta vistoria antes de sair?\n\n(Se você clicar em OK, a vistoria será apagada. Se clicar em CANCELAR, ela ficará salva como rascunho)");
        if (discard) {
          try { await deleteDoc(doc(firestore, 'inspections', id)); } catch(e) {}
          await db.inspections.delete(id);
          console.log("Vistoria vazia descartada ao voltar.");
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
               <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Nuvem Governamental</span>
               <span className={cn(
                 "text-[10px] font-bold uppercase",
                 isSyncing ? "text-indigo-600 animate-pulse" : 
                 syncError ? "text-amber-500" :
                 unsyncedAssetsCount > 0 ? "text-indigo-400" : "text-emerald-600"
               )}>
                 {isSyncing ? "Sincronizando..." : 
                  syncError ? "Pausado (Erro)" :
                  unsyncedAssetsCount > 0 ? `${unsyncedAssetsCount} Pendentes` : "Sincronizado"}
               </span>
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
               <div className="flex flex-col">
                  <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] leading-none mb-2">Local em Auditoria</span>
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
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Itens</span>
                <span className="font-display text-2xl font-black tracking-tight text-white">{assets?.length || 0}</span>
             </div>
             <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Status</span>
                <span className={cn(
                  "font-display text-2xl font-black tracking-tight uppercase",
                  isFinalized ? "text-emerald-400" : isConcluded ? "text-indigo-400" : "text-blue-400"
                )}>
                  {inspection.status.split('_')[0]}
                </span>
             </div>
          </div>
        </div>
        <Building2 className="absolute -bottom-20 -right-20 w-96 h-96 text-white/5 transform rotate-12 pointer-events-none" />
      </div>

      {/* Concluded but not Finalized state */}
      {isConcluded && !isFinalized && (
        <div className="bg-white border border-indigo-100 rounded-[2rem] p-8 flex flex-col md:flex-row items-center gap-8 animate-in slide-in-from-top-4 duration-500 shadow-[0_20px_50px_-15px_rgba(99,102,241,0.1)]">
           <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center text-white shadow-xl shadow-indigo-600/20 shrink-0">
              <History className="w-10 h-10" />
           </div>
           <div className="flex flex-col gap-2 flex-1 text-center md:text-left">
              <h3 className="text-2xl font-display font-extrabold text-slate-900 tracking-tight">Dossiê em Aguardo</h3>
              <p className="text-slate-500 font-medium leading-relaxed">
                Esta auditoria foi concluída pela comissão de vistoria. Agora, o Prefeito ou Responsável Legal deve homologar o documento para gerar o selo oficial de transparência.
              </p>
              {sectorSignature && (
                <div className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-4">
                  <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-indigo-600 border border-slate-100">
                    <Signature className="w-5 h-5" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest leading-none mb-1">Responsável Setorial</span>
                    <span className="text-sm font-bold text-slate-700">{sectorSignature.responsibleName}</span>
                  </div>
                  <div className="ml-auto">
                    <img src={sectorSignature.signatureBase64} alt="Assinatura" className="h-10 opacity-70 grayscale hover:grayscale-0 transition-all" />
                  </div>
                </div>
              )}
           </div>
           <div className="flex items-center gap-2">
              <div className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border border-indigo-100">
                Pendente Homologação
              </div>
           </div>
        </div>
      )}

      {/* QR Code section if finalized */}
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
                    <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-emerald-500/20">
                       <ShieldCheck className="w-7 h-7" />
                    </div>
                    <h3 className="font-display font-extrabold text-3xl text-slate-900 tracking-tight leading-none uppercase">Selo de Transparência</h3>
                 </div>
                 <p className="text-lg text-slate-500 leading-relaxed font-medium max-w-xl">
                    Este ambiente foi <span className="text-emerald-600 font-bold">Blindado Digitalmente</span>. Ao escanear este QR Code, a sociedade civil e os auditores terão acesso imediato aos {assets?.length} itens tombados nesta sala.
                 </p>
                 {sectorSignature && (
                    <div className="mt-2 p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100 flex items-center gap-4">
                      <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-emerald-600">
                        <Signature className="w-5 h-5" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase text-emerald-700/50 tracking-widest leading-none mb-1">Atestado por</span>
                        <span className="text-sm font-bold text-slate-700">{sectorSignature.responsibleName}</span>
                      </div>
                      <div className="ml-auto bg-white/50 p-1 rounded-lg">
                        <img src={sectorSignature.signatureBase64} alt="Assinatura" className="h-8" />
                      </div>
                    </div>
                  )}
              </div>
              
              <div className="flex flex-wrap gap-4">
                 <Button variant="accent" size="sm" onClick={generatePDF} icon={Save} className="px-10 h-16 text-xs uppercase tracking-widest">
                   Baixar Auditoria (PDF)
                 </Button>
                 <Button variant="outline" size="sm" icon={UserPlus} className="px-8 h-16 text-xs uppercase tracking-widest bg-white" onClick={handlePrintQRCode}>
                   Imprimir QR Code
                 </Button>
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
              <input 
                type="text" 
                placeholder="Buscar item ou patrimônio..." 
                value={searchTermAssets}
                onChange={e => setSearchTermAssets(e.target.value)}
                className="pl-11 pr-6 py-2.5 bg-white border border-slate-100 rounded-xl text-sm font-bold text-slate-900 shadow-sm focus:ring-2 focus:ring-slate-900 focus:outline-none transition-all w-full sm:w-64"
              />
            </div>
            {!isLocked && (
              <Button variant="accent" size="sm" icon={Plus} onClick={() => setIsAdding(true)} className="rounded-xl px-8 h-11 shadow-xl shadow-blue-600/10">
                ADICIONAR ITEM
              </Button>
            )}
          </div>
        </div>

        {isAdding && (
          <div className="fixed inset-0 z-[200] flex flex-col bg-slate-900/40 backdrop-blur-sm md:p-6 md:justify-center md:items-center animate-in fade-in duration-300">
            <Card className="w-full h-full md:h-auto md:max-h-[90vh] md:max-w-4xl flex flex-col overflow-hidden rounded-none md:rounded-[2.5rem] border-none shadow-[0_40px_100px_-20px_rgba(0,0,0,0.3)] relative z-10 p-0 bg-white">
               
               {/* 1. Header Fixo */}
               <div className="flex items-center justify-between p-8 bg-slate-900 text-white shadow-xl z-20 shrink-0">
                  <div className="flex items-center gap-5">
                    <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center border border-white/20">
                      <Plus className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex flex-col">
                       <h3 className="font-display font-bold text-2xl uppercase tracking-tight text-white leading-none">
                        {editingAssetId ? 'Editar Detalhes' : 'Novo Registro'}
                       </h3>
                       <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">
                        Inventário Digital • Manoel Viana
                       </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                     <button type="button" onClick={() => { setIsAdding(false); setEditingAssetId(null); setDuplicateWarning(null); }} className="p-3 rounded-2xl bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-all border border-white/10">
                       <X className="w-6 h-6" />
                     </button>
                  </div>
               </div>
               
               {/* 2. Área do Formulário */}
               <div className="flex-1 overflow-y-auto custom-scrollbar p-8 lg:p-12 flex flex-col gap-10 bg-white pb-32">
                 
                 <div className="flex flex-col gap-4">
                   <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Descrição do Patrimônio</label>
                   <Input 
                     ref={nameRef}
                     placeholder="Ex: Mesa de Escritório, Cadeira de Rodas..." 
                     value={newItem.name}
                     onChange={e => {
                       setNewItem({...newItem, name: e.target.value});
                       if (duplicateWarning) { setDuplicateWarning(null); setTransferCandidate(null); }
                     }}
                     onKeyDown={e => handleKeyDown(e, 0)}
                     error={duplicateWarning || undefined}
                     autoFocus
                     className="text-xl h-16 px-6"
                   />
                   {duplicateWarning && (
                     <div className="flex flex-col gap-4 p-6 bg-rose-50 border border-rose-100 rounded-[1.5rem] animate-in fade-in slide-in-from-top-2">
                       <div className="flex items-center gap-3 text-rose-600 font-bold text-sm">
                          <AlertCircle className="w-6 h-6 shrink-0"/> 
                          <span className="leading-tight">{duplicateWarning}</span>
                       </div>
                       {transferCandidate && (
                         <Button 
                           variant="accent" 
                           onClick={handleAddItem}
                           className="bg-rose-600 hover:bg-rose-700 h-14 rounded-xl text-[10px] font-black uppercase tracking-widest"
                         >
                            Confirmar Transferência para este Local
                         </Button>
                       )}
                     </div>
                   )}
                 </div>
                 
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                    <div className="flex flex-col gap-4">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Etiq. Patrimônio</label>
                      <Input 
                        ref={patrimonyRef}
                        placeholder="Nº de Registro" 
                        value={newItem.patrimonyNumber}
                        onChange={e => setNewItem({...newItem, patrimonyNumber: e.target.value})}
                        onKeyDown={e => handleKeyDown(e, 1)}
                        className="text-lg h-16 px-6 font-mono tracking-widest"
                      />
                    </div>

                    <div className="flex flex-col gap-4">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Estado Físico</label>
                      <Select 
                        ref={conditionRef}
                        value={newItem.condition}
                        onChange={e => setNewItem({...newItem, condition: e.target.value as any})}
                        onKeyDown={e => handleKeyDown(e, 2)}
                        className="h-16 px-6 text-sm"
                        options={[
                          { value: 'bom', label: 'Bom Estado' },
                          { value: 'regular', label: 'Regular' },
                          { value: 'ruim', label: 'Ruim (Requer Manutenção)' },
                          { value: 'inservivel', label: 'Inservível (Descarte)' }
                        ]}
                      />
                    </div>

                    <div className="flex flex-col gap-4">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Quantidade</label>
                      <Input 
                        type="number"
                        value={newItem.quantity?.toString()}
                        onChange={e => setNewItem({...newItem, quantity: Math.max(1, parseInt(e.target.value) || 1)})}
                        min={1}
                        className="text-center font-bold text-lg h-16 shadow-sm"
                      />
                    </div>
                 </div>

                 <div className="flex flex-col gap-4">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Observações Técnicas</label>
                    <Textarea 
                      ref={obsRef}
                      placeholder="Identificou avarias ou detalhes específicos? Descreva aqui..." 
                      value={newItem.observations}
                      onChange={e => setNewItem({...newItem, observations: e.target.value})}
                      onKeyDown={e => handleKeyDown(e, 3)}
                      className="text-base p-6 min-h-[160px] resize-none"
                    />
                 </div>

                 <div className="flex flex-col gap-6">
                    <div className="flex items-center justify-between">
                       <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Evidências Fotográficas ({newItem.photos.length}/4)</label>
                       <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-2 text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:text-indigo-700 transition-colors"
                       >
                          <Camera className="w-5 h-5" /> Adicionar Foto
                       </button>
                    </div>
                    {newItem.photos.length > 0 ? (
                      <div className="flex flex-wrap gap-6">
                        {newItem.photos.map((photo, index) => (
                          <div key={index} className="relative w-32 h-32 rounded-[1.5rem] overflow-hidden border-2 border-slate-100 shadow-sm group">
                             <img src={photo} alt="" className="w-full h-full object-cover" />
                             <button 
                                onClick={() => removePhoto(index)}
                                className="absolute top-2 right-2 bg-rose-600 text-white p-2 rounded-xl shadow-lg opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0"
                              >
                                <Trash2 className="w-4 h-4" />
                             </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full py-12 border-2 border-dashed border-slate-100 rounded-[2rem] flex flex-col items-center gap-3 text-slate-400 hover:border-indigo-200 hover:text-indigo-400 transition-all group"
                      >
                         <Camera className="w-10 h-10 transition-transform group-hover:scale-110" />
                         <span className="text-[10px] font-black uppercase tracking-widest">Toque para capturar imagem</span>
                      </button>
                    )}
                 </div>
               </div>

               {/* Footer Fixo */}
               <div className="absolute bottom-0 inset-x-0 p-8 pt-4 bg-white border-t border-slate-100 flex items-center gap-4 z-30">
                  <Button 
                    variant="secondary" 
                    onClick={() => { setIsAdding(false); setEditingAssetId(null); setDuplicateWarning(null); }}
                    className="flex-1 h-16 rounded-2xl text-[10px] uppercase font-black tracking-widest"
                  >
                    Descartar
                  </Button>
                  <Button 
                    variant="accent" 
                    onClick={handleAddItem}
                    disabled={!newItem.name}
                    className="flex-[2] h-16 rounded-2xl text-xs uppercase font-black tracking-widest shadow-2xl shadow-indigo-500/30"
                  >
                    {editingAssetId ? 'Salvar Alterações' : 'Registrar Patrimônio'}
                  </Button>
               </div>
            </Card>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {assets?.filter(asset => 
            (asset.name || '').toLowerCase().includes(searchTermAssets.toLowerCase()) || 
            (asset.patrimonyNumber || '').toLowerCase().includes(searchTermAssets.toLowerCase())
          ).map(asset => (
            <Card key={asset.id} className="flex flex-col gap-6 group hover:shadow-2xl hover:-translate-y-1 transition-all duration-500 rounded-[2rem] p-8 border-slate-100 bg-white">
              <div className="flex items-start justify-between">
                <div className="flex flex-col gap-1 pr-12">
                  <h4 className="font-display font-extrabold text-xl text-slate-900 group-hover:text-indigo-600 transition-colors tracking-tight leading-tight">{asset.name}</h4>
                  <div className="flex flex-wrap items-center gap-3 mt-2">
                     <div className="flex items-center gap-2 px-2 py-1 bg-slate-50 border border-slate-100 rounded-lg">
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Patr.</span>
                        <span className="text-xs text-slate-700 font-mono font-black">{asset.patrimonyNumber || 'N/A'}</span>
                     </div>
                     <div className="flex items-center gap-2 px-2 py-1 bg-slate-50 border border-slate-100 rounded-lg">
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Qtd</span>
                        <span className="text-xs text-slate-700 font-black">{asset.quantity || 1}</span>
                     </div>
                  </div>
                </div>
                <div className={cn(
                  "px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all",
                  asset.condition === 'bom' ? "bg-emerald-50 text-emerald-600 border-emerald-100 shadow-sm" :
                  asset.condition === 'regular' ? "bg-amber-50 text-amber-600 border-amber-100 shadow-sm" :
                  "bg-rose-50 text-rose-600 border-rose-100 shadow-sm"
                )}>
                  {asset.condition || 'Não Inf.'}
                </div>
              </div>
              
              <div className="h-px bg-slate-50" />
              
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <p className="text-sm text-slate-500 font-medium leading-relaxed flex-1">
                  {asset.observations || "Sem detalhes adicionais registrados."}
                </p>
                <div className="flex flex-col gap-4">
                  <div className="flex -space-x-3 justify-end">
                    {(asset.photos && asset.photos.length > 0) ? (
                      asset.photos.map((photo, i) => (
                        <div key={i} className="w-14 h-14 rounded-2xl bg-white border-2 border-slate-50 flex items-center justify-center overflow-hidden shadow-lg transform hover:scale-110 hover:z-30 transition-all cursor-pointer">
                           <img src={photo} alt="" className="w-full h-full object-cover" />
                        </div>
                      ))
                    ) : (
                      <div className="w-14 h-14 rounded-2xl bg-slate-50 border-2 border-white flex items-center justify-center shadow-sm">
                         <ImageIcon className="w-5 h-5 text-slate-300" />
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center justify-end gap-2">
                    <button 
                      onClick={() => loadHistory(asset)}
                      className="p-3 bg-white text-slate-400 hover:text-indigo-600 rounded-2xl border border-slate-100 hover:border-indigo-100 shadow-sm transition-all"
                      title="Histórico"
                    >
                      <History className="w-5 h-5" />
                    </button>
                    {!isLocked && (
                      <>
                        <button 
                          onClick={() => handleEditAsset(asset)}
                          className="p-3 bg-white text-slate-400 hover:text-blue-600 rounded-2xl border border-slate-100 hover:border-blue-100 shadow-sm transition-all"
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => setConfirmDeleteId(asset.id)}
                          className="p-3 bg-white text-slate-400 hover:text-rose-600 rounded-2xl border border-slate-100 hover:border-rose-100 shadow-sm transition-all"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                        {isCommittee && (
                          <button 
                            onClick={() => setTransferAssetId(asset.id)}
                            className="p-3 bg-white text-slate-400 hover:text-amber-600 rounded-2xl border border-slate-100 hover:border-amber-100 shadow-sm transition-all"
                            title="Mover"
                          >
                            <Zap className="w-5 h-5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {confirmDeleteId === asset.id && (
                <div className="absolute inset-0 z-40 bg-white/90 backdrop-blur-sm rounded-[2rem] flex flex-col items-center justify-center p-8 animate-in fade-in duration-300">
                  <div className="flex flex-col items-center text-center gap-4">
                    <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-3xl flex items-center justify-center">
                      <Trash2 className="w-8 h-8" />
                    </div>
                    <div className="flex flex-col">
                      <h5 className="font-bold text-slate-900">Excluir este item?</h5>
                      <p className="text-sm text-slate-500">Esta ação não pode ser desfeita no inventário local.</p>
                    </div>
                    <div className="flex items-center gap-3 w-full mt-2">
                       <button 
                        onClick={() => handleDeleteAsset(asset.id)}
                        className="flex-1 bg-rose-600 text-white font-black text-xs uppercase tracking-widest h-12 rounded-xl shadow-lg shadow-rose-600/20"
                       >
                         Excluir
                       </button>
                       <button 
                        onClick={() => setConfirmDeleteId(null)}
                        className="flex-1 bg-slate-100 text-slate-700 font-black text-xs uppercase tracking-widest h-12 rounded-xl"
                       >
                         Manter
                       </button>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          ))}
          {assets?.length === 0 && !isAdding && (
             <div className="col-span-full py-32 flex flex-col items-center justify-center text-slate-300 border-2 border-dashed border-slate-100 rounded-[3rem] bg-slate-50/20 group">
               <div className="w-24 h-24 bg-white rounded-[2rem] flex items-center justify-center shadow-xl shadow-slate-200/50 mb-8 transition-all duration-700 group-hover:scale-110 group-hover:rotate-6">
                  <Database className="w-10 h-10 text-slate-200 group-hover:text-indigo-600 transition-colors" />
               </div>
               <div className="text-center">
                 <p className="font-display font-extrabold text-xl text-slate-900 tracking-tight mb-2">Local sem inventário</p>
                 <p className="text-slate-400 font-medium max-w-xs mx-auto">Não encontramos nenhum bem catalogado neste ambiente. Toque acima para iniciar a auditoria.</p>
               </div>
             </div>
          )}
        </div>
      </div>

      {/* Footer Controls */}
      {!isFinalized && (
        <div className="mt-16 flex flex-col gap-6 max-w-xl mx-auto w-full">
          {inspection.status === 'em_andamento' ? (
            <div className="flex flex-col gap-4">
              {(assets?.length || 0) === 0 && (
                <div className="bg-amber-50 border border-amber-100 p-6 rounded-[1.5rem] flex items-center gap-4 text-amber-700 animate-in slide-in-from-bottom-4 duration-500 shadow-xl shadow-amber-900/5">
                   <AlertCircle className="w-6 h-6 shrink-0" />
                   <p className="text-xs font-bold uppercase tracking-widest leading-relaxed">Adicione ao menos um item válido para habilitar a conclusão da vistoria.</p>
                </div>
              )}
              <div className="flex flex-col gap-3">
                <Button 
                  disabled={(assets?.length || 0) === 0}
                  className={cn(
                    "h-24 text-xl font-display font-black uppercase tracking-[0.2em] shadow-[0_30px_60px_-15px_rgba(79,70,229,0.3)] rounded-[2rem] transition-all duration-700",
                    (assets?.length || 0) === 0 
                      ? "bg-slate-100 text-slate-400 border-slate-200 grayscale shadow-none" 
                      : "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/30 hover:scale-[1.02]"
                  )} 
                  icon={Signature} 
                  onClick={() => setIsSignOffModalOpen(true)}
                >
                  Encerrar Vistoria do Setor
                </Button>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mt-2">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-relaxed text-center">
                    Ao encerrar, o responsável pelo setor assinará o Termo de Responsabilidade digitalmente.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {(user?.role === 'prefeito' || user?.role === 'responsavel' || user?.role === 'administrador') && (
                <div className="flex flex-col gap-3">
                  <Button 
                    className={cn(
                      "h-24 text-xl font-display font-black uppercase tracking-[0.2em] shadow-[10px_30px_80px_-20px_rgba(99,102,241,0.4)] rounded-[2rem] transition-all duration-700 animate-pulse",
                      isConfirmingFinalize
                        ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20 animate-none ring-8 ring-emerald-500/10"
                        : "bg-slate-900 border-none hover:scale-[1.02]"
                    )} 
                    icon={isConfirmingFinalize ? ShieldCheck : Save} 
                    onClick={handleFinalize}
                    loading={isFinalizing}
                  >
                    {isConfirmingFinalize ? "Protocolar Homologação?" : "Homologar Dossiê"}
                  </Button>
                  {isConfirmingFinalize && (
                    <button 
                      onClick={() => setIsConfirmingFinalize(false)}
                      className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-rose-500 transition-colors py-2"
                    >
                      Manter apenas Concluída
                    </button>
                  )}
                </div>
              )}
              <div className="flex flex-col gap-3">
                {isManager && (
                  <Button 
                    variant="outline"
                    className={cn(
                      "h-16 font-bold uppercase tracking-widest rounded-2xl transition-all duration-500 bg-white border-2",
                      isConfirmingReopen ? "bg-rose-50 border-rose-600 text-rose-600 ring-4 ring-rose-500/5 text-[10px]" : "border-slate-100 text-slate-900 text-[10px]"
                    )} 
                    icon={isConfirmingReopen ? AlertCircle : History} 
                    onClick={handleReopen}
                    loading={isReopening}
                  >
                    {isConfirmingReopen ? "Reabrir para Novas Vistorias?" : "Reabrir Edição do Inventário"}
                  </Button>
                )}
                {isConfirmingReopen && (
                  <button 
                    onClick={() => setIsConfirmingReopen(false)}
                    className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors py-1"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          )}
          <p className="text-[10px] font-bold text-center text-slate-400 uppercase tracking-widest px-12 leading-relaxed opacity-60">
            O encerramento imobiliza os registros locais. A homologação autentica o dossiê perante o controle interno municipal.
          </p>
        </div>
      )}

      {/* 🚀 Modal de Transferência */}
      {transferAssetId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-10">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setTransferAssetId(null)} />
          <Card className="w-full max-w-lg flex flex-col p-8 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 rounded-[3rem] border-none bg-white relative z-10 text-slate-900">
             <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                   <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center">
                      <Zap className="w-6 h-6 text-amber-600" />
                   </div>
                   <div className="flex flex-col">
                      <h3 className="font-black text-xl uppercase tracking-tight">Transferir Item</h3>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mt-1">Mudar de localização</span>
                   </div>
                </div>
                <button onClick={() => setTransferAssetId(null)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                   <X className="w-6 h-6 text-slate-400" />
                </button>
             </div>

             <div className="flex flex-col gap-3 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                <p className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-widest">Selecione o Destino:</p>
                {allLocations?.filter(l => l.id !== location.id).map(loc => (
                  <button 
                    key={loc.id}
                    onClick={() => handleTransfer(loc.id)}
                    disabled={isTransferring}
                    className="flex flex-col p-5 bg-slate-50 border border-slate-100 rounded-2xl hover:bg-slate-900 hover:text-white group transition-all text-left"
                  >
                     <span className="font-black text-sm uppercase tracking-tight transition-colors">{loc.name}</span>
                     <span className="text-[10px] text-slate-400 group-hover:text-slate-500 transition-colors mt-1">{loc.description}</span>
                  </button>
                ))}
             </div>

             {isTransferring && (
               <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center rounded-[3rem]">
                  <div className="flex flex-col items-center gap-3">
                     <div className="w-10 h-10 border-4 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
                     <span className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em]">Processando...</span>
                  </div>
               </div>
             )}
          </Card>
        </div>
      )}

      {/* Modal de Histórico */}
      {historyAsset && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 md:p-10">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setHistoryAsset(null)} />
          <Card className="w-full max-w-2xl flex flex-col p-8 md:p-10 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 rounded-[3rem] border-none bg-white relative z-10 text-slate-900 max-h-[90vh]">
            <div className="flex items-center justify-between mb-8 pb-6 border-b border-slate-100">
               <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-emerald-100 rounded-[1.5rem] flex items-center justify-center border border-emerald-200">
                     <History className="w-7 h-7 text-emerald-600" />
                  </div>
                  <div className="flex flex-col">
                     <h3 className="font-black text-2xl uppercase tracking-tight text-slate-900 leading-none">Histórico</h3>
                     <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mt-2">{historyAsset.name} {historyAsset.patrimonyNumber ? `(Nº ${historyAsset.patrimonyNumber})` : ''}</span>
                  </div>
               </div>
               <button onClick={() => setHistoryAsset(null)} className="p-3 hover:bg-slate-100 rounded-2xl transition-colors border border-transparent hover:border-slate-200">
                  <X className="w-6 h-6 text-slate-400" />
               </button>
            </div>

            <div className="flex flex-col gap-4 overflow-y-auto custom-scrollbar flex-1 pr-2">
               {isLoadingHistory ? (
                 <div className="py-20 flex flex-col items-center justify-center">
                    <div className="w-8 h-8 border-4 border-slate-200 border-t-emerald-500 rounded-full animate-spin"></div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-4">Carregando histórico...</span>
                 </div>
               ) : !assetHistory || assetHistory.length === 0 ? (
                 <div className="py-20 flex flex-col items-center justify-center text-slate-300">
                    <History className="w-12 h-12 opacity-20 mb-4" />
                    <p className="font-bold tracking-widest text-xs uppercase text-slate-400">Nenhum registro anterior encontrado</p>
                 </div>
               ) : (
                 <div className="relative border-l-2 border-slate-100 ml-4 py-2 space-y-8">
                   {assetHistory.map((entry, idx) => (
                     <div key={idx} className="relative pl-6">
                       <div className="absolute -left-[9px] top-1 w-4 h-4 bg-white border-2 border-slate-300 rounded-full z-10"></div>
                       <div className="flex flex-col gap-1">
                         <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 self-start px-2 py-0.5 rounded-lg mb-1">{formatDate(entry.inspection.date)}</span>
                         <h4 className="font-black text-base text-slate-900 tracking-tight leading-tight">{entry.location.name}</h4>
                         <span className="text-sm font-semibold text-slate-500">Condição: <span className="uppercase text-slate-700">{entry.asset.condition}</span></span>
                         {(entry.asset.quantity && entry.asset.quantity > 1) ? (
                            <span className="text-xs font-semibold text-slate-400">Qtd: {entry.asset.quantity}</span>
                         ) : null}
                         {entry.asset.observations && (
                           <p className="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl mt-2 border border-slate-100 italic">
                             "{entry.asset.observations}"
                           </p>
                         )}
                       </div>
                     </div>
                   ))}
                 </div>
               )}
            </div>
          </Card>
        </div>
      )}

      {/* ✍️ Modal de Assinatura e Encerramento Setorial */}
      {isSignOffModalOpen && (
        <SectorInspectionSignOffModal
          isOpen={isSignOffModalOpen}
          onClose={() => setIsSignOffModalOpen(false)}
          inspection={inspection}
          location={location}
          assets={assets || []}
          onComplete={async () => {
             setIsSignOffModalOpen(false);
             // Trigger internal status update
             setIsConfirmingConclude(true); // Pre-set confirmation to skip the internal check if needed
             await handleConclude();
          }}
        />
      )}
    </div>
  );
}

function Building2(props: any) {
  return (
    <svg 
      {...props}
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" 
    >
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>
    </svg>
  );
}
