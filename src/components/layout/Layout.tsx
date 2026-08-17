import React from 'react';
import { Navbar } from './Navbar';
import { Home, Search, Library, PlusCircle, User } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { cn } from '../../lib/utils';

export function Layout({ children }: { children: React.ReactNode }) {
  const { currentPage, navigate, t } = useApp();
  const isReadingDashboard = currentPage === 'shelf';

  const navItems = [
    { id: 'home', icon: Home, label: t('nav', 'home') },
    { id: 'search', icon: Search, label: t('nav', 'searchPlaceholder').split('...')[0] },
    { id: 'gen', icon: PlusCircle, label: t('nav', 'generate') },
    { id: 'shelf', icon: Library, label: t('nav', 'shelf') },
    { id: 'profile', icon: User, label: t('nav', 'login') },
  ];

  return (
    <div className="warm-theme min-h-screen bg-[#e8dfd1] font-sans text-[#35261d] flex flex-col selection:bg-[#c75b2d]/20">
      {!isReadingDashboard && <Navbar />}
      <main className={cn("flex-1", !isReadingDashboard && "pb-24 sm:pb-8")}>
        {children}
      </main>
      
      {/* Mobile Bottom Tab Bar */}
      {!isReadingDashboard && <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#d8c8b2] bg-[#f7f0e4]/92 backdrop-blur-md pb-safe sm:hidden">
        <div className="flex h-16 items-center justify-around px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id || (currentPage === 'map' && item.id === 'home');
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.id as any)}
                className={cn(
                  "flex flex-col items-center justify-center w-full h-full gap-1 transition-colors",
                  isActive ? "text-[#b84d29]" : "text-[#796a5d] hover:text-[#35261d]"
                )}
              >
                <Icon className={cn("h-5 w-5", isActive && "fill-[#c75b2d]/15")} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>}

      {!isReadingDashboard && <footer className="hidden sm:block border-t border-[#d8c8b2] bg-[#f2e9dc] py-8 mt-auto">
        <div className="container mx-auto max-w-7xl px-4 text-center text-sm text-[#887565]">
          &copy; {new Date().getFullYear()} LazyMap Agent. All rights reserved.
        </div>
      </footer>}
    </div>
  );
}
