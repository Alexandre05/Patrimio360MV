import React, { useEffect, useState, useRef } from 'react';
import { Html5QrcodeScanner, Html5QrcodeScanType } from 'html5-qrcode';
import { Camera, X, CheckCircle2, Search, Info, ExternalLink, QrCode, ScanLine } from 'lucide-react';
import { Button, Card } from './UI';
import { db, Inspection, Asset } from '../lib/db';
import { db as firestore, auth } from '../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { cn } from '../lib/utils';

export function ScannerView({ onOpenInspection }: { onOpenInspection: (id: string, locationId: string) => void }) {
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      "qr-reader",
      {
        fps: 15, // Aumentado para leitura mais rápida
        qrbox: { width: 280, height: 280 },
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
        // Ignora os erros de leitura em tempo real (foco, luz, etc)
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

    // Parse inteligente do QR Code
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
      const isOnline = window.navigator.onLine;

      // 1. Procura Local Dexie (Item)
      const assetById = await db.assets.get(id);
      const assetByPatrimony = await db.assets.where('patrimonyNumber').equals(id).first();
      const asset = assetById || assetByPatrimony;

      if (asset) {
        onOpenInspection(asset.inspectionId, ''); 
        return;
      }

      // 2. Procura Local Dexie (Vistoria)
      if (isVistoria) {
         const localInsp = await db.inspections.get(id);
         if (localInsp) {
           onOpenInspection(localInsp.id, localInsp.locationId);
           return;
         }
      }

      if (!isOnline) {
         setError("Item não encontrado na memória offline.");
         setScanResult(null);
         setLoading(false);
         if (scannerRef.current) {
            try { scannerRef.current.resume(); } catch(e){}
         }
         return;
      }

      // 3. Procura na Nuvem (Firestore)
      if (isVistoria) {
         const inspRef = doc(firestore, 'inspections', id);
         const inspSnap = await getDoc(inspRef);
         if (inspSnap.exists()) {
           const data = inspSnap.data() as Inspection;
           await db.inspections.put({ id: inspSnap.id, ...(data as any) } as any);
           
           let assetsQuery;
           if (auth.currentUser) {
             assetsQuery = query(collection(firestore, 'assets'), where('inspectionId', '==', inspSnap.id), limit(100));
           } else {
             assetsQuery = query(collection(firestore, 'assets'), where('inspectionId', '==', inspSnap.id), where('isPublic', '==', true), limit(100));
           }
           
           try {
             const assetsSnap = await getDocs(assetsQuery);
             const assetsPromises = assetsSnap.docs.map(doc => db.assets.put({ id: doc.id, ...(doc.data() as any) } as any));
             await Promise.all(assetsPromises);
           } catch(e) {
             console.warn("Sincronização de itens restrita.");
           }

           onOpenInspection(inspSnap.id, data.locationId);
           return;
         }
      } else if (isLocal) {
         const locRef = doc(firestore, 'locations', id);
         const locSnap = await getDoc(locRef);
         if (locSnap.exists()) {
           onOpenInspection('NEW', locSnap.id);
           return;
         }
      } else {
        const assetRef = doc(firestore, 'assets', id);
        const assetSnap = await getDoc(assetRef);
        
        let foundAssetData: any = null;
        if (assetSnap.exists()) {
          foundAssetData = assetSnap.data();
        } else {
          const q = query(collection(firestore, 'assets'), where('patrimonyNumber', '==', id), limit(1));
          const qSnap = await getDocs(q);
          if (!qSnap.empty) {
            foundAssetData = qSnap.docs[0].data();
          }
        }

        if (foundAssetData) {
          onOpenInspection(foundAssetData.inspectionId, '');
          return;
        }
      }

      setError("QR Code inválido ou item não registado.");
      setScanResult(null);
      if (scannerRef.current) {
        try { scannerRef.current.resume(); } catch(e){}
      }

    } catch (err: any) {
      console.error(err);
      if (err.message && err.message.toLowerCase().includes('permission')) {
         setError("Acesso Negado (Erro 403).");
      } else {
         setError("Falha na leitura do código.");
      }
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
    <div className="flex flex-col min-h-[80vh] md:min-h-0 animate-in fade-in duration-700 pb-20">
      
      {/* ESTILOS CIRÚRGICOS PARA O HTML5-QRCODE */}
      <style>{`
        #qr-reader {
          border: none !important;
          border-radius: 2.5rem !important;
          overflow: hidden !important;
          position: relative !important;
          background: #0f172a !important;
        }
        #qr-reader video {
          object-fit: cover !important;
          width: 100% !important;
          height: 100% !important;
          border-radius: 2.5rem !important;
        }
        /* Ocultar lixo visual da biblioteca */
        #qr-reader__dashboard_section_csr,
        #qr-reader__dashboard_section_swaplink,
        #qr-reader__status_span,
        #qr-reader__header_message {
          display: none !important;
        }
        #qr-reader button {
          background: #4f46e5 !important;
          color: white !important;
          border: none !important;
          padding: 10px 20px !important;
          border-radius: 12px !important;
          font-weight: 900 !important;
          text-transform: uppercase !important;
          letter-spacing: 1px !important;
          margin-bottom: 10px !important;
        }
        /* Animação do Laser */
        @keyframes surgicalScan {
          0%, 100% { top: 5%; opacity: 0; }
          10%, 90% { opacity: 1; }
          50% { top: 95%; }
        }
        .laser-beam {
          animation: surgicalScan 2.5s cubic-bezier(0.53, 0.21, 0.29, 0.67) infinite;
        }
      `}</style>

      {/* CABEÇALHO */}
      <div className="flex flex-col items-center mb-8 mt-6 text-center gap-4">
        <div className="w-16 h-16 bg-slate-900 rounded-[1.5rem] flex items-center justify-center shadow-xl shadow-slate-900/20 transform hover:scale-105 transition-transform duration-500">
           <ScanLine className="w-8 h-8 text-white" />
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl font-display font-extrabold text-slate-900 tracking-tight">Leitura Dinâmica</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
            Auditoria Instantânea de Patrimônio
          </p>
        </div>
      </div>

      {/* ÁREA DO SCANNER */}
      <div className="flex-1 flex flex-col max-w-md mx-auto w-full px-2 relative">
        <div className={cn(
            "relative w-full aspect-[3/4] rounded-[2.5rem] overflow-hidden shadow-2xl transition-all duration-700 bg-slate-900 ring-8 ring-white",
            loading && scanResult ? "scale-95 opacity-0 pointer-events-none absolute" : "scale-100 opacity-100"
        )}>
           
           <div id="qr-reader" className="w-full h-full flex items-center justify-center" />
           
           {/* MÁSCARA "CIRÚRGICA" SOBRE A CÂMARA */}
           <div className="absolute inset-0 pointer-events-none z-10 flex flex-col items-center justify-center">
               {/* Sombra de contorno (Efeito Nativo) */}
               <div className="w-[260px] h-[260px] border-[3px] border-white/20 rounded-[2.5rem] relative shadow-[0_0_0_9999px_rgba(15,23,42,0.65)]">
                  
                  {/* Bordas de Foco (Cantos) */}
                  <div className="absolute -top-1 -left-1 w-12 h-12 border-t-[5px] border-l-[5px] border-white rounded-tl-[2.4rem]"></div>
                  <div className="absolute -top-1 -right-1 w-12 h-12 border-t-[5px] border-r-[5px] border-white rounded-tr-[2.4rem]"></div>
                  <div className="absolute -bottom-1 -left-1 w-12 h-12 border-b-[5px] border-l-[5px] border-white rounded-bl-[2.4rem]"></div>
                  <div className="absolute -bottom-1 -right-1 w-12 h-12 border-b-[5px] border-r-[5px] border-white rounded-br-[2.4rem]"></div>
                  
                  {/* Laser Animado */}
                  <div className="absolute left-[5%] right-[5%] h-[2px] bg-emerald-400 laser-beam shadow-[0_0_15px_4px_rgba(52,211,153,0.7)] rounded-full z-20"></div>
               </div>
               
               <div className="mt-8 bg-slate-900/90 backdrop-blur-md text-white text-[9px] font-black uppercase tracking-[0.3em] px-6 py-3 rounded-full border border-white/10 shadow-2xl">
                  Enquadre o Selo ou Etiqueta
               </div>
           </div>
        </div>
           
        {/* MENSAGEM DE ERRO VISUAL */}
        {error && !loading && (
          <div className="mt-6 flex items-center gap-4 bg-rose-950 text-white p-5 rounded-[2rem] animate-in slide-in-from-bottom-4 duration-500 shadow-2xl shadow-rose-900/20">
            <div className="w-12 h-12 rounded-[1.2rem] bg-rose-500 flex items-center justify-center shrink-0">
               <X className="w-6 h-6 text-white" />
            </div>
            <div className="flex flex-col">
               <span className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-300">Falha na Leitura</span>
               <span className="text-sm font-bold">{error}</span>
            </div>
          </div>
        )}

        {/* BOTÕES AUXILIARES */}
        <div className={cn("mt-6 flex flex-col gap-4 transition-all duration-500", loading && scanResult ? "opacity-0" : "opacity-100")}>
           <button 
             onClick={openGoogleLens}
             className="w-full h-16 bg-white border border-slate-200 hover:border-indigo-600 transition-all duration-300 rounded-[2rem] flex items-center justify-between px-6 group shadow-sm hover:shadow-xl hover:shadow-indigo-900/10"
           >
             <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-slate-50 group-hover:bg-indigo-600 flex items-center justify-center transition-colors">
                   <Search className="w-5 h-5 text-slate-400 group-hover:text-white" />
                </div>
                <div className="flex flex-col items-start">
                   <span className="font-display font-bold text-slate-900 text-sm group-hover:text-indigo-600 transition-colors">Scanner Externo</span>
                   <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Usar Google Lens</span>
                </div>
             </div>
             <ExternalLink className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 transition-transform group-hover:translate-x-1" />
           </button>
        </div>
      </div>

      {/* ESTADO DE SUCESSO (LOCK-ON E CARREGAMENTO PREMIUM) */}
      {loading && scanResult && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-50 animate-in fade-in zoom-in-95 duration-500 p-6">
           <div className="w-full max-w-sm flex flex-col items-center gap-8">
               
               {/* Ícone de Sucesso com Pulsação */}
               <div className="relative">
                 <div className="w-32 h-32 bg-emerald-500 rounded-[3rem] flex items-center justify-center shadow-[0_20px_60px_-15px_rgba(16,185,129,0.5)] z-10 relative transform hover:scale-105 transition-transform">
                    <CheckCircle2 className="w-16 h-16 text-white" />
                 </div>
                 <div className="absolute inset-0 bg-emerald-400 rounded-[3rem] animate-ping opacity-20"></div>
               </div>

               {/* Textos e Feedback */}
               <div className="text-center flex flex-col gap-2 w-full">
                 <h3 className="font-display font-extrabold text-3xl text-slate-900 tracking-tight">Código Validado</h3>
                 
                 {/* Exibição cirúrgica do ID escaneado (Resumo) */}
                 <div className="mt-4 bg-white border border-slate-200 p-4 rounded-3xl flex items-center gap-4 shadow-sm w-full mx-auto">
                    <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center shrink-0">
                       <QrCode className="w-6 h-6 text-slate-400" />
                    </div>
                    <div className="flex flex-col items-start overflow-hidden w-full text-left">
                       <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Hash / ID Identificado</span>
                       <span className="text-sm font-bold text-slate-900 truncate w-full">{scanResult.length > 25 ? `${scanResult.substring(0, 25)}...` : scanResult}</span>
                    </div>
                 </div>

                 {/* Barra de progresso animada */}
                 <div className="mt-8 flex flex-col items-center gap-3">
                    <div className="flex items-center gap-2">
                       <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                       <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                       <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                    <p className="text-slate-400 font-black uppercase tracking-[0.2em] text-[10px]">A resgatar o dossiê do ativo...</p>
                 </div>
               </div>

           </div>
        </div>
      )}

    </div>
  );
}