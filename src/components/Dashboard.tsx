import React, { useState, useEffect, ChangeEvent } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useOnlineStatus } from '../lib/hooks';
import { Card, Button, Input, ErrorBoundary } from './UI';
import { 
  Building2, 
  ClipboardList, 
  BarChart3, 
  Users, 
  Settings, 
  LogOut, 
  CheckCircle2, 
  AlertCircle, 
  Bell, 
  Plus, 
  Search, 
  LayoutGrid, 
  PlayCircle, 
  Eye, 
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Home,
  User as UserIcon,
  Zap,
  Clock,
  Download,
  Upload
} from 'lucide-react';
import { db, Inspection, Location } from '../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { formatDate } from '../lib/utils';
import { InspectionView } from './InspectionView';
import { LocationsView } from './LocationsView';
import { ReportsView } from './ReportsView';
import { UsersView } from './UsersView';
import { NotificationsView } from './NotificationsView';
import { checkAndGenerateNotifications } from '../lib/NotificationService';
import { cn } from '../lib/utils';
import { setupSync, pushLocalChanges } from '../lib/syncService';
import { db as firestore } from '../lib/firebase';
import { doc, deleteDoc } from 'firebase/firestore';

export function Dashboard() {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<'home' | 'inspections' | 'locations' | 'reports' | 'users' | 'settings' | 'notifications'>('home');
  const [selectedInspectionId, setSelectedInspectionId] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const isOnline = useOnlineStatus();

  const inspections = useLiveQuery(() => db.inspections.orderBy('date').reverse().limit(10).toArray());
  const locations = useLiveQuery(() => db.locations.toArray());
  const activeInspectionsCount = useLiveQuery(() => db.inspections.where('status').equals('em_andamento').count());
  const concludedInspectionsCount = useLiveQuery(() => db.inspections.where('status').anyOf('concluida', 'finalizada').count());
  const totalAssetsCount = useLiveQuery(() => db.assets.count());
  const unreadNotifications = useLiveQuery(() => user ? db.notifications.where('targetUserId').equals(user.userId).and(n => !n.read).count() : 0, [user]);
  const unsyncedCount = useLiveQuery(() => db.assets.filter(a => a.needsSync === true).count()) || 0;
  const isAdmin = user?.role === 'administrador' || user?.role === 'prefeito';
  const isManager = user?.role === 'administrador' || user?.role === 'responsavel' || user?.role === 'prefeito';

  useEffect(() => {
    if (user) {
      setupSync();
      pushLocalChanges();
      
      checkAndGenerateNotifications(user.userId).catch(err => {
        console.error("Erro ao gerar notificações:", err);
      });
    }
  }, [user]);

  if (selectedInspectionId) {
    return <InspectionView id={selectedInspectionId} onBack={() => setSelectedInspectionId(null)} />;
  }

  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab);
    setSelectedInspectionId(null);
  };

  const handleResetSystem = async () => {
    if (!isAdmin) return;
    const confirm1 = window.confirm("⚠️ ATENÇÃO: Isso irá apagar TODAS as vistorias e itens do sistema. Esta ação não pode ser desfeita. Deseja continuar?");
    if (!confirm1) return;
    
    const confirm2 = window.confirm("CONFIRMAÇÃO FINAL: Você tem certeza absoluta que deseja ZERAR o sistema de vistorias?");
    if (!confirm2) return;

    setIsResetting(true);
    try {
      // Usar Promise.all para garantir que tudo seja limpo antes de avisar
      await Promise.all([
        db.assets.clear(),
        db.inspections.clear(),
        db.notifications.clear()
      ]);
      
      alert("✅ SISTEMA REINICIADO: Todas as vistorias e itens de teste foram apagados com sucesso.");
      
      // Pequeno delay para garantir que o Dexie terminou
      setTimeout(() => {
        window.location.href = '/'; // Recarregar na home
      }, 500);
    } catch (err) {
      console.error("Erro ao zerar sistema:", err);
      alert("Erro ao zerar o sistema.");
    } finally {
      setIsResetting(false);
    }
  };

  const handleExportData = async () => {
    try {
      const users = await db.users.toArray();
      const locations = await db.locations.toArray();
      const inspections = await db.inspections.toArray();
      const assets = await db.assets.toArray();
      const notifications = await db.notifications.toArray();

      const data = {
        users,
        locations,
        inspections,
        assets,
        notifications,
        exportDate: Date.now(),
        version: "v16.4.2"
      };

      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `backup-patri-mv-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Erro ao exportar dados:", err);
      alert("Falha ao exportar backup.");
    }
  };

  const handleImportData = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (!data.inspections || !data.assets) throw new Error("Formato de backup inválido.");

        const confirm = window.confirm("Deseja importar estes dados? Os dados atuais em conflito podem ser substituídos.");
        if (!confirm) return;

        // Limpar bancos para importação limpa (opcional, aqui vamos mesclar)
        // Usando bulkPut para mesclar
        await Promise.all([
          db.users.bulkPut(data.users || []),
          db.locations.bulkPut(data.locations || []),
          db.inspections.bulkPut(data.inspections || []),
          db.assets.bulkPut(data.assets || []),
          db.notifications.bulkPut(data.notifications || [])
        ]);

        alert("✅ DADOS IMPORTADOS: O sistema foi atualizado com as informações do backup.");
        window.location.reload();
      } catch (err) {
        console.error("Erro na importação:", err);
        alert("Erro ao importar arquivo. Verifique se o formato está correto.");
      }
    };
    reader.readAsText(file);
  };

  const renderContent = () => {
    if (selectedInspectionId) {
      return (
        <div className="animate-in fade-in slide-in-from-right-4 duration-500">
           <ErrorBoundary fallback={
             <div className="p-10 text-center">
               <h2 className="text-xl font-bold text-rose-500 mb-2">Erro ao carregar a vistoria</h2>
               <p className="text-slate-500 mb-6">Ocorreu um erro inesperado ao tentar exibir esta vistoria.</p>
               <Button onClick={() => setSelectedInspectionId(null)}>Voltar ao Início</Button>
             </div>
           }>
             <InspectionView id={selectedInspectionId} onBack={() => setSelectedInspectionId(null)} />
           </ErrorBoundary>
        </div>
      );
    }

    switch (activeTab) {
      case 'home':
        return (
          <div className="flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* 🏰 Hero Moderno */}
            <div className="relative overflow-hidden rounded-[3rem] bg-slate-900 px-8 py-12 text-white shadow-2xl shadow-slate-900/40 group">
              <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-10">
                <div className="flex flex-col gap-4 text-center md:text-left max-w-xl">
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-md rounded-full w-fit mx-auto md:mx-0">
                    <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Resumo Operacional • Manoel Viana</span>
                  </div>
                  <h2 className="text-4xl md:text-5xl font-black tracking-tighter leading-[0.9] text-white">
                    Gestão <br /> 
                    <span className="text-slate-500">Patrimonial</span>
                  </h2>
                  <p className="text-slate-400 text-sm font-medium leading-relaxed">
                    Painel inteligente para monitoramento, vistoria e homologação dos bens públicos municipais. Segurança e transparência em tempo real.
                  </p>
                  <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 mt-2">
                    <Button variant="accent" icon={Plus} onClick={() => setActiveTab('locations')} className="rounded-2xl px-10 h-14 uppercase tracking-widest font-black text-[10px] shadow-2xl shadow-blue-600/30">
                      Iniciar Vistoria
                    </Button>
                    {isManager && (
                      <button onClick={async () => {
                        const allInspections = await db.inspections.toArray();
                        let cleared = 0;
                        for (const i of allInspections) {
                           if (i.status === 'concluida' || i.status === 'finalizada') {
                             const c = await db.assets.where('inspectionId').equals(i.id).count();
                             if (c === 0) {
                               await db.inspections.delete(i.id);
                               try { await deleteDoc(doc(firestore, 'inspections', i.id)); } catch(e){}
                               cleared++;
                             }
                           }
                        }
                        if (cleared > 0) window.location.reload();
                        else alert('Nenhuma vistoria vazia encontrada.');
                      }} className="text-[10px] font-black uppercase text-slate-400 hover:text-rose-500 transition-colors underline underline-offset-4">Limpar Fantasmas</button>
                    )}
                    <div className="hidden sm:flex items-center gap-3 px-6 py-4 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-sm">
                      <Clock className="w-5 h-5 text-slate-500" />
                      <div className="flex flex-col leading-none">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Último Login</span>
                        <span className="text-sm font-bold text-slate-300 mt-1">{new Date().toLocaleTimeString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="hidden lg:flex flex-col gap-4 relative">
                   <div className="p-8 bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2.5rem] shadow-2xl flex flex-col items-center gap-2 transform rotate-2 hover:rotate-0 transition-transform duration-500 cursor-pointer group/card" onClick={() => setActiveTab('notifications')}>
                      <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center shadow-2xl shadow-white/10 mb-2 group-hover/card:scale-110 transition-transform">
                        <Bell className="w-8 h-8 text-slate-900" />
                      </div>
                      <span className="text-3xl font-black text-white">{unreadNotifications || 0}</span>
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Avisos Pendentes</span>
                   </div>
                   <div className="absolute -top-12 -left-20 p-6 bg-blue-600/20 backdrop-blur-md border border-blue-500/20 rounded-[2rem] shadow-2xl flex flex-col items-center gap-1 transform -rotate-6 scale-90">
                      <ShieldCheck className="w-6 h-6 text-blue-400" />
                      <span className="text-[10px] font-black text-blue-300 uppercase tracking-widest mt-1">Concluídas</span>
                      <span className="text-xl font-bold text-white">{concludedInspectionsCount || 0}</span>
                   </div>
                </div>
              </div>
              
              {/* Background Accents */}
              <Building2 className="absolute -bottom-20 -right-20 w-96 h-96 text-white/5 transform -rotate-12 pointer-events-none transition-transform duration-1000 group-hover:scale-110" />
              <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/20 blur-[100px] rounded-full -translate-y-1/2 translate-x-1/2"></div>
            </div>

            {/* 📊 2. Cards de Resumo */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <SummaryCard 
                label="Localizações" 
                value={locations?.length || 0} 
                icon={Building2} 
                onClick={() => setActiveTab('locations')}
              />
              <SummaryCard 
                label="Em Andamento" 
                value={activeInspectionsCount || 0} 
                icon={ClipboardList} 
                variant="accent"
                onClick={() => setActiveTab('inspections')}
              />
              <SummaryCard 
                label="Concluídas" 
                value={concludedInspectionsCount || 0} 
                icon={CheckCircle2} 
                onClick={() => setActiveTab('inspections')}
              />
              <SummaryCard 
                label="Total de Itens" 
                value={totalAssetsCount || 0} 
                icon={ShieldCheck} 
                onClick={() => setActiveTab('reports')}
              />
            </div>

            {/* 📋 4. Lista de Vistorias Recentes */}
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between ml-1 leading-none">
                <div className="flex flex-col">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Fluxo de Atividades</h3>
                  <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mt-1">Vistorias recentes no sistema</span>
                </div>
                <button onClick={() => setActiveTab('inspections')} className="flex items-center gap-2 text-[10px] font-black text-slate-900 border-2 border-slate-900 px-4 py-2 rounded-xl hover:bg-slate-900 hover:text-white transition-all">VER TODAS <ArrowRight className="w-3 h-3" /></button>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {inspections?.length === 0 ? (
                  <Card className="flex items-center justify-center py-20 text-slate-400 border-dashed border-2 border-slate-100 bg-slate-50/50 rounded-[3rem]">
                    <div className="text-center">
                      <ClipboardList className="w-16 h-16 mx-auto opacity-10 mb-4" />
                      <p className="text-sm font-black uppercase tracking-widest text-slate-300">Nenhuma vistoria registrada</p>
                      <p className="text-xs text-slate-400 mt-1">Selecione um local para iniciar o inventário.</p>
                    </div>
                  </Card>
                ) : (
                  inspections?.map(insp => (
                    <RecentInspectionRow 
                      key={insp.id} 
                      inspection={insp} 
                      locationName={locations?.find(l => l.id === insp.locationId)?.name || '...'} 
                      onClick={() => setSelectedInspectionId(insp.id)}
                    />
                  ))
                )}
              </div>
            </div>

            {/* 📡 5. Status Offline/Sync */}
            {!isOnline ? (
              <div className="bg-rose-50 border border-rose-100 rounded-[2.5rem] p-6 flex flex-col md:flex-row items-center gap-6 animate-in zoom-in-95 duration-500 shadow-xl shadow-rose-500/5">
                <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center shadow-lg shadow-rose-500/10 shrink-0">
                  <AlertCircle className="w-10 h-10 text-rose-500" />
                </div>
                <div className="flex flex-col gap-1 text-center md:text-left">
                  <span className="text-lg font-black text-rose-900 tracking-tight uppercase leading-none">Conectividade Interrompida</span>
                  <span className="text-xs font-bold text-rose-600/70">O modo offline-first está mantendo seus dados salvos localmente. {unsyncedCount > 0 ? `Existem ${unsyncedCount} itens pendentes de sincronização.` : 'Tudo pronto para subir assim que a internet voltar.'}</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-6 bg-slate-50/50 rounded-[2.5rem] border border-slate-100 mt-4 group">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_12px_#10b981] animate-pulse"></div>
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] leading-none">
                    {unsyncedCount > 0 ? `Sincronizando ${unsyncedCount} registros com a prefeitura...` : 'Nuvem e Dispositivo Sincronizados (100%)'}
                  </span>
                </div>
                {unsyncedCount > 0 && (
                  <div className="w-64 h-1.5 bg-slate-200 rounded-full overflow-hidden shadow-inner translate-y-1">
                    <div className="h-full bg-emerald-500 animate-progress origin-left rounded-full"></div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      case 'locations':
        return <LocationsView onSelectInspection={(id) => setSelectedInspectionId(id)} />;
      case 'inspections':
        // Reuse similar structure or pass setTab
        return (
          <div className="flex flex-col gap-6 animate-in fade-in duration-500">
             <div className="flex items-center justify-between">
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Todas as Vistorias</h2>
                <Button size="sm" icon={Plus} onClick={() => setActiveTab('locations')}>Nova</Button>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {inspections?.map(insp => (
                    <RecentInspectionRow 
                      key={insp.id} 
                      inspection={insp} 
                      locationName={locations?.find(l => l.id === insp.locationId)?.name || '...'} 
                      onClick={() => setSelectedInspectionId(insp.id)}
                    />
                  ))}
              </div>
          </div>
        );
      case 'reports':
        return isManager ? <ReportsView /> : <div className="p-20 text-center text-slate-400 font-bold uppercase tracking-widest">Acesso restrito.</div>;
      case 'users':
        return isAdmin ? <UsersView /> : <div className="p-20 text-center text-slate-400 font-bold uppercase tracking-widest">Acesso restrito a administradores.</div>;
      case 'notifications':
        return <NotificationsView onBack={() => setActiveTab('home')} />;
      case 'settings':
        return (
          <div className="flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
             <div className="flex flex-col gap-2">
                <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">Configurações</h2>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ajustes e manutenção do sistema</span>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {isAdmin && (
                  <Card className="p-8 border-rose-100 bg-rose-50/30 flex flex-col gap-6 rounded-[2.5rem]">
                    <div className="flex items-center gap-4">
                       <div className="w-12 h-12 bg-rose-100 rounded-2xl flex items-center justify-center text-rose-600">
                          <AlertCircle className="w-6 h-6" />
                       </div>
                       <div className="flex flex-col">
                          <h3 className="font-black text-slate-900 uppercase tracking-tight">Zona de Risco</h3>
                          <span className="text-[10px] font-bold text-rose-500 uppercase tracking-widest">Ações Irreversíveis</span>
                       </div>
                    </div>
                    
                    <p className="text-xs text-slate-500 leading-relaxed font-medium">
                      Esta função apaga permanentemente todas as vistorias, itens, fotos e notificações registradas no banco de dados local. 
                      Use apenas para limpeza de dados de teste antes do uso oficial.
                    </p>

                    <Button 
                      onClick={handleResetSystem} 
                      loading={isResetting}
                      variant="secondary" 
                      className="bg-white border-rose-200 text-rose-600 hover:bg-rose-600 hover:text-white transition-all rounded-2xl h-14 font-black uppercase tracking-widest text-[10px]"
                    >
                      ZERAR TODOS OS DADOS DE VISTORIA
                    </Button>
                  </Card>
                )}

                <Card className="p-8 flex flex-col gap-6 rounded-[2.5rem]">
                    <div className="flex items-center gap-4">
                       <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600">
                          <Download className="w-6 h-6" />
                       </div>
                       <div className="flex flex-col">
                          <h3 className="font-black text-slate-900 uppercase tracking-tight">Gestão de Dados</h3>
                          <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Sincronização Manual (Arquivos)</span>
                       </div>
                    </div>
                    
                    <p className="text-xs text-slate-500 leading-relaxed font-medium">
                      Como o storage em nuvem está em manutenção, use esta função para mover dados entre dispositivos (ex: do PC para o Celular).
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                       <Button 
                         variant="secondary" 
                         icon={Download} 
                         onClick={handleExportData}
                         className="rounded-2xl h-14 font-black uppercase tracking-widest text-[9px] bg-slate-50 border-slate-100"
                       >
                         EXPORTAR BACKUP
                       </Button>
                       <label className="cursor-pointer">
                          <div className="flex items-center justify-center gap-2 w-full h-14 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-[9px] hover:bg-slate-800 transition-all">
                             <Upload className="w-4 h-4" />
                             IMPORTAR DADOS
                          </div>
                          <input type="file" className="hidden" accept=".json" onChange={handleImportData} />
                       </label>
                    </div>
                </Card>

                <Card className="p-8 flex flex-col gap-6 rounded-[2.5rem]">
                    <div className="flex items-center gap-4">
                       <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white">
                          <ShieldCheck className="w-6 h-6" />
                       </div>
                       <div className="flex flex-col">
                          <h3 className="font-black text-slate-900 uppercase tracking-tight">Sobre o Sistema</h3>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Informações Técnicas</span>
                       </div>
                    </div>
                    
                    <div className="flex flex-col gap-3">
                       <div className="flex justify-between items-center py-3 border-b border-slate-50">
                          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Nome</span>
                          <span className="text-sm font-black text-slate-900 text-right uppercase">PATRI-MV</span>
                       </div>
                       <div className="flex justify-between items-center py-3 border-b border-slate-50">
                          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Versão</span>
                          <span className="text-sm font-black text-slate-900 text-right uppercase">v16.2.1 • Transparência</span>
                       </div>
                       <div className="flex justify-between items-center py-3 border-b border-slate-50">
                          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Jurisdição</span>
                          <span className="text-sm font-black text-slate-900 text-right uppercase">Manoel Viana - RS</span>
                       </div>
                    </div>
                </Card>
             </div>
          </div>
        );
      default:
        return <div className="flex items-center justify-center py-20 text-slate-400 font-medium italic">Selecione uma opção no menu.</div>;
    }
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-bg">
      {/* 📱 Mobile Header */}
      <div className="lg:hidden flex items-center justify-between p-4 bg-white border-b border-slate-100 sticky top-0 z-50">
        <div className="flex items-center gap-2">
           {selectedInspectionId ? (
             <button onClick={() => setSelectedInspectionId(null)} className="flex items-center gap-2 text-slate-900 font-black">
                <ArrowLeft className="w-5 h-5 text-slate-400" /> 
                <span className="text-xs uppercase tracking-widest text-slate-500">Detalhes</span>
             </button>
           ) : (
             <div className="flex items-center gap-2" onClick={() => handleTabChange('home')}>
                <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center">
                   <ShieldCheck className="w-5 h-5 text-white" />
                </div>
                <span className="font-black tracking-tighter text-slate-900 uppercase">PATRI-MV</span>
             </div>
           )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-50 rounded-full">
            <div className={cn("w-2 h-2 rounded-full animate-pulse", isOnline ? "bg-emerald-500" : "bg-rose-500")} />
            <span className="text-[10px] font-black text-slate-400">{isOnline ? "ON" : "OFF"}</span>
          </div>
          <button onClick={signOut} className="p-2 text-rose-500">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 🖥️ Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-72 bg-white border-r border-slate-100 p-8 sticky top-0 h-screen">
        <div className="flex items-center gap-3 mb-10 pl-2">
           <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center shadow-xl shadow-slate-900/20">
              <ShieldCheck className="w-6 h-6 text-white" />
           </div>
           <div className="flex flex-col leading-none">
              <span className="font-black text-xl tracking-tighter text-slate-900">PATRI-MV</span>
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mt-1">Manoel Viana</span>
           </div>
        </div>

        <nav className="flex flex-col gap-2 flex-1">
          <NavItem active={activeTab === 'home' && !selectedInspectionId} label="Início" icon={LayoutGrid} onClick={() => handleTabChange('home')} />
          <NavItem active={activeTab === 'notifications'} label="Notificações" icon={Bell} onClick={() => handleTabChange('notifications')} badge={unreadNotifications || 0} />
          <NavItem active={activeTab === 'inspections'} label="Vistorias" icon={ClipboardList} onClick={() => handleTabChange('inspections')} />
          <NavItem active={activeTab === 'locations'} label="Localizações" icon={Building2} onClick={() => handleTabChange('locations')} />
          {isManager && <NavItem active={activeTab === 'reports'} label="Relatórios" icon={BarChart3} onClick={() => handleTabChange('reports')} />}
          {isAdmin && (
            <NavItem active={activeTab === 'users'} label="Membros" icon={Users} onClick={() => handleTabChange('users')} />
          )}
          <NavItem active={activeTab === 'settings'} label="Configurações" icon={Settings} onClick={() => handleTabChange('settings')} />
        </nav>

        <div className="mt-auto flex flex-col gap-4">
          <div className="p-4 bg-slate-50 rounded-3xl flex items-center gap-3 ring-1 ring-slate-100">
             <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center shadow-sm text-slate-400 font-black text-xs uppercase">
                {user?.name.charAt(0)}
             </div>
             <div className="flex flex-col overflow-hidden">
                <span className="text-sm font-bold text-slate-900 truncate">{user?.name}</span>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{user?.role}</span>
             </div>
          </div>
          <button 
            onClick={signOut}
            className="flex items-center gap-3 px-6 py-4 rounded-2xl text-rose-500 hover:bg-rose-50 font-bold text-sm transition-all group outline-none"
          >
            <LogOut className="w-5 h-5 transition-transform group-hover:-translate-x-1" /> Sair do Sistema
          </button>
        </div>
      </aside>

      {/* 🚀 Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* 🗺️ Universal Header with Breadcrumbs */}
        <header className={cn(
          "flex items-center justify-between px-6 lg:px-12 py-6 lg:py-8 bg-bg/80 backdrop-blur-xl sticky top-0 z-30 transition-all",
          selectedInspectionId ? "pb-4" : ""
        )}>
          <div className="flex items-center gap-4 lg:gap-6 w-full lg:w-auto">
            {(activeTab !== 'home' || selectedInspectionId) && (
              <button 
                onClick={() => handleTabChange('home')}
                className="w-10 h-10 lg:w-12 lg:h-12 shrink-0 bg-white border border-slate-100 rounded-[1rem] lg:rounded-2xl flex items-center justify-center text-slate-400 hover:text-slate-900 hover:shadow-lg hover:border-slate-300 transition-all active:scale-95"
                title="Voltar ao Início"
              >
                <Home className="w-5 h-5 lg:w-6 lg:h-6" />
              </button>
            )}
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2 mb-1.5 overflow-x-auto no-scrollbar mask-fade-right pr-4">
                <span 
                  onClick={() => handleTabChange('home')}
                  className="text-[9px] lg:text-[10px] font-black text-slate-400 hover:text-blue-600 uppercase tracking-widest cursor-pointer transition-colors shrink-0"
                >
                  Dashboard
                </span>
                {activeTab !== 'home' && (
                  <>
                    <ArrowRight className="w-3 h-3 text-slate-300 shrink-0" />
                    <span 
                      onClick={() => setSelectedInspectionId(null)}
                      className={cn("text-[9px] lg:text-[10px] font-black uppercase tracking-widest cursor-pointer transition-colors shrink-0", selectedInspectionId ? "text-slate-400 hover:text-blue-600" : "text-blue-600")}
                    >
                      {activeTab === 'locations' ? 'Ambientes' : activeTab === 'inspections' ? 'Vistorias' : activeTab === 'reports' ? 'Auditoria' : activeTab === 'users' ? 'Equipe' : activeTab === 'settings' ? 'Global' : activeTab === 'notifications' ? 'Alertas' : activeTab}
                    </span>
                  </>
                )}
                {selectedInspectionId && (
                  <>
                    <ArrowRight className="w-3 h-3 text-slate-300 shrink-0" />
                    <span className="text-[9px] lg:text-[10px] font-black text-blue-600 uppercase tracking-widest shrink-0 truncate">
                      Modo Inspeção
                    </span>
                  </>
                )}
              </div>
              <h2 className="text-xl lg:text-3xl font-black text-slate-900 tracking-tighter leading-none truncate">
                {selectedInspectionId ? "Auditoria de Ambiente" : activeTab === 'home' ? `Olá, ${user?.name.split(' ')[0]}` : activeTab === 'locations' ? 'Registro de Ambientes' : activeTab === 'inspections' ? 'Dossiê de Vistorias' : activeTab === 'reports' ? 'Painel de Transparência' : activeTab === 'users' ? 'Gestão de Agentes' : activeTab === 'settings' ? 'Configurações de Instância' : activeTab === 'notifications' ? 'Centro de Controle' : activeTab}
              </h2>
            </div>
          </div>
          
          <div className="hidden lg:flex items-center gap-6 shrink-0">
             <div className="flex items-center gap-3 pr-6 border-r border-slate-200">
                <div className="flex flex-col items-end leading-none">
                   <span className="text-[10px] font-black text-slate-900 uppercase tracking-tighter shrink-0">{user?.name}</span>
                   <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">{user?.role}</span>
                </div>
                <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white">
                   <UserIcon className="w-5 h-5" />
                </div>
             </div>

             <div className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-100 rounded-full shadow-sm">
                <div className={cn("w-2 h-2 rounded-full", isOnline ? "bg-emerald-500 shadow-[0_0_8px_#10b981]" : "bg-rose-500")} />
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">{isOnline ? "Conectado" : "Offline"}</span>
             </div>

             <button onClick={() => setActiveTab('notifications')} className="relative w-12 h-12 flex items-center justify-center bg-white border border-slate-100 rounded-2xl text-slate-400 hover:text-slate-900 transition-all hover:bg-slate-50">
               <Bell className="w-6 h-6" />
               {unreadNotifications > 0 && (
                 <span className="absolute top-2 right-2 w-4 h-4 bg-rose-500 text-[10px] text-white flex items-center justify-center rounded-full border-2 border-white font-bold">
                   {unreadNotifications}
                 </span>
               )}
             </button>
          </div>
        </header>

        <section className="px-6 lg:px-12 pb-24 lg:pb-12 pt-4 lg:pt-0 max-w-7xl">
          {renderContent()}
        </section>
      </main>

      {/* 🤳 Mobile Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 lg:hidden bg-white/80 backdrop-blur-xl border-t border-slate-100 flex items-center justify-around p-4 z-50">
        <MobileNavItem active={activeTab === 'home' && !selectedInspectionId} icon={LayoutGrid} onClick={() => handleTabChange('home')} />
        <MobileNavItem active={activeTab === 'inspections'} icon={ClipboardList} onClick={() => handleTabChange('inspections')} />
        <div className="relative -top-6">
           <button 
             onClick={() => handleTabChange('locations')}
             className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center shadow-xl shadow-slate-900/30 text-white"
           >
             <Plus className="w-6 h-6" />
           </button>
        </div>
        {isManager ? (
          <MobileNavItem active={activeTab === 'reports'} icon={BarChart3} onClick={() => handleTabChange('reports')} />
        ) : (
          <div className="w-11 h-11" /> // Placeholder to keep layout balanced if 5 items were expected
        )}
        <MobileNavItem active={activeTab === 'notifications'} icon={Bell} onClick={() => handleTabChange('notifications')} />
      </nav>
    </div>
  );
}

// 🧩 Componentes Auxiliares Locais

function SummaryCard({ label, value, icon: Icon, onClick, variant = 'default' }: { label: string, value: number | string, icon: any, onClick: () => void, variant?: 'default' | 'accent' }) {
  return (
    <Card 
      onClick={onClick}
      className={cn(
        "group h-40 flex flex-col justify-between border-slate-50 px-6 py-6",
        variant === 'accent' ? "bg-slate-900 text-white border-transparent" : "bg-white shadow-sm hover:shadow-xl hover:shadow-slate-200/50"
      )}
    >
      <div className="flex items-start justify-between">
        <div className={cn(
          "w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500",
          variant === 'accent' ? "bg-white/10" : "bg-slate-50 group-hover:bg-slate-900 group-hover:text-white"
        )}>
          <Icon className="w-6 h-6 transform group-hover:rotate-12 transition-transform" />
        </div>
        <span className={cn(
          "text-[10px] font-black uppercase tracking-[0.2em] transform rotate-90 origin-right translate-y-4 opacity-30",
          variant === 'accent' ? "text-white" : "text-slate-900"
        )}>DADOS</span>
      </div>
      <div className="flex flex-col">
        <span className="text-4xl font-black stat-value tracking-tighter leading-none">{value}</span>
        <span className={cn(
          "text-[10px] uppercase font-black tracking-[0.15em] mt-2",
          variant === 'accent' ? "text-slate-400" : "text-slate-400 group-hover:text-slate-600"
        )}>{label}</span>
      </div>
    </Card>
  );
}

function QuickActionButton({ icon: Icon, label, onClick, primary = false }: { icon: any, label: string, onClick: () => void, primary?: boolean }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-4 h-40 rounded-[2.5rem] border-2 transition-all group active:scale-95 shadow-sm",
        primary 
          ? "bg-slate-900 border-slate-900 text-white hover:bg-slate-800" 
          : "bg-white border-slate-50 hover:border-slate-200 text-slate-600 hover:text-slate-900"
      )}
    >
      <div className={cn(
        "w-14 h-14 rounded-2xl flex items-center justify-center transition-all shadow-sm",
        primary ? "bg-white/10 text-white" : "bg-slate-50 text-slate-400 group-hover:bg-slate-900 group-hover:text-white"
      )}>
        <Icon className="w-7 h-7" />
      </div>
      <span className="text-[11px] font-black uppercase tracking-widest leading-none">{label}</span>
    </button>
  );
}

function RecentInspectionRow({ inspection, locationName, onClick }: { inspection: Inspection, locationName: string, onClick: () => void, key?: string | number }) {
  const isFinalized = inspection.status === 'finalizada';
  const isInProgress = inspection.status === 'em_andamento';
  
  const assetCount = useLiveQuery(
    () => db.assets.where('inspectionId').equals(inspection.id).count(),
    [inspection.id]
  );

  return (
    <Card 
      onClick={onClick}
      className="flex items-center justify-between py-5 px-6 group border-slate-50/50 hover:border-slate-200"
    >
      <div className="flex items-center gap-5">
        <div className={cn(
          "w-14 h-14 rounded-2xl flex items-center justify-center border-2 transition-all group-hover:scale-105 relative",
          isFinalized ? "bg-emerald-50/50 border-emerald-100/50" : "bg-blue-50/50 border-blue-100/50"
        )}>
          <ClipboardList className={cn("w-6 h-6", isFinalized ? "text-emerald-500" : "text-blue-500")} />
          {isInProgress && (assetCount === 0) && (
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full border-2 border-white flex items-center justify-center">
              <AlertCircle className="w-2.5 h-2.5 text-white" />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-900 text-lg tracking-tight group-hover:text-blue-600 transition-colors line-clamp-1">{locationName}</span>
            {isInProgress && (assetCount === 0) && (
              <span className="bg-amber-100 text-amber-700 text-[8px] font-black uppercase px-2 py-0.5 rounded-full tracking-widest">Sem itens</span>
            )}
          </div>
          <div className="flex items-center gap-3 text-[10px] font-bold">
            <span className="uppercase text-slate-400 tracking-wider font-mono">{formatDate(inspection.date).split(',')[0]}</span>
            <div className="w-1 h-1 rounded-full bg-slate-200"></div>
            <span className="text-slate-400">{assetCount || 0} itens</span>
            <div className="w-1 h-1 rounded-full bg-slate-200"></div>
            <span className={cn(
              "uppercase tracking-[0.1em]",
              isFinalized ? "text-emerald-600" : isInProgress ? "text-blue-600" : "text-slate-600"
            )}>
              {inspection.status.replace('_', ' ')}
            </span>
          </div>
        </div>
      </div>
      
      <Button 
        size="sm" 
        variant={isInProgress ? "accent" : "secondary"}
        icon={isInProgress ? PlayCircle : Eye}
        onClick={onClick}
        className="hidden sm:flex text-[10px] font-black h-10 px-6 uppercase tracking-widest rounded-xl"
      >
        {isInProgress ? "Continuar" : "Ver"}
      </Button>

      <ArrowRight className="w-5 h-5 text-slate-300 sm:hidden group-hover:text-slate-900 transition-transform group-hover:translate-x-1" />
    </Card>
  );
}

function NavItem({ active, label, icon: Icon, onClick, badge }: { active: boolean, icon: any, label: string, onClick: () => void, badge?: number }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-4 px-6 py-4 rounded-2xl font-bold text-sm transition-all group relative",
        active ? "bg-slate-900 text-white shadow-2xl shadow-slate-900/20" : "text-slate-400 hover:bg-slate-50 hover:text-slate-900"
      )}
    >
      <Icon className={cn("w-5 h-5 transition-transform duration-300", active ? "scale-110" : "group-hover:scale-110")} />
      <span className="flex-1 text-left tracking-tight">{label}</span>
      {badge && badge > 0 ? (
        <span className={cn(
          "px-2 py-0.5 rounded-full text-[9px] font-black flex items-center justify-center",
          active ? "bg-white/20 text-white" : "bg-rose-500 text-white"
        )}>
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function MobileNavItem({ active, icon: Icon, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "p-2.5 rounded-2xl transition-all",
        active ? "bg-slate-900 text-white shadow-lg" : "text-slate-300"
      )}
    >
      <Icon className="w-6 h-6" />
    </button>
  );
}
