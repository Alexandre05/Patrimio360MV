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
    } else if (text.startsWith("VISTORIA_ID:")) {
      isVistoria = true;
      id = text.replace("VISTORIA_ID:", "");
    } else if (text.startsWith("LOCAL_ID:")) {
      isLocal = true;
      id = text.replace("LOCAL_ID:", "");
    }

    if (!id) {
      setError("QR Code inválido - Identificador desconhecido");
      setScanResult(null);
      if (scannerRef.current) {
        try { scannerRef.current.resume(); } catch(e){}
      }
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Step 1: Let's check if it's an inspection ID in Dexie (Fastest)
      if (isVistoria) {
         const localInsp = await db.inspections.get(id);
         if (localInsp) {
           onOpenInspection(localInsp.id, localInsp.locationId);
           return;
         }
      }

      const isOnline = window.navigator.onLine;

      if (!isOnline) {
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
      }

      setError("Vistoria não encontrada ou acesso negado.");
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
    <div className="flex flex-col min-h-[80vh] md:min-h-0 bg-slate-50 md:bg-transparent -m-4 md:m-0 p-4 md:p-0 animate-in fade-in duration-500">
      <div className="flex flex-col items-center mb-8 mt-4 text-center">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4 shadow-sm border border-blue-200">
           <Camera className="w-8 h-8 text-blue-600" />
        </div>
        <h2 className="text-3xl md:text-4xl font-display tracking-tight font-black text-slate-900 mb-3">Escanear QR Code</h2>
        <p className="text-slate-500 font-medium text-sm md:text-base max-w-sm">Aponte a câmera para um código de patrimônio ou para iniciar/continuar uma vistoria.</p>
      </div>

      <div style={{ display: scanResult ? 'none' : 'block' }} className="flex-1 flex flex-col">
        <Card className="p-4 md:p-6 overflow-hidden shadow-2xl relative max-w-md mx-auto w-full border-2 border-slate-200 rounded-[2.5rem] bg-white">
           <div className="relative rounded-2xl overflow-hidden bg-slate-900 isolate shadow-[inset_0_4px_20px_rgba(0,0,0,0.5)]">
             <div id="qr-reader" className="w-full text-center qr-reader-container [&_#qr-reader-results]:hidden !border-none min-h-[300px] flex items-center justify-center" />
             
             {/* Scanner Overlay (Mira) */}
             <div className="absolute inset-0 z-10 pointer-events-none flex flex-col items-center justify-center space-y-4">
                 <div className="w-56 h-56 md:w-64 md:h-64 border-2 border-white/20 rounded-3xl relative">
                    {/* Corner marks */}
                    <div className="absolute -top-1 -left-1 w-10 h-10 border-t-8 border-l-8 border-emerald-500 rounded-tl-2xl"></div>
                    <div className="absolute -top-1 -right-1 w-10 h-10 border-t-8 border-r-8 border-emerald-500 rounded-tr-2xl"></div>
                    <div className="absolute -bottom-1 -left-1 w-10 h-10 border-b-8 border-l-8 border-emerald-500 rounded-bl-2xl"></div>
                    <div className="absolute -bottom-1 -right-1 w-10 h-10 border-b-8 border-r-8 border-emerald-500 rounded-br-2xl"></div>
                    
                    {/* Scanning animation line */}
                    <div className="absolute top-0 left-2 tracking-line w-[calc(100%-1rem)] h-[3px] rounded-full bg-emerald-500 shadow-[0_0_12px_4px_rgba(16,185,129,0.7)] animate-scan"></div>
                 </div>
                 
                 <div className="bg-slate-900/80 backdrop-blur-md text-white text-xs md:text-sm font-semibold px-6 py-3 rounded-2xl absolute bottom-6 max-w-[90%] text-center border border-white/10 shadow-lg">
                   Centralize o Código na marcação
                 </div>
             </div>
           </div>
           
           {error && (
             <div className="text-rose-600 mt-6 text-center font-bold bg-rose-50 p-4 rounded-2xl border border-rose-200 flex items-center gap-3 justify-center shadow-sm">
               <X className="w-5 h-5 shrink-0" />
               <span className="text-sm">{error}</span>
             </div>
           )}

           <div className="mt-6 flex flex-col gap-4">
              <div className="flex items-start gap-4 p-5 bg-blue-50/70 rounded-2xl border border-blue-100 text-blue-800 text-sm shadow-sm transition-all hover:bg-blue-50">
                <Info className="w-6 h-6 flex-shrink-0 text-blue-500" />
                <p className="font-medium leading-relaxed">Se o leitor não focar, afaste um pouco o celular ou use lente bem iluminada.</p>
              </div>

              <Button 
                variant="outline" 
                onClick={openGoogleLens}
                className="w-full h-16 border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 transition-all rounded-2xl flex items-center justify-center gap-4 shadow-sm group"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-white flex items-center justify-center shadow-sm border border-slate-200 transition-colors">
                   <Search className="w-5 h-5 text-slate-700" />
                </div>
                <span className="font-bold text-slate-700 group-hover:text-blue-700 text-base">Utilizar Scanner Externo</span>
                <ExternalLink className="w-5 h-5 text-slate-400 group-hover:text-blue-600 transition-colors ml-auto" />
              </Button>
           </div>
        </Card>
      </div>

      {loading && scanResult && (
        <div className="flex-1 flex flex-col items-center justify-center py-20 gap-8 animate-in fade-in zoom-in-95 duration-500">
           <div className="relative">
             <div className="w-24 h-24 bg-emerald-100 rounded-[2rem] flex items-center justify-center animate-pulse shadow-2xl shadow-emerald-500/30 border-4 border-white">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 drop-shadow-md" />
             </div>
             <div className="absolute inset-0 bg-emerald-400 rounded-[2rem] animate-ping opacity-20"></div>
           </div>
           <div className="flex flex-col items-center gap-3">
             <h3 className="font-display font-black text-3xl text-emerald-700 tracking-tight">Leitura Concluída</h3>
             <p className="text-slate-500 font-bold tracking-widest uppercase text-xs animate-pulse bg-slate-100 px-4 py-2 rounded-full">Carregando dados...</p>
           </div>
        </div>
      )}
    </div>
  );
}
