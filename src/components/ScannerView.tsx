import React, { useState, useEffect, useRef } from 'react';
import { Html5QrcodeScanner, Html5QrcodeScanType } from 'html5-qrcode';
import { Camera, X, Box, CheckCircle2, ChevronRight, Share, Search, Info, ExternalLink, ShieldCheck, Zap } from 'lucide-react';
import { Button, Card } from './UI';
import { db, Inspection, Asset } from '../lib/db';
import { supabase } from '../lib/supabase'; // Nosso Supabase oficial

export function ScannerView({ onOpenInspection }: { onOpenInspection: (id: string, locationId: string) => void }) {
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      "qr-reader",
      {
        fps: 15,
        qrbox: { width: 260, height: 260 },
        supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
        rememberLastUsedCamera: true,
      },
      false
    );
    scannerRef.current = scanner;

    let isProcessing = false;

    scanner.render(
      (decodedText) => {
        if (isProcessing) return;
        isProcessing = true;
        
        try {
           scanner.pause(true);
        } catch(e) {}
        
        handleScan(decodedText).finally(() => {
           isProcessing = false;
        });
      },
      (error) => {
        // Ignora erros genéricos de frame vazio do leitor
      }
    );

    return () => {
      if (scannerRef.current) {
         scannerRef.current.clear().catch(console.error);
      }
    };
  }, []);

  const handleScan = async (text: string) => {
    setScanResult(text);
    
    let isVistoria = false;
    let isLocal = false;
    let id = "";

    if (text.includes("/vistoria/")) {
      isVistoria = true;
      id = text.split("/vistoria/")[1]?.split("?")[0];
    } else if (text.includes("/local/")) {
      isLocal = true;
      id = text.split("/local/")[1]?.split("?")[0];
    } else if (text.includes("/item/") || text.includes("/asset/")) {
      id = text.split("/item/")[1]?.split("?")[0] || text.split("/asset/")[1]?.split("?")[0];
    } else if (text.startsWith("VISTORIA_ID:")) {
      isVistoria = true;
      id = text.replace("VISTORIA_ID:", "");
    } else if (text.startsWith("LOCAL_ID:")) {
      isLocal = true;
      id = text.replace("LOCAL_ID:", "");
    } else {
      id = text;
    }

    setLoading(true);
    setError(null);
    try {
      const assetById = await db.assets.get(id);
      const assetByPatrimony = await db.assets.where('patrimonyNumber').equals(id).first();
      const asset = assetById || assetByPatrimony;

      if (asset) {
        onOpenInspection(asset.inspectionId, ''); 
        return;
      }

      if (isVistoria) {
         const localInsp = await db.inspections.get(id);
         if (localInsp) {
           onOpenInspection(localInsp.id, localInsp.locationId);
           return;
         }
      }

      if (!window.navigator.onLine) {
         setError("Dados não disponíveis offline.");
         setScanResult(null);
         setLoading(false);
         if (scannerRef.current) {
            try { scannerRef.current.resume(); } catch(e){}
         }
         return;
      }

      if (isVistoria) {
         const { data: inspData, error: inspError } = await supabase
           .from('inspections')
           .select('*')
           .eq('id', id)
           .single();

         if (!inspError && inspData) {
           await db.inspections.put({ 
             id: inspData.id, 
             locationId: inspData.locationId, 
             date: inspData.date,
             participants: inspData.participants,
             status: inspData.status
           } as any);
           
           const { data: assetsData } = await supabase
             .from('assets')
             .select('*')
             .eq('inspectionId', inspData.id)
             .limit(100);

           if (assetsData) {
             const assetsPromises = assetsData.map(a => db.assets.put({ 
               id: a.id, 
               inspectionId: a.inspectionId, 
               name: a.name,
               patrimonyNumber: a.patrimonyNumber, 
               condition: a.condition,
               observations: a.observations,
               photos: a.photos,
               hash: a.hash,
               quantity: a.quantity
             } as any));
             await Promise.all(assetsPromises);
           }

           onOpenInspection(inspData.id, inspData.locationId);
           return;
         }
      } else if (isLocal) {
         const { data: locData } = await supabase
           .from('locations')
           .select('*')
           .eq('id', id)
           .single();

         if (locData) {
           onOpenInspection('NEW', locData.id);
           return;
         }
      } else {
        const { data: assetData } = await supabase
          .from('assets')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        let foundAssetData: any = assetData;
        if (!foundAssetData) {
          const { data: patrimonyData } = await supabase
            .from('assets')
            .select('*')
            .eq('patrimonyNumber', id)
            .limit(1)
            .maybeSingle();
          foundAssetData = patrimonyData;
        }

        if (foundAssetData) {
          onOpenInspection(foundAssetData.inspectionId, ''); 
          return;
        }
      }

      setError("Código não reconhecido ou Vistoria não encontrada.");
      setScanResult(null);
      if (scannerRef.current) {
        try { scannerRef.current.resume(); } catch(e){}
      }

    } catch (err: any) {
      console.error(err);
      setError("Erro ao processar o QR Code.");
      setScanResult(null);
      if (scannerRef.current) {
        try { scannerRef.current.resume(); } catch(e){}
      }
    } finally {
      if (loading) {
         setLoading(false);
      }
    }
  };

  const openGoogleLens = () => {
    const isAndroid = /Android/i.test(navigator.userAgent);
    if (isAndroid) {
      window.location.href = "intent://#Intent;scheme=googleapp;package=com.google.android.googlequicksearchbox;action=com.google.zxing.client.android.SCAN;end";
    } else {
      window.open("https://www.google.com/search?q=google+lens", "_blank");
    }
  };

  return (
    <div className="flex flex-col min-h-[80vh] md:min-h-0 animate-in fade-in duration-700 pb-24 max-w-xl mx-auto w-full">
      {/* Cabeçalho Profissional */}
      <div className="flex flex-col items-center mb-8 mt-4 text-center gap-3">
        <div className="w-16 h-16 bg-gradient-to-tr from-slate-900 to-indigo-900 rounded-3xl flex items-center justify-center shadow-2xl shadow-indigo-500/10 border border-slate-800">
           <Camera className="w-7 h-7 text-indigo-400" />
        </div>
        <div className="flex flex-col gap-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full mx-auto mb-1">
             <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
             <span className="text-[9px] font-black uppercase tracking-widest">Sensor Ativo</span>
          </div>
          <h2 className="text-2xl lg:text-3xl font-display font-black text-slate-900 tracking-tight">Leitor de Selo Patrimonial</h2>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
            Auditoria por QR Code ou Etiqueta de Tombo
          </p>
        </div>
      </div>

      <div style={{ display: scanResult ? 'none' : 'block' }} className="flex-1 flex flex-col w-full px-2">
        {/* Mockup Dispositivo Moderno */}
        <div className="bg-slate-950 p-4 rounded-[3.5rem] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.3)] border-4 border-slate-900 relative">
          {/* Ilha Superior / Altifalante do Dispositivo */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2 w-28 h-4 bg-slate-900 rounded-full z-20 flex items-center justify-center">
             <div className="w-10 h-1 bg-slate-800 rounded-full"></div>
          </div>
          
          <div className="relative rounded-[2.5rem] overflow-hidden bg-black mt-3 shadow-inner border border-slate-800">
             <div id="qr-reader" className="w-full text-center qr-reader-container !border-none min-h-[340px] flex items-center justify-center opacity-90" />
             
             {/* Overlay de Mira Profissional */}
             <div className="absolute inset-0 z-10 pointer-events-none flex flex-col items-center justify-center gap-4">
                 <div className="w-60 h-60 border border-white/20 rounded-[2.5rem] relative bg-slate-950/20 backdrop-blur-[2px]">
                    {/* Cantos Estilizados */}
                    <div className="absolute -top-1 -left-1 w-12 h-12 border-t-4 border-l-4 border-indigo-500 rounded-tl-2xl"></div>
                    <div className="absolute -top-1 -right-1 w-12 h-12 border-t-4 border-r-4 border-indigo-500 rounded-tr-2xl"></div>
                    <div className="absolute -bottom-1 -left-1 w-12 h-12 border-b-4 border-l-4 border-indigo-500 rounded-bl-2xl"></div>
                    <div className="absolute -bottom-1 -right-1 w-12 h-12 border-b-4 border-r-4 border-indigo-500 rounded-br-2xl"></div>
                    
                    {/* Linha de Varredura Laser */}
                    <div className="absolute top-1/2 left-4 right-4 h-0.5 bg-gradient-to-r from-transparent via-indigo-400 to-transparent shadow-[0_0_15px_4px_rgba(129,140,248,0.7)] animate-pulse"></div>
                 </div>
                 
                 <div className="bg-slate-900/90 backdrop-blur-md text-white text-[9px] font-black uppercase tracking-[0.2em] px-5 py-2.5 rounded-xl border border-white/10 shadow-2xl">
                    Posicione o código no visor
                 </div>
             </div>
          </div>
        </div>
        
        {error && (
          <div className="mt-6 flex items-center gap-3 bg-rose-50 border border-rose-100 p-5 rounded-2xl text-rose-600 shadow-xl shadow-rose-900/5 animate-in slide-in-from-top-2">
             <X className="w-5 h-5 shrink-0" />
             <p className="text-xs font-bold uppercase tracking-widest leading-relaxed">{error}</p>
          </div>
        )}

        {/* Dicas e Alternativas */}
        <div className="mt-6 flex flex-col gap-4">
          <div className="flex items-start gap-4 p-5 bg-white border border-slate-100 rounded-2xl text-slate-500 shadow-sm">
             <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0 border border-indigo-100/50">
                <Info className="w-4 h-4 text-indigo-600" />
             </div>
             <p className="text-[11px] font-medium leading-relaxed text-slate-600">
               Mantenha o telemóvel firme e garanta boa iluminação ambiente caso a leitura automática demore.
             </p>
          </div>

          <button 
            onClick={openGoogleLens}
            className="w-full h-16 bg-white border border-slate-200 hover:border-indigo-300 hover:bg-slate-50/80 transition-all rounded-2xl flex items-center px-6 gap-4 shadow-sm group"
          >
            <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-indigo-600 flex items-center justify-center transition-all shadow-sm">
               <Search className="w-4 h-4 text-slate-600 group-hover:text-white" />
            </div>
            <div className="flex flex-col items-start text-left">
               <span className="font-display font-bold text-slate-900 text-xs uppercase tracking-wider">Scanner Externo Nativo</span>
               <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Google Lens / Sistema</span>
            </div>
            <ExternalLink className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 transition-all ml-auto" />
          </button>
        </div>
      </div>

      {loading && scanResult && (
        <div className="flex-1 flex flex-col items-center justify-center py-20 gap-8 animate-in fade-in zoom-in-95 duration-500">
           <div className="w-24 h-24 bg-emerald-50 rounded-3xl flex items-center justify-center animate-pulse shadow-2xl border-4 border-emerald-100">
              <CheckCircle2 className="w-12 h-12 text-emerald-600" />
           </div>
           <div className="flex flex-col items-center gap-2">
              <h3 className="font-display font-black text-3xl text-slate-900 tracking-tight">Capturado!</h3>
              <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-[10px]">A sincronizar com o servidor...</p>
           </div>
        </div>
      )}
    </div>
  );
}