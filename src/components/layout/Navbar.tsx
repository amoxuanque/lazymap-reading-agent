import React from 'react';
import { Search, Library, User, PlusCircle } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { Button } from '../ui/Button';

export function Navbar() {
  const { navigate, t, account } = useApp();
  const accountLabel = account?.name || '演示账户';

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#d8c8b2] bg-[#f7f0e4]/88 backdrop-blur-md">
      <div className="container mx-auto flex h-14 sm:h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div 
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => navigate('home')}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#c75b2d] text-[#fffaf2] font-bold">
            LM
          </div>
          <span className="text-xl font-bold tracking-tight text-[#35261d]">
            LazyMap
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('search')} className="hidden sm:flex text-[#796a5d] hover:text-[#35261d] hover:bg-[#eadfcd]">
            <Search className="mr-2 h-4 w-4" />
            {t('nav', 'searchPlaceholder').split('...')[0]}
          </Button>
          
          <Button variant="ghost" size="sm" onClick={() => navigate('shelf')} className="hidden sm:flex text-[#796a5d] hover:text-[#35261d] hover:bg-[#eadfcd]">
            <Library className="mr-2 h-4 w-4" />
            {t('nav', 'shelf')}
          </Button>

          <Button variant="outline" size="sm" className="hidden sm:flex border-[#cdbba3] text-[#4b382c] hover:bg-[#eadfcd] hover:text-[#35261d]" onClick={() => navigate('gen')}>
            <PlusCircle className="mr-2 h-4 w-4" />
            {t('nav', 'generate')}
          </Button>

          {account && (
            <button
              key={`${account.id}-${accountLabel}`}
              onClick={() => navigate('profile')}
              className="hidden items-center gap-3 rounded-full border border-[#d8c8b2] bg-[#fffaf2]/75 px-3 py-1.5 text-left sm:flex"
            >
              <div className="text-right">
                <div className="text-[11px] text-[#887565]">我的账户</div>
                <div className="text-sm font-medium text-[#35261d]">{accountLabel}</div>
              </div>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ead3ad] text-[#9a542f]">
                <User className="h-4 w-4" />
              </span>
            </button>
          )}

          {!account && (
            <Button variant="ghost" size="sm" className="hidden sm:flex px-2 text-[#796a5d] hover:text-[#35261d] hover:bg-[#eadfcd]" onClick={() => navigate('profile')}>
              <User className="h-4 w-4" />
            </Button>
          )}

          <Button variant="ghost" size="sm" className="sm:hidden px-2 text-[#796a5d] hover:text-[#35261d] hover:bg-[#eadfcd]" onClick={() => navigate('profile')}>
            <User className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
