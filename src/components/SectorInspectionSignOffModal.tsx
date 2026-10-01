import React, { useState, useRef, useEffect } from 'react';
import { Card, Button, Input } from './UI';
import { ShieldCheck, Signature, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { db, Inspection, Location, Asset, generateId } from '../lib/db';
import { useAuth } from '../lib/AuthContext';
import { auth } from '../lib/firebase';
import { supabase } from '../lib/supabase';
import { useOnlineStatus } from '../lib/hooks';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  inspection: Inspection;
  location: Location;
  assets: Asset[];
  onComplete: () => void;
}

export function SectorInspectionSignOffModal({ isOpen, onClose, inspection, location, assets, onComplete }: Props) {
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const [responsibleName, setResponsibleName] = useState('');
  const [isDrawing, setIsDrawing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // If the modal opens, reset state
    if (isOpen) {
      setResponsibleName('');
      setError(null);
      clearSignature();
    }
  }, [isOpen]);

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setIsDrawing(true);
    draw(e);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.beginPath(); // Reset path
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    
    // Suporte para touch e mouse
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0f172a'; // slate-900

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const isCanvasBlank = (canvas: HTMLCanvasElement) => {
    const context = canvas.getContext('2d');
    if (!context) return true;
    
    const pixelBuffer = new Uint32Array(
      context.getImageData(0, 0, canvas.width, canvas.height).data.buffer
    );
    
    return !pixelBuffer.some(color => color !== 0);
  };

  const handleSubmit = async () => {
    if (!responsibleName.trim()) {
      setError("Por favor, informe o nome completo do responsável.");
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas || isCanvasBlank(canvas)) {
      setError("A assinatura digital é obrigatória.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const signatureBase64 = canvas.toDataURL('image/png');
      const totalItens = assets.reduce((acc, a) => acc + (a.quantity || 1), 0);

      // Save to Supabase if online
      if (isOnline && auth.currentUser) {
        // PASSO 0: Garantir que o Local (Location) exista no Supabase
        await supabase
          .from('locations')
          .upsert({
            id: location.id,
            name: location.name,
            description: location.description || '',
            updatedAt: location.updatedAt || Date.now()
          }, { onConflict: 'id' });

        // PASSO 1: Garantir que a vistoria pai exista no Supabase
        const { error: inspectionError } = await supabase
          .from('inspections')
          .upsert({
            id: inspection.id,
            locationId: inspection.locationId || location.id,
            date: inspection.date || Date.now(),
            status: inspection.status || 'concluida',
            participants: inspection.participants || [],
            deleted: inspection.deleted || false,
            updatedAt: inspection.updatedAt || Date.now()
          }, { onConflict: 'id' });

        if (inspectionError) {
          console.warn("Aviso ao sincronizar vistoria pai:", inspectionError);
        }

        // PASSO 2: Salva a assinatura com segurança absoluta
        const { error: supabaseError } = await supabase
          .from('sector_inspections')
          .upsert({
            id: inspection.id,
            inspectionId: inspection.id,
            responsibleName: responsibleName.trim(),
            signatureBase64: signatureBase64,
            signedAt: Date.now()
          }, { onConflict: 'id' });

        if (supabaseError) {
          throw supabaseError;
        }
      }

      // 🔔 NOTIFICAÇÃO: Criar o aviso para os Administradores no banco local Dexie
      const admins = await db.users.filter(u => u.role === 'administrador' || u.role === 'vistoriador').toArray();
      for (const admin of admins) {
        if (admin.userId !== user?.userId) {
          await db.notifications.add({
            id: generateId(),
            type: 'sistema',
            title: 'Setor Encerrado!',
            message: `O setor "${location?.name}" acaba de concluir a auditoria e assinar o termo de ${totalItens} itens.`,
            date: Date.now(),
            read: false,
            targetUserId: admin.userId,
            relatedId: inspection.id
          });
        }
      }

      onComplete(); // Triggers the parent's finalize flow
      
    } catch (err: any) {
      console.error("Erro ao salvar assinatura:", err);
      setError("Erro ao processar assinatura. Verifique sua conexão e tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
      <Card className="w-full max-w-2xl bg-white border-none shadow-[0_50px_100px_-20px_rgba(0,0,0,0.3)] rounded-[2.5rem] flex flex-col max-h-[95vh] overflow-hidden">
        
        <div className="p-8 pb-6 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-600/20">
              <Signature className="w-7 h-7" />
            </div>
            <div className="flex flex-col">
              <h2 className="text-2xl font-display font-black text-slate-900 tracking-tight leading-none">Termo de Responsabilidade</h2>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-2">Encerramento Setorial</span>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-3 text-slate-400 hover:text-slate-900 hover:bg-white rounded-xl transition-all shadow-sm border border-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8 overflow-y-auto flex-1 custom-scrollbar flex flex-col gap-8">
          
          <div className="bg-indigo-50/50 border border-indigo-100 rounded-[1.5rem] p-6 flex flex-col gap-2">
            <p className="text-sm font-medium text-slate-600 leading-relaxed text-justify">
              Declaro sob as penas da Lei que acompanhei a presente vistoria física patrimonial nas dependências do(a) <strong className="text-slate-900">{location.name}</strong>, conferindo e atestando a existência de <strong className="text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-md">{assets.reduce((acc, a) => acc + (a.quantity || 1), 0)} itens</strong> constantes na lista deste sistema. Confirmo que as condições de conservação relatadas condizem com a realidade atual dos bens em minha posse ou supervisão direta.
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-3 p-4 bg-rose-50 text-rose-600 rounded-2xl border border-rose-100 text-xs font-bold uppercase tracking-widest animate-in shake">
              <AlertCircle className="w-5 h-5 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black text-slate-900 uppercase tracking-widest ml-1">Nome Completo do Responsável</label>
              <Input 
                placeholder="Ex: João Silva de Almeida" 
                value={responsibleName}
                onChange={e => setResponsibleName(e.target.value)}
                className="h-14 font-bold text-slate-700 bg-slate-50 border-slate-200 focus:bg-white"
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between ml-1">
                <label className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Assinatura Digital</label>
                <button 
                  onClick={clearSignature}
                  className="text-[10px] font-bold text-rose-500 hover:text-rose-700 uppercase tracking-widest transition-colors"
                >
                  Limpar Traço
                </button>
              </div>
              <div className="relative border-2 border-dashed border-slate-300 rounded-[2rem] bg-slate-50 overflow-hidden group">
                <canvas
                  ref={canvasRef}
                  width={600}
                  height={250}
                  className="w-full h-48 touch-none cursor-crosshair relative z-10"
                  onMouseDown={startDrawing}
                  onMouseUp={stopDrawing}
                  onMouseOut={stopDrawing}
                  onMouseMove={draw}
                  onTouchStart={startDrawing}
                  onTouchEnd={stopDrawing}
                  onTouchMove={draw}
                />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20 group-hover:opacity-10 transition-opacity">
                  <Signature className="w-16 h-16 text-slate-400" />
                </div>
                <div className="absolute bottom-4 left-0 right-0 text-center pointer-events-none opacity-30">
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Assine na tela acima</span>
                </div>
              </div>
            </div>
          </div>

        </div>

        <div className="p-8 border-t border-slate-100 bg-white flex flex-col sm:flex-row items-center gap-4 shrink-0">
          <Button 
            variant="secondary" 
            onClick={onClose} 
            className="w-full sm:flex-1 h-16 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-slate-100 text-slate-500 hover:bg-slate-200"
          >
            Cancelar
          </Button>
          <Button 
            variant="accent" 
            onClick={handleSubmit} 
            loading={isSubmitting}
            icon={CheckCircle2}
            className="w-full sm:flex-[2] h-16 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-indigo-600/20 bg-indigo-600 hover:bg-indigo-700"
          >
            Atestar e Encerrar Vistoria
          </Button>
        </div>

      </Card>
    </div>
  );
}