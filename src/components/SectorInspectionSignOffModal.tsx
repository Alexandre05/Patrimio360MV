import React, { useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  X, 
  User, 
  Signature, 
  Trash2, 
  CheckCircle, 
  FileText, 
  AlertCircle,
  ShieldCheck,
  Clock,
  MapPin,
  ClipboardList,
  Zap,
  History
} from 'lucide-react';
import { Card, Button, Input, Alert } from './UI';
import { db as firestore, handleFirestoreError } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { Asset, Location, Inspection } from '../lib/db';
import { formatDate, cn } from '../lib/utils';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/ToastContext';

interface SectorInspectionSignOffModalProps {
  isOpen: boolean;
  onClose: () => void;
  location: Location;
  inspection: Inspection;
  assets: Asset[];
  onComplete: () => void;
}

export function SectorInspectionSignOffModal({ 
  isOpen, 
  onClose, 
  location, 
  inspection, 
  assets,
  onComplete 
}: SectorInspectionSignOffModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const sigPad = useRef<SignatureCanvas>(null);
  const [responsibleName, setResponsibleName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCanvasEmpty, setIsCanvasEmpty] = useState(true);

  // Resize canvas when modal opens
  React.useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        if (sigPad.current) {
          const canvas = sigPad.current.getCanvas();
          if (canvas) {
            // Force adjustment of canvas coordinates to visual size
            const ratio = Math.max(window.devicePixelRatio || 1, 1);
            canvas.width = canvas.offsetWidth * ratio;
            canvas.height = canvas.offsetHeight * ratio;
            canvas.getContext('2d')?.scale(ratio, ratio);
            sigPad.current.clear();
          }
        }
      }, 350); // Wait for modal animation
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const clearSignature = () => {
    sigPad.current?.clear();
    setIsCanvasEmpty(true);
  };

  const generatePDF = (signatureDataUrl: string, signedAt: number) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header
    doc.setFillColor(248, 250, 252);
    doc.rect(0, 0, pageWidth, 40, 'F');
    
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.setFont('helvetica', 'bold');
    doc.text('TERMO DE RESPONSABILIDADE, GUARDA E CONSERVAÇÃO', pageWidth / 2, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('PÓS-VISTORIA PATRIMONIAL', pageWidth / 2, 28, { align: 'center' });

    // Body text (Objective and Generic as requested)
    doc.setFontSize(11);
    doc.setTextColor(51, 65, 85); // slate-700
    const bodyContent = `Eu, ${responsibleName}, na qualidade de servidor responsável pelo setor ${location.name}, atesto que acompanhei a vistoria patrimonial realizada nesta unidade. Confirmo a conferência dos bens listados abaixo, assumindo integral responsabilidade por sua guarda, conservação e preservação nas condições físicas registradas no momento da inspeção.`;
    
    const splitText = doc.splitTextToSize(bodyContent, pageWidth - 40);
    doc.text(splitText, 20, 55);

    // Asset Table
    const tableData = assets.map(a => [
      a.patrimonyNumber || 'N/A',
      a.name,
      a.condition.toUpperCase(),
      a.observations || '-'
    ]);

    autoTable(doc, {
      head: [['PATRIMÔNIO', 'DESCRIÇÃO DO BEM', 'ESTADO', 'OBSERVAÇÕES']],
      body: tableData,
      startY: 85,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [79, 70, 229] }, // indigo-600
    });

    // Signature and Footer
    const finalY = (doc as any).lastAutoTable.finalY + 20;
    
    if (finalY + 80 > doc.internal.pageSize.getHeight()) {
      doc.addPage();
    }

    doc.setFontSize(10);
    doc.text('ASSINATURA DO RESPONSÁVEL PELO SETOR:', 20, finalY);
    doc.addImage(signatureDataUrl, 'PNG', 40, finalY + 5, 80, 30);
    
    doc.setDrawColor(203, 213, 225); // slate-300
    doc.line(40, finalY + 35, 120, finalY + 35);
    doc.text(responsibleName.toUpperCase(), 80, finalY + 40, { align: 'center' });
    
    // Timestamp dynamic in footer
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184); // slate-400
    const dateStr = formatDate(signedAt);
    doc.text(`Documento gerado eletronicamente em: ${dateStr}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
    doc.text(`ID da Vistoria: ${inspection.id} | Localização: ${location.name}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 15, { align: 'center' });

    doc.save(`Termo_Responsabilidade_${location.name.replace(/\s+/g, '_')}_${inspection.id.slice(0, 8)}.pdf`);
  };

  const handleSave = async () => {
    if (!responsibleName.trim()) {
      setError('Por favor, informe o nome do servidor responsável.');
      return;
    }

    if (isCanvasEmpty || sigPad.current?.isEmpty()) {
      setError('A assinatura é obrigatória para encerrar a vistoria.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const signatureBase64 = sigPad.current?.getTrimmedCanvas().toDataURL('image/png') || '';
      const docId = `concluid_` + inspection.id;
      const now = Date.now();

      const sectorData = {
        id: docId,
        locationName: location.name,
        inspectionId: inspection.id,
        assetIds: assets.map(a => a.id),
        responsibleName: responsibleName.trim(),
        signatureBase64,
        signedAt: now,
        signedByUser: user?.userId || 'unknown'
      };

      await setDoc(doc(firestore, 'sector_inspections', docId), sectorData);
      
      toast('Vistoria encerrada com sucesso!', 'success', 'Finalizado');
      generatePDF(signatureBase64, now);
      onComplete();
    } catch (err: any) {
      console.error(err);
      toast('Não foi possível salvar o encerramento.', 'error', 'Erro de Conexão');
      setError('Falha ao salvar encerramento no servidor.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-0 md:p-6 animate-in fade-in duration-300">
      <Card className="w-full md:max-w-4xl h-full md:h-auto md:max-h-[95vh] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.4)] border-none flex flex-col gap-0 p-0 overflow-hidden relative rounded-none md:rounded-[3rem] bg-white">
        
        {/* Header - Fixed */}
        <div className="px-8 py-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-indigo-600 rounded-[1.5rem] flex items-center justify-center text-white shadow-xl shadow-indigo-600/20">
              <FileText className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-2xl font-display font-black text-slate-900 leading-tight">Encerramento do Setor</h3>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em]">{location.name}</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="w-12 h-12 flex items-center justify-center hover:bg-slate-200 rounded-2xl transition-all text-slate-400"
          >
            <X className="w-7 h-7" />
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto px-8 py-10 flex flex-col gap-10">
          
          {/* Item Verification List */}
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600">
                  <ClipboardList className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Conferência de Itens</h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Verifique os bens antes de assinar</p>
                </div>
              </div>
              <span className="px-4 py-1.5 bg-slate-100 text-slate-600 rounded-full text-[10px] font-black uppercase tracking-widest">
                {assets.length} ITENS
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              {assets.map((asset) => (
                <div key={asset.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group hover:border-indigo-200 hover:bg-white transition-all duration-300">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400 shadow-sm border border-slate-100 group-hover:text-indigo-600 transition-colors">
                      <Zap className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-900 leading-tight">{asset.name}</span>
                      <span className="text-[10px] font-black text-slate-400 mt-1 uppercase tracking-wider">Pat: {asset.patrimonyNumber}</span>
                    </div>
                  </div>
                  <div className={cn(
                    "px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest",
                    asset.condition === 'novo' ? 'bg-emerald-100 text-emerald-700' :
                    asset.condition === 'bom' ? 'bg-blue-100 text-blue-700' :
                    asset.condition === 'regular' ? 'bg-amber-100 text-amber-700' :
                    asset.condition === 'ruim' ? 'bg-orange-100 text-orange-700' :
                    'bg-rose-100 text-rose-700'
                  )}>
                    {asset.condition}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-indigo-50/50 p-6 rounded-[2rem] border border-indigo-100/50 flex items-center gap-5">
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm border border-indigo-100">
                <ClipboardList className="w-6 h-6" />
              </div>
              <div>
                <p className="text-2xl font-display font-black text-slate-900 leading-none">{assets.length}</p>
                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500 mt-1 block">Bens Vistoriados</span>
              </div>
            </div>
            <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 flex items-center gap-5">
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-400 shadow-sm border border-slate-100">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-700 leading-none">{formatDate(inspection.date)}</p>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1 block">Início da Vistoria</span>
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="flex flex-col gap-8">
            <div className="space-y-3">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">
                Servidor Responsável pela Sala
              </label>
              <div className="relative">
                <User className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 text-slate-300" />
                <Input 
                  value={responsibleName}
                  onChange={(e) => setResponsibleName(e.target.value)}
                  placeholder="Nome completo do servidor"
                  className="pl-14 h-16 text-base font-bold placeholder:text-slate-300 bg-slate-50/50 border-slate-200 rounded-2xl focus:bg-white transition-all shadow-sm"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between ml-1">
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em]">
                  Assinatura Digital do Servidor
                </label>
                {!isCanvasEmpty && (
                  <button 
                    onClick={clearSignature}
                    className="flex items-center gap-2 text-rose-500 hover:text-rose-600 font-black text-[10px] uppercase tracking-widest transition-all bg-rose-50 px-4 py-2 rounded-xl border border-rose-100 shadow-sm"
                  >
                    <Trash2 className="w-4 h-4" /> Limpar Escrita
                  </button>
                )}
              </div>
              
              <div className={cn(
                "border-4 border-dashed rounded-[2.5rem] bg-white relative group overflow-hidden touch-none h-72 transition-all duration-500",
                isCanvasEmpty ? "border-slate-100 bg-slate-50/30" : "border-indigo-600 ring-[12px] ring-indigo-50"
              )}>
                <SignatureCanvas
                  ref={sigPad}
                  penColor="#1e293b"
                  onBegin={() => setIsCanvasEmpty(false)}
                  velocityFilterWeight={0.7}
                  canvasProps={{
                    className: "w-full h-full cursor-crosshair",
                    style: { width: '100%', height: '100%', touchAction: 'none' }
                  }}
                />
                {isCanvasEmpty && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-slate-200">
                    <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center shadow-xl border border-slate-100 mb-4 animate-bounce duration-[2000ms]">
                      <Signature className="w-10 h-10" />
                    </div>
                    <span className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">Assine com o dedo ou mouse</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {error && (
            <Alert variant="error" className="rounded-3xl p-6 border-rose-100 bg-rose-50/50">
              <div className="flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-rose-500 shrink-0 mt-0.5" />
                <div className="flex flex-col gap-1">
                  <p className="font-bold text-rose-900 text-sm">Atenção Necessária</p>
                  <p className="text-xs text-rose-700/80 font-medium leading-relaxed">{error}</p>
                </div>
              </div>
            </Alert>
          )}

          <div className="bg-slate-900 p-8 rounded-[2rem] flex flex-col items-center gap-4 text-center">
             <div className="w-10 h-10 bg-indigo-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                <ShieldCheck className="w-5 h-5" />
             </div>
             <p className="text-[11px] leading-relaxed text-slate-400 font-bold max-w-sm uppercase tracking-widest">
               Este documento possui validade administrativa. Ao assinar, você declara estar ciente do estado físico dos bens patrimoniais registrados.
             </p>
          </div>
        </div>

        {/* Footer Actions - Fixed */}
        <div className="px-8 py-8 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row gap-4 shrink-0">
          <Button 
            variant="outline" 
            onClick={onClose} 
            className="flex-1 h-16 border-slate-200 text-slate-500 font-black text-xs uppercase tracking-[0.2em] rounded-2xl hover:bg-slate-100 transition-all"
          >
            Cancelar
          </Button>
          <Button 
            onClick={handleSave}
            loading={isSaving}
            icon={CheckCircle}
            className="flex-[2] h-16 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase tracking-[0.2em] rounded-2xl shadow-[0_20px_40px_-10px_rgba(79,70,229,0.4)] transition-all transform active:scale-95"
          >
            Confirmar e Assinar Termo
          </Button>
        </div>
      </Card>
    </div>
  );
}
