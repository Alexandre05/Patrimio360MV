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
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex flex-col items-center mb-4 text-center">
        <h2 className="text-3xl font-display tracking-tight font-bold text-primary mb-2">Escanear Vistoria</h2>
        <p className="text-text-muted">Aponte a câmera para o QR Code de um local ou de uma vistoria já realizada para carregá-la na íntegra.</p>
      </div>

      <div style={{ display: scanResult ? 'none' : 'block' }}>
        <Card className="p-4 overflow-hidden shadow-2xl relative max-w-md mx-auto w-full">
           <div className="relative rounded-2xl overflow-hidden bg-slate-900 isolate">
             <div id="qr-reader" className="w-full text-center qr-reader-container [&_#qr-reader-results]:hidden !border-none" />
             
             {/* Scanner Overlay (Mira) */}
             <div className="absolute inset-0 z-10 pointer-events-none flex flex-col items-center justify-center space-y-4">
                 <div className="w-48 h-48 sm:w-64 sm:h-64 border-2 border-white/40 border-dashed rounded-3xl relative">
                    {/* Corner marks */}
                    <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-emerald-500 rounded-tl-2xl"></div>
                    <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-emerald-500 rounded-tr-2xl"></div>
                    <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-emerald-500 rounded-bl-2xl"></div>
                    <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-emerald-500 rounded-br-2xl"></div>
                    
                    {/* Scanning animation line */}
                    <div className="absolute -top-1 left-2 tracking-line w-[calc(100%-1rem)] h-[2px] bg-emerald-500 shadow-[0_0_8px_2px_rgba(16,185,129,0.5)]"></div>
                 </div>
                 
                 <div className="bg-black/50 backdrop-blur-sm text-white text-xs font-semibold px-4 py-2 rounded-full absolute bottom-6 max-w-[80%] text-center">
                   Posicione o QR Code centralizado na área pontilhada
                 </div>
             </div>
           </div>
           
           {error && (
             <div className="text-rose-500 mt-4 text-center font-bold bg-rose-50 p-3 rounded-xl border border-rose-100">{error}</div>
           )}

           <div className="mt-6 flex flex-col gap-3">
              <div className="flex items-start gap-3 p-4 bg-blue-50/50 rounded-2xl border border-blue-100 text-blue-700 text-sm">
                <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p>O leitor integrado pode ter dificuldades em ambientes com pouca luz ou códigos muito pequenos.</p>
              </div>

              <Button 
                variant="outline" 
                onClick={openGoogleLens}
                className="w-full py-4 border-slate-200 hover:border-primary hover:text-primary transition-all group rounded-2xl flex items-center justify-center gap-3"
              >
                <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-yellow-400 via-rose-500 to-blue-500 p-[2px] flex items-center justify-center">
                   <div className="w-full h-full bg-white rounded-md flex items-center justify-center">
                      <Search className="w-4 h-4 text-slate-700" />
                   </div>
                </div>
                <span className="font-bold">Abrir com Google Lens</span>
                <ExternalLink className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Button>
           </div>
        </Card>
      </div>

      {loading && scanResult && (
        <div className="flex flex-col items-center py-20 gap-6 animate-in fade-in zoom-in-95 duration-500">
           <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center animate-pulse shadow-xl shadow-emerald-500/20">
              <CheckCircle2 className="w-10 h-10 text-emerald-500" />
           </div>
           <div className="flex flex-col items-center gap-2">
             <h3 className="font-display font-bold text-2xl text-emerald-600">QR Reconhecido</h3>
             <p className="text-text-muted animate-pulse font-medium">Carregando vistoria...</p>
           </div>
        </div>
      )}
    </div>
  );
}
