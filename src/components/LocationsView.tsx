import { useState } from 'react';
import { Card, Button, Input } from './UI';
import { Building2, Plus, ArrowRight, Trash2, AlertCircle, X, Search } from 'lucide-react';
import { db, generateId } from '../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { cn } from '../lib/utils';
import { useAuth } from '../lib/AuthContext';

export function LocationsView({ onSelectInspection }: { onSelectInspection: (id: string) => void }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'prefeito' || user?.role === 'responsavel';

  const locations = useLiveQuery(() => db.locations.toArray());
  const inspections = useLiveQuery(() => db.inspections.toArray());
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newLoc, setNewLoc] = useState({ name: '', description: '' });

  const getLatestStatus = (locId: string) => {
    const locInspections = inspections?.filter(i => i.locationId === locId);
    if (!locInspections || locInspections.length === 0) return null;
    
    // Prioridade: em_andamento > concluida > finalizada (pegando a mais relevante ou recente)
    const sorted = [...locInspections].sort((a, b) => b.date - a.date);
    return sorted[0].status;
  };

  const filteredLocations = locations?.filter(loc => 
    loc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    loc.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleStartInspection = async (locationId: string) => {
    // 1. Procurar vistoria ativa ou concluída para este local (que ainda não foi homologada/finalizada)
    const existing = await db.inspections
      .where({ locationId })
      .filter(i => i.status !== 'finalizada')
      .reverse()
      .first();

    if (existing) {
      onSelectInspection(existing.id);
      return;
    }

    // 2. Se não houver nenhuma aberta/pendente, criar uma nova
    const id = generateId();
    await db.inspections.add({
      id,
      locationId,
      date: Date.now(),
      participants: [],
      status: 'em_andamento'
    });
    onSelectInspection(id);
  };

  const handleAddLocation = async () => {
    if (!newLoc.name.trim()) return;
    await db.locations.add({
      id: generateId(),
      name: newLoc.name,
      description: newLoc.description
    });
    setNewLoc({ name: '', description: '' });
    setIsAdding(false);
  };

  const handleDeleteLocation = async (locId: string, locName: string) => {
    // 1. Encontrar todas as vistorias deste local
    const inspectionIds = (await db.inspections.where('locationId').equals(locId).toArray()).map(i => i.id);
    
    // 2. Verificar se existe algum item em qualquer uma dessas vistorias
    let assetCount = 0;
    if (inspectionIds.length > 0) {
      assetCount = await db.assets.where('inspectionId').anyOf(inspectionIds).count();
    }

    if (assetCount > 0) {
      alert(`Não é possível excluir "${locName}". Existem ${assetCount} itens registrados vinculados a este local.`);
      return;
    }

    if (window.confirm(`Deseja realmente excluir o local "${locName}"? Todas as vistorias Vazias vinculadas também serão removidas.`)) {
      // Excluir vistorias vazias primeiro
      if (inspectionIds.length > 0) {
        await db.inspections.bulkDelete(inspectionIds);
      }
      // Excluir o local
      await db.locations.delete(locId);
    }
  };

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Localizações</h2>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] leading-none">Gestão de prédios e repartições</span>
        </div>
        
        <div className="flex items-center gap-3">
           <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-slate-900 transition-colors" />
              <input 
                type="text" 
                placeholder="Buscar local..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-11 pr-6 py-3 bg-white border border-slate-100 rounded-2xl text-sm font-bold text-slate-900 shadow-sm focus:ring-2 focus:ring-slate-900 focus:outline-none transition-all w-full md:w-64"
              />
           </div>
           {!isAdding && isAdmin && (
             <Button variant="accent" icon={Plus} onClick={() => setIsAdding(true)} className="rounded-2xl h-12 shadow-xl shadow-slate-900/10">
               NOVO LOCAL
             </Button>
           )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isAdding && (
          <Card className="p-8 border-2 border-slate-900 ring-8 ring-slate-900/5 animate-in zoom-in-95 duration-300 rounded-[2.5rem] flex flex-col gap-6 relative z-10">
            <div className="flex items-center justify-between">
               <h3 className="font-black text-slate-900 uppercase tracking-tight">Cadastrar Prédio</h3>
               <button onClick={() => setIsAdding(false)} className="p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-400">
                  <X className="w-5 h-5" />
               </button>
            </div>
            <Input label="Nome da Unidade" placeholder="Ex: Secretaria de Saúde" value={newLoc.name} onChange={e => setNewLoc({...newLoc, name: e.target.value})} />
            <Input label="Endereço / Descrição" placeholder="Rua Central, nº 123" value={newLoc.description} onChange={e => setNewLoc({...newLoc, description: e.target.value})} />
            <Button onClick={handleAddLocation} icon={CheckCircle2} className="h-14 font-black tracking-widest text-lg rounded-[1.2rem]" variant="accent">
               CONFIRMAR
            </Button>
          </Card>
        )}

        {filteredLocations?.map(loc => {
          const status = getLatestStatus(loc.id);
          return (
            <Card key={loc.id} className="group p-8 rounded-[2.5rem] flex flex-col gap-6 border-slate-50 hover:border-slate-200 transition-all duration-500 hover:shadow-2xl hover:shadow-slate-200/50 relative overflow-hidden">
              <div className="flex items-start justify-between">
                <div className="w-14 h-14 bg-slate-50 group-hover:bg-slate-900 rounded-2xl flex items-center justify-center transition-all duration-500 text-slate-400 group-hover:text-white shadow-sm">
                  <Building2 className="w-7 h-7" />
                </div>
                <div className="flex flex-col items-end gap-2">
                  {status && (
                    <div className={cn(
                      "text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border",
                      status === 'em_andamento' ? "bg-blue-50 text-blue-600 border-blue-100" :
                      status === 'concluida' ? "bg-amber-50 text-amber-600 border-amber-100" :
                      "bg-emerald-50 text-emerald-600 border-emerald-100"
                    )}>
                      {status.replace('_', ' ')}
                    </div>
                  )}
                  {isAdmin && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteLocation(loc.id, loc.name);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all duration-300"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
              
              <div className="flex flex-col">
                <span className="text-xl font-black text-slate-900 tracking-tight leading-tight group-hover:text-blue-600 transition-colors uppercase">{loc.name}</span>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">{loc.description}</span>
              </div>

              <div className="pt-2">
                <Button 
                  variant="secondary" 
                  size="sm" 
                  onClick={() => handleStartInspection(loc.id)}
                  className="w-full h-12 rounded-xl text-[10px] font-black uppercase tracking-widest group-hover:bg-slate-900 group-hover:text-white transition-all duration-500"
                >
                  {status === 'em_andamento' ? 'CONTINUAR VISTORIA' : status === 'concluida' ? 'REVISAR VISTORIA' : 'VER VISTORIA'} <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </Card>
          );
        })}

        {!isAdding && filteredLocations?.length === 0 && (
          <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-300">
             <AlertCircle className="w-12 h-12 opacity-20 mb-4" />
             <p className="font-bold tracking-widest text-xs uppercase text-slate-400">Nenhuma localização encontrada</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Re-using local Lucide icon wrapper just in case
function CheckCircle2(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/>
    </svg>
  );
}
