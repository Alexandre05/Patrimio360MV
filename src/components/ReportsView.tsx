import { useState } from 'react';
import { Card, Button } from './UI';
import { BarChart3, TrendingUp, AlertCircle, FileText, Download, Users, Award, Lightbulb, Copy, X, ShieldCheck } from 'lucide-react';
import { db, Asset, Location, Inspection } from '../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { cn, formatDate } from '../lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export function ReportsView() {
  const [showBiddingDraft, setShowBiddingDraft] = useState(false);
  const [copied, setCopied] = useState(false);

  const assets = useLiveQuery(() => db.assets.toArray());
  const inspections = useLiveQuery(() => db.inspections.toArray());
  const allUsers = useLiveQuery(() => db.users.toArray());
  const locations = useLiveQuery(() => db.locations.toArray());

  const stats = {
    totalItens: assets?.length || 0,
    ruins: assets?.filter(a => a.condition === 'ruim' || a.condition === 'inservivel').length || 0,
    finalizadas: inspections?.filter(i => i.status === 'finalizada').length || 0,
    semPatrimonio: assets?.filter(a => !a.patrimonyNumber).length || 0
  };

  const inspectorWork = (inspections || [])
    .filter(i => i.status !== 'em_andamento' && i.concludedBy)
    .reduce((acc, current) => {
      const inspectorId = current.concludedBy!;
      acc[inspectorId] = (acc[inspectorId] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

  const ranking = Object.entries(inspectorWork)
    .map(([id, count]) => ({
      id,
      count,
      name: allUsers?.find(u => u.userId === id)?.name || 'Vistoriador Externo'
    }))
    .sort((a, b) => b.count - a.count);

  const locationSummary = locations?.map(loc => {
    const locInspections = inspections?.filter(i => i.locationId === loc.id) || [];
    const locAssets = assets?.filter(a => locInspections.some(i => i.id === a.inspectionId)) || [];
    return {
      ...loc,
      itemCount: locAssets.length
    };
  }).sort((a, b) => b.itemCount - a.itemCount) || [];

  const getBiddingDraftText = () => {
    if (!assets) return '';
    const toReplace = assets.filter(a => a.condition === 'ruim' || a.condition === 'inservivel');
    
    const groups = toReplace.reduce((acc, asset) => {
      acc[asset.name] = (acc[asset.name] || 0) + (asset.quantity || 1);
      return acc;
    }, {} as Record<string, number>);

    const listText = Object.entries(groups)
      .map(([name, qty]) => `- ${qty} unidade(s) de ${name}`)
      .join('\n');

    return `ESTUDO TÉCNICO PRELIMINAR (ETP) - RASCUNHO AUTOMÁTICO
Base Legal: Art. 18, Lei 14.133/2021

1. DESCRIÇÃO DA NECESSIDADE
A presente contratação visa a substituição de bens móveis classificados como críticos/inservíveis durante a última vistoria patrimonial, essenciais para a continuidade dos serviços públicos.

2. QUANTITATIVOS LEVANTADOS PELO SISTEMA
${listText || 'Nenhum item crítico registrado.'}

3. JUSTIFICATIVA
A manutenção dos bens atuais tornou-se antieconômica. A substituição imediata resguarda a administração pública de perdas de eficiência operacional.`;
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(getBiddingDraftText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const generateSingleLocationReport = (locId: string) => {
    const loc = locations?.find(l => l.id === locId);
    if (!loc) return;

    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(`Relatório de Inventário - ${loc.name}`, 14, 22);
    
    doc.setFontSize(11);
    doc.text(`Data de Emissão: ${new Date().toLocaleDateString()}`, 14, 32);
    doc.text(`Descrição: ${loc.description}`, 14, 38);

    const locInspections = inspections?.filter(i => i.locationId === loc.id) || [];
    const locAssets = assets?.filter(a => locInspections.some(i => i.id === a.inspectionId)) || [];

    const tableData = locAssets.map(a => [
      a.name,
      a.patrimonyNumber || '-',
      a.condition.toUpperCase(),
      a.observations || '-'
    ]);

    autoTable(doc, {
      head: [['Item', 'Nº Patrimônio', 'Estado', 'Obs']],
      body: tableData,
      startY: 45,
      theme: 'grid'
    });

    doc.save(`Inventario_${loc.name.replace(/\s+/g, '_')}.pdf`);
  };

  const generateInserviceReport = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Relatório de Bens Inservíveis / Críticos', 14, 22);
    
    doc.setFontSize(11);
    doc.text(`Data de Emissão: ${new Date().toLocaleDateString()}`, 14, 32);
    doc.text(`Total de itens identificados: ${stats.ruins}`, 14, 38);

    const items = assets?.filter(a => a.condition === 'ruim' || a.condition === 'inservivel') || [];
    const tableData = items.map(a => [
      a.name,
      a.patrimonyNumber || '-',
      a.condition.toUpperCase(),
      locations?.find(l => {
        const insp = inspections?.find(i => i.id === a.inspectionId);
        return l.id === insp?.locationId;
      })?.name || 'Local não ident.'
    ]);

    autoTable(doc, {
      head: [['Item', 'Nº Patrimônio', 'Estado', 'Localização']],
      body: tableData,
      startY: 45,
      theme: 'striped'
    });

    doc.save('Relatorio_Bens_Inserviveis.pdf');
  };

  const generateLocationReport = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Inventário Consolidado por Localização', 14, 22);
    
    doc.setFontSize(11);
    doc.text(`Data de Emissão: ${new Date().toLocaleDateString()}`, 14, 32);

    let currentY = 45;

    locations?.forEach(loc => {
      const locInspections = inspections?.filter(i => i.locationId === loc.id) || [];
      const locAssets = assets?.filter(a => locInspections.some(i => i.id === a.inspectionId)) || [];

      if (locAssets.length === 0) return;

      if (currentY > 250) {
        doc.addPage();
        currentY = 20;
      }

      doc.setFontSize(13);
      doc.setTextColor(30, 41, 59);
      doc.text(loc.name.toUpperCase(), 14, currentY);
      doc.setTextColor(0, 0, 0);

      const tableData = locAssets.map(a => [
        a.name,
        a.patrimonyNumber || '-',
        a.condition,
        a.observations || '-'
      ]);

      autoTable(doc, {
        head: [['Item', 'Nº Patrimônio', 'Estado', 'Obs']],
        body: tableData,
        startY: currentY + 5,
        theme: 'grid',
        margin: { top: 20 }
      });

      currentY = (doc as any).lastAutoTable.finalY + 15;
    });

    doc.save('Inventario_Por_Localizacao.pdf');
  };

  const generateNoPatrimonyReport = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Relatório de Bens Sem Identificação Patrimonial', 14, 22);
    
    doc.setFontSize(11);
    doc.text(`Data de Emissão: ${new Date().toLocaleDateString()}`, 14, 32);
    doc.text(`Esses itens requerem etiquetagem e registro no sistema central.`, 14, 38);

    const items = assets?.filter(a => !a.patrimonyNumber) || [];
    const tableData = items.map(a => [
      a.name,
      a.condition.toUpperCase(),
      locations?.find(l => {
        const insp = inspections?.find(i => i.id === a.inspectionId);
        return l.id === insp?.locationId;
      })?.name || 'Local não ident.'
    ]);

    autoTable(doc, {
      head: [['Item', 'Estado Conservação', 'Localização']],
      body: tableData,
      startY: 45,
      theme: 'striped'
    });

    doc.save('Relatorio_Bens_Sem_Patrimonio.pdf');
  };

  return (
    <div className="flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="relative overflow-hidden rounded-[2.5rem] bg-slate-900 p-10 text-white shadow-2xl shadow-slate-900/20 group">
           <div className="relative z-10 flex flex-col gap-6">
              <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-sm border border-white/10 transition-transform group-hover:scale-110 duration-500">
                 <TrendingUp className="w-7 h-7 text-white" />
              </div>
              <div className="flex flex-col">
                 <span className="text-6xl font-display font-black tracking-tighter leading-none">{stats.totalItens}</span>
                 <span className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400 mt-4 leading-none">Bens Catalogados</span>
              </div>
           </div>
           <BarChart3 className="absolute -bottom-10 -right-10 w-48 h-48 text-white/5 transform rotate-12 transition-transform group-hover:scale-125 duration-700" />
        </div>

        <div className="relative overflow-hidden rounded-[2.5rem] bg-rose-600 p-10 text-white shadow-2xl shadow-rose-600/20 group">
           <div className="relative z-10 flex flex-col gap-6">
              <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-sm border border-white/10 transition-transform group-hover:scale-110 duration-500">
                 <AlertCircle className="w-7 h-7 text-white" />
              </div>
              <div className="flex flex-col">
                 <span className="text-6xl font-display font-black tracking-tighter leading-none">{stats.ruins}</span>
                 <span className="text-[11px] font-black uppercase tracking-[0.3em] text-rose-200 mt-4 leading-none">Estado Crítico / Baixa</span>
              </div>
           </div>
           <AlertCircle className="absolute -bottom-10 -right-10 w-48 h-48 text-white/5 transform -rotate-12 transition-transform group-hover:scale-125 duration-700" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2 flex flex-col gap-8">
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Central de Inteligência</h3>
            <h4 className="text-2xl font-black text-slate-900 tracking-tight">Emissão de Auditorias</h4>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ReportAction 
              title="ETP de Substituição" 
              description="Rascunho Automático Lei 14.133" 
              icon={Lightbulb} 
              variant="amber" 
              onClick={() => setShowBiddingDraft(true)}
            />
            <ReportAction 
              title="Bens Inservíveis" 
              description="Processo de Descarte/Leilão" 
              icon={FileText} 
              variant="rose" 
              onClick={generateInserviceReport}
            />
            <ReportAction 
              title="Mapa de Setores" 
              description="Inventário por Localização" 
              icon={FileText} 
              variant="indigo" 
              onClick={generateLocationReport}
            />
            <ReportAction 
              title="Sem Selo" 
              description="Itens Pendentes de Registro" 
              icon={ShieldCheck} 
              variant="slate" 
              onClick={generateNoPatrimonyReport}
            />
          </div>
        </div>

        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Produtividade</h3>
            <h4 className="text-2xl font-black text-slate-900 tracking-tight">Ranking Agentes</h4>
          </div>
          <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm flex flex-col gap-6">
             {ranking.length > 0 ? ranking.slice(0, 5).map((item, idx) => (
               <div key={item.id} className="flex items-center gap-4 group">
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center font-black text-sm transition-all duration-300",
                    idx === 0 ? "bg-amber-100 text-amber-600 shadow-lg shadow-amber-500/10" : "bg-slate-50 text-slate-400 group-hover:bg-slate-900 group-hover:text-white"
                  )}>
                    {idx === 0 ? <Award className="w-6 h-6" /> : idx + 1}
                  </div>
                  <div className="flex flex-col flex-1 overflow-hidden">
                     <span className="font-bold text-slate-900 text-sm truncate">{item.name}</span>
                     <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{item.count} Vistorias</span>
                  </div>
                  {idx === 0 && (
                    <div className="flex flex-col items-end">
                      <span className="text-[8px] font-black text-amber-600 bg-amber-50 px-2 py-1 rounded-lg uppercase tracking-tighter shadow-sm border border-amber-100">Destaque</span>
                    </div>
                  )}
               </div>
             )) : (
               <div className="py-12 flex flex-col items-center justify-center text-center opacity-30">
                  <Users className="w-12 h-12 mb-4 text-slate-300" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Dados Insuficientes</p>
               </div>
             )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Consolidado Quantitativo</h3>
          <h4 className="text-2xl font-black text-slate-900 tracking-tight">Itens por Localização</h4>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
           {locationSummary.map(loc => (
             <Card 
               key={loc.id} 
               className="p-8 flex flex-col gap-6 border-slate-50 hover:border-indigo-200 transition-all group rounded-[2.5rem] bg-white shadow-sm hover:shadow-xl hover:shadow-indigo-500/5"
               onClick={() => generateSingleLocationReport(loc.id)}
             >
                <div className="flex items-center justify-between">
                   <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-400 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-500 shadow-sm">
                      <FileText className="w-6 h-6" />
                   </div>
                   <span className={cn(
                     "text-[10px] font-black px-3 py-1.5 rounded-xl uppercase tracking-tighter shadow-sm border",
                     loc.itemCount > 0 ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-slate-50 text-slate-400 border-slate-100"
                   )}>
                     {loc.itemCount} Bens
                   </span>
                </div>
                <div className="flex flex-col">
                   <span className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors truncate text-lg tracking-tight mb-1">{loc.name}</span>
                   <span className="text-[9px] text-slate-400 uppercase font-black tracking-widest leading-relaxed line-clamp-1 opacity-70 italic">{loc.description}</span>
                </div>
                <button className="flex items-center gap-2 text-[10px] font-black text-indigo-600 uppercase tracking-widest opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-500">
                   GERAR PDF <Download className="w-3.5 h-3.5" />
                </button>
             </Card>
           ))}
        </div>
      </div>

      {showBiddingDraft && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/40 backdrop-blur-md animate-in fade-in duration-300">
          <Card className="w-full max-w-4xl max-h-[90vh] flex flex-col border-none shadow-[0_50px_100px_-20px_rgba(0,0,0,0.25)] relative overflow-hidden rounded-[3.5rem] bg-white">
            <div className="absolute top-0 left-0 w-full h-2 bg-amber-500"></div>
            <div className="flex items-center justify-between p-10 pb-6">
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 bg-amber-500 rounded-[1.8rem] flex items-center justify-center text-white shadow-2xl shadow-amber-500/20">
                   <Lightbulb className="w-8 h-8" />
                </div>
                <div className="flex flex-col">
                  <h2 className="text-3xl font-black text-slate-900 tracking-tight leading-none uppercase">Estudo Técnico (ETP)</h2>
                  <span className="text-[10px] font-black tracking-[0.3em] text-slate-400 mt-2 uppercase">Geração Automatizada • Lei 14.133</span>
                </div>
              </div>
              <button 
                onClick={() => setShowBiddingDraft(false)}
                className="w-12 h-12 flex items-center justify-center bg-slate-50 rounded-2xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all border border-slate-100"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto px-10 py-4">
               <textarea 
                 readOnly
                 value={getBiddingDraftText()}
                 className="w-full h-full min-h-[450px] p-10 rounded-[2.5rem] border-2 border-slate-50 bg-slate-50/30 text-slate-700 font-mono text-sm leading-loose focus:outline-none resize-none shadow-inner"
               />
            </div>

            <div className="p-10 bg-white flex flex-col md:flex-row justify-between items-center gap-8">
              <div className="flex items-start gap-4 flex-1">
                 <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center shrink-0 border border-amber-100">
                    <AlertCircle className="w-5 h-5 text-amber-600" />
                 </div>
                 <p className="text-[11px] font-medium text-slate-400 leading-relaxed max-w-md">
                   Este documento é um rascunho baseado nos bens classificados em <strong>estado crítico</strong>. Revise cuidadosamente antes de anexar ao seu processo administrativo.
                 </p>
              </div>
              <Button 
                variant="accent" 
                className={cn("px-12 h-16 text-xs uppercase tracking-widest transition-all duration-500", copied ? "bg-emerald-600 scale-95" : "bg-slate-900")}
                onClick={copyToClipboard}
              >
                {copied ? "TEXTO COPIADO!" : "COPIAR ESTRUTURA"} {copied ? <Download className="w-4 h-4 ml-2" /> : <Copy className="w-4 h-4 ml-2" />}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function ReportAction({ title, description, icon: Icon, variant = 'slate', onClick }: { title: string, description: string, icon: any, variant?: 'rose' | 'indigo' | 'amber' | 'slate', onClick: () => void }) {
  const styles = {
    rose: "bg-rose-50 text-rose-600 border-rose-100 hover:bg-rose-600 hover:text-white",
    indigo: "bg-indigo-50 text-indigo-600 border-indigo-100 hover:bg-indigo-600 hover:text-white",
    amber: "bg-amber-50 text-amber-600 border-amber-100 hover:bg-amber-500 hover:text-white",
    slate: "bg-slate-50 text-slate-500 border-slate-100 hover:bg-slate-900 hover:text-white",
  }[variant];

  return (
    <Card className="px-8 py-10 flex flex-col gap-6 rounded-[2.5rem] border-slate-100 hover:border-transparent transition-all duration-500 cursor-pointer shadow-sm hover:shadow-2xl group relative overflow-hidden" onClick={onClick}>
       <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-700 shadow-sm border", styles)}>
          <Icon className="w-7 h-7 transform group-hover:rotate-12 transition-transform duration-500" />
       </div>
       <div className="flex flex-col">
          <span className="font-black text-slate-900 text-lg uppercase tracking-tight leading-none group-hover:text-indigo-600 transition-colors mb-2">{title}</span>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none opacity-80">{description}</span>
       </div>
       <button className="flex items-center gap-2 text-[10px] font-black text-slate-900 uppercase tracking-widest opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-500">
          PDF <Download className="w-3.5 h-3.5" />
       </button>
    </Card>
  );
}
