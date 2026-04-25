import { useState } from 'react';
import { Card, Button } from './UI';
import { BarChart3, TrendingUp, AlertCircle, FileText, Download, Users, Award, Lightbulb, Copy, X } from 'lucide-react';
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
    <div className="flex flex-col gap-10 animate-in fade-in duration-700 pb-20">
      <div className="flex flex-col gap-2 px-2">
        <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Painel Analítico</h2>
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] leading-none">Consolidado Geral de Ativos</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="relative overflow-hidden rounded-[2.5rem] bg-slate-900 p-10 text-white shadow-2xl shadow-slate-900/20 group">
           <div className="relative z-10 flex flex-col gap-6">
              <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-sm border border-white/10 transition-transform group-hover:scale-110 duration-500">
                 <TrendingUp className="w-7 h-7 text-white" />
              </div>
              <div className="flex flex-col">
                 <span className="text-6xl font-black tracking-tighter leading-none stat-value">{stats.totalItens}</span>
                 <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 mt-4">Total de Bens Tombados</span>
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
                 <span className="text-6xl font-black tracking-tighter leading-none stat-value">{stats.ruins}</span>
                 <span className="text-[11px] font-black uppercase tracking-[0.2em] text-rose-200 mt-4">Itens em Estado Crítico</span>
              </div>
           </div>
           <AlertCircle className="absolute -bottom-10 -right-10 w-48 h-48 text-white/5 transform -rotate-12 transition-transform group-hover:scale-125 duration-700" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <div className="flex items-center justify-between px-2">
            <div className="flex flex-col">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-[0.2em]">Exportação de Dados</h3>
              <span className="text-[10px] font-bold text-slate-400">Emissão de registros oficiais</span>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <ReportAction 
              title="Gerar ETP de Substituição (Lei 14.133)" 
              description="Inteligência Estratégica" 
              icon={Lightbulb} 
              color="amber" 
              onClick={() => setShowBiddingDraft(true)}
            />
            <ReportAction 
              title="Lista de Inservíveis" 
              description="Bens para leilão ou descarte" 
              icon={FileText} 
              color="rose" 
              onClick={generateInserviceReport}
            />
            <ReportAction 
              title="Por Localização" 
              description="Planilha completa por sala" 
              icon={FileText} 
              color="blue" 
              onClick={generateLocationReport}
            />
            <ReportAction 
              title="Sem Patrimônio" 
              description="Itens para etiquetagem" 
              icon={FileText} 
              color="amber" 
              onClick={generateNoPatrimonyReport}
            />
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between px-2">
            <div className="flex flex-col">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-[0.2em]">Ranking Atividade</h3>
              <span className="text-[10px] font-bold text-slate-400">Performance dos Vistoriadores</span>
            </div>
          </div>
          <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm flex flex-col gap-4">
             {ranking.length > 0 ? ranking.slice(0, 5).map((item, idx) => (
               <div key={item.id} className="flex items-center gap-4 group">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs transition-all duration-300",
                    idx === 0 ? "bg-amber-100 text-amber-600" : "bg-slate-50 text-slate-400 group-hover:bg-slate-900 group-hover:text-white"
                  )}>
                    {idx === 0 ? <Award className="w-5 h-5" /> : idx + 1}
                  </div>
                  <div className="flex flex-col flex-1 overflow-hidden">
                     <span className="font-bold text-slate-900 text-sm truncate">{item.name}</span>
                     <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.count} Vistorias</span>
                  </div>
                  {idx === 0 && <span className="text-[8px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full uppercase tracking-tighter">Líder</span>}
               </div>
             )) : (
               <div className="py-10 flex flex-col items-center justify-center text-center opacity-50 grayscale">
                  <Users className="w-10 h-10 mb-4 text-slate-300" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sem dados suficientes</p>
               </div>
             )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between px-2">
          <div className="flex flex-col">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-[0.2em]">Inventário por Localização</h3>
            <span className="text-[10px] font-bold text-slate-400">Resumo quantitativo de itens por sala/prédio</span>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
           {locationSummary.map(loc => (
             <Card 
               key={loc.id} 
               className="p-6 flex flex-col gap-4 border-slate-50 hover:border-blue-200 transition-all group"
               onClick={() => generateSingleLocationReport(loc.id)}
             >
                <div className="flex items-center justify-between">
                   <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                      <FileText className="w-5 h-5" />
                   </div>
                   <span className={cn(
                     "text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-tighter",
                     loc.itemCount > 0 ? "bg-emerald-50 text-emerald-600" : "bg-slate-50 text-slate-400"
                   )}>
                     {loc.itemCount} Itens
                   </span>
                </div>
                <div className="flex flex-col">
                   <span className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors truncate">{loc.name}</span>
                   <span className="text-[9px] text-slate-400 uppercase font-black tracking-widest mt-1 line-clamp-1">{loc.description}</span>
                </div>
                <button className="mt-2 text-[8px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                   GERAR PDF SALA <Download className="w-3 h-3" />
                </button>
             </Card>
           ))}
        </div>
      </div>

      {showBiddingDraft && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-4xl max-h-[90vh] flex flex-col rounded-[2.5rem] shadow-2xl relative overflow-hidden">
            <div className="flex items-center justify-between p-8 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-[1.5rem] flex items-center justify-center border border-amber-200 shadow-sm">
                   <Lightbulb className="w-7 h-7" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-800 tracking-tight">Estudo Técnico Preliminar (ETP)</h2>
                  <p className="text-sm font-bold tracking-widest text-slate-500 uppercase">Rascunho Automático - Lei 14.133/2021</p>
                </div>
              </div>
              <button 
                onClick={() => setShowBiddingDraft(false)}
                className="w-12 h-12 flex items-center justify-center bg-white rounded-2xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all border border-slate-200"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 bg-slate-50 relative">
               <textarea 
                 readOnly
                 value={getBiddingDraftText()}
                 className="w-full h-full min-h-[400px] p-6 rounded-2xl border border-slate-200 bg-white text-slate-700 font-mono text-sm leading-relaxed focus:outline-none focus:ring-4 focus:ring-amber-500/10 resize-none shadow-sm"
               />
            </div>

            <div className="p-8 border-t border-slate-100 bg-white flex flex-col sm:flex-row justify-between items-center gap-6">
              <p className="text-xs font-semibold text-slate-400 max-w-md leading-relaxed">
                Este é um rascunho base gerado automaticamente a partir dos itens classificados como <strong>ruins/inservíveis</strong> no inventário. Revise as informações antes de utilizar no processo licitatório oficial.
              </p>
              <Button 
                variant="primary" 
                className={cn("whitespace-nowrap transition-all duration-300", copied ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20" : "")}
                onClick={copyToClipboard}
              >
                {copied ? "COPIADO PARA ÁREA DE TRANSFERÊNCIA!" : "COPIAR RASCUNHO"} {copied ? <Download className="w-4 h-4 ml-2" /> : <Copy className="w-4 h-4 ml-2" />}
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function ReportAction({ title, description, icon: Icon, color = 'blue', onClick }: { title: string, description: string, icon: any, color?: string, onClick: () => void }) {
  const colorClasses = {
    rose: "bg-rose-50 text-rose-600 border-rose-100",
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    amber: "bg-amber-50 text-amber-600 border-amber-100",
  }[color] || "bg-slate-50 text-slate-600 border-slate-100";

  return (
    <Card className="p-8 flex flex-col gap-6 rounded-[2.5rem] border-slate-50 hover:border-slate-200 cursor-pointer group transition-all duration-500 hover:shadow-2xl hover:shadow-slate-200/50" onClick={onClick}>
       <div className={cn("w-16 h-16 rounded-[1.5rem] flex items-center justify-center transition-all duration-500 group-hover:bg-slate-900 group-hover:text-white", colorClasses)}>
          <Icon className="w-8 h-8 transition-transform group-hover:rotate-12" />
       </div>
       <div className="flex flex-col">
          <span className="font-black text-slate-900 text-lg uppercase tracking-tight leading-tight group-hover:text-blue-600 transition-colors">{title}</span>
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2">{description}</span>
       </div>
       <div className="pt-2">
          <button className="flex items-center gap-2 text-[10px] font-black text-slate-900 uppercase tracking-widest opacity-0 -translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-500">
            EMITIR PDF <Download className="w-3 h-3" />
          </button>
       </div>
    </Card>
  );
}
