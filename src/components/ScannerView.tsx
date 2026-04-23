import React, { useEffect, useState, useRef } from 'react';
import { Html5QrcodeScanner, Html5QrcodeScanType } from 'html5-qrcode';
import { Camera, X, Box, CheckCircle2, ChevronRight, Share, Search } from 'lucide-react';
import { Button, Card } from './UI';
import { db, Inspection, Asset } from '../lib/db';
import { db as firestore } from '../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';

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
    let id = "";

    // Check for Deep Link URL pattern
    if (text.startsWith("https://patrimv.web.app/vistoria/")) {
      isVistoria = true;
      id = text.split("/vistoria/")[1]?.split("?")[0];
    } else if (text.startsWith(window.location.origin + "/vistoria/")) {
      isVistoria = true;
      id = text.split("/vistoria/")[1]?.split("?")[0];
    } else if (text.startsWith("VISTORIA_ID:")) {
      isVistoria = true;
      id = text.replace("VISTORIA_ID:", "");
    } else if (text.startsWith("LOCAL_ID:")) {
      isVistoria = false;
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
      // Small artificial delay for visual feedback of "QR Reconhecido"
      await new Promise(r => setTimeout(r, 600));
      
      // Step 1: Let's check if it's an inspection ID in Dexie
      if (isVistoria) {
         const localInsp = await db.inspections.get(id);
         if (localInsp) {
           await new Promise(r => setTimeout(r, 400)); // Delay for UX "Carregando vistoria..."
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
           await db.inspections.put({ id: inspSnap.id, ...data } as any);
           
           // Fetch assets just in case they aren't synced yet
           const assetsQuery = query(collection(firestore, 'assets'), where('inspectionId', '==', inspSnap.id));
           const assetsSnap = await getDocs(assetsQuery);
           const assetsPromises = assetsSnap.docs.map(doc => db.assets.put({ id: doc.id, ...doc.data() } as any));
           await Promise.all(assetsPromises);

           await new Promise(r => setTimeout(r, 400));
           onOpenInspection(inspSnap.id, data.locationId);
           return;
         }
      } else {
         const locRef = doc(firestore, 'locations', id);
         const locSnap = await getDoc(locRef);
         if (locSnap.exists()) {
           await new Promise(r => setTimeout(r, 400));
           onOpenInspection('NEW', locSnap.id);
           return;
         }
      }

      setError("Vistoria não encontrada");
      setScanResult(null);
      if (scannerRef.current) {
        try { scannerRef.current.resume(); } catch(e){}
      }

    } catch (err) {
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

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex flex-col items-center mb-4 text-center">
        <h2 className="text-3xl font-display tracking-tight font-bold text-primary mb-2">Escanear Vistoria</h2>
        <p className="text-text-muted">Aponte a câmera para o QR Code de um local ou de uma vistoria já realizada para carregá-la na íntegra.</p>
      </div>

      <div style={{ display: scanResult ? 'none' : 'block' }}>
        <Card className="p-4 overflow-hidden shadow-2xl relative max-w-md mx-auto w-full">
           <div id="qr-reader" className="w-full text-center qr-reader-container [&_#qr-reader-results]:hidden" />
           {error && (
             <div className="text-rose-500 mt-4 text-center font-bold bg-rose-50 p-3 rounded-xl border border-rose-100">{error}</div>
           )}
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
