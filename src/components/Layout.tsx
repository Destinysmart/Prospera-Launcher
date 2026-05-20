import React from 'react';
import { Bitcoin, FileText, LayoutDashboard, Webhook, Menu, X, User as UserIcon, Settings } from 'lucide-react';
import { User } from 'firebase/auth';

interface LayoutProps {
  children: React.ReactNode;
  currentView: string;
  setView: (view: any) => void;
  user: User | null;
}

export function Layout({ children, currentView, setView, user }: LayoutProps) {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'residency', label: 'e-Residency', icon: Bitcoin },
    { id: 'llc', label: 'LLC Formation', icon: FileText },
    { id: 'invoices', label: 'Invoices', icon: FileText },
    { id: 'webhooks', label: 'Agent Webhooks', icon: Webhook },
  ];

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-[#141414]">
        <div className="flex items-center gap-2">
          <Bitcoin size={24} className="text-[#141414]" />
          <span className="font-bold uppercase tracking-tight">Próspera Launcher</span>
        </div>
        <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2">
          {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={`
        fixed md:relative z-40 w-64 min-h-screen bg-[#E4E3E0] border-r border-[#141414] transition-transform duration-300 ease-in-out
        ${isMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="p-8 hidden md:block">
          <div className="flex items-center gap-3 mb-1">
            <Bitcoin size={32} className="text-[#141414]" />
            <h1 className="font-bold text-xl uppercase tracking-tighter leading-none">
              Próspera<br />Launcher
            </h1>
          </div>
          <div className="text-[10px] font-mono opacity-50 uppercase tracking-widest mt-2">
            Bitcoin-Native ZEDE v1.0
          </div>
        </div>

        <nav className="mt-4 md:mt-0 p-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { setView(item.id); setIsMenuOpen(false); }}
                className={`
                  w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-all
                  ${isActive 
                    ? 'bg-[#141414] text-[#E4E3E0]' 
                    : 'hover:bg-[#141414]/10 text-[#141414]'}
                `}
              >
                <Icon size={18} />
                <span className="uppercase tracking-wide">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="absolute bottom-0 w-full p-8 border-t border-[#141414]/20 bg-[#E4E3E0]">
          {user && (
            <button 
              onClick={() => { setView('settings'); setIsMenuOpen(false); }}
              className="w-full flex items-center justify-between mb-4 p-3 bg-white border border-[#141414] hover:bg-[#141414]/5 transition-colors text-left"
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="p-1.5 bg-[#141414] text-white shrink-0">
                  <UserIcon size={12} />
                </div>
                <div className="overflow-hidden">
                  <div className="text-[10px] font-bold uppercase truncate">{user.displayName || 'Sovereign Agent'}</div>
                  <div className="text-[8px] font-mono opacity-50 truncate uppercase">{localStorage.getItem('residentId') || user.uid.slice(0, 8) + '...'}</div>
                </div>
              </div>
              <Settings size={14} className="opacity-50 shrink-0" />
            </button>
          )}
          <div className="text-[9px] font-mono uppercase opacity-40">
            System Status: Connected<br />
            API Region: HN-ZEDE
          </div>
        </div>
      </aside>

      {/* Bottom Mobile Navigation */}
      {user && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#E4E3E0] border-t border-[#141414] flex items-center justify-around pb-safe">
            {navItems.slice(0, 4).map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setView(item.id)}
                  className={`flex flex-col items-center justify-center p-3 w-full ${isActive ? 'text-[#141414]' : 'text-[#141414]/40'} transition-colors`}
                >
                  <Icon size={20} className="mb-1" />
                  <span className="text-[9px] uppercase tracking-wider font-bold">{item.label}</span>
                </button>
              );
            })}
            <button
               onClick={() => setView('settings')}
               className={`flex flex-col items-center justify-center p-3 w-full ${currentView === 'settings' ? 'text-[#141414]' : 'text-[#141414]/40'} transition-colors`}
            >
              <Settings size={20} className="mb-1" />
              <span className="text-[9px] uppercase tracking-wider font-bold">Settings</span>
            </button>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-[#F0EFEC] pb-24 md:pb-0">
        {children}
      </main>
    </div>
  );
}
