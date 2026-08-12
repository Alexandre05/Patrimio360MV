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
  Cloud,
  TrendingUp,
  Activity,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
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
            await db.inspections.put({ ...data, id: inspSnap.id } as any);
            handleScannerOpen(inspSnap.id, data.locationId);
            return;
         }

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
  
  // 🚀 NOVA QUERY INTELIGENTE: Puxa o total e a saúde do acervo de uma vez só
  const assetsStats = useLiveQuery(async () => {
    const ativos = await db.assets.filter(a => !a.deleted && !a.isTrashed).toArray();
    let bom = 0, regular = 0, ruim = 0, inservivel = 0, total = 0;
    
    ativos.forEach(a => {
      const q = Number(a.quantity) || 1;
      total += q;
      if (a.condition === 'bom' || a.condition === 'novo') bom += q;
      else if (a.condition === 'regular') regular += q;
      else if (a.condition === 'ruim') ruim += q;
      else if (a.condition === 'inservivel') inservivel += q;
    });
    
    return { total, bom, regular, ruim, inservivel };
  }, []) || { total: 0, bom: 0, regular: 0, ruim: 0, inservivel: 0 };

  const pendingHomologation = useLiveQuery(() => db.inspections.where('status').equals('concluida').toArray());

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

  // ==========================================================================
  // LÓGICA DE ADMINISTRAÇÃO MANTIDA INTACTA
  // ==========================================================================
  const roleStr = String(user?.role || '').toLowerCase();
  const cargoStr = String(user?.cargo || '').toLowerCase();

  const isAdmin = roleStr.includes('admin') || 
                  cargoStr.includes('admin') || 
                  roleStr === 'prefeito' || 
                  user?.email === 'henri199@gmail.com' || 
                  auth.currentUser?.email === 'henri199@gmail.com';

  const isManager = isAdmin || roleStr.includes('responsavel') || cargoStr.includes('responsavel');
  // ==========================================================================

  const [quotaExceeded, setQuotaExceeded] = useState(false);

  useEffect(() => {
    if (user) {
      setupSync();
      
      const syncAndNotify = async () => {
        setSyncing(true);
        try {
          await pushLocalChanges();
          await processSyncQueue();
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
    if (selectedInspectionId) {
       return <InspectionView id={selectedInspectionId} onBack={() => {
         setSelectedInspectionId(null);
         window.history.replaceState({}, '', '/');
       }} />;
    }

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
          <div className="flex flex-col gap-6">
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
          <div className="flex flex-col gap-8 max-w-4xl">
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
        
        // CÁLCULOS PERCENTUAIS PARA O GRÁFICO
        const percBom = assetsStats.total > 0 ? Math.round((assetsStats.bom / assetsStats.total) * 100) : 0;
        const percRegular = assetsStats.total > 0 ? Math.round((assetsStats.regular / assetsStats.total) * 100) : 0;
        const percRuim = assetsStats.total > 0 ? Math.round((assetsStats.ruim / assetsStats.total) * 100) : 0;
        const percInservivel = assetsStats.total > 0 ? Math.round((assetsStats.inservivel / assetsStats.total) * 100) : 0;

        return (
          <div className="flex flex-col gap-8">
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

            {/* 🚀 TOPO: HEADER EXECUTIVO COM AÇÕES RÁPIDAS */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 px-2">
              <div className="flex flex-col gap-2">
                <h2 className="text-3xl lg:text-4xl font-display font-extrabold tracking-tight text-slate-900">
                  Visão Geral <span className="text-indigo-600">Patrimonial</span>
                </h2>
                <p className="text-slate-500 font-medium text-sm">Resumo da auditoria pública de Manoel Viana.</p>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="outline" icon={Search} onClick={() => setActiveTab('scanner')} className="h-12 px-6 text-[10px] uppercase tracking-widest bg-white rounded-xl shadow-sm border-slate-200">
                  Escanear QR
                </Button>
                <Button variant="accent" icon={Plus} onClick={() => setActiveTab('locations')} className="h-12 px-6 text-[10px] uppercase tracking-widest rounded-xl shadow-lg shadow-indigo-600/20">
                  Nova Vistoria
                </Button>
              </div>
            </div>

            {/* 🚀 MÉTRICAS VITAIS PARA A GESTÃO */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <SummaryCard label="Total Patrimônios" value={assetsStats.total} icon={Database} onClick={() => setActiveTab('reports')} variant="accent" />
              <SummaryCard label="Setores em Auditoria" value={activeInspectionsCount || 0} icon={Building2} onClick={() => setActiveTab('locations')} />
              <SummaryCard label="Itens Inservíveis" value={assetsStats.inservivel} icon={AlertTriangle} onClick={() => setActiveTab('reports')} customColor="text-rose-500" />
              <SummaryCard label="Dossiês Concluídos" value={concludedInspectionsCount || 0} icon={CheckCircle2} onClick={() => setActiveTab('inspections')} />
            </div>

            {/* 🚀 SEÇÃO MEIO: GRÁFICOS E ATIVIDADE RECENTE */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* PAINEL DE SAÚDE DO ACERVO */}
              <Card className="lg:col-span-1 flex flex-col gap-6 p-8 rounded-[2rem] bg-white border-slate-100/60 shadow-sm hover:shadow-lg transition-all duration-500">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <Activity className="w-5 h-5" />
                  </div>
                  <div className="flex flex-col">
                    <h3 className="font-extrabold text-slate-900 tracking-tight">Saúde do Acervo</h3>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Indicadores de Conservação</span>
                  </div>
                </div>

                <div className="flex flex-col gap-5 mt-2">
                  <ProgressRow label="Bons / Novos" value={assetsStats.bom} percentage={percBom} color="bg-emerald-500" />
                  <ProgressRow label="Regulares" value={assetsStats.regular} percentage={percRegular} color="bg-amber-500" />
                  <ProgressRow label="Críticos / Ruins" value={assetsStats.ruim} percentage={percRuim} color="bg-rose-400" />
                  <ProgressRow label="Inservíveis (Descarte)" value={assetsStats.inservivel} percentage={percInservivel} color="bg-rose-600" />
                </div>
              </Card>

              {/* LISTA DE VISTORIAS RECENTES */}
              <div className="lg:col-span-2 flex flex-col gap-4">
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-slate-400" />
                    <h3 className="font-extrabold text-slate-900 tracking-tight">Atividade Recente</h3>
                  </div>
                  <button onClick={() => setActiveTab('inspections')} className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:text-indigo-800 transition-colors">
                    Ver Todas &rarr;
                  </button>
                </div>
                
                <div className="flex flex-col gap-3">
                  {inspections?.length === 0 ? (
                    <Card className="flex items-center justify-center py-16 text-slate-400 border-dashed border-2 bg-slate-50 rounded-[2rem]">
                      <div className="text-center">
                        <ClipboardList className="w-12 h-12 mx-auto opacity-20 mb-3" />
                        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Nenhuma vistoria iniciada</p>
                      </div>
                    </Card>
                  ) : (
                    inspections?.slice(0, 4).map(insp => (
                      <RecentInspectionRow 
                        key={insp.id} 
                        inspection={insp} 
                        locationName={locations?.find(l => l.id === insp.locationId)?.name || 'Localização Desconhecida'} 
                        onClick={() => setSelectedInspectionId(insp.id)}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex h-screen bg-[#F8FAFC] overflow-hidden">
      
      {/* HEADER MOBILE (Apenas telas pequenas) */}
      <div className="lg:hidden flex items-center justify-between p-4 bg-white border-b border-slate-200 fixed top-0 left-0 right-0 z-50">
        <div className="flex items-center gap-3">
           <button onClick={() => setIsMobileMenuOpen(true)} className="w-10 h-10 flex items-center justify-center bg-slate-50 text-slate-400 rounded-xl border border-slate-100">
              <LayoutGrid className="w-5 h-5" />
           </button>
           <div className="flex items-center gap-2" onClick={() => setActiveTab('home')}>
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

      {/* OVERLAY MOBILE */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] lg:hidden animate-in fade-in duration-300" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      {/* SIDEBAR MODERNA (Desktop & Mobile) */}
      <aside className={cn(
        "fixed lg:relative inset-y-0 left-0 bg-white border-r border-slate-200/60 flex flex-col z-[70] transition-all duration-500 ease-in-out shadow-[4px_0_24px_rgba(0,0,0,0.02)]",
        isMobileMenuOpen ? "translate-x-0 w-80" : "-translate-x-full lg:translate-x-0",
        !isMobileMenuOpen && isSidebarCollapsed ? "lg:w-[88px]" : !isMobileMenuOpen ? "lg:w-[280px]" : ""
      )}>
        {/* Topo da Sidebar (Logo) */}
        <div className="h-24 flex items-center justify-between px-6 border-b border-slate-100/50">
          <div className={cn("flex items-center gap-3 transition-all duration-500 overflow-hidden", isSidebarCollapsed ? "w-0 opacity-0" : "w-auto opacity-100")}>
             <div className="w-10 h-10 bg-indigo-600 rounded-[14px] flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0">
                <ShieldCheck className="w-6 h-6 text-white" />
             </div>
             <div className="flex flex-col leading-none whitespace-nowrap">
                <span className="font-black text-2xl tracking-tighter text-slate-900">PATRI<span className="text-indigo-600">360</span></span>
             </div>
          </div>
          <button 
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className={cn("p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all shrink-0", isSidebarCollapsed ? "mx-auto" : "")}
          >
            {isSidebarCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
        </div>

        {/* Links do Menu */}
        <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-1.5 custom-scrollbar">
          <NavItem collapsed={isSidebarCollapsed} active={activeTab === 'home' && !selectedInspectionId} label="Dashboard" icon={LayoutGrid} onClick={() => handleTabChange('home')} />
          <NavItem collapsed={isSidebarCollapsed} active={activeTab === 'scanner'} label="Scanner QR" icon={Search} onClick={() => handleTabChange('scanner')} />
          <NavItem collapsed={isSidebarCollapsed} active={activeTab === 'notifications'} label="Alertas" icon={Bell} onClick={() => handleTabChange('notifications')} badge={isSidebarCollapsed ? (unreadNotifications ? '•' : 0) : unreadNotifications || 0} />
          
          {unsyncedCount > 0 && (
            <div className={cn("mt-2 py-3 bg-amber-50 rounded-2xl border border-amber-100/50 flex items-center gap-3 animate-in fade-in transition-all", isSidebarCollapsed ? "px-0 justify-center w-12 mx-auto" : "px-5")}>
              <Cloud className={cn("w-[22px] h-[22px] text-amber-500 shrink-0", syncing && "animate-bounce")} />
              {!isSidebarCollapsed && (
                <div className="flex flex-col leading-none truncate">
                  <span className="text-[10px] font-black text-amber-900 uppercase">{unsyncedCount} PENDENTES</span>
                  <span className="text-[8px] font-bold text-amber-500 uppercase mt-0.5">Sincronizando...</span>
                </div>
              )}
            </div>
          )}

          <div className="h-4" />
          {!isSidebarCollapsed && <span className="text-[10px] font-extrabold text-slate-400 uppercase px-4 mb-2 tracking-widest block">Gestão Patrimonial</span>}
          
          <NavItem collapsed={isSidebarCollapsed} active={activeTab === 'inspections'} label="Dossiês" icon={ClipboardList} onClick={() => handleTabChange('inspections')} />
          <NavItem collapsed={isSidebarCollapsed} active={activeTab === 'locations'} label="Setores" icon={Building2} onClick={() => handleTabChange('locations')} />
          
          {isAdmin && (
            <>
              <div className="h-6" />
              {!isSidebarCollapsed && <span className="text-[10px] font-extrabold text-slate-400 uppercase px-4 mb-2 tracking-widest block">Administração</span>}
              <NavItem collapsed={isSidebarCollapsed} active={activeTab === 'users'} label="Agentes" icon={Users} onClick={() => handleTabChange('users')} />
              <NavItem collapsed={isSidebarCollapsed} active={activeTab === 'reports'} label="Relatórios" icon={BarChart3} onClick={() => handleTabChange('reports')} />
              <NavItem collapsed={isSidebarCollapsed} active={activeTab === 'settings'} label="Configurações" icon={Settings} onClick={() => handleTabChange('settings')} />
            </>
          )}
        </nav>
      </aside>

      {/* ÁREA PRINCIPAL (Main) */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        
        {/* CABEÇALHO FLUTUANTE (Desktop apenas) */}
        <header className={cn(
          "hidden lg:flex absolute top-6 left-8 right-8 z-30 bg-white/70 backdrop-blur-md border border-white/40 shadow-sm rounded-2xl px-6 py-4 justify-between items-center transition-all duration-300",
          selectedInspectionId ? "opacity-0 pointer-events-none translate-y-[-20px]" : "opacity-100 translate-y-0"
        )}>
          <div className="flex items-center gap-5 min-w-0 flex-1">
             <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full border", isOnline ? "bg-emerald-50/50 border-emerald-100/50" : "bg-rose-50/50 border-rose-100/50")}>
                <div className={cn("w-2 h-2 rounded-full", isOnline ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" : "bg-rose-500")} />
                <span className={cn("text-[10px] font-bold uppercase tracking-widest", isOnline ? "text-emerald-700" : "text-rose-700")}>
                  {isOnline ? 'Sistema Online' : 'Modo Offline'}
                </span>
             </div>
             {syncing && <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest animate-pulse">Sincronizando dados...</span>}
          </div>
          
          <div className="flex items-center gap-4 shrink-0">
             <button onClick={() => setActiveTab('notifications')} className="relative p-2.5 bg-white border border-slate-200/50 rounded-xl hover:bg-slate-50 transition-all text-slate-400 hover:text-indigo-600 shadow-sm">
               <Bell className="w-5 h-5" />
               {unreadNotifications > 0 && (
                 <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 bg-rose-500 text-white text-[10px] font-black rounded-full border-2 border-white flex items-center justify-center shadow-sm">
                   {unreadNotifications}
                 </span>
               )}
             </button>
             
             {/* Perfil Simplificado */}
             <div className="flex items-center gap-3 pl-4 border-l border-slate-200/50">
                <div className="flex flex-col text-right">
                   <span className="text-sm font-bold text-slate-900 leading-tight">{user?.name.split(' ')[0]}</span>
                   <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{user?.cargo || 'Membro'}</span>
                </div>
                <button onClick={signOut} title="Sair do sistema" className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100/50 flex items-center justify-center text-rose-500 hover:bg-rose-500 hover:text-white transition-colors">
                  <LogOut className="w-4 h-4" />
                </button>
             </div>
          </div>
        </header>

        {/* ÁREA COM SCROLL E ANIMAÇÃO */}
        <div className="flex-1 overflow-y-auto px-6 lg:px-12 pt-24 lg:pt-32 pb-24 lg:pb-12 custom-scrollbar relative">
          <div className="max-w-7xl mx-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedInspectionId ? `insp-${selectedInspectionId}` : activeTab}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                {renderContent()}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

      </main>

      {/* MENU INFERIOR MOBILE */}
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

// ==========================================
// COMPONENTES MENORES (UI ATUALIZADA)
// ==========================================

function ProgressRow({ label, value, percentage, color }: { label: string, value: number, percentage: number, color: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-end">
        <span className="text-xs font-bold text-slate-700">{label}</span>
        <div className="flex items-baseline gap-1">
          <span className="text-sm font-black text-slate-900 leading-none">{value}</span>
          <span className="text-[10px] font-bold text-slate-400">({percentage}%)</span>
        </div>
      </div>
      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-1000", color)} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, onClick, variant = 'default', customColor }: { label: string, value: number | string, icon: any, onClick: () => void, variant?: 'default' | 'accent', customColor?: string }) {
  return (
    <Card onClick={onClick} className={cn("group h-40 flex flex-col justify-between border-slate-100/60 px-6 py-6 cursor-pointer rounded-[2rem]", variant === 'accent' ? "bg-slate-900 border-transparent shadow-xl shadow-slate-900/10" : "bg-white shadow-sm hover:shadow-xl hover:shadow-indigo-500/5")}>
      <div className={cn("w-12 h-12 rounded-[1rem] flex items-center justify-center transition-all duration-500", variant === 'accent' ? "bg-white/10" : "bg-indigo-50/50 group-hover:bg-indigo-600 text-indigo-500 group-hover:text-white", customColor && `text-${customColor.split('-')[1]}-500 bg-${customColor.split('-')[1]}-50 group-hover:bg-${customColor.split('-')[1]}-500`)}>
        <Icon className={cn("w-6 h-6 transform group-hover:rotate-12 transition-transform", customColor && customColor)} />
      </div>
      <div className="flex flex-col">
        <span className={cn("text-4xl font-display font-extrabold tracking-tight", variant === 'accent' ? "text-white" : "text-slate-900", customColor && customColor)}>{value}</span>
        <span className={cn("text-[10px] uppercase font-bold tracking-widest mt-2", variant === 'accent' ? "text-slate-400" : "text-slate-400")}>{label}</span>
      </div>
    </Card>
  );
}

function RecentInspectionRow({ inspection, locationName, onClick }: { inspection: Inspection, locationName: string, onClick: () => void }) {
  const isFinalized = inspection.status === 'finalizada';
  const isInProgress = inspection.status === 'em_andamento';
  
  const assetCount = useLiveQuery(async () => {
    const itens = await db.assets.where('inspectionId').equals(inspection.id).filter(a => !a.deleted && !a.isTrashed).toArray();
    return itens.reduce((acc, curr) => acc + (Number(curr.quantity) || 1), 0);
  }, [inspection.id]);

  return (
    <Card onClick={onClick} className="flex items-center justify-between p-4 lg:p-6 group hover:border-indigo-100 transition-all border-slate-100/60 shadow-sm hover:shadow-md cursor-pointer rounded-[1.5rem] bg-white">
      <div className="flex items-center gap-5 min-w-0">
        <div className={cn("w-14 h-14 rounded-[1rem] flex items-center justify-center shrink-0 transition-all duration-500", isFinalized ? "bg-emerald-50 text-emerald-600" : isInProgress ? "bg-indigo-50 text-indigo-600" : "bg-slate-50 text-slate-400")}>
          {isFinalized ? <CheckCircle2 className="w-7 h-7" /> : <ClipboardList className="w-7 h-7" />}
        </div>
        <div className="flex flex-col min-w-0">
          <h4 className="text-sm font-bold text-slate-800 truncate mb-1">{locationName}</h4>
          <div className="flex items-center gap-3 text-[10px] font-bold">
            <span className="uppercase text-slate-400">{formatDate(inspection.date).split(',')[0]}</span>
            <div className="w-1 h-1 rounded-full bg-slate-300"></div>
            <span className="text-slate-500">{assetCount || 0} itens</span>
          </div>
        </div>
      </div>
      <Button size="sm" variant={isInProgress ? "accent" : "secondary"} icon={isInProgress ? PlayCircle : Eye} onClick={onClick} className="hidden sm:flex h-11 px-6 uppercase tracking-widest text-[10px] rounded-xl">
        {isInProgress ? "Continuar" : "Ver"}
      </Button>
    </Card>
  );
}

function NavItem({ active, label, icon: Icon, onClick, badge, collapsed }: any) {
  return (
    <button onClick={onClick} title={collapsed ? label : undefined} className={cn(
      "relative flex items-center gap-3 py-3.5 rounded-2xl font-bold text-[12px] tracking-wide transition-all duration-300 group overflow-hidden outline-none",
      collapsed ? "justify-center px-0 w-12 mx-auto" : "px-4 w-full",
      active ? "bg-indigo-50/80 text-indigo-800" : "text-slate-500 hover:bg-slate-100/50 hover:text-slate-800"
    )}>
      {/* Indicador Lateral Azul */}
      <div className={cn("absolute left-0 top-3 bottom-3 w-1 rounded-r-full transition-all duration-300", active ? "bg-indigo-600" : "bg-transparent group-hover:bg-slate-300")} />
      
      <Icon className={cn("w-[22px] h-[22px] shrink-0 transition-transform duration-300", active ? "scale-110 text-indigo-600" : "group-hover:text-slate-600")} />
      
      {!collapsed && <span className="flex-1 text-left truncate">{label}</span>}
      
      {badge !== undefined && badge > 0 ? (
        <span className={cn("rounded-full text-[9px] font-black flex items-center justify-center transition-all", collapsed ? "absolute top-1 right-1 w-2 h-2 p-0" : "px-2 py-0.5 min-w-[20px]", active ? "bg-indigo-600 text-white shadow-sm" : "bg-rose-500 text-white shadow-sm")}>
          {!collapsed && badge}
        </span>
      ) : null}
    </button>
  );
}

function MobileNavItem({ active, icon: Icon, onClick }: any) {
  return (
    <button onClick={onClick} className={cn("relative p-3 rounded-2xl flex flex-col items-center justify-center transition-all outline-none", active ? "text-indigo-600 scale-110" : "text-slate-400 hover:text-slate-600")}>
      <Icon className={cn("w-[26px] h-[26px] transition-all duration-300", active ? "stroke-[2.5px]" : "stroke-2")} />
    </button>
  );
}