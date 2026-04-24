import React from 'react';
import { ScannerView } from './ScannerView';
import { ShieldCheck, ArrowLeft } from 'lucide-react';

export function PublicScannerView({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col p-4">
      <header className="flex items-center gap-4 py-4 mb-6">
        <button onClick={onBack} className="p-2 text-slate-400 hover:text-slate-900 transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div className="flex items-center gap-2">
           <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-white" />
           </div>
           <span className="font-black tracking-tighter text-slate-900 uppercase">PATRI-MV</span>
        </div>
      </header>

      <main className="max-w-md mx-auto w-full">
         <ScannerView 
           onOpenInspection={(id, locId) => {
             // For public scanner, we just update the URL to show the PublicInspectionView
             if (id === 'NEW') {
                window.location.href = `/local/${locId}`;
             } else {
                window.location.href = `/vistoria/${id}`;
             }
           }} 
         />
      </main>
      
      <footer className="mt-auto py-8 text-center">
         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Acesso Público de Consulta • Manoel Viana/RS</p>
      </footer>
    </div>
  );
}
