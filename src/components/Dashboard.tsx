import { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useOnlineStatus } from '../lib/hooks';
import { Card, Button, Input } from './UI';
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
  ShieldCheck
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

export function Dashboard() {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<'home' | 'inspections' | 'locations' | 'reports' | 'users' | 'settings' | 'notifications'>('home');
  const [selectedInspectionId, setSelectedInspectionId] = useState<string | null>(null);
  const isOnline = useOnlineStatus();

  const inspections = useLiveQuery(() => db.inspections.orderBy('date').reverse().limit(10).toArray());
  const locations = useLiveQuery(() => db.locations.toArray());
  const activeInspectionsCount = useLiveQuery(() => db.inspections.where('status').equals('em_andamento').count());
  const concludedInspectionsCount = useLiveQuery(() => db.inspections.where('status').anyOf('concluida', 'finalizada').count());
  const totalAssetsCount = useLiveQuery(() => db.assets.count());
  const unreadNotifications = useLiveQuery(() => user ? db.notifications.where('targetUserId').equals(user.userId).and(n => !n.read).count() : 0, [user]);
  const unsyncedCount = useLiveQuery(() => db.assets.where('needsSync').equals(1).count()) || 0;

  useEffect(() => {
    if (user) {
      checkAndGenerateNotifications(user.userId).catch(err => {
        console.error("Erro ao gerar notificações:", err);
      });
    }
  }, [user]);

  if (selectedInspectionId) {
    return <InspectionView id={selectedInspectionId} onBack={() => setSelectedInspectionId(null)} />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return (
          <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
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

            {/* ⚡ 3. Ações Rápidas */}
            <div className="flex flex-col gap-4">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Ações Rápidas</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <QuickActionButton icon={Plus} label="Nova Vistoria" onClick={() => setActiveTab('locations')} primary />
                <QuickActionButton icon={Search} label="Ver Vistorias" onClick={() => setActiveTab('inspections')} />
                <QuickActionButton icon={Building2} label="Localizações" onClick={() => setActiveTab('locations')} />
                <QuickActionButton icon={BarChart3} label="Relatórios" onClick={() => setActiveTab('reports')} />
              </div>
            </div>

            {/* 📋 4. Lista de Vistorias Recentes */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between ml-1">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Últimas Vistorias</h3>
                <button onClick={() => setActiveTab('inspections')} className="text-[10px] font-black text-slate-900 border-b-2 border-slate-900 pb-0.5 hover:opacity-70 transition-opacity">VER TODAS</button>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {inspections?.length === 0 ? (
                  <Card className="flex items-center justify-center py-16 text-slate-400 border-dashed border-2">
                    <div className="text-center">
                      <ClipboardList className="w-10 h-10 mx-auto opacity-10 mb-2" />
                      <p className="text-sm font-medium">Nenhuma vistoria registrada</p>
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
              <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-center gap-3 animate-pulse text-red-700">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <div className="flex flex-col">
                  <span className="text-sm font-bold">Modo Offline Ativado</span>
                  <span className="text-xs opacity-80">Você está offline. {unsyncedCount > 0 ? `${unsyncedCount} itens aguardando conexão.` : 'Os dados serão sincronizados automaticamente ao retornar.'}</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {unsyncedCount > 0 ? `Sincronizando ${unsyncedCount} itens...` : 'Sincronizado com o servidor central'}
                  </span>
                </div>
                {unsyncedCount > 0 && (
                  <div className="w-48 h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-400 animate-progress origin-left"></div>
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
        return <ReportsView />;
      case 'users':
        return <UsersView />;
      case 'notifications':
        return <NotificationsView onBack={() => setActiveTab('home')} />;
      default:
        return <div className="flex items-center justify-center py-20 text-slate-400 font-medium italic">Selecione uma opção no menu.</div>;
    }
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-bg">
      {/* 📱 Mobile Header */}
      <div className="lg:hidden flex items-center justify-between p-4 bg-white border-b border-slate-100 sticky top-0 z-50">
        <div className="flex items-center gap-2">
           <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-white" />
           </div>
           <span className="font-black tracking-tighter text-slate-900 uppercase">PATRI-MV</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-50 rounded-full">
            <div className={cn("w-2 h-2 rounded-full animate-pulse", isOnline ? "bg-emerald-500" : "bg-rose-500")} />
            <span className="text-[10px] font-black text-slate-400">{isOnline ? "ON" : "OFF"}</span>
          </div>
          <button onClick={() => setActiveTab('notifications')} className="relative p-2 text-slate-400">
            <Bell className="w-6 h-6" />
            {unreadNotifications > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full border-2 border-white" />
            )}
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
          <NavItem active={activeTab === 'home'} label="Início" icon={LayoutGrid} onClick={() => setActiveTab('home')} />
          <NavItem active={activeTab === 'notifications'} label="Notificações" icon={Bell} onClick={() => setActiveTab('notifications')} badge={unreadNotifications || 0} />
          <NavItem active={activeTab === 'inspections'} label="Vistorias" icon={ClipboardList} onClick={() => setActiveTab('inspections')} />
          <NavItem active={activeTab === 'locations'} label="Localizações" icon={Building2} onClick={() => setActiveTab('locations')} />
          <NavItem active={activeTab === 'reports'} label="Relatórios" icon={BarChart3} onClick={() => setActiveTab('reports')} />
          {user?.role === 'prefeito' && (
            <NavItem active={activeTab === 'users'} label="Membros" icon={Users} onClick={() => setActiveTab('users')} />
          )}
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
        {/* Desktop Header */}
        <header className="hidden lg:flex items-center justify-between px-12 py-8 bg-bg/80 backdrop-blur-sm sticky top-0 z-30">
          <div className="flex flex-col">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              {activeTab === 'home' ? `Olá, ${user?.name.split(' ')[0]}` : activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
            </h2>
            <p className="text-slate-400 text-sm font-medium">Benvindo ao painel de gestão patrimonial.</p>
          </div>
          
          <div className="flex items-center gap-6">
             <div className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-100 rounded-full shadow-sm">
                <div className={cn("w-2 h-2 rounded-full", isOnline ? "bg-emerald-500 shadow-[0_0_8px_#10b981]" : "bg-rose-500")} />
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">{isOnline ? "Sistema Online" : "Modo Offline"}</span>
             </div>

             <button onClick={() => setActiveTab('notifications')} className="relative p-2 text-slate-400 hover:text-slate-900 transition-colors">
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
        <MobileNavItem active={activeTab === 'home'} icon={LayoutGrid} onClick={() => setActiveTab('home')} />
        <MobileNavItem active={activeTab === 'inspections'} icon={ClipboardList} onClick={() => setActiveTab('inspections')} />
        <div className="relative -top-6">
           <button 
             onClick={() => setActiveTab('locations')}
             className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center shadow-xl shadow-slate-900/30 text-white"
           >
             <Plus className="w-6 h-6" />
           </button>
        </div>
        <MobileNavItem active={activeTab === 'reports'} icon={BarChart3} onClick={() => setActiveTab('reports')} />
        <MobileNavItem active={activeTab === 'notifications'} icon={Bell} onClick={() => setActiveTab('notifications')} />
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
