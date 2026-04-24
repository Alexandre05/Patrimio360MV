import React, { useState, useRef } from 'react';
import { Card, Button, Input, Select, Textarea } from './UI';
import { useOnlineStatus } from '../lib/hooks';
import { ArrowLeft, Plus, Image as ImageIcon, Trash2, Camera, UserPlus, Save, CheckCircle2, History, Eye, PlayCircle, ArrowRight, X, Edit2, Search, ShieldCheck, AlertCircle, Home, ChevronLeft, ChevronRight, Zap, Copy } from 'lucide-react';
import { db, Asset, generateAssetHash, generateId, AssetCondition, InspectionStatus } from '../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../lib/AuthContext';
import { formatDate, cn } from '../lib/utils';
import { QRCodeSVG } from 'qrcode.react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { compressImage } from '../lib/image';
import { pushLocalChanges, syncInspection } from '../lib/syncService';
import { db as firestore } from '../lib/firebase';
import { doc, deleteDoc } from 'firebase/firestore';

export function InspectionView({ id, onBack }: { id: string, onBack: () => void }) {
  const { user } = useAuth();
  const isManager = user?.role === 'administrador' || user?.role === 'responsavel' || user?.role === 'prefeito';
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
  const [transferAssetId, setTransferAssetId] = useState<string | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const allLocations = useLiveQuery(() => db.locations.toArray());
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

  const [newItem, setNewItem] = useState({
    name: '',
    patrimonyNumber: '',
    condition: 'bom' as AssetCondition,
    observations: '',
    photos: [] as string[]
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
    
    // Duplication Check (only for new items)
    if (!editingAssetId) {
      const existingInSameInspection = await db.assets
        .where('inspectionId')
        .equals(id)
        .and(a => a.hash === hash)
        .first();

      if (existingInSameInspection) {
        setDuplicateWarning("Este item já foi cadastrado nesta vistoria.");
        return;
      }

      // GLOBAL Patrimony check
      if (newItem.patrimonyNumber) {
        const globalExisting = await db.assets.where('patrimonyNumber').equals(newItem.patrimonyNumber).first();
        if (globalExisting) {
          const otherInsp = await db.inspections.get(globalExisting.inspectionId);
          const otherLoc = otherInsp ? await db.locations.get(otherInsp.locationId) : null;
          
          // Se for na mesma vistoria, o erro acima já pegou. 
          // Perguntamos se deseja ignorar e vincular a esta nova vistoria/local.
          if (confirm(`O patrimônio ${newItem.patrimonyNumber} já está vinculado ao local "${otherLoc?.name || 'outro setor'}". Deseja cadastrá-lo aqui assim mesmo?`)) {
             // Continue without returning
          } else {
             setDuplicateWarning(`O patrimônio ${newItem.patrimonyNumber} já pertence a outro local.`);
             return;
          }
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
        needsSync: true
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
        needsSync: true
      });
      setSuccessMessage("Adicionado com sucesso!");
    }

    // Trigger sync
    pushLocalChanges();

    setNewItem({ name: '', patrimonyNumber: '', condition: 'bom', observations: '', photos: [] });
    setIsAdding(false);
    setEditingAssetId(null);
    setDuplicateWarning(null);
  };

  const handleDeleteAsset = async (assetId: string) => {
    if (!isManager) {
      setError("Apenas administradores podem excluir itens registrados.");
      return;
    }
    if (confirmDeleteId !== assetId) {
      setConfirmDeleteId(assetId);
      return;
    }

    try {
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
      photos: asset.photos || []
    });
    setEditingAssetId(asset.id);
    setIsAdding(true);
  };

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file: any) => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const rawBase64 = reader.result as string;
          // COMPRESS to avoid storage quota issues
          const compressedBase64 = await compressImage(rawBase64, 800, 0.6);
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

      // Rely on current origin. When deployed/shared, this will be the correct public URL.
      // We also ensure it uses the hash routing format.
      let baseUrl = window.location.origin;
      
      // Remove trailing slash if exists
      baseUrl = baseUrl.replace(/\/$/, '');
      const qrCodeDataPayload = `${baseUrl}/#/vistoria/${id}`;

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
        startY: 50,
        theme: 'grid'
      });

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
  const isLocked = isFinalized || isConcluded; // Bloquear se concluída ou finalizada

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
    <div className="flex flex-col gap-8 animate-in slide-in-from-right-4 duration-500 pb-20">
      {error && (
        <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl flex items-center gap-3 text-rose-600 animate-in slide-in-from-top-4 duration-300">
           <AlertCircle className="w-5 h-5 shrink-0" />
           <p className="text-xs font-bold uppercase tracking-tight flex-1">{error}</p>
           <button onClick={() => setError(null)} className="p-1 hover:bg-rose-100 rounded-lg transition-colors">
              <X className="w-4 h-4" />
           </button>
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl flex items-center gap-3 text-emerald-600 animate-in slide-in-from-top-4 duration-300">
           <CheckCircle2 className="w-5 h-5 shrink-0" />
           <p className="text-xs font-bold uppercase tracking-tight flex-1">{successMessage}</p>
        </div>
      )}

      <header className="flex items-center justify-between sticky top-0 md:relative z-40 py-4 bg-bg/80 backdrop-blur-md md:bg-transparent">
        <div className="flex items-center gap-4">
          <button onClick={handleBack} className="flex items-center gap-2 text-slate-400 font-bold hover:text-slate-900 transition-all group">
            <ArrowLeft className="w-5 h-5 transition-transform group-hover:-translate-x-1" /> VOLTAR
          </button>
          <div className="w-px h-4 bg-slate-200 hidden md:block" />
          <button 
            onClick={() => {
              handleBack();
              // This is a bit hacky as we don't have direct access to setActiveTab here, 
              // but since onBack resets selectedInspectionId, it returns to the last active tab.
              // If the user wants HOME specifically, they can click home in the dashboard header after this.
            }} 
            className="hidden md:flex items-center gap-2 text-slate-400 font-bold hover:text-slate-900 transition-all px-2"
          >
            <Home className="w-4 h-4" /> INÍCIO
          </button>
        </div>
        <div className="flex items-center gap-4">
           {!isLocked && isManager && (
             <div className="flex items-center mr-2">
               {isConfirmingDeleteInspection ? (
                 <div className="flex items-center gap-2 bg-rose-50 border border-rose-100 p-1 rounded-xl animate-in slide-in-from-right-4 duration-300">
                   <button 
                     onClick={handleDeleteInspection}
                     disabled={isDeletingInspection}
                     className="px-3 py-1.5 bg-rose-600 text-white rounded-lg shadow-lg shadow-rose-600/20 hover:bg-rose-700 transition-all font-black text-[9px] uppercase"
                   >
                     {isDeletingInspection ? "..." : "EXCLUIR"}
                   </button>
                   <button 
                     onClick={() => setIsConfirmingDeleteInspection(false)}
                     className="px-3 py-1.5 bg-white text-slate-400 hover:text-slate-900 rounded-lg border border-slate-100 transition-all font-black text-[9px] uppercase"
                   >
                     X
                   </button>
                 </div>
               ) : (
                 <button 
                   onClick={() => setIsConfirmingDeleteInspection(true)}
                   className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                   title="Excluir esta Vistoria"
                 >
                   <Trash2 className="w-5 h-5" />
                 </button>
               )}
             </div>
           )}
           {isOnline && <div className="hidden md:flex flex-col items-end leading-none">
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Estado Local</span>
              <span className="text-[10px] font-bold text-emerald-600 uppercase">Sincronizado</span>
           </div>}
           <div className={cn(
             "text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-xl border shadow-sm",
             isFinalized ? "bg-emerald-50 text-emerald-700 border-emerald-100" : isConcluded ? "bg-amber-50 text-amber-700 border-amber-100" : "bg-blue-50 text-blue-700 border-blue-100"
           )}>
             {inspection.status.replace('_', ' ')}
           </div>
        </div>
      </header>

      <div className="relative overflow-hidden rounded-[2.5rem] bg-slate-900 px-8 py-10 text-white shadow-2xl shadow-slate-900/30">
        <div className="relative z-10 flex flex-col gap-2">
          <div className="flex items-center gap-3 mb-2">
             <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-sm border border-white/10">
                <Building2 className="w-6 h-6 text-white" />
             </div>
             <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Localização</span>
                <h1 className="text-3xl font-black tracking-tighter leading-none mt-1">{location.name}</h1>
             </div>
          </div>
          <p className="text-slate-400 text-sm font-medium max-w-lg leading-relaxed">{location.description}</p>
          
          <div className="flex flex-wrap items-center gap-6 mt-8 overflow-hidden">
             <div className="flex flex-col">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Data Inicial</span>
                <span className="font-mono text-lg font-bold tracking-tighter text-slate-300">{formatDate(inspection.date).split(',')[0]}</span>
             </div>
             <div className="w-px h-8 bg-white/10" />
             <div className="flex flex-col">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Membros</span>
                <span className="font-mono text-lg font-bold tracking-tighter text-slate-300">03 Participantes</span>
             </div>
             <div className="w-px h-8 bg-white/10" />
             <div className="flex flex-col">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Total Itens</span>
                <span className="font-mono text-lg font-bold tracking-tighter text-slate-300">{assets?.length || 0}</span>
             </div>
          </div>
        </div>
        <Building2 className="absolute -bottom-8 -right-8 w-64 h-64 text-white/5 transform rotate-12" />
      </div>

      {/* Concluded but not Finalized state */}
      {isConcluded && !isFinalized && (
        <div className="bg-amber-50 border border-amber-100 rounded-[2.5rem] p-8 flex flex-col md:flex-row items-center gap-6 animate-in slide-in-from-top-4 duration-500 shadow-xl shadow-amber-900/5">
           <div className="w-16 h-16 bg-amber-500 rounded-3xl flex items-center justify-center text-white shadow-lg shadow-amber-500/20 rotate-6">
              <History className="w-8 h-8" />
           </div>
           <div className="flex flex-col gap-1 flex-1 text-center md:text-left">
              <h3 className="text-xl font-black text-amber-900 uppercase tracking-tight">Aguardando Homologação</h3>
              <p className="text-sm text-amber-700/70 font-medium">
                Esta vistoria foi marcada como concluída pela comissão. O Prefeito ou Responsável deve realizar a homologação final para gerar o selo de autenticidade (QR Code).
              </p>
           </div>
           <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest px-4 py-2 bg-white rounded-xl border border-amber-100 shadow-sm">Pendente</span>
           </div>
        </div>
      )}

      {/* QR Code section if finalized */}
      {isFinalized && (
        <div className="flex flex-col gap-6 animate-in zoom-in-95 duration-500">
          <Card className="flex flex-col md:flex-row items-center gap-10 p-10 border-emerald-100 bg-white group hover:shadow-2xl transition-all duration-500 rounded-[3rem]">
            <div id="qr-code-container" className="p-6 bg-slate-50 rounded-[2.5rem] border border-slate-100 shadow-inner group-hover:bg-white transition-all duration-500 flex flex-col items-center gap-3">
              <QRCodeSVG value={inspection.qrCodeData || ''} size={160} />
              <div className="flex flex-col items-center">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">ID: {inspection.id.slice(0,8)}</span>
                <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mt-1">{formatDate(inspection.date)}</span>
              </div>
            </div>
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-3">
                 <div className="w-10 h-10 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-emerald-500/20 rotate-3">
                    <ShieldCheck className="w-6 h-6 -rotate-3" />
                 </div>
                 <div className="flex flex-col">
                    <h3 className="font-black text-2xl text-slate-900 tracking-tighter uppercase leading-none">Pasaporte do Local</h3>
                    <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mt-1">Vistoria Homologada Oficial</span>
                 </div>
              </div>
              <p className="text-sm text-slate-500 leading-relaxed font-semibold max-w-sm">
                A vistoria de <span className="text-slate-900 font-black">{location.name}</span> foi blindada com sucesso. 
                Ao escanear este código, qualquer pessoa poderá ver em tempo real os {assets?.length} bens registrados nesta sala.
              </p>
              <div className="flex flex-wrap gap-4 pt-2">
                 <Button variant="accent" size="sm" onClick={generatePDF} icon={Save} className="rounded-xl px-10 h-14 shadow-2xl shadow-blue-600/20 font-black tracking-widest text-xs">
                   BAIXAR RELATÓRIO PDF
                 </Button>
                 <Button variant="secondary" size="sm" icon={UserPlus} className="rounded-xl px-6 h-14 font-black tracking-widest text-[10px]" onClick={handlePrintQRCode}>
                   IMPRIMIR QR CODE
                 </Button>
                 <Button 
                    variant="outline" 
                    size="sm" 
                    icon={Copy} 
                    className="rounded-xl px-6 h-14 font-black tracking-widest text-[10px] bg-white hover:bg-slate-50" 
                    onClick={() => {
                      if (inspection.qrCodeData) {
                        navigator.clipboard.writeText(inspection.qrCodeData);
                        alert('Link copiado: ' + inspection.qrCodeData);
                      }
                    }}
                  >
                   COPIAR LINK
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
          <Card className="p-8 flex flex-col gap-6 ring-4 ring-slate-900/5 animate-in zoom-in-95 duration-300 rounded-[2.5rem] border-slate-200 shadow-2xl relative z-10">
             <div className="flex items-center justify-between">
                <div className="flex flex-col">
                   <h3 className="font-black text-slate-900 text-lg uppercase tracking-tight">
                    {editingAssetId ? 'Editar Registro' : 'Novo Registro'}
                   </h3>
                   <span className="text-[10px] font-bold text-slate-400">
                    {editingAssetId ? 'Atualize os dados do bem patrimonial' : 'Preencha os dados do bem patrimonial'}
                   </span>
                </div>
                <div className="flex items-center gap-2">
                   <div className="flex items-center bg-slate-100 rounded-xl p-1 mr-2">
                      <button 
                        type="button"
                        onClick={() => navigateFields('prev')}
                        className="p-2 hover:bg-white rounded-lg text-slate-400 hover:text-slate-900 transition-all shadow-sm"
                        title="Anterior (Seta Esquerda)"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <div className="w-px h-4 bg-slate-300 mx-1" />
                      <button 
                        type="button"
                        onClick={() => navigateFields('next')}
                        className="p-2 hover:bg-white rounded-lg text-slate-400 hover:text-slate-900 transition-all shadow-sm"
                        title="Próximo (Seta Direita / Enter)"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                   </div>
                   <button type="button" onClick={() => { setIsAdding(false); setEditingAssetId(null); setDuplicateWarning(null); }} className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all">
                     <X className="w-5 h-5" />
                   </button>
                </div>
             </div>
             
             <Input 
               ref={nameRef}
               label="Nome do Item" 
               placeholder="Ex: Mesa de Escritório em L" 
               value={newItem.name}
               onChange={e => setNewItem({...newItem, name: e.target.value})}
               onKeyDown={e => handleKeyDown(e, 0)}
               error={duplicateWarning || undefined}
               autoFocus
             />
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <Input 
                 ref={patrimonyRef}
                 label="Número Patrimonial" 
                 placeholder="Cód. Identificador" 
                 value={newItem.patrimonyNumber}
                 onChange={e => setNewItem({...newItem, patrimonyNumber: e.target.value})}
                 onKeyDown={e => handleKeyDown(e, 1)}
               />
               <Select 
                 ref={conditionRef}
                 label="Estado de Conservação" 
                 value={newItem.condition}
                 onChange={e => setNewItem({...newItem, condition: e.target.value as any})}
                 onKeyDown={e => handleKeyDown(e, 2)}
                 options={[
                   { value: 'novo', label: 'Novo (Sem uso)' },
                   { value: 'bom', label: 'Bom (Funcional)' },
                   { value: 'regular', label: 'Regular (Gasto)' },
                   { value: 'ruim', label: 'Ruim (Requer Manutenção)' },
                   { value: 'inservivel', label: 'Inservível (Baixa Definitiva)' }
                 ]}
               />
             </div>

             <Textarea 
               ref={obsRef}
               label="Observações Adicionais" 
               placeholder="Avarias, marcas, detalhes de localização..." 
               value={newItem.observations}
               onChange={e => setNewItem({...newItem, observations: e.target.value})}
               onKeyDown={e => handleKeyDown(e, 3)}
             />

             {newItem.photos.length > 0 && (
               <div className="flex flex-wrap gap-3">
                 {newItem.photos.map((photo, index) => (
                   <div key={index} className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200 group">
                      <img src={photo} alt="" className="w-full h-full object-cover" />
                      <button 
                        onClick={() => removePhoto(index)}
                        className="absolute inset-0 bg-rose-500/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                   </div>
                 ))}
               </div>
             )}

             <div className="flex items-center gap-4 mt-2">
                <input 
                  type="file" 
                  ref={fileInputRef}
                  className="hidden" 
                  accept="image/*" 
                  multiple 
                  onChange={handlePhotoCapture}
                />
                <Button 
                  variant="secondary" 
                  icon={Camera} 
                  className="w-20 md:w-40 h-16 rounded-[1.5rem] group overflow-hidden relative"
                  onClick={() => fileInputRef.current?.click()}
                >
                   <span className="relative z-10">FOTO</span>
                   <div className="absolute inset-0 bg-slate-50 transition-transform group-hover:scale-110" />
                </Button>
                <Button onClick={handleAddItem} className="flex-1 h-16 rounded-[1.5rem] uppercase font-black tracking-widest text-lg shadow-2xl shadow-blue-600/20" icon={CheckCircle2} variant="accent">
                   {editingAssetId ? 'SALVAR ALTERAÇÕES' : 'REGISTRAR BEM'}
                </Button>
             </div>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {assets?.filter(asset => 
            (asset.name || '').toLowerCase().includes(searchTermAssets.toLowerCase()) || 
            (asset.patrimonyNumber || '').toLowerCase().includes(searchTermAssets.toLowerCase())
          ).map(asset => (
            <Card key={asset.id} className="flex flex-col gap-4 group hover:border-slate-300 transition-all duration-300 rounded-[2rem] p-7 relative">
              {!isLocked && (
                <div className={cn(
                  "absolute top-4 right-4 flex items-center gap-2 transition-all duration-300 z-20",
                  confirmDeleteId === asset.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )}>
                  {confirmDeleteId === asset.id ? (
                    <div className="flex items-center gap-2 bg-rose-50 border border-rose-100 p-1.5 rounded-2xl animate-in fade-in slide-in-from-right-4 duration-300">
                      <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest px-2">Excluir item?</span>
                      <button 
                        onClick={() => handleDeleteAsset(asset.id)}
                        className="p-2 bg-rose-600 text-white rounded-xl shadow-lg shadow-rose-600/20 hover:bg-rose-700 transition-all font-bold text-[10px]"
                      >
                        SIM
                      </button>
                      <button 
                        onClick={() => setConfirmDeleteId(null)}
                        className="p-2 bg-white text-slate-400 hover:text-slate-900 rounded-xl border border-slate-100 transition-all font-bold text-[10px]"
                      >
                        NÃO
                      </button>
                    </div>
                  ) : (
                    <>
                      <button 
                        onClick={() => handleEditAsset(asset)}
                        className="p-2 bg-white text-slate-400 hover:text-blue-600 rounded-xl border border-slate-100 hover:border-blue-100 shadow-sm transition-all"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDeleteAsset(asset.id)}
                        className="p-2 bg-white text-slate-400 hover:text-rose-600 rounded-xl border border-slate-100 hover:border-rose-100 shadow-sm transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      {isManager && (
                        <button 
                          onClick={() => setTransferAssetId(asset.id)}
                          className="p-2 bg-white text-slate-400 hover:text-amber-600 rounded-xl border border-slate-100 hover:border-amber-100 shadow-sm transition-all"
                          title="Transferir Item"
                        >
                          <Zap className="w-4 h-4" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
              <div className="flex items-start justify-between">
                <div className="flex flex-col pr-12">
                  <span className="font-black text-slate-900 group-hover:text-blue-600 transition-colors text-lg tracking-tight leading-tight">{asset.name}</span>
                  <div className="flex items-center gap-2 mt-1">
                     <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Patr.</span>
                     <span className="text-xs text-slate-500 font-mono font-bold">{asset.patrimonyNumber || 'N/A'}</span>
                  </div>
                </div>
                <div className={cn(
                  "text-[9px] font-black uppercase px-3 py-1.5 rounded-xl transition-colors",
                  asset.condition === 'ruim' || asset.condition === 'inservivel' 
                    ? "bg-rose-50 text-rose-600 border border-rose-100" 
                    : "bg-slate-50 text-slate-500 border border-slate-100"
                )}>
                  {asset.condition}
                </div>
              </div>
              
              <div className="h-px bg-slate-50" />
              
              <div className="flex items-end justify-between gap-4">
                <p className="text-xs text-slate-400 italic line-clamp-2 leading-relaxed">
                  {asset.observations || "Sem observações registradas para este item."}
                </p>
                <div className="flex -space-x-2 shrink-0">
                   {(asset.photos && asset.photos.length > 0) ? (
                     asset.photos.map((photo, i) => (
                       <div key={i} className="w-10 h-10 rounded-lg bg-slate-100 border-2 border-white flex items-center justify-center overflow-hidden shadow-sm">
                          <img src={photo} alt="" className="w-full h-full object-cover" />
                       </div>
                     ))
                   ) : (
                     [1,2].map(i => (
                       <div key={i} className="w-8 h-8 rounded-lg bg-slate-100 border-2 border-white flex items-center justify-center">
                          <ImageIcon className="w-3 h-3 text-slate-300" />
                       </div>
                     ))
                   )}
                </div>
              </div>
            </Card>
          ))}
          {assets?.length === 0 && !isAdding && (
             <div className="col-span-full py-24 flex flex-col items-center justify-center text-slate-300 border-2 border-dashed border-slate-100 rounded-[3rem] bg-slate-50/30">
               <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center shadow-lg shadow-slate-200/50 mb-6 group hover:scale-110 transition-transform duration-500">
                  <History className="w-10 h-10 text-slate-200 group-hover:text-slate-900 transition-colors" />
               </div>
               <p className="font-black uppercase tracking-widest text-[11px] text-slate-400">Nenhum bem registrado</p>
               <p className="text-xs mt-1">Inicie o inventário clicando em adicionar.</p>
                {isManager && (
                  <Button 
                    variant="secondary" 
                    icon={Trash2} 
                    onClick={() => setIsConfirmingDeleteInspection(true)}
                    className="mt-6 rounded-2xl border-rose-100 text-rose-500 hover:bg-rose-500 hover:text-white transition-all px-8 h-10 uppercase font-black tracking-widest text-[9px]"
                  >
                    DESCARTAR ESTA VISTORIA
                  </Button>
                )}
             </div>
          )}
        </div>
      </div>

      {/* Footer Controls */}
      {!isFinalized && (
        <div className="mt-10 flex flex-col gap-4 max-w-lg mx-auto w-full group">
          {inspection.status === 'em_andamento' ? (
            <div className="flex flex-col gap-3">
              {(assets?.length || 0) === 0 && (
                <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex items-center gap-3 text-amber-700 animate-in slide-in-from-bottom-4 duration-300 mb-2">
                   <AlertCircle className="w-5 h-5 shrink-0" />
                   <p className="text-[10px] font-black uppercase tracking-tight">Adicione ao menos um item para concluir a vistoria.</p>
                </div>
              )}
              <div className="flex flex-col gap-2">
                <Button 
                  disabled={(assets?.length || 0) === 0}
                  className={cn(
                    "h-20 text-xl font-black uppercase tracking-widest shadow-2xl rounded-[1.5rem] transition-all duration-500",
                    (assets?.length || 0) === 0 
                      ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed shadow-none" 
                      : isConfirmingConclude 
                        ? "bg-amber-500 hover:bg-amber-600 shadow-amber-500/20" 
                        : "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20"
                  )} 
                  icon={isConfirmingConclude ? AlertCircle : CheckCircle2} 
                  onClick={handleConclude}
                  loading={isConcluding}
                >
                  {isConfirmingConclude ? "CONFIRMAR CONCLUSÃO?" : "CONCLUIR VISTORIA"}
                </Button>
                {isConfirmingConclude && (
                  <button 
                    onClick={() => setIsConfirmingConclude(false)}
                    className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors py-2"
                  >
                    CANCELAR
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {(user?.role === 'prefeito' || user?.role === 'responsavel' || user?.role === 'administrador') && (
                <div className="flex flex-col gap-2">
                  <Button 
                    className={cn(
                      "h-20 text-xl font-black uppercase tracking-widest shadow-2xl rounded-[1.5rem] transition-all duration-500",
                      isConfirmingFinalize
                        ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20"
                        : "bg-slate-900 border-none shadow-slate-900/20"
                    )} 
                    icon={isConfirmingFinalize ? ShieldCheck : Save} 
                    onClick={handleFinalize}
                    loading={isFinalizing}
                  >
                    {isConfirmingFinalize ? "CONFIRMAR HOMOLOGAÇÃO?" : "HOMOLOGAR VISTORIA"}
                  </Button>
                  {isConfirmingFinalize && (
                    <button 
                      onClick={() => setIsConfirmingFinalize(false)}
                      className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors py-2"
                    >
                      CANCELAR
                    </button>
                  )}
                </div>
              )}
              <div className="flex flex-col gap-2">
                {isManager && (
                  <Button 
                    variant="secondary"
                    className={cn(
                      "h-14 font-black uppercase tracking-widest rounded-xl transition-all duration-500",
                      isConfirmingReopen ? "bg-rose-50 text-rose-600 border-rose-200" : ""
                    )} 
                    icon={isConfirmingReopen ? AlertCircle : History} 
                    onClick={handleReopen}
                    loading={isReopening}
                  >
                    {isConfirmingReopen ? "CONFIRMAR REABERTURA?" : "REABRIR PARA EDIÇÃO"}
                  </Button>
                )}
                {isConfirmingReopen && (
                  <button 
                    onClick={() => setIsConfirmingReopen(false)}
                    className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors py-1"
                  >
                    CANCELAR
                  </button>
                )}
              </div>
            </div>
          )}
          <p className="text-[10px] font-bold text-center text-slate-400 uppercase tracking-widest px-8 leading-relaxed mt-2">
            A conclusão bloqueia novas edições. A homologação gera o QR Code oficial e o selo de autenticidade.
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
