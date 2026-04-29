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
import { motion } from 'motion/react';
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
import { doc, deleteDoc, getDoc } from 'firebase/firestore';
import { ScannerView } from './ScannerView';

export function Dashboard() {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<'home' | 'inspections' | 'locations' | 'reports' | 'users' | 'settings' | 'notifications' | 'scanner'>('home');
  const [selectedInspectionId, setSelectedInspectionId] = useState<string | null>(null);

  const handleScannerOpen = (inspectionId: string, locationId: string) => {
    if (inspectionId === 'NEW') {
      const startNew = async () => {
         const newId = crypto.randomUUID();
         await db.inspections.put({
            id: newId,
            locationId: locationId,
            date: Date.now(),
            participants: [],
            status: 'em_andamento'
         });
         setActiveTab('home');
         setSelectedInspectionId(newId);
      };
      startNew();
    } else {
      setActiveTab('home');
      setSelectedInspectionId(inspectionId);
    }
  };
  const [isResetting, setIsResetting] = useState(false);
  const isOnline = useOnlineStatus();

  const currentSettings = useLiveQuery(() => db.settings.get('current'));

  useEffect(() => {
    const processScanned = async () => {
      const scanned = sessionStorage.getItem('scanned_id');
      if (scanned) {
         sessionStorage.removeItem('scanned_id');
         
         const localInsp = await db.inspections.get(scanned);
         if (localInsp) {
            handleScannerOpen(scanned, localInsp.locationId);
            return;
         }

         const inspRef = doc(firestore, 'inspections', scanned);
         const inspSnap = await getDoc(inspRef);
         if (inspSnap.exists()) {
            const data = inspSnap.data() as Inspection;
            await db.inspections.put({ id: inspSnap.id, ...data } as any);
            handleScannerOpen(inspSnap.id, data.locationId);
            return;
         }

         // If it's a location ID
         const locRef = doc(firestore, 'locations', scanned);
         const locSnap = await getDoc(locRef);
         if (locSnap.exists()) {
            handleScannerOpen('NEW', locSnap.id);
            return;
         }
      }
    };
    processScanned();
  }, []);

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
    return <InspectionView id={selectedInspectionId} onBack={() => {
      setSelectedInspectionId(null);
      window.history.replaceState({}, '', '/');
    }} />;
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
      case 'scanner':
        return <ScannerView onOpenInspection={handleScannerOpen} />;
      case 'home':
        return (
          <div className="flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* 🏰 Hero Moderno */}
            <div className="relative overflow-hidden rounded-[3rem] bg-card border border-border px-8 py-12 text-primary shadow-xl group">
              <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-10">
                <div className="flex flex-col gap-4 text-center md:text-left max-w-xl">
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-bg backdrop-blur-md rounded-full w-fit mx-auto md:mx-0">
                    <Zap className="w-4 h-4 text-accent fill-accent" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">Resumo Operacional • Manoel Viana</span>
                  </div>
                  <h2 className="text-4xl md:text-5xl font-black tracking-tighter leading-[0.9] text-primary">
                    Gestão <br /> 
                    <span className="text-primary-light">Patrimonial</span>
                  </h2>
                  <p className="text-text-muted text-sm font-medium leading-relaxed">
                    Painel inteligente para monitoramento, vistoria e homologação dos bens públicos municipais. Segurança e transparência em tempo real.
                  </p>
                  <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 mt-2">
                    <Button variant="accent" icon={Plus} onClick={() => setActiveTab('locations')} className="rounded-2xl px-10 h-14 uppercase tracking-widest font-black text-[10px] shadow-2xl shadow-accent/30">
                      Iniciar Vistoria
                    </Button>
                    <Button variant="secondary" onClick={() => setActiveTab('scanner')} className="rounded-2xl px-10 h-14 uppercase tracking-widest font-black text-[10px] border-border text-primary hover:bg-bg hover:text-primary">
                      Escanear QR Code
                    </Button>
                    {isManager && (
                      <button onClick={async () => {
                        const allInspections = await db.inspections.toArray();
                        const allLocations = await db.locations.toArray();
                        let clearedInps = 0;
                        let clearedAssets = 0;
                        let clearedLocs = 0;
                        
                        // 1. Clear Empty Inspections
                        for (const i of allInspections) {
                           const c = await db.assets.where('inspectionId').equals(i.id).count();
                           if (c === 0) {
                              await db.inspections.delete(i.id);
                              try { await deleteDoc(doc(firestore, 'inspections', i.id)); } catch(e){}
                              clearedInps++;
                           }
                        }

                        // 2. Clear Empty Locations
                        for (const l of allLocations) {
                          const c = await db.inspections.where('locationId').equals(l.id).count();
                          if (c === 0) {
                            await db.locations.delete(l.id);
                            try { await deleteDoc(doc(firestore, 'locations', l.id)); } catch(e){}
                            clearedLocs++;
                          }
                        }

                        // 3. Clear Orphan Assets
                        const allAssets = await db.assets.toArray();
                        for (const a of allAssets) {
                          const insp = await db.inspections.get(a.inspectionId);
                          if (!insp) {
                            await db.assets.delete(a.id);
                            try { await deleteDoc(doc(firestore, 'assets', a.id)); } catch(e){}
                            clearedAssets++;
                          }
                        }

                        if (clearedInps > 0 || clearedAssets > 0 || clearedLocs > 0) {
                          alert(`Limpeza concluída:\n- ${clearedLocs} Locais vazios\n- ${clearedInps} Vistorias vazias\n- ${clearedAssets} Itens órfãos`);
                          window.location.reload();
                        }
                        else alert('Nenhuma irregularidade encontrada.');
                      }} className="text-[10px] font-black uppercase text-slate-400 hover:text-rose-500 transition-colors underline underline-offset-4">Limpar Fantasmas</button>
                    )}
                    {isManager && (
                      <button onClick={async () => {
                        if (confirm("ATENÇÃO: Isso irá apagar TODOS os dados locais (vistorias não sincronizadas serão perdidas). Deseja continuar?")) {
                          await db.delete();
                          window.location.reload();
                        }
                      }} className="text-[10px] font-black uppercase text-rose-500 hover:text-rose-700 transition-colors underline underline-offset-4">Resetar Banco Local</button>
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
                   <div className="p-8 bg-card border border-border rounded-[2.5rem] shadow-xl flex flex-col items-center gap-2 transform rotate-2 hover:rotate-0 transition-transform duration-500 cursor-pointer group/card" onClick={() => setActiveTab('notifications')}>
                      <div className="w-16 h-16 bg-bg rounded-3xl flex items-center justify-center shadow-lg mb-2 group-hover/card:scale-110 transition-transform border border-border">
                        <Bell className="w-8 h-8 text-primary" />
                      </div>
                      <span className="text-3xl font-black text-primary">{unreadNotifications || 0}</span>
                      <span className="text-[10px] font-black text-text-muted uppercase tracking-widest">Avisos Pendentes</span>
                   </div>
                   <div className="absolute -top-12 -left-20 p-6 bg-primary-light/10 backdrop-blur-md border border-primary-light/20 rounded-[2rem] shadow-lg flex flex-col items-center gap-1 transform -rotate-6 scale-90">
                      <ShieldCheck className="w-6 h-6 text-primary-light" />
                      <span className="text-[10px] font-black text-primary-light uppercase tracking-widest mt-1">Concluídas</span>
                      <span className="text-xl font-bold text-primary">{concludedInspectionsCount || 0}</span>
                   </div>
                </div>
              </div>
              
              {/* Background Accents */}
              <Building2 className="absolute -bottom-20 -right-20 w-96 h-96 text-primary/5 transform -rotate-12 pointer-events-none transition-transform duration-1000 group-hover:scale-110" />
              <div className="absolute top-0 right-0 w-64 h-64 bg-accent/10 blur-[100px] rounded-full -translate-y-1/2 translate-x-1/2"></div>
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
                  <h3 className="text-xs font-black text-text-muted uppercase tracking-[0.2em]">Fluxo de Atividades</h3>
                  <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest mt-1">Vistorias recentes no sistema</span>
                </div>
                <button onClick={() => setActiveTab('inspections')} className="flex items-center gap-2 text-[10px] font-black text-primary border-2 border-primary px-4 py-2 rounded-xl hover:bg-primary hover:text-white transition-all">VER TODAS <ArrowRight className="w-3 h-3" /></button>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {inspections?.length === 0 ? (
                  <Card className="flex items-center justify-center py-20 text-text-muted border-dashed border-2 border-border bg-bg/50 rounded-[3rem]">
                    <div className="text-center">
                      <ClipboardList className="w-16 h-16 mx-auto opacity-20 mb-4" />
                      <p className="text-sm font-black uppercase tracking-widest text-text-muted">Nenhuma vistoria registrada</p>
                      <p className="text-xs text-text-muted mt-1">Selecione um local para iniciar o inventário.</p>
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
              <div className="flex flex-col items-center gap-3 py-6 bg-card rounded-[2.5rem] border border-border mt-4 group shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_12px_#10b981] animate-pulse"></div>
                  <span className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] leading-none">
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
      default:
        return <div className="flex items-center justify-center py-20 text-slate-400 font-medium italic">Selecione uma opção no menu.</div>;
    }
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-bg">
      {/* 📱 Mobile Header */}
      <div className="lg:hidden flex items-center justify-between p-4 bg-card border-b border-border sticky top-0 z-50">
        <div className="flex items-center gap-2">
           {selectedInspectionId ? (
             <button onClick={() => setSelectedInspectionId(null)} className="flex items-center gap-2 text-slate-900 font-black">
                <ArrowLeft className="w-5 h-5 text-slate-400" /> 
                <span className="text-xs uppercase tracking-widest text-slate-500">Detalhes</span>
             </button>
           ) : (
             <div className="flex items-center gap-2" onClick={() => handleTabChange('home')}>
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                   <ShieldCheck className="w-5 h-5 text-white" />
                </div>
                <span className="font-black tracking-tighter text-primary uppercase">PATRI-MV</span>
             </div>
           )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-50 rounded-full shadow-inner border border-slate-100">
            <div className={cn("w-2 h-2 rounded-full", isOnline ? "bg-emerald-500" : "bg-rose-500")} />
          </div>
          <button onClick={signOut} className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100 transition-colors">
             <span className="text-[10px] font-bold uppercase tracking-widest leading-none">Sair</span>
             <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 🖥️ Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-72 bg-card border-r border-border p-8 sticky top-0 h-screen">
        <div className="flex items-center gap-3 mb-10 pl-2">
           <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-xl shadow-primary/20">
              <ShieldCheck className="w-6 h-6 text-white" />
           </div>
           <div className="flex flex-col leading-none">
              <span className="font-black text-xl tracking-tighter text-primary">PATRI-MV</span>
              <span className="text-[9px] font-black text-text-muted uppercase tracking-widest leading-none mt-1">Manoel Viana</span>
           </div>
        </div>

        <nav className="flex flex-col gap-2 flex-1">
          <NavItem active={activeTab === 'home' && !selectedInspectionId} label="Início" icon={LayoutGrid} onClick={() => handleTabChange('home')} />
          <NavItem active={activeTab === 'scanner'} label="Escanear Vistoria" icon={Search} onClick={() => handleTabChange('scanner')} />
          <NavItem active={activeTab === 'notifications'} label="Notificações" icon={Bell} onClick={() => handleTabChange('notifications')} badge={unreadNotifications || 0} />
          <NavItem active={activeTab === 'inspections'} label="Vistorias" icon={ClipboardList} onClick={() => handleTabChange('inspections')} />
          <NavItem active={activeTab === 'locations'} label="Localizações" icon={Building2} onClick={() => handleTabChange('locations')} />
          {isManager && <NavItem active={activeTab === 'reports'} label="Relatórios" icon={BarChart3} onClick={() => handleTabChange('reports')} />}
          {isAdmin && (
            <NavItem active={activeTab === 'users'} label="Membros" icon={Users} onClick={() => handleTabChange('users')} />
          )}
        </nav>

        <div className="mt-auto flex flex-col gap-4">
          <div className="p-4 bg-bg rounded-3xl flex items-center gap-3 ring-1 ring-border">
             <div className="w-10 h-10 bg-card rounded-2xl flex items-center justify-center shadow-sm text-text-muted font-black text-xs uppercase border border-border">
                {user?.name.charAt(0)}
             </div>
             <div className="flex flex-col overflow-hidden">
                <span className="text-sm font-bold text-primary truncate">{user?.name}</span>
                <span className="text-[10px] font-black text-text-muted uppercase tracking-widest">{user?.role}</span>
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
                className="w-10 h-10 lg:w-12 lg:h-12 shrink-0 bg-card border border-border rounded-[1rem] lg:rounded-2xl flex items-center justify-center text-text-muted hover:text-primary hover:shadow-lg hover:border-text-muted transition-all active:scale-95"
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
              <h2 className="text-xl lg:text-3xl font-black text-primary tracking-tighter leading-none truncate">
                {selectedInspectionId ? "Auditoria de Ambiente" : activeTab === 'home' ? `Olá, ${user?.name.split(' ')[0]}` : activeTab === 'locations' ? 'Registro de Ambientes' : activeTab === 'inspections' ? 'Dossiê de Vistorias' : activeTab === 'reports' ? 'Painel de Transparência' : activeTab === 'users' ? 'Gestão de Agentes' : activeTab === 'settings' ? 'Configurações de Instância' : activeTab === 'notifications' ? 'Centro de Controle' : activeTab}
              </h2>
            </div>
          </div>
          
          <div className="hidden lg:flex items-center gap-6 shrink-0">
             <div className="flex items-center gap-3 pr-6 border-r border-border">
                <div className="flex flex-col items-end leading-none">
                   <span className="text-[10px] font-black text-primary uppercase tracking-tighter shrink-0">{user?.name}</span>
                   <span className="text-[8px] font-bold text-text-muted uppercase tracking-widest mt-1">{user?.role}</span>
                </div>
                <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white font-bold">
                   {user?.name.charAt(0)}
                </div>
             </div>

             <div className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-full shadow-sm">
                <div className={cn("w-2 h-2 rounded-full", isOnline ? "bg-emerald-500 shadow-[0_0_8px_#10b981]" : "bg-rose-500")} />
                <span className="text-[10px] font-black text-text-muted uppercase tracking-widest leading-none">{isOnline ? "Conectado" : "Offline"}</span>
             </div>

             <button onClick={() => setActiveTab('notifications')} className="relative w-12 h-12 flex items-center justify-center bg-card border border-border rounded-2xl text-text-muted hover:text-primary transition-all hover:bg-bg">
               <Bell className="w-6 h-6" />
               {unreadNotifications > 0 && (
                 <span className="absolute top-2 right-2 w-4 h-4 bg-rose-500 text-[10px] text-white flex items-center justify-center rounded-full border-2 border-white font-bold">
                   {unreadNotifications}
                 </span>
               )}
             </button>

             <button 
               onClick={signOut}
               className="flex items-center gap-2 px-5 h-12 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 hover:bg-rose-500 hover:text-white transition-all font-bold text-[10px] uppercase tracking-widest"
             >
               <LogOut className="w-4 h-4" /> Sair
             </button>
          </div>
        </header>

        <section className="px-6 lg:px-12 pb-24 lg:pb-12 pt-4 lg:pt-0 max-w-7xl">
          {renderContent()}
        </section>
      </main>

      {/* 🤳 Mobile Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 lg:hidden bg-card/90 backdrop-blur-xl border-t border-border flex items-center justify-around p-4 pb-6 z-50">
        <MobileNavItem active={activeTab === 'home' && !selectedInspectionId} icon={LayoutGrid} onClick={() => handleTabChange('home')} />
        <MobileNavItem active={activeTab === 'inspections'} icon={ClipboardList} onClick={() => handleTabChange('inspections')} />
        <div className="relative -top-6">
           <motion.button 
             whileTap={{ scale: 0.9 }}
             whileHover={{ scale: 1.05 }}
             onClick={() => handleTabChange('locations')}
             className={cn("w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl shadow-accent/30 text-white transition-colors duration-300",
               activeTab === 'locations' ? "bg-accent-focus ring-4 ring-accent/20" : "bg-accent"
             )}
           >
             <Plus className={cn("w-6 h-6 transition-transform duration-300", activeTab === 'locations' && "rotate-45")} />
           </motion.button>
        </div>
        {isManager ? (
          <MobileNavItem active={activeTab === 'reports'} icon={BarChart3} onClick={() => handleTabChange('reports')} />
        ) : (
          <MobileNavItem active={activeTab === 'scanner'} icon={Search} onClick={() => handleTabChange('scanner')} />
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
        "group h-40 flex flex-col justify-between border-bg px-6 py-6",
        variant === 'accent' ? "bg-primary text-white border-transparent" : "bg-card shadow-sm hover:shadow-xl"
      )}
    >
      <div className="flex items-start justify-between">
        <div className={cn(
          "w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500",
          variant === 'accent' ? "bg-white/10" : "bg-bg group-hover:bg-primary text-primary group-hover:text-white"
        )}>
          <Icon className="w-6 h-6 transform group-hover:rotate-12 transition-transform" />
        </div>
        <span className={cn(
          "text-[10px] font-black uppercase tracking-[0.2em] transform rotate-90 origin-right translate-y-4 opacity-30",
          variant === 'accent' ? "text-white" : "text-primary"
        )}>DADOS</span>
      </div>
      <div className="flex flex-col">
        <span className="text-4xl font-black stat-value tracking-tighter leading-none">{value}</span>
        <span className={cn(
          "text-[10px] uppercase font-black tracking-[0.15em] mt-2",
          variant === 'accent' ? "text-primary-light" : "text-text-muted"
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
          ? "bg-primary border-primary text-white hover:bg-primary-light" 
          : "bg-card border-bg hover:border-border text-text-muted hover:text-primary"
      )}
    >
      <div className={cn(
        "w-14 h-14 rounded-2xl flex items-center justify-center transition-all shadow-sm",
        primary ? "bg-white/10 text-white" : "bg-bg text-text-muted group-hover:bg-primary group-hover:text-white"
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
      className="flex items-center justify-between py-5 px-6 group border-border hover:border-primary-light"
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
        active ? "bg-primary text-white shadow-2xl shadow-primary/20" : "text-text-muted hover:bg-bg hover:text-primary"
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

function MobileNavItem({ active, icon: Icon, onClick, label }: any) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "relative p-3 rounded-2xl flex flex-col items-center justify-center transition-all outline-none",
        active ? "text-primary scale-110" : "text-text-muted hover:text-text-main"
      )}
    >
      {active && (
        <motion.div
          layoutId="mobile-nav-indicator"
          className="absolute -inset-1 bg-primary/10 rounded-2xl -z-10"
          transition={{ type: "spring", bounce: 0.3, duration: 0.6 }}
        />
      )}
      <Icon className={cn("w-6 h-6 transition-all duration-300", active ? "stroke-[2.5px]" : "stroke-2")} />
      {active && (
        <motion.div 
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -bottom-1 w-1 h-1 bg-primary rounded-full shadow-[0_0_8px_#2563eb]"
        />
      )}
    </button>
  );
}
