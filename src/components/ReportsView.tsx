import React, { useState } from 'react';
import { Card, Button } from './UI';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { BarChart3, Download, FileText, Filter, AlertCircle, Building2, CheckCircle2, FileSpreadsheet, ShieldCheck } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDate, cn } from '../lib/utils';
import { motion } from 'motion/react';

export function ReportsView() {
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [selectedCondition, setSelectedCondition] = useState<string>('all');

  const locations = useLiveQuery(() => db.locations.filter(l => !l.deleted).toArray()) || [];
  const allAssets = useLiveQuery(() => db.assets.filter(a => !a.deleted).toArray()) || [];
  const inspections = useLiveQuery(() => db.inspections.filter(i => !i.deleted).toArray()) || [];

  // Cruzamento de dados para os filtros
  const filteredAssets = allAssets.filter(asset => {
    if (selectedCondition !== 'all' && asset.condition !== selectedCondition) return false;
    
    if (selectedLocation !== 'all') {
      const insp = inspections.find(i => i.id === asset.inspectionId);
      if (!insp || insp.locationId !== selectedLocation) return false;
    }
    
    return true;
  });

  // Cálculos precisos somando a quantidade de cada registo
  const totalAssets = filteredAssets.reduce((acc, curr) => acc + (Number(curr.quantity) || 1), 0);
  const conditionBom = filteredAssets.filter(a => a.condition === 'bom' || a.condition === 'novo').reduce((acc, curr) => acc + (Number(curr.quantity) || 1), 0);
  const conditionRegular = filteredAssets.filter(a => a.condition === 'regular').reduce((acc, curr) => acc + (Number(curr.quantity) || 1), 0);
  const conditionRuim = filteredAssets.filter(a => a.condition === 'ruim' || a.condition === 'inservivel').reduce((acc, curr) => acc + (Number(curr.quantity) || 1), 0);

  const generatePDF = () => {
    const doc = new jsPDF();
    
    // Cabeçalho Oficial
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('Relatório Analítico de Património', 14, 22);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Prefeitura Municipal de Manoel Viana', 14, 30);
    
    const locName = selectedLocation === 'all' ? 'Todos os Setores' : locations.find(l => l.id === selectedLocation)?.name || 'Setor Específico';
    const condName = selectedCondition === 'all' ? 'Todas as Condições' : selectedCondition.toUpperCase();
    
    doc.text(`Filtros Aplicados: ${locName} | Estado: ${condName}`, 14, 36);
    doc.text(`Data de Emissão: ${new Date().toLocaleDateString()}`, 14, 42);

    // Painel de Resumo
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, 48, 182, 16, 3, 3, 'FD');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`Total de Itens: ${totalAssets} unidades`, 18, 57);
    doc.text(`Bons/Novos: ${conditionBom}`, 75, 57);
    doc.text(`Regulares: ${conditionRegular}`, 125, 57);
    doc.text(`Críticos: ${conditionRuim}`, 165, 57);

    // Tabela de Dados
    const tableData = filteredAssets.map(asset => {
      const insp = inspections.find(i => i.id === asset.inspectionId);
      const loc = locations.find(l => l.id === insp?.locationId);
      return [
        asset.patrimonyNumber || 'Sem Nº',
        asset.name,
        loc?.name || 'N/A',
        asset.condition.toUpperCase(),
        asset.quantity || 1
      ];
    });

    autoTable(doc, {
      head: [['Património', 'Descrição do Bem', 'Localização', 'Estado', 'Qtd']],
      body: tableData,
      startY: 72,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [79, 70, 229], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] }
    });

    doc.save(`Relatorio_Patrimonio_${new Date().getTime()}.pdf`);
  };

  const generateCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Patrimonio,Descricao,Localizacao,Estado,Quantidade,Observacoes\n";

    filteredAssets.forEach(asset => {
      const insp = inspections.find(i => i.id === asset.inspectionId);
      const loc = locations.find(l => l.id === insp?.locationId);
      
      // Limpar quebras de linha nas observações para não estragar o CSV
      const obs = (asset.observations || '').replace(/(\r\n|\n|\r)/gm, " ");
      
      const row = `"${asset.patrimonyNumber || ''}","${asset.name}","${loc?.name || ''}","${asset.condition}","${asset.quantity || 1}","${obs}"`;
      csvContent += row + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Exportacao_Bens_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      {/* HEADER */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-2">
        <div className="flex flex-col gap-2">
          <h2 className="text-4xl font-display font-black text-slate-900 tracking-tighter uppercase leading-none">Relatórios Analíticos</h2>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Painel de Inteligência de Dados</span>
        </div>
        <div className="flex items-center gap-3">
           <Button variant="outline" icon={FileSpreadsheet} onClick={generateCSV} className="h-12 px-6 border-slate-200 text-slate-600 font-black text-[10px] uppercase tracking-widest bg-white hover:bg-slate-50 rounded-xl">
             Exportar Excel
           </Button>
           <Button variant="accent" icon={FileText} onClick={generatePDF} className="h-12 px-6 shadow-lg shadow-indigo-500/20 font-black text-[10px] uppercase tracking-widest rounded-xl">
             Gerar PDF Oficial
           </Button>
        </div>
      </header>

      {/* DASHBOARD DE MÉTRICAS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-6 bg-slate-900 text-white rounded-[2rem] border-none shadow-xl shadow-slate-900/10 flex flex-col justify-between h-40 group">
          <div className="w-10 h-10 bg-white/10 rounded-[1rem] flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="flex flex-col">
            <span className="text-4xl font-display font-black tracking-tight">{totalAssets}</span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Total de Unidades</span>
          </div>
        </Card>
        
        <Card className="p-6 bg-white border-slate-100 rounded-[2rem] shadow-sm hover:shadow-md transition-all flex flex-col justify-between h-40">
          <div className="w-10 h-10 bg-emerald-50 rounded-[1rem] flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="flex flex-col">
            <span className="text-4xl font-display font-black tracking-tight text-slate-900">{conditionBom}</span>
            <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mt-1">Bons / Novos</span>
          </div>
        </Card>

        <Card className="p-6 bg-white border-slate-100 rounded-[2rem] shadow-sm hover:shadow-md transition-all flex flex-col justify-between h-40">
          <div className="w-10 h-10 bg-amber-50 rounded-[1rem] flex items-center justify-center">
            <AlertCircle className="w-5 h-5 text-amber-500" />
          </div>
          <div className="flex flex-col">
            <span className="text-4xl font-display font-black tracking-tight text-slate-900">{conditionRegular}</span>
            <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mt-1">Estado Regular</span>
          </div>
        </Card>

        <Card className="p-6 bg-white border-slate-100 rounded-[2rem] shadow-sm hover:shadow-md transition-all flex flex-col justify-between h-40">
          <div className="w-10 h-10 bg-rose-50 rounded-[1rem] flex items-center justify-center">
            <AlertCircle className="w-5 h-5 text-rose-500" />
          </div>
          <div className="flex flex-col">
            <span className="text-4xl font-display font-black tracking-tight text-slate-900">{conditionRuim}</span>
            <span className="text-[10px] font-bold text-rose-600 uppercase tracking-widest mt-1">Requer Atenção (Ruim)</span>
          </div>
        </Card>
      </div>

      {/* ÁREA DE FILTROS E TABELA */}
      <Card className="flex flex-col rounded-[2.5rem] border-slate-100 bg-white shadow-sm overflow-hidden p-0">
        
        {/* Barra de Filtros */}
        <div className="p-6 lg:p-8 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row gap-6">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-white border border-slate-200 rounded-xl flex items-center justify-center shrink-0">
                <Filter className="w-5 h-5 text-slate-400" />
             </div>
             <div className="flex flex-col">
                <span className="text-sm font-black text-slate-900 uppercase tracking-tight">Filtros de Dados</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Refine a sua busca</span>
             </div>
          </div>
          
          <div className="flex flex-col sm:flex-row flex-1 gap-4">
             <div className="flex-1 flex flex-col gap-1.5">
               <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Localização / Setor</label>
               <select 
                 value={selectedLocation} 
                 onChange={e => setSelectedLocation(e.target.value)}
                 className="w-full h-12 px-4 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 bg-white focus:ring-2 focus:ring-indigo-600 focus:outline-none transition-all cursor-pointer"
               >
                 <option value="all">Todos os Setores</option>
                 {locations.map(loc => (
                   <option key={loc.id} value={loc.id}>{loc.name}</option>
                 ))}
               </select>
             </div>
             
             <div className="flex-1 flex flex-col gap-1.5">
               <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Estado de Conservação</label>
               <select 
                 value={selectedCondition} 
                 onChange={e => setSelectedCondition(e.target.value)}
                 className="w-full h-12 px-4 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 bg-white focus:ring-2 focus:ring-indigo-600 focus:outline-none transition-all cursor-pointer"
               >
                 <option value="all">Todas as Condições</option>
                 <option value="novo">Novo</option>
                 <option value="bom">Bom</option>
                 <option value="regular">Regular</option>
                 <option value="ruim">Ruim</option>
                 <option value="inservivel">Inservível</option>
               </select>
             </div>
          </div>
        </div>

        {/* Tabela de Pré-visualização */}
        <div className="overflow-x-auto custom-scrollbar">
          {filteredAssets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-300">
               <ShieldCheck className="w-12 h-12 mb-4 opacity-20" />
               <p className="font-bold text-xs uppercase tracking-widest text-slate-400">Nenhum item corresponde a estes filtros.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white border-b border-slate-100">
                  <th className="py-4 px-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">Património</th>
                  <th className="py-4 px-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">Descrição</th>
                  <th className="py-4 px-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">Setor</th>
                  <th className="py-4 px-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">Estado</th>
                  <th className="py-4 px-8 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Qtd</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredAssets.slice(0, 50).map(asset => {
                  const insp = inspections.find(i => i.id === asset.inspectionId);
                  const loc = locations.find(l => l.id === insp?.locationId);
                  return (
                    <tr key={asset.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="py-4 px-8 font-mono text-xs font-black text-slate-600">{asset.patrimonyNumber || '-'}</td>
                      <td className="py-4 px-8 text-sm font-bold text-slate-900">{asset.name}</td>
                      <td className="py-4 px-8 text-xs font-bold text-slate-500">{loc?.name || 'N/A'}</td>
                      <td className="py-4 px-8">
                        <span className={cn(
                          "px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest",
                          asset.condition === 'bom' || asset.condition === 'novo' ? "bg-emerald-50 text-emerald-600" :
                          asset.condition === 'regular' ? "bg-amber-50 text-amber-600" : "bg-rose-50 text-rose-600"
                        )}>
                          {asset.condition}
                        </span>
                      </td>
                      <td className="py-4 px-8 text-sm font-black text-slate-900 text-right">{asset.quantity || 1}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          {filteredAssets.length > 50 && (
            <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                A exibir os primeiros 50 itens de {filteredAssets.length}. Exporte o ficheiro para ver a lista completa.
              </span>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}