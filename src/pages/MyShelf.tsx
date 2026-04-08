import React, { useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { BookCard } from '../components/ui/BookCard';
import { getShelfData } from '../lib/mockData';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { Library } from 'lucide-react';

type Tab = keyof ReturnType<typeof getShelfData>;

export function MyShelf() {
  const { t } = useApp();
  const [activeTab, setActiveTab] = useState<Tab>('organized');
  const shelf = getShelfData();

  const tabs: { id: Tab; label: string }[] = [
    { id: 'wantToRead', label: t('shelf', 'wantToRead') },
    { id: 'organized', label: t('shelf', 'organized') },
    { id: 'favorited', label: t('shelf', 'favorited') },
    { id: 'shared', label: t('shelf', 'shared') },
  ];

  const currentItems = shelf[activeTab];

  return (
    <div className="pb-12 min-h-screen bg-[#0f1117] text-zinc-300 px-4 sm:px-6 lg:px-8 pt-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-serif font-bold tracking-tight text-white">{t('shelf', 'title')}</h1>
      </div>

      <div className="mb-6 sm:mb-8 border-b border-white/10">
        <nav className="-mb-px flex space-x-6 sm:space-x-8 overflow-x-auto scrollbar-hide" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'whitespace-nowrap border-b-2 py-3 sm:py-4 px-1 text-sm sm:text-base font-medium transition-colors',
                activeTab === tab.id
                  ? 'border-amber-500 text-amber-500'
                  : 'border-transparent text-zinc-500 hover:border-zinc-400 hover:text-zinc-300'
              )}
            >
              {tab.label}
              <span className={cn(
                "ml-2 rounded-full px-2.5 py-0.5 text-xs font-medium",
                activeTab === tab.id ? "bg-amber-500/10 text-amber-500" : "bg-white/5 text-zinc-500"
              )}>
                {shelf[tab.id].length}
              </span>
            </button>
          ))}
        </nav>
      </div>

      {currentItems.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {currentItems.map((book, i) => (
            <motion.div
              key={`${activeTab}-${book.id}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
            >
              <BookCard book={book} />
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 sm:py-20 text-center">
          <div className="rounded-full bg-white/5 p-6 mb-4">
            <Library className="h-8 w-8 text-zinc-500" />
          </div>
          <h3 className="text-lg font-medium text-white">No items here</h3>
          <p className="mt-1 text-zinc-500">You haven't added anything to this shelf yet.</p>
        </div>
      )}
    </div>
  );
}
