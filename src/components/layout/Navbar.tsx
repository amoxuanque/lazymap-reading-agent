import React from 'react';
import { Search, Library, User, PlusCircle } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { Button } from '../ui/Button';

export function Navbar() {
  const { navigate, t, account } = useApp();
  const balanceText = account ? `${account.creditBalance.toLocaleString()} 积分` : '';

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-[#0f1117]/80 backdrop-blur-md">
      <div className="container mx-auto flex h-14 sm:h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div 
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => navigate('home')}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-zinc-900 font-bold">
            LM
          </div>
          <span className="text-xl font-bold tracking-tight text-white">
            LazyMap
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('search')} className="hidden sm:flex text-zinc-400 hover:text-white hover:bg-white/5">
            <Search className="mr-2 h-4 w-4" />
            {t('nav', 'searchPlaceholder').split('...')[0]}
          </Button>
          
          <Button variant="ghost" size="sm" onClick={() => navigate('shelf')} className="hidden sm:flex text-zinc-400 hover:text-white hover:bg-white/5">
            <Library className="mr-2 h-4 w-4" />
            {t('nav', 'shelf')}
          </Button>

          <Button variant="outline" size="sm" className="hidden sm:flex border-white/10 text-zinc-300 hover:bg-white/5 hover:text-white" onClick={() => navigate('gen')}>
            <PlusCircle className="mr-2 h-4 w-4" />
            {t('nav', 'generate')}
          </Button>

          {account && (
            <button
              key={`${account.id}-${balanceText}`}
              onClick={() => navigate('profile')}
              className="hidden items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-left sm:flex"
            >
              <div className="text-right">
                <div className="text-[11px] text-zinc-500">我的账户</div>
                <div className="text-sm font-medium text-white">{balanceText}</div>
              </div>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/10 text-amber-400">
                <User className="h-4 w-4" />
              </span>
            </button>
          )}

          {!account && (
            <Button variant="ghost" size="sm" className="hidden sm:flex px-2 text-zinc-400 hover:text-white hover:bg-white/5" onClick={() => navigate('profile')}>
              <User className="h-4 w-4" />
            </Button>
          )}

          <Button variant="ghost" size="sm" className="sm:hidden px-2 text-zinc-400 hover:text-white hover:bg-white/5" onClick={() => navigate('profile')}>
            <User className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
