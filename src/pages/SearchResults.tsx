import React, { useEffect, useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { Button } from '../components/ui/Button';
import { BookCard } from '../components/ui/BookCard';
import { motion } from 'motion/react';
import { searchCatalog } from '../services/catalogService';
import { SearchBook } from '../lib/types';
export function SearchResults() {
  const { t, searchQuery, navigate, consumeCredits } = useApp();
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const [results, setResults] = useState<SearchBook[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let active = true;

    async function runSearch() {
      if (!searchQuery.trim()) {
        setResults([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessage('');

      const billingResult = consumeCredits('search', { title: searchQuery });
      if (!billingResult.ok) {
        if (!active) {
          return;
        }
        setLoading(false);
        setResults([]);
        setErrorMessage(billingResult.error || '当前积分不足，无法继续搜索。');
        return;
      }

      const found = await searchCatalog(searchQuery);
      if (!active) {
        return;
      }

      if (found.length === 0 && searchQuery.trim()) {
        setResults([
          {
            id: `temp-${Date.now()}`,
            title: searchQuery,
            author: '',
            cover: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?q=80&w=800&auto=format&fit=crop',
            oneLiner: { zh: '当前没命中现成地图，可直接继续走全网搜索生成。' },
            saves: 0,
            status: 'no_map_paid',
            source: 'catalog',
            matchReason: '未命中现有地图库，建议直接继续生成阅读地图。',
          },
        ]);
      } else {
        setResults(found);
      }

      setLoading(false);
    }

    runSearch();

    return () => {
      active = false;
    };
  }, [searchQuery]);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    if (localQuery.trim()) {
      navigate('search', { query: localQuery.trim() });
    }
  };

  return (
    <div className="flex flex-col gap-6 sm:gap-8 pb-12 min-h-screen bg-[#0f1117] text-zinc-300 px-4 sm:px-6 lg:px-8 pt-8">
      <div className="rounded-2xl bg-white/[0.02] p-4 sm:p-6 border border-white/5">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-500" />
            <input
              type="text"
              value={localQuery}
              onChange={(event) => setLocalQuery(event.target.value)}
              placeholder={t('nav', 'searchPlaceholder')}
              className="w-full rounded-xl border border-white/10 bg-zinc-900/50 py-3 pl-12 pr-4 text-base text-white focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/50 placeholder:text-zinc-600"
            />
          </div>
          <Button type="submit" size="lg" className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 text-zinc-900">
            搜索
          </Button>
        </form>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg sm:text-xl font-medium text-zinc-200">
            {t('search', 'resultsFor').replace('{query}', searchQuery || 'All')}
          </h2>
          <p className="mt-2 text-sm text-zinc-500">{t('search', 'subtitle')}</p>
        </div>
        <div className="text-xs uppercase tracking-[0.2em] text-zinc-600">
          {results.length} 条结果
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 px-5 py-4 text-sm text-red-200">
          {errorMessage}
          <div className="mt-3">
            <Button variant="outline" className="border-red-500/20 text-red-100 hover:bg-red-500/10" onClick={() => navigate('profile')}>
              去账户中心查看计划
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="rounded-3xl border border-white/5 bg-white/[0.02] px-6 py-16 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-amber-500" />
          <p className="mt-4 text-sm text-zinc-400">{t('search', 'loading')}</p>
        </div>
      ) : (
        <>
          {results.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {results.map((book, index) => (
                <motion.div
                  key={book.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: index * 0.04 }}
                >
                  <BookCard book={book} />
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-white/5 bg-white/[0.02] p-8 sm:p-10">
              <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">{t('search', 'noMatchTitle')}</div>
              <h3 className="mt-4 text-2xl font-serif font-bold text-white">“{searchQuery}” 暂时没有现成地图</h3>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-400">{t('search', 'noMatchDesc')}</p>
              <div className="mt-6">
                <Button className="bg-amber-500 hover:bg-amber-600 text-zinc-900" onClick={() => navigate('gen', { query: searchQuery })}>
                  {t('search', 'paidGenerate')}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
