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
  Clock,
  MapPin,
  ClipboardList
} from 'lucide-react';
import { Card, Button, Input, Alert } from './UI';
import { db as firestore, handleFirestoreError } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { Asset, Location, Inspection } from '../lib/db';
import { formatDate } from '../lib/utils';
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

  if (!isOpen) return null;

  const clearSignature = () => {
    sigPad.current?.clear();
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

    if (sigPad.current?.isEmpty()) {
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl border-indigo-100 flex flex-col gap-0 p-0 overflow-hidden relative translate-y-0 scale-100 transition-all">
        
        {/* Header */}
        <div className="p-6 bg-slate-50 border-b border-slate-100 sticky top-0 z-10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-600/20">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-display font-black text-slate-900 leading-tight">Encerramento do Setor</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{location.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-xl transition-all text-slate-400">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-8 flex flex-col gap-8">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100/50">
              <div className="flex items-center gap-3 text-indigo-600 mb-1">
                <ClipboardList className="w-4 h-4" />
                <span className="text-[10px] font-black uppercase tracking-widest leading-none">Bens Vistoriados</span>
              </div>
              <p className="text-2xl font-display font-black text-slate-900">{assets.length}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-3 text-slate-400 mb-1">
                <Clock className="w-4 h-4" />
                <span className="text-[10px] font-black uppercase tracking-widest leading-none">Início da Vistoria</span>
              </div>
              <p className="text-sm font-bold text-slate-700">{formatDate(inspection.date)}</p>
            </div>
          </div>

          {/* Form */}
          <div className="flex flex-col gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">
                Servidor Responsável pela Sala
              </label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
                <Input 
                  value={responsibleName}
                  onChange={(e) => setResponsibleName(e.target.value)}
                  placeholder="Nome completo do servidor"
                  className="pl-12 h-14 text-sm font-bold placeholder:text-slate-300 bg-white"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between ml-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                  Assinatura Digital (Toque ou Mouse)
                </label>
                <button 
                  onClick={clearSignature}
                  className="flex items-center gap-1.5 text-rose-500 hover:text-rose-600 font-black text-[9px] uppercase tracking-widest transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Limpar
                </button>
              </div>
              
              <div className="border-2 border-dashed border-slate-200 rounded-[2rem] bg-slate-50 relative group overflow-hidden touch-none h-48">
                <SignatureCanvas
                  ref={sigPad}
                  penColor="#1e293b" // slate-800
                  canvasProps={{
                    className: "w-full h-full cursor-crosshair",
                    style: { width: '100%', height: '100%' }
                  }}
                />
                {!sigPad.current || sigPad.current.isEmpty() ? (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
                    <Signature className="w-12 h-12" />
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {error && (
            <Alert variant="error" title="Atenção">
              {error}
            </Alert>
          )}

          <div className="bg-indigo-50/30 p-5 rounded-2xl border border-indigo-100/30">
            <p className="text-[10px] leading-relaxed text-indigo-600/80 font-bold text-center">
              Ao assinar este documento digitalmente, o servidor confirma a conferência física de todos os itens listados e assume o compromisso administrativo pela custódia dos mesmos.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-4">
          <Button 
            variant="outline" 
            onClick={onClose} 
            className="flex-1 h-14 border-slate-200 text-slate-500 font-black text-[11px] uppercase tracking-widest rounded-2xl"
          >
            Cancelar
          </Button>
          <Button 
            onClick={handleSave}
            loading={isSaving}
            icon={CheckCircle}
            className="flex-[2] h-14 bg-indigo-600 text-white font-black text-[11px] uppercase tracking-widest rounded-2xl shadow-xl shadow-indigo-600/20"
          >
            Encerrar e Gerar PDF
          </Button>
        </div>
      </Card>
    </div>
  );
}
