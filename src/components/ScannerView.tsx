import React, { useEffect, useState, useRef } from 'react';
import { Html5QrcodeScanner, Html5QrcodeScanType } from 'html5-qrcode';
import { Camera, X, Box, CheckCircle2, ChevronRight, Share, Search, Info, ExternalLink } from 'lucide-react';
import { Button, Card } from './UI';
import { db, Inspection, Asset } from '../lib/db';
import { db as firestore, auth } from '../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';

export function ScannerView({ onOpenInspection }: { onOpenInspection: (id: string, locationId: string) => void }) {
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      "qr-reader",
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
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
        // Ignore generic scan errors
      }
    );

    return () => {
      if (scannerRef.current) {
         scannerRef.current.clear().catch(console.error);
      }
    };
  }, []); // Run once on mount

  const handleScan = async (text: string) => {
    setScanResult(text);
    
    let isVistoria = false;
    let isLocal = false;
    let id = "";

    // Check for Deep Link URL patterns
    if (text.includes("/vistoria/")) {
      isVistoria = true;
      id = text.split("/vistoria/")[1]?.split("?")[0];
    } else if (text.includes("/local/")) {
      isLocal = true;
      id = text.split("/local/")[1]?.split("?")[0];
    } else if (text.includes("/item/") || text.includes("/asset/")) {
      id = text.split("/item/")[1]?.split("?")[0] || text.split("/asset/")[1]?.split("?")[0];
      // We will handle asset search below
    } else if (text.startsWith("VISTORIA_ID:")) {
      isVistoria = true;
      id = text.replace("VISTORIA_ID:", "");
    } else if (text.startsWith("LOCAL_ID:")) {
      isLocal = true;
      id = text.replace("LOCAL_ID:", "");
    } else {
      // Could be a patrimony number directly or an asset ID
      id = text;
    }

    setLoading(true);
    setError(null);
    try {
      const isOnline = window.navigator.onLine;

      // 1. Try to check if it's a known Asset by ID or Patrimony (Dexie first)
      const assetById = await db.assets.get(id);
      const assetByPatrimony = await db.assets.where('patrimonyNumber').equals(id).first();
      const asset = assetById || assetByPatrimony;

      if (asset) {
        onOpenInspection(asset.inspectionId, ''); // Opening inspection where it belongs
        return;
      }

      // Step 2: Let's check if it's an inspection ID in Dexie
      if (isVistoria) {
         const localInsp = await db.inspections.get(id);
         if (localInsp) {
           onOpenInspection(localInsp.id, localInsp.locationId);
           return;
         }
      }

      if (!window.navigator.onLine) {
         setError("Dados não disponíveis offline");
         setScanResult(null);
         setLoading(false);
         if (scannerRef.current) {
            try { scannerRef.current.resume(); } catch(e){}
         }
         return;
      }

      // Check Cloud if online
      if (isVistoria) {
         const inspRef = doc(firestore, 'inspections', id);
         const inspSnap = await getDoc(inspRef);
         if (inspSnap.exists()) {
           const data = inspSnap.data() as Inspection;
           await db.inspections.put({ id: inspSnap.id, ...(data as any) } as any);
           
           // Fetch assets - restricted query for public security compatibility
           let assetsQuery;
           if (auth.currentUser) {
             assetsQuery = query(
               collection(firestore, 'assets'), 
               where('inspectionId', '==', inspSnap.id),
               limit(100)
             );
           } else {
             assetsQuery = query(
               collection(firestore, 'assets'), 
               where('inspectionId', '==', inspSnap.id),
               where('isPublic', '==', true),
               limit(100)
             );
           }
           
           try {
             const assetsSnap = await getDocs(assetsQuery);
             const assetsPromises = assetsSnap.docs.map(doc => db.assets.put({ id: doc.id, ...(doc.data() as any) } as any));
             await Promise.all(assetsPromises);
           } catch(e) {
             console.warn("Assets sync failed (likely permission-related), continuing with metadata only.");
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
        // Global Asset Search by ID or Patrimony in Firestore
        const assetRef = doc(firestore, 'assets', id);
        const assetSnap = await getDoc(assetRef);
        
        let foundAssetData: any = null;
        if (assetSnap.exists()) {
          foundAssetData = assetSnap.data();
        } else {
          // Search by patrimony number
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

      setError("Código não reconhecido ou Vistoria não encontrada.");
      setScanResult(null);
      if (scannerRef.current) {
        try { scannerRef.current.resume(); } catch(e){}
      }

    } catch (err: any) {
      console.error(err);
      if (err.message && err.message.toLowerCase().includes('permission')) {
         setError("Erro 403: Acesso negado aos dados. Verifique login.");
      } else {
         setError("Erro ao processar o QR Code.");
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
    // There is no direct web API to trigger Google Lens perfectly across platforms,
    // but on Android we can try an intent. On iOS/others, we just open Google.
    const isAndroid = /Android/i.test(navigator.userAgent);
    if (isAndroid) {
      window.location.href = "intent://#Intent;scheme=googleapp;package=com.google.android.googlequicksearchbox;action=com.google.zxing.client.android.SCAN;end";
    } else {
      window.open("https://www.google.com/search?q=google+lens", "_blank");
    }
  };

  return (
    <div className="flex flex-col min-h-[80vh] md:min-h-0 animate-in fade-in duration-700 pb-20">
      <div className="flex flex-col items-center mb-12 mt-10 text-center gap-6">
        <div className="w-20 h-20 bg-indigo-600 rounded-[2rem] flex items-center justify-center shadow-2xl shadow-indigo-600/30 transform hover:scale-110 transition-transform duration-500">
           <Camera className="w-10 h-10 text-white" />
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="text-4xl font-display font-extrabold text-slate-900 tracking-tight leading-tight">Mapeamento Inteligente</h2>
          <p className="text-sm font-medium text-slate-400 uppercase tracking-[0.2em] max-w-sm mx-auto leading-relaxed">
            Aponte para o QR Code de patrimônio ou ambiente para iniciar a auditoria instantânea.
          </p>
        </div>
      </div>

      <div style={{ display: scanResult ? 'none' : 'block' }} className="flex-1 flex flex-col max-w-xl mx-auto w-full">
        <Card className="p-8 md:p-10 overflow-hidden shadow-[0_40px_100px_-20px_rgba(0,0,0,0.1)] rounded-[3.5rem] bg-white border-none relative">
           <div className="relative rounded-[2rem] overflow-hidden bg-slate-900 shadow-[inset_0_4px_30px_rgba(0,0,0,0.8)] border-8 border-slate-50">
             <div id="qr-reader" className="w-full text-center qr-reader-container !border-none min-h-[350px] flex items-center justify-center opacity-80" />
             
             {/* Scanner Overlay (Mira) */}
             <div className="absolute inset-0 z-10 pointer-events-none flex flex-col items-center justify-center gap-6">
                 <div className="w-64 h-64 md:w-72 md:h-72 border-2 border-white/10 rounded-[2.5rem] relative">
                    {/* Corner marks */}
                    <div className="absolute -top-2 -left-2 w-14 h-14 border-t-[10px] border-l-[10px] border-indigo-500 rounded-tl-[1.5rem]"></div>
                    <div className="absolute -top-2 -right-2 w-14 h-14 border-t-[10px] border-r-[10px] border-indigo-500 rounded-tr-[1.5rem]"></div>
                    <div className="absolute -bottom-2 -left-2 w-14 h-14 border-b-[10px] border-l-[10px] border-indigo-500 rounded-bl-[1.5rem]"></div>
                    <div className="absolute -bottom-2 -right-2 w-14 h-14 border-b-[10px] border-r-[10px] border-indigo-500 rounded-br-[1.5rem]"></div>
                    
                    {/* Scanning animation line */}
                    <div className="absolute top-0 left-4 tracking-line w-[calc(100%-2rem)] h-[4px] rounded-full bg-indigo-400 shadow-[0_0_20px_6px_rgba(129,140,248,0.8)]"></div>
                 </div>
                 
                 <div className="bg-indigo-600/90 backdrop-blur-md text-white text-[10px] font-black uppercase tracking-[0.2em] px-8 py-3.5 rounded-2xl border border-white/20 shadow-2xl">
                    Posicione o código no centro
                 </div>
             </div>
           </div>
           
           {error && (
             <div className="mt-8 flex items-center gap-4 bg-rose-50 border border-rose-100 p-6 rounded-3xl animate-in shake duration-500 text-rose-600 shadow-xl shadow-rose-900/5">
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shrink-0 border border-rose-100 shadow-sm">
                  <X className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold uppercase tracking-widest leading-relaxed">{error}</p>
             </div>
           )}

           <div className="mt-10 flex flex-col gap-6">
              <div className="flex items-start gap-4 p-6 bg-slate-50 border border-slate-100 rounded-[2rem] text-slate-500 text-sm transition-all hover:bg-slate-100/50 group">
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shrink-0 border border-slate-100 shadow-sm group-hover:scale-110 transition-transform">
                   <Info className="w-5 h-5 text-indigo-600" />
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-bold text-slate-900 uppercase tracking-widest">Dica de Captura</p>
                  <p className="text-xs font-medium leading-relaxed opacity-80">Afaste levemente o dispositivo caso o foco esteja demorando ou utilize iluminação direta sobre o selo patrimonial.</p>
                </div>
              </div>

              <button 
                onClick={openGoogleLens}
                className="w-full h-20 bg-white border-2 border-slate-50 hover:border-indigo-100 hover:bg-indigo-50/10 transition-all duration-500 rounded-[2rem] flex items-center px-8 gap-5 group shadow-sm hover:shadow-xl hover:shadow-indigo-900/5"
              >
                <div className="w-12 h-12 rounded-xl bg-slate-50 group-hover:bg-indigo-600 flex items-center justify-center shadow-inner transition-all duration-500">
                   <Search className="w-6 h-6 text-slate-400 group-hover:text-white" />
                </div>
                <div className="flex flex-col items-start gap-1">
                   <span className="font-display font-extrabold text-slate-900 text-base tracking-tight group-hover:text-indigo-600 transition-colors">Scanner Externo</span>
                   <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Google Lens / Nativo</span>
                </div>
                <ExternalLink className="w-5 h-5 text-slate-300 group-hover:text-indigo-600 transition-all ml-auto group-hover:translate-x-1 group-hover:-translate-y-1" />
              </button>
           </div>
        </Card>
      </div>

      {loading && scanResult && (
        <div className="flex-1 flex flex-col items-center justify-center py-20 gap-10 animate-in fade-in zoom-in-95 duration-700">
           <div className="relative">
             <div className="w-32 h-32 bg-emerald-100 rounded-[3rem] flex items-center justify-center animate-pulse shadow-[0_40px_80px_-15px_rgba(16,185,129,0.4)] border-4 border-white relative z-10">
                <CheckCircle2 className="w-16 h-16 text-emerald-600 drop-shadow-md" />
             </div>
             <div className="absolute inset-0 bg-emerald-400 rounded-[3rem] animate-ping opacity-10"></div>
             <div className="absolute -inset-4 bg-emerald-50 rounded-[4rem] animate-pulse opacity-50 -z-10"></div>
           </div>
           <div className="flex flex-col items-center gap-4">
             <h3 className="font-display font-black text-4xl text-slate-900 tracking-tight">Capturado!</h3>
             <div className="flex items-center gap-3 bg-white px-6 py-3 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-50">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce"></div>
                <p className="text-slate-400 font-black uppercase tracking-[0.3em] text-[10px]">Puxando dossiê...</p>
             </div>
           </div>
        </div>
      )}
    </div>
  );
}
