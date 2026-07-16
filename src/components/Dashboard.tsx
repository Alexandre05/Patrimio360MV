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
  Trash2,
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
  Upload,
  Database,
  GraduationCap,
  ChevronLeft,
  ChevronRight,
  Cloud
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
// Adicionado processSyncQueue para rodar a fila inteligente no fundo
import { setupSync, pushLocalChanges, processSyncQueue, forceFullSyncRecovery, hardResetAndRescue } from '../lib/syncService';
import { db as firestore, auth } from '../lib/firebase';
import { doc, deleteDoc, getDoc } from 'firebase/firestore';
import { ScannerView } from './ScannerView';
import { InventoryDashboard } from './InventoryDashboard';
import { TrainingView } from './TrainingView';

export function Dashboard() {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<'home' | 'inspections' | 'locations' | 'reports' | 'users' | 'settings' | 'notifications' | 'scanner' | 'analytics' | 'training'>('home');
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
  
  // SOMA REAL DAS QUANTIDADES NO DASHBOARD
  const totalAssetsCount = useLiveQuery(async () => {
    const ativos = await db.assets.filter(a => !a.deleted).toArray();
    return ativos.reduce((acc, curr) => acc + (Number(curr.quantity) || 1), 0);
  });

  // Busca vistorias prontas para o Administrador homologar
  const pendingHomologation = useLiveQuery(() => db.inspections.where('status').equals('concluida').toArray());

  // CORREÇÃO: Usando .filter() em vez de .and() para compatibilidade máxima com Dexie
  const unreadNotifications = useLiveQuery(() => 
    user ? db.notifications.where('targetUserId').equals(user.userId).filter(n => !n.read).count() : 0, 
  [user]) || 0;

  const unsyncedCount = useLiveQuery(() => 
    db.assets.filter(a => 
      a.needsSync === 1 || 
      a.needsSync === true as any ||
      (a.photos && a.photos.some(p => typeof p === 'string' && p.startsWith('data:image')))
    ).count()
  ) || 0;
  
  const [syncing, setSyncing] = useState(false);
  const isAdmin = user?.role === 'administrador' || user?.role === 'prefeito' || user?.email === 'henri199@gmail.com' || auth.currentUser?.email === 'henri199@gmail.com';
  const isManager = isAdmin || user?.role === 'responsavel';

  const [quotaExceeded, setQuotaExceeded] = useState(false);

  useEffect(() => {
    if (user) {
      setupSync();
      
      const syncAndNotify = async () => {
        setSyncing(true);
        try {
          await pushLocalChanges(); // Mantém compatibilidade com o sistema antigo
          await processSyncQueue(); // NOVO: Processa a fila inteligente também!
        } catch (err: any) {
          if (err.message?.includes('LIMITE DE COTAS')) setQuotaExceeded(true);
        } finally {
          setTimeout(() => setSyncing(false), 2000);
        }
        
        try {
          await checkAndGenerateNotifications(user.userId);
        } catch (err: any) {
          if (err.message?.includes('LIMITE DE COTAS')) setQuotaExceeded(true);
        }
      };

      syncAndNotify();

      if (isOnline) {
        const interval = setInterval(syncAndNotify, 30000);
        return () => clearInterval(interval);
      }
    }
  }, [user, isOnline]);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar_collapsed');
    return saved ? JSON.parse(saved) : window.innerWidth < 1280;
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', JSON.stringify(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1280) setIsSidebarCollapsed(true);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (selectedInspectionId) {
    return <InspectionView id={selectedInspectionId} onBack={() => {
      setSelectedInspectionId(null);
      window.history.replaceState({}, '', '/');
    }} />;
  }

  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab);
    setSelectedInspectionId(null);
    setIsMobileMenuOpen(false);
  };

  const handleResetSystem = async () => {
    if (!isAdmin) return;
    const confirm1 = window.confirm("⚠️ ATENÇÃO: Isso irá apagar COMPLETAMENTE o banco de dados. Deseja prosseguir?");
    if (!confirm1) return;
    
    const confirm2 = window.confirm("CONFIRMAÇÃO FINAL: Você tem certeza absoluta de que quer ZERAR tudo?");
    if (!confirm2) return;

    setIsResetting(true);
    try {
      await Promise.all([
        db.assets.clear(),
        db.inspections.clear(),
        db.locations.clear(),
        db.notifications.clear()
      ]);

      if (isOnline) {
        try {
          const { getDocs, collection, deleteDoc, doc, setDoc } = await import('firebase/firestore');
          
          const collectionsToClear = ['assets', 'inspections', 'locations', 'notifications'];
          for (const col of collectionsToClear) {
             const snap = await getDocs(collection(firestore, col));
             for (const d of snap.docs) await deleteDoc(doc(firestore, col, d.id));
          }

          await setDoc(doc(firestore, 'locations', 'GLOBAL_RESET_COMMAND'), {
            reset_timestamp: Date.now(),
            name: 'Comando de Reset (Ignorar)',
            deleted: true
          });

        } catch (firestoreErr) {
          console.error("Erro ao limpar dados remotos:", firestoreErr);
        }
      }

      const keys = ['lastSyncTime_locations', 'lastSyncTime_inspections', 'lastSyncTime_assets', 'lastSyncTime_users', 'lastSyncTime_sector_inspections'];
      keys.forEach(key => localStorage.removeItem(key));
      
      alert("✅ SUCESSO: O banco de dados local e na nuvem foi zerado com sucesso.");
      setTimeout(() => window.location.href = '/', 500);
    } catch (err) {
      alert("Erro ao zerar o banco de dados.");
    } finally {
      setIsResetting(false);
    }
  };

  const handleExportData = async () => {
    try {
      const data = {
        users: await db.users.toArray(),
        locations: await db.locations.toArray(),
        inspections: await db.inspections.toArray(),
        assets: await db.assets.toArray(),
        notifications: await db.notifications.toArray(),
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
        if (!data.inspections || !data.assets) throw new Error("Formato inválido.");

        if (!window.confirm("Deseja importar estes dados? Os dados atuais podem ser substituídos.")) return;

        await Promise.all([
          db.users.bulkPut(data.users || []),
          db.locations.bulkPut(data.locations || []),
          db.inspections.bulkPut(data.inspections || []),
          db.assets.bulkPut(data.assets || []),
          db.notifications.bulkPut(data.notifications || [])
        ]);

        alert("✅ DADOS IMPORTADOS: O sistema foi atualizado.");
        window.location.reload();
      } catch (err) {
        alert("Erro ao importar arquivo.");
      }
    };
    reader.readAsText(file);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'training': return <TrainingView />;
      case 'analytics': return <InventoryDashboard />;
      case 'scanner': return <ScannerView onOpenInspection={handleScannerOpen} />;
      case 'locations': return <LocationsView onSelectInspection={(id) => setSelectedInspectionId(id)} />;
      case 'reports': return isManager ? <ReportsView /> : <div className="p-20 text-center font-bold tracking-widest text-slate-400">Acesso restrito.</div>;
      case 'users': return isAdmin ? <UsersView /> : <div className="p-20 text-center font-bold tracking-widest text-slate-400">Acesso restrito.</div>;
      case 'notifications': return <NotificationsView onBack={() => setActiveTab('home')} />;
      case 'inspections':
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
      case 'settings':
        return isAdmin ? (
          <div className="flex flex-col gap-8 animate-in fade-in duration-500 max-w-4xl">
            <div className="bg-white border border-slate-100 p-8 rounded-[2.5rem] shadow-sm flex flex-col gap-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-[1.25rem] bg-indigo-50 border border-indigo-100/40 flex items-center justify-center text-indigo-600">
                  <Settings className="w-6 h-6" />
                </div>
                <div className="flex flex-col">
                  <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Ferramentas de Sistema</h3>
                  <span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Painel de manutenção</span>
                </div>
              </div>
              <div className="h-px bg-slate-100 w-full" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="border border-rose-100 bg-rose-50/20 p-6 rounded-[2rem] flex flex-col justify-between gap-6">
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-black text-rose-600 uppercase tracking-widest">Zona de Perigo</span>
                    <h4 className="text-xl font-bold text-rose-950 leading-none">Zerar Banco</h4>
                    <p className="text-slate-500 text-xs mt-2">Apaga permanentemente todas as informações.</p>
                  </div>
                  <Button variant="danger" onClick={handleResetSystem} disabled={isResetting} className="w-full h-14 bg-rose-600 text-white hover:bg-rose-700 font-bold uppercase text-xs">
                    {isResetting ? "Limpando..." : "Zerar Banco"}
                  </Button>
                </div>
                <div className="border border-indigo-100/30 bg-slate-50/40 p-6 rounded-[2rem] flex flex-col justify-between gap-6">
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-black text-indigo-600 uppercase tracking-widest">Preservação</span>
                    <h4 className="text-xl font-bold text-slate-950 leading-none">Backup</h4>
                    <p className="text-slate-500 text-xs mt-2">Exporte ou importe os dados do sistema.</p>
                  </div>
                  <div className="flex flex-col gap-3">
                    <Button variant="outline" onClick={handleExportData} className="w-full h-14 border-2 font-bold uppercase text-xs">Exportar Dados (.json)</Button>
                    <label className="flex items-center justify-center gap-2 w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs uppercase font-black cursor-pointer text-center">
                      Importar Backup
                      <input type="file" accept=".json" onChange={handleImportData} className="hidden" />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : <div className="p-20 text-center font-bold text-slate-400 uppercase tracking-widest">Acesso restrito.</div>;
      case 'home':
      default:
        return (
          <div className="flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {quotaExceeded && (
              <div className="bg-amber-50 border border-amber-200 rounded-[2.5rem] p-6 flex flex-col md:flex-row items-center gap-6 shadow-xl shadow-amber-500/5">
                <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center shadow-lg shadow-amber-500/10 shrink-0">
                  <AlertCircle className="w-8 h-8 text-amber-500" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-lg font-black text-amber-900 tracking-tight uppercase">Limite de Sincronização Atingido</span>
                  <span className="text-xs font-bold text-amber-600/70">O Google Cloud atingiu o limite gratuito de hoje. Suas vistorias continuam sendo salvas no dispositivo.</span>
                </div>
              </div>
            )}

            {isAdmin && pendingHomologation && pendingHomologation.length > 0 && (
              <div className="bg-emerald-50 border border-emerald-200 p-6 rounded-[2.5rem] flex flex-col md:flex-row items-center gap-6 shadow-xl shadow-emerald-500/5">
                 <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center shadow-lg shrink-0">
                    <ShieldCheck className="w-8 h-8 text-emerald-600" />
                 </div>
                 <div className="flex flex-col gap-1 flex-1">
                    <span className="text-lg font-black text-emerald-900 tracking-tight uppercase">Homologação Pendente</span>
                    <span className="text-xs font-bold text-emerald-700/70">
                       Existem <strong>{pendingHomologation.length} vistoria(s)</strong> aguardando sua revisão e homologação.
                    </span>
                 </div>
                 <Button onClick={() => setActiveTab('inspections')} className="bg-emerald-600 hover:bg-emerald-700 h-14 px-8 text-[10px] font-black uppercase tracking-widest rounded-xl">
                    Revisar Agora
                 </Button>
              </div>
            )}

            <div className="relative overflow-hidden rounded-[2.5rem] bg-white border border-slate-100 p-8 lg:p-12 text-slate-900 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.03)] group">
              <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-12">
                <div className="flex flex-col gap-6 text-center lg:text-left max-w-2xl">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-full w-fit mx-auto lg:mx-0">
                    <Zap className="w-4 h-4 text-indigo-600" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Manoel Viana • Sistema Oficial</span>
                  </div>
                  <h2 className="text-4xl lg:text-6xl font-display font-extrabold tracking-tight leading-[0.9] text-slate-900">
                    Sua Vistoria <br /> 
                    <span className="text-indigo-600">360 Graus.</span>
                  </h2>
                  <p className="text-slate-500 text-lg font-medium max-w-lg">
                    Software inteligente de auditoria patrimonial. Monitore, escaneie e homologue bens públicos com transparência total.
                  </p>
                  <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 mt-4">
                    <Button variant="accent" icon={Plus} onClick={() => setActiveTab('locations')} className="px-10 h-16 text-xs uppercase tracking-widest">
                      Nova Vistoria
                    </Button>
                    <Button variant="outline" icon={Search} onClick={() => setActiveTab('scanner')} className="px-10 h-16 text-xs uppercase tracking-widest bg-white">
                      Escanear QR
                    </Button>
                    <Button variant="outline" icon={Database} onClick={async () => {
                        if (window.confirm("Isso fará uma limpeza segura e baixará todos os dados da nuvem novamente. Deseja continuar?")) {
                          try {
                            await db.locations.clear(); await db.inspections.clear(); await db.assets.clear(); await db.notifications.clear();
                            ['lastSyncTime_locations','lastSyncTime_inspections','lastSyncTime_assets','lastSyncTime_users','lastSyncTime_notifications'].forEach(k => localStorage.removeItem(k));
                            window.location.reload();
                          } catch (error) { alert("Erro ao limpar cache."); }
                        }
                      }} className="px-10 h-16 text-xs uppercase tracking-widest bg-white">
                      Sincronização Forçada
                    </Button>
                  </div>
                </div>
                
                <div className="hidden lg:flex flex-col gap-6 relative">
                   <Card className="p-8 bg-slate-900 border-slate-800 rounded-[2rem] shadow-2xl flex flex-col items-center gap-3 transform rotate-2 hover:rotate-0 transition-all duration-500 cursor-pointer group/card" onClick={() => setActiveTab('notifications')}>
                      <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 mb-2 transition-transform group-hover/card:scale-110">
                        <Bell className="w-8 h-8 text-indigo-400" />
                      </div>
                      <span className="text-4xl font-display font-black text-white leading-none">{unreadNotifications}</span>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Alertas Críticos<br/>Pendentes</span>
                   </Card>
                   <div className="absolute -top-16 -left-24 p-6 bg-indigo-600 rounded-[2rem] shadow-2xl flex flex-col items-center gap-1 transform -rotate-6 scale-90 border border-indigo-500">
                      <ShieldCheck className="w-8 h-8 text-white" />
                      <span className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest mt-2">Vistorias</span>
                      <span className="text-2xl font-display font-extrabold text-white leading-none">{concludedInspectionsCount || 0}</span>
                   </div>
                </div>
              </div>
              <Building2 className="absolute -bottom-24 -right-16 w-80 h-80 text-slate-100 opacity-20 transform -rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-1000" />
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <SummaryCard label="Localizações" value={locations?.length || 0} icon={Building2} onClick={() => setActiveTab('locations')} />
              <SummaryCard label="Em Andamento" value={activeInspectionsCount || 0} icon={ClipboardList} variant="accent" onClick={() => setActiveTab('inspections')} />
              <SummaryCard label="Concluídas" value={concludedInspectionsCount || 0} icon={CheckCircle2} onClick={() => setActiveTab('inspections')} />
              <SummaryCard label="Total de Itens" value={totalAssetsCount || 0} icon={ShieldCheck} onClick={() => setActiveTab('reports')} />
            </div>

            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between ml-1 leading-none">
                <div className="flex flex-col">
                  <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">Fluxo de Atividades</h3>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Vistorias recentes no sistema</span>
                </div>
                <button onClick={() => setActiveTab('inspections')} className="flex items-center gap-2 text-[10px] font-black text-indigo-600 border-2 border-indigo-600 px-4 py-2 rounded-xl hover:bg-indigo-600 hover:text-white transition-all">VER TODAS <ArrowRight className="w-3 h-3" /></button>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {inspections?.length === 0 ? (
                  <Card className="flex items-center justify-center py-20 text-slate-400 border-dashed border-2 bg-slate-50 rounded-[3rem]">
                    <div className="text-center">
                      <ClipboardList className="w-16 h-16 mx-auto opacity-20 mb-4" />
                      <p className="text-sm font-black uppercase tracking-widest text-slate-400">Nenhuma vistoria registrada</p>
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
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-slate-50">
      <div className="lg:hidden flex items-center justify-between p-4 bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="flex items-center gap-3">
           <button onClick={() => setIsMobileMenuOpen(true)} className="w-10 h-10 flex items-center justify-center bg-slate-50 text-slate-400 rounded-xl border border-slate-100">
              <LayoutGrid className="w-5 h-5" />
           </button>
           <div className="flex items-center gap-2" onClick={() => handleTabChange('home')}>
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                 <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <span className="font-black tracking-tighter text-indigo-600 uppercase">PATRI-MV</span>
           </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setActiveTab('notifications')} className="relative p-2 text-slate-400 hover:text-indigo-600">
             <Bell className="w-5 h-5" />
             {unreadNotifications > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full animate-pulse" />}
          </button>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] lg:hidden animate-in fade-in duration-300" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      <aside className={cn(
        "fixed lg:sticky inset-y-0 left-0 flex flex-col bg-white border-r border-slate-100 transition-all duration-500 ease-in-out z-[70] h-screen top-0",
        isMobileMenuOpen ? "translate-x-0 w-80 px-8" : "-translate-x-full lg:translate-x-0",
        !isMobileMenuOpen && isSidebarCollapsed ? "lg:w-24 lg:px-4" : !isMobileMenuOpen ? "lg:w-80 lg:px-8" : ""
      )}>
        <div className="h-32 flex items-center justify-between">
          <div className={cn("flex items-center gap-3 transition-all duration-500 overflow-hidden", isSidebarCollapsed ? "w-0 opacity-0" : "w-auto opacity-100 pl-2")}>
             <div className="w-11 h-11 bg-indigo-600 rounded-xl flex items-center justify-center shadow-xl shadow-indigo-500/20 shrink-0">
                <ShieldCheck className="w-6 h-6 text-white" />
             </div>
             <div className="flex flex-col leading-none whitespace-nowrap">
                <span className="font-display font-extrabold text-2xl tracking-tighter text-slate-900">PATRI<span className="text-indigo-600">360</span></span>
             </div>
          </div>
          <button 
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className={cn("p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:text-indigo-600 transition-all border border-slate-100 shrink-0", isSidebarCollapsed ? "mx-auto" : "")}
          >
            {isSidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex flex-col gap-1.5 flex-1">
          <NavItem collapsed={isSidebarCollapsed} active={activeTab === 'home' && !selectedInspectionId} label="Dashboard" icon={LayoutGrid} onClick={() => handleTabChange('home')} />
          <NavItem collapsed={isSidebarCollapsed} active={activeTab === 'scanner'} label="Scanner QR" icon={Search} onClick={() => handleTabChange('scanner')} />
          <NavItem collapsed={isSidebarCollapsed} active={activeTab === 'notifications'} label="Alertas" icon={Bell} onClick={() => handleTabChange('notifications')} badge={isSidebarCollapsed ? (unreadNotifications ? '•' : 0) : unreadNotifications || 0} />
          
          {unsyncedCount > 0 && (
            <div className={cn("mt-2 px-6 py-3 bg-amber-50 rounded-2xl border flex items-center gap-3 animate-in fade-in", isSidebarCollapsed && "px-0 justify-center w-14 mx-auto")}>
              <Cloud className={cn("w-4 h-4 text-amber-600", syncing && "animate-bounce")} />
              {!isSidebarCollapsed && (
                <div className="flex flex-col leading-none">
                  <span className="text-[9px] font-black text-amber-900 uppercase">{unsyncedCount} PENDENTES</span>
                  <span className="text-[7px] font-bold text-amber-500 uppercase mt-0.5">Sincronizando...</span>
                </div>
              )}
            </div>
          )}

          <div className={cn("h-4 transition-all", isSidebarCollapsed ? "h-6" : "h-4")} />
          {!isSidebarCollapsed && <span className="text-[10px] font-bold text-slate-400 uppercase px-4 mb-2">Gestão Patrimonial</span>}
          <NavItem collapsed={isSidebarCollapsed} active={activeTab === 'inspections'} label="Dossiês" icon={ClipboardList} onClick={() => handleTabChange('inspections')} />
          <NavItem collapsed={isSidebarCollapsed} active={activeTab === 'locations'} label="Setores" icon={Building2} onClick={() => handleTabChange('locations')} />
          {isManager && <NavItem collapsed={isSidebarCollapsed} active={activeTab === 'reports'} label="Relatórios" icon={BarChart3} onClick={() => handleTabChange('reports')} />}
          {isAdmin && (
            <>
              {!isSidebarCollapsed && <div className="h-4" />}
              <NavItem collapsed={isSidebarCollapsed} active={activeTab === 'settings'} label="Configurações" icon={Settings} onClick={() => handleTabChange('settings')} />
            </>
          )}
        </nav>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className={cn("hidden lg:flex items-center justify-between px-10 py-7 bg-white/80 backdrop-blur-xl sticky top-0 z-30 transition-all", selectedInspectionId ? "pb-4" : "")}>
          <div className="flex items-center gap-5 min-w-0 flex-1">
            <h2 className="text-3xl font-black text-slate-900 tracking-tighter truncate">
              {activeTab === 'home' ? `Olá, ${user?.name.split(' ')[0]}` : activeTab.toUpperCase()}
            </h2>
          </div>
          
          <div className="flex items-center gap-6 shrink-0">
             <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-full">
                <div className={cn("w-2 h-2 rounded-full", syncing ? "bg-indigo-500 animate-pulse" : (isOnline ? "bg-emerald-500" : "bg-rose-500"))} />
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{syncing ? "Sincronizando..." : (isOnline ? "Conectado" : "Offline")}</span>
             </div>

             <button onClick={() => setActiveTab('notifications')} className="relative w-12 h-12 flex items-center justify-center bg-white border border-slate-200 rounded-2xl text-slate-400 hover:text-indigo-600 transition-all">
               <Bell className="w-6 h-6" />
               {unreadNotifications > 0 && (
                 <span className="absolute -top-2 -right-2 min-w-[20px] h-5 px-1 bg-rose-500 text-[10px] text-white flex items-center justify-center rounded-full border-2 border-white font-bold animate-pulse">
                   {unreadNotifications}
                 </span>
               )}
             </button>

             <button onClick={signOut} className="w-12 h-12 flex items-center justify-center bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 hover:bg-rose-500 hover:text-white transition-all">
               <LogOut className="w-5 h-5" />
             </button>
          </div>
        </header>

        <section className="px-6 lg:px-12 pb-24 lg:pb-12 pt-4 lg:pt-0 max-w-7xl">
          {renderContent()}
        </section>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 lg:hidden bg-white/90 backdrop-blur-xl border-t border-slate-200 flex items-center justify-around p-4 pb-6 z-50">
        <MobileNavItem active={activeTab === 'home' && !selectedInspectionId} icon={LayoutGrid} onClick={() => handleTabChange('home')} />
        <div className="relative -top-6">
           <motion.button 
             whileTap={{ scale: 0.9 }}
             onClick={() => handleTabChange('locations')}
             className={cn("w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl text-white transition-colors duration-300", activeTab === 'locations' ? "bg-indigo-700 ring-4 ring-indigo-500/20" : "bg-indigo-600")}
           >
             <Plus className={cn("w-6 h-6 transition-transform duration-300", activeTab === 'locations' && "rotate-45")} />
           </motion.button>
        </div>
        <MobileNavItem active={activeTab === 'notifications'} icon={Bell} onClick={() => handleTabChange('notifications')} />
      </nav>
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, onClick, variant = 'default' }: { label: string, value: number | string, icon: any, onClick: () => void, variant?: 'default' | 'accent' }) {
  return (
    <Card onClick={onClick} className={cn("group h-40 flex flex-col justify-between border-slate-100 px-6 py-6 cursor-pointer", variant === 'accent' ? "bg-slate-900 border-transparent" : "bg-white shadow-sm hover:shadow-xl")}>
      <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500", variant === 'accent' ? "bg-white/10" : "bg-slate-50 group-hover:bg-slate-900 text-slate-500 group-hover:text-white")}>
        <Icon className="w-6 h-6 transform group-hover:rotate-12 transition-transform" />
      </div>
      <div className="flex flex-col">
        <span className={cn("text-4xl font-display font-extrabold tracking-tight", variant === 'accent' ? "text-white" : "text-slate-900")}>{value}</span>
        <span className={cn("text-[10px] uppercase font-bold tracking-widest mt-2", variant === 'accent' ? "text-slate-400" : "text-slate-500")}>{label}</span>
      </div>
    </Card>
  );
}

function RecentInspectionRow({ inspection, locationName, onClick }: { inspection: Inspection, locationName: string, onClick: () => void }) {
  const isFinalized = inspection.status === 'finalizada';
  const isInProgress = inspection.status === 'em_andamento';
  
  const assetCount = useLiveQuery(async () => {
    const itens = await db.assets.where('inspectionId').equals(inspection.id).toArray();
    return itens.reduce((acc, curr) => acc + (Number(curr.quantity) || 1), 0);
  }, [inspection.id]);

  return (
    <Card onClick={onClick} className="flex items-center justify-between p-4 lg:p-6 group hover:border-slate-300 transition-all border-slate-100 cursor-pointer">
      <div className="flex items-center gap-6 min-w-0">
        <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border transition-all duration-500", isFinalized ? "bg-emerald-50 border-emerald-100 text-emerald-600" : isInProgress ? "bg-indigo-50 border-indigo-100 text-indigo-600" : "bg-slate-50 border-slate-100 text-slate-400")}>
          {isFinalized ? <CheckCircle2 className="w-7 h-7" /> : <ClipboardList className="w-7 h-7" />}
        </div>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-bold text-slate-900 truncate">{locationName}</h4>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-bold">
            <span className="uppercase text-slate-400">{formatDate(inspection.date).split(',')[0]}</span>
            <div className="w-1 h-1 rounded-full bg-slate-200"></div>
            <span className="text-slate-400">{assetCount || 0} itens</span>
          </div>
        </div>
      </div>
      <Button size="sm" variant={isInProgress ? "accent" : "secondary"} icon={isInProgress ? PlayCircle : Eye} onClick={onClick} className="hidden sm:flex h-11 px-8 uppercase tracking-widest">
        {isInProgress ? "Continuar" : "Ver"}
      </Button>
    </Card>
  );
}

function NavItem({ active, label, icon: Icon, onClick, badge, collapsed }: any) {
  return (
    <button onClick={onClick} title={collapsed ? label : undefined} className={cn("flex items-center gap-4 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all group relative overflow-hidden", collapsed ? "justify-center px-0 w-14 mx-auto" : "px-6 w-full", active ? "bg-slate-900 text-white shadow-2xl" : "text-slate-500 hover:bg-slate-50")}>
      <Icon className={cn("w-5 h-5 shrink-0 transition-transform duration-500", active ? "scale-110" : "group-hover:scale-110")} />
      {!collapsed && <span className="flex-1 text-left truncate">{label}</span>}
      {badge !== undefined && badge > 0 ? (
        <span className={cn("rounded-full text-[8px] font-black flex items-center justify-center border transition-all", collapsed ? "absolute top-2 right-2 w-2 h-2 p-0" : "px-2 py-0.5 min-w-[18px]", active ? "bg-indigo-500 border-indigo-400 text-white" : "bg-indigo-100 border-indigo-200 text-indigo-700")}>
          {!collapsed && badge}
        </span>
      ) : null}
    </button>
  );
}

function MobileNavItem({ active, icon: Icon, onClick }: any) {
  return (
    <button onClick={onClick} className={cn("relative p-3 rounded-2xl flex flex-col items-center justify-center transition-all outline-none", active ? "text-indigo-600 scale-110" : "text-slate-400")}>
      <Icon className={cn("w-6 h-6 transition-all duration-300", active ? "stroke-[2.5px]" : "stroke-2")} />
    </button>
  );
}