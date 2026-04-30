import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Download, Landmark, ShieldCheck } from 'lucide-react';
import { Button } from './UI';

interface QRCodeCardProps {
  id: string;
  name: string;
  type: 'local' | 'vistoria';
}

export function QRCodePrintCard({ id, name, type }: QRCodeCardProps) {
  const url = `${window.location.origin}/${type}/${id}`;

  const downloadQR = () => {
    const svg = document.getElementById(`qr-code-${id}`);
    if (!svg) return;
    
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    
    img.onload = () => {
      canvas.width = img.width + 40;
      canvas.height = img.height + 120;
      if (ctx) {
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 20, 20);
        
        ctx.fillStyle = "#0f172a"; // slate-900
        ctx.font = "bold 14px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(name.toUpperCase(), canvas.width / 2, img.height + 60);
        
        ctx.font = "9px Inter, sans-serif";
        ctx.fillStyle = "#64748b"; // slate-500
        ctx.fillText("PATRI-MV - MANOEL VIANA/RS", canvas.width / 2, img.height + 85);
        ctx.fillText("CONSULTA PÚBLICA DE PATRIMÔNIO", canvas.width / 2, img.height + 100);
      }
      
      const pngFile = canvas.toDataURL("image/png");
      const downloadLink = document.createElement("a");
      downloadLink.download = `QRCode_${name.replace(/\s+/g, '_')}.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };
    
    img.src = "data:image/svg+xml;base64," + btoa(svgData);
  };

  return (
    <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 flex flex-col items-center gap-6 shadow-sm border-2 border-slate-900 ring-8 ring-slate-900/5">
      <div className="flex flex-col items-center gap-2 text-center">
         <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center mb-2">
            <ShieldCheck className="w-6 h-6 text-white" />
         </div>
         <h4 className="font-black text-slate-900 uppercase tracking-tighter text-lg">{name}</h4>
         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Etiqueta de Identificação</p>
      </div>

      <div className="p-4 bg-white rounded-3xl border-2 border-slate-100 shadow-inner">
        <QRCodeSVG 
          id={`qr-code-${id}`}
          value={url} 
          size={180}
          level="H"
          includeMargin={true}
          imageSettings={{
            src: "/patri_logo_mini.png", // Fallback if doesn't exist is fine
            x: undefined,
            y: undefined,
            height: 40,
            width: 40,
            excavate: true,
          }}
        />
      </div>

      <div className="flex flex-col gap-2 w-full">
        <Button onClick={downloadQR} icon={Download} variant="primary" className="h-12 rounded-2xl uppercase font-black text-[10px] tracking-widest">
           BAIXAR ETIQUETA PNG
        </Button>
      </div>
    </div>
  );
}
