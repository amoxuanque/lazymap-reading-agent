import React, { useState } from 'react';
import { Search, Upload, Sparkles } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { Button } from '../components/ui/Button';
import { BookCard } from '../components/ui/BookCard';
import { getFeaturedMaps } from '../lib/mockData';
import { motion } from 'motion/react';

export function Home() {
  const { t, navigate, language } = useApp();
  const [query, setQuery] = useState('');
  const featuredMaps = getFeaturedMaps();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      navigate('search', { query });
    }
  };

  return (
    <div className="flex flex-col gap-12 sm:gap-16 pb-12 min-h-screen bg-[#0f1117] text-zinc-300 px-4 sm:px-6 lg:px-8 pt-8">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-3xl bg-zinc-900/50 border border-white/5 px-4 py-16 sm:px-12 sm:py-24 text-center lg:px-16">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-amber-500/20 via-zinc-900/0 to-zinc-900/0"></div>
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative z-10 mx-auto max-w-3xl"
        >
          <h1 className="text-3xl font-serif font-bold tracking-tight text-white sm:text-5xl lg:text-6xl whitespace-pre-line">
            {t('home', 'heroTitle')}
          </h1>
          <p className="mt-4 sm:mt-6 text-base text-zinc-400 sm:text-xl">
            {t('home', 'heroSubtitle')}
          </p>

          <form onSubmit={handleSearch} className="mx-auto mt-8 sm:mt-10 flex flex-col sm:flex-row max-w-2xl items-center gap-2 rounded-2xl bg-white/[0.02] p-2 backdrop-blur-md border border-white/10">
            <div className="flex w-full items-center flex-1">
              <Search className="ml-3 h-5 w-5 sm:h-6 sm:w-6 text-zinc-500 shrink-0" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('nav', 'searchPlaceholder')}
                className="w-full bg-transparent px-3 py-3 text-base sm:text-lg text-white placeholder:text-zinc-600 focus:outline-none"
              />
            </div>
            <Button type="submit" size="lg" className="w-full sm:w-auto rounded-xl bg-amber-500 hover:bg-amber-600 text-zinc-900 border-none">
              {language === 'en' ? 'Search' : '搜索'}
            </Button>
          </form>

          <div className="mt-6 sm:mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
            <Button variant="secondary" size="lg" className="w-full sm:w-auto rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white border-none" onClick={() => navigate('gen')}>
              <Upload className="mr-2 h-5 w-5" />
              {t('home', 'uploadBtn')}
            </Button>
            <Button variant="outline" size="lg" className="w-full sm:w-auto rounded-xl border-white/10 text-zinc-300 hover:bg-white/5 hover:text-white" onClick={() => navigate('gen')}>
              <Sparkles className="mr-2 h-5 w-5" />
              {t('home', 'paidBtn')}
            </Button>
          </div>
        </motion.div>
      </section>

      {/* Popular Maps */}
      <section>
        <div className="mb-6 sm:mb-8 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-serif font-bold tracking-tight text-white">{t('home', 'popularMaps')}</h2>
            <p className="mt-2 text-sm text-zinc-500">优先展示已整理好的高质量阅读地图，没命中的再进搜索和生成链路。</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {featuredMaps.map((map, i) => (
            <motion.div
              key={map.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
            >
              <BookCard book={map} />
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
