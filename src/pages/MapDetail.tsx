import React, { useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, Copy, Loader2, Send, Share2 } from 'lucide-react';
import { clsx } from 'clsx';
import { useApp } from '../contexts/AppContext';
import { getMapById } from '../lib/mockData';
import { createShareMap, getSharedMap } from '../services/shareService';

export function MapDetail() {
  const { currentMapId, shareId, navigate, t } = useApp();
  const allCategoryLabel = '全部';
  const localMapData = shareId ? null : getMapById(currentMapId);
  const [sharedMap, setSharedMap] = useState<ReturnType<typeof getMapById> | null>(null);
  const [shareLoading, setShareLoading] = useState(Boolean(shareId));
  const [shareError, setShareError] = useState('');
  const [shareLinkLoading, setShareLinkLoading] = useState(false);
  const [shareActionMessage, setShareActionMessage] = useState('');
  const [generatedShareUrl, setGeneratedShareUrl] = useState('');
  const [activePart, setActivePart] = useState<string | undefined>(undefined);
  const [activeCategory, setActiveCategory] = useState<string | undefined>(undefined);
  const mapData = shareId ? sharedMap : localMapData;
  const leadingQuote = mapData?.quotes?.[0];
  const leadingRoute = mapData?.routes?.[0];
  const leadingCards = mapData?.overview?.cards?.slice(0, 3) || [];

  const visibleMethodItems =
    !mapData?.methods
      ? []
      : activeCategory === allCategoryLabel
        ? mapData.methods.items
        : mapData.methods.items.filter((item) => item.category === activeCategory);

  useEffect(() => {
    let active = true;

    if (!shareId) {
      setSharedMap(null);
      setShareLoading(false);
      setShareError('');
      return () => {
        active = false;
      };
    }

    setShareLoading(true);
    setShareError('');
    setSharedMap(null);

    getSharedMap(shareId)
      .then((map) => {
        if (!active) {
          return;
        }
        setSharedMap(map);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setShareError('分享已失效或服务已重启');
      })
      .finally(() => {
        if (!active) {
          return;
        }
        setShareLoading(false);
      });

    return () => {
      active = false;
    };
  }, [shareId]);

  useEffect(() => {
    if (!mapData) {
      return;
    }

    setActivePart(mapData.parts?.[0]?.id);
    setActiveCategory(mapData.methods?.items?.length ? allCategoryLabel : mapData.methods?.categories?.[0]);
    setGeneratedShareUrl('');
    setShareActionMessage('');
  }, [mapData?.id]);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const ensureShareUrl = async () => {
    if (!mapData) {
      throw new Error('当前地图尚未加载完成。');
    }

    if (generatedShareUrl) {
      return generatedShareUrl;
    }

    setShareLinkLoading(true);
    setShareActionMessage('');

    try {
      const payload = await createShareMap(mapData);
      if (typeof window === 'undefined') {
        throw new Error('当前环境无法生成分享链接。');
      }

      const url = `${window.location.origin}${window.location.pathname}?shareId=${payload.shareId}`;
      setGeneratedShareUrl(url);
      setShareActionMessage('临时分享链接已生成。');
      return url;
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : '分享创建失败，请稍后重试。';
      setShareActionMessage(nextMessage);
      throw error;
    } finally {
      setShareLinkLoading(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      const shareUrl = await ensureShareUrl();
      await navigator.clipboard.writeText(shareUrl);
      setShareActionMessage('分享链接已复制。');
    } catch (error) {
      console.warn('Failed to copy share link.', error);
    }
  };

  const handleNativeShare = async () => {
    try {
      const shareUrl = await ensureShareUrl();
      if (!navigator.share) {
        await navigator.clipboard.writeText(shareUrl);
        setShareActionMessage('分享链接已复制。');
        return;
      }

      await navigator.share({
        title: mapData?.title,
        text: mapData?.oneLiner?.zh,
        url: shareUrl,
      });
    } catch (error) {
      console.warn('Native share was cancelled or failed.', error);
    }
  };

  const handleSocialShare = async (channel: 'weibo' | 'x' | 'linkedin') => {
    if (typeof window === 'undefined' || !mapData) {
      return;
    }

    try {
      const shareUrl = await ensureShareUrl();
      const title = `${mapData.title}｜${mapData.oneLiner?.zh || ''}`;
      const socialUrl =
        channel === 'weibo'
          ? `https://service.weibo.com/share/share.php?title=${encodeURIComponent(title)}&url=${encodeURIComponent(shareUrl)}`
          : channel === 'x'
            ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(shareUrl)}`
            : `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;

      window.open(socialUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.warn('Social share failed.', error);
    }
  };

  const copy = {
    overview: '总览',
    knowledgeMap: '知识地图',
    parts: '核心模块',
    methods: '方法地图',
    timeline: '时间线',
    routes: '阅读路线',
    readStructure: '先看整本书骨架',
    jumpMethods: '直接进入方法地图',
    jumpRoutes: '看阅读路线',
    shareNow: shareLinkLoading ? '生成分享链接中...' : '直接分享',
    copyLink: shareLinkLoading ? '生成分享链接中...' : '复制链接',
    readingMap: '阅读地图',
    readingPosition: '阅读定位',
    keySentence: '读前一句',
    bestEntry: '最适合的入口',
    keyIdeas: '读前先抓',
    howToReadParts: '不是目录复述，而是每一部分该怎么看',
    partsDesc: '左边选模块，右边看这一部分的任务、重点章节和最该带走的东西。',
    partTask: '这一部分的任务',
    priorityChapters: '优先章节',
    takeAway: '看完该带走',
    position: '怎么理解它的位置',
    methodTitleSuffix: '条方法卡，不再只是一页摘要',
    methodDesc: '这里把方法按类别切成固定知识网格，先扫一遍，再挑与你工作最相关的几条深读。',
    timelineTitle: '把推进顺序看清',
    quotesTitle: '最值得带走的句子',
    debateTitle: '今天再读，哪些地方要带着判断',
    routeTitle: '不同人该怎么读',
  };

  if (shareId && shareLoading) {
    return (
      <div className="min-h-screen bg-[#0f1117] px-4 py-24 text-zinc-300">
        <div className="mx-auto max-w-2xl rounded-3xl border border-white/5 bg-white/[0.02] p-10 text-center">
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-amber-500" />
          <h1 className="mt-6 text-3xl font-serif font-bold text-white">正在读取分享地图</h1>
          <p className="mt-3 text-sm text-zinc-400">这个链接不依赖本地缓存，会从服务端临时分享记录中读取。</p>
        </div>
      </div>
    );
  }

  if (shareId && shareError) {
    return (
      <div className="min-h-screen bg-[#0f1117] px-4 py-24 text-zinc-300">
        <div className="mx-auto max-w-2xl rounded-3xl border border-red-500/20 bg-red-500/5 p-10 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 text-red-300">
            <AlertCircle className="h-8 w-8" />
          </div>
          <h1 className="mt-6 text-3xl font-serif font-bold text-white">分享已失效或服务已重启</h1>
          <p className="mt-3 text-sm text-zinc-300">请让分享者重新生成链接后再打开。当前页面不会回落到默认地图。</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              onClick={() => navigate('home')}
              className="rounded-full border border-white/10 bg-white/[0.03] px-6 py-3 text-sm text-zinc-100 hover:bg-white/[0.06]"
            >
              返回首页
            </button>
            <button
              onClick={() => navigate('shelf')}
              className="rounded-full border border-white/10 bg-white/[0.03] px-6 py-3 text-sm text-zinc-100 hover:bg-white/[0.06]"
            >
              返回书架
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!mapData) {
    return null;
  }

  const socialShareItems = [
    { label: '微博', channel: 'weibo' as const },
    { label: 'X', channel: 'x' as const },
    { label: 'LinkedIn', channel: 'linkedin' as const },
  ];

  const isShareActionDisabled = shareLinkLoading || Boolean(shareId && shareLoading);

  return (
    <div className="min-h-screen bg-[#0f1117] text-zinc-300 font-sans selection:bg-amber-500/30">
      <nav className="sticky top-0 z-50 border-b border-white/5 bg-[#0f1117]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center px-4 sm:px-6 lg:px-8 h-14 overflow-x-auto scrollbar-hide">
          <button onClick={() => navigate('home')} className="mr-6 flex-shrink-0 text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex space-x-6 sm:space-x-8 text-sm font-medium whitespace-nowrap">
            <button onClick={() => scrollToSection('overview')} className="text-amber-500">{copy.overview}</button>
            <button onClick={() => scrollToSection('knowledgeMap')} className="text-zinc-400 hover:text-zinc-200 transition-colors">{copy.knowledgeMap}</button>
            <button onClick={() => scrollToSection('parts')} className="text-zinc-400 hover:text-zinc-200 transition-colors">{copy.parts}</button>
            <button onClick={() => scrollToSection('methods')} className="text-zinc-400 hover:text-zinc-200 transition-colors">{copy.methods}</button>
            <button onClick={() => scrollToSection('timeline')} className="text-zinc-400 hover:text-zinc-200 transition-colors">{copy.timeline}</button>
            <button onClick={() => scrollToSection('routes')} className="text-zinc-400 hover:text-zinc-200 transition-colors">{copy.routes}</button>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 lg:py-20">
        <section className="flex flex-col lg:flex-row gap-12 lg:gap-24 mb-28">
          <div className="flex-1">
            <div className="text-amber-500/80 text-sm font-medium tracking-widest mb-6 uppercase">
              Reading Map
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-7xl font-serif font-bold leading-[1.1] tracking-tight text-white mb-8">
              《{mapData.title}》<br />
              <span className="text-[#dcb773] text-2xl sm:text-3xl lg:text-4xl mt-4 block leading-snug">
                {mapData.oneLiner?.zh || ''}
              </span>
            </h1>
            <p className="text-lg text-zinc-400 leading-relaxed max-w-2xl mb-10">
              {mapData.about?.zh}
            </p>

            <div className="flex flex-wrap gap-4 mb-12">
              <button onClick={() => scrollToSection('parts')} className="rounded-full border border-zinc-700 bg-zinc-800/50 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-800 transition-colors">
                {copy.readStructure}
              </button>
              <button onClick={() => scrollToSection('methods')} className="rounded-full border border-zinc-700 bg-transparent px-6 py-3 text-sm font-medium text-white hover:bg-zinc-800/50 transition-colors">
                {copy.jumpMethods}
              </button>
              <button onClick={() => scrollToSection('routes')} className="rounded-full border border-zinc-700 bg-transparent px-6 py-3 text-sm font-medium text-white hover:bg-zinc-800/50 transition-colors">
                {copy.jumpRoutes}
              </button>
            </div>

            <div className="mb-10 flex flex-wrap gap-3">
              <button
                onClick={handleNativeShare}
                disabled={isShareActionDisabled}
                className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-zinc-200 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Share2 className="mr-2 h-4 w-4" />
                {copy.shareNow}
              </button>
              <button
                onClick={handleCopyLink}
                disabled={isShareActionDisabled}
                className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-zinc-200 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Copy className="mr-2 h-4 w-4" />
                {copy.copyLink}
              </button>
              {socialShareItems.map((item) => (
                <button
                  key={item.label}
                  onClick={() => handleSocialShare(item.channel)}
                  disabled={isShareActionDisabled}
                  className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-zinc-200 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Send className="mr-2 h-4 w-4" />
                  {item.label}
                </button>
              ))}
            </div>
            <div className="mb-10 space-y-2">
              <p className="text-sm text-zinc-500">这是临时分享链接，服务重启后可能失效。</p>
              {shareActionMessage && <p className="text-sm text-amber-300">{shareActionMessage}</p>}
            </div>

            {mapData.stats && (
              <div className="grid grid-cols-2 gap-6 max-w-lg">
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
                  <div className="text-xs text-amber-500/80 mb-2">书籍结构</div>
                  <div className="text-4xl font-serif text-white mb-4">{mapData.stats.structure}</div>
                  <div className="text-sm text-zinc-500">核心部分，适合先抓骨架再看细节。</div>
                </div>
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
                  <div className="text-xs text-amber-500/80 mb-2">阅读体量</div>
                  <div className="text-4xl font-serif text-white mb-4">{mapData.stats.volume}</div>
                  <div className="text-sm text-zinc-500">估算页量，帮助决定速读还是深读。</div>
                </div>
              </div>
            )}
          </div>

          <div className="lg:w-[400px] flex-shrink-0">
            <div className="relative rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.16),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.14),transparent_28%),linear-gradient(180deg,rgba(24,24,27,0.92),rgba(10,10,12,0.98))] p-8 overflow-hidden aspect-[3/4] flex flex-col justify-between shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
              <div className="absolute top-16 right-16 h-28 w-28 rounded-full bg-amber-400/10 blur-3xl" />
              <div className="absolute bottom-16 left-10 h-24 w-24 rounded-full bg-sky-400/10 blur-3xl" />
              <div>
                <div className="text-[11px] tracking-[0.3em] text-zinc-500 uppercase">Reading Map</div>
                <div className="mt-6 text-sm tracking-widest text-zinc-400 uppercase">{mapData.author || 'AUTHOR'}</div>
              </div>
              <div className="mt-10">
                <h2 className="text-5xl font-serif font-bold text-white mb-4">{copy.readingMap}</h2>
                <p className="text-sm leading-relaxed text-zinc-400">
                  {mapData.about?.zh || mapData.oneLiner?.zh || '围绕这本书的核心问题、结构展开与关键判断整理的阅读地图。'}
                </p>
                {leadingCards.length > 0 && (
                  <div className="mt-8 space-y-3">
                    {leadingCards.map((card) => (
                      <div key={card.title} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                        <div className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">{card.layer}</div>
                        <div className="mt-1 text-sm font-medium text-zinc-100">{card.title}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {mapData.readingPosition && (
              <div className="mt-8 rounded-2xl border border-white/5 bg-white/[0.02] p-5">
                <div className="text-xs text-zinc-500 mb-2">{copy.readingPosition}</div>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  {typeof mapData.readingPosition === 'string'
                    ? mapData.readingPosition
                    : mapData.readingPosition.zh}
                </p>
              </div>
            )}
          </div>
        </section>

        {(leadingQuote || leadingRoute || leadingCards.length > 0) && (
          <section className="mb-28">
            <div className="grid gap-6 lg:grid-cols-[1.2fr_0.9fr_0.9fr]">
              {leadingQuote && (
                <div className="rounded-[2rem] border border-amber-500/15 bg-[linear-gradient(135deg,rgba(217,119,6,0.12),rgba(255,255,255,0.02))] p-8">
                  <div className="text-xs uppercase tracking-[0.24em] text-amber-400/80">{copy.keySentence}</div>
                  <p className="mt-5 text-2xl font-serif leading-relaxed text-white">“{leadingQuote.quote}”</p>
                  <p className="mt-4 text-sm leading-relaxed text-zinc-400">{leadingQuote.note}</p>
                </div>
              )}

              {leadingRoute && (
                <div className="rounded-[2rem] border border-white/5 bg-white/[0.02] p-8">
                  <div className="text-xs uppercase tracking-[0.24em] text-zinc-500">{copy.bestEntry}</div>
                  <h3 className="mt-5 text-2xl font-serif text-white">{leadingRoute.audience}</h3>
                  <p className="mt-4 text-sm leading-relaxed text-zinc-400">{leadingRoute.route}</p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {leadingRoute.focus.map((focus) => (
                      <span key={focus} className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-300">
                        {focus}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {leadingCards.length > 0 && (
                <div className="rounded-[2rem] border border-white/5 bg-white/[0.02] p-8">
                  <div className="text-xs uppercase tracking-[0.24em] text-zinc-500">{copy.keyIdeas}</div>
                  <div className="mt-5 space-y-4">
                    {leadingCards.map((card) => (
                      <div key={card.title} className="border-l border-amber-500/30 pl-4">
                        <div className="text-sm font-medium text-white">{card.title}</div>
                        <div className="mt-1 text-sm leading-relaxed text-zinc-400">{card.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {mapData.overview && (
          <section id="overview" className="mb-28 scroll-mt-24">
            <div className="text-xs text-amber-500/80 mb-4">{copy.overview}</div>
            <h2 className="text-4xl sm:text-5xl font-serif font-bold text-white mb-4">{mapData.overview.title}</h2>
            <p className="text-lg text-zinc-400 mb-12">{mapData.overview.subtitle}</p>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {mapData.overview.cards.map((card, index) => (
                <div key={`${card.title}-${index}`} className="relative rounded-2xl border border-white/5 bg-white/[0.02] p-6 pt-8 overflow-hidden">
                  <div className={clsx('absolute top-0 left-0 right-0 h-1 bg-gradient-to-r', card.color)} />
                  <div className="text-xs text-zinc-500 mb-4">{card.layer}</div>
                  <h3 className="text-xl font-bold text-white mb-4">{card.title}</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed mb-6">{card.desc}</p>
                  <ul className="space-y-2">
                    {card.points.map((point) => (
                      <li key={point} className="text-sm text-zinc-300 flex items-start">
                        <span className="mr-2 mt-1.5 h-1.5 w-1.5 rounded-full bg-zinc-600 flex-shrink-0" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {mapData.knowledgeMap && (
          <section id="knowledgeMap" className="mb-28 scroll-mt-24">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-24">
              <div>
                <h2 className="text-3xl font-bold text-white mb-10">{t('map', 'keyAreas')}</h2>
                <div className="space-y-8">
                  {mapData.knowledgeMap.areas.map((area) => (
                    <div key={area.title}>
                      <div className="flex justify-between items-end mb-3">
                        <h3 className="text-lg font-bold text-white">{area.title}</h3>
                        <span className="text-xs text-zinc-500">{area.status}</span>
                      </div>
                      <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden mb-3">
                        <div className={clsx('h-full rounded-full', area.color)} style={{ width: `${area.progress}%` }} />
                      </div>
                      <p className="text-sm text-zinc-400">{area.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h2 className="text-3xl font-bold text-white mb-10">{t('map', 'keyTools')}</h2>
                <div className="space-y-6">
                  {mapData.knowledgeMap.tools.map((tool) => (
                    <div key={tool.title} className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
                      <div className="text-xs text-zinc-500 mb-2">思维工具</div>
                      <h3 className="text-xl font-bold text-white mb-3">{tool.title}</h3>
                      <p className="text-sm text-zinc-400 mb-4">{tool.desc}</p>
                      <ul className="space-y-2">
                        {tool.points.map((point) => (
                          <li key={point} className="text-sm text-zinc-300 flex items-start">
                            <span className="mr-2 mt-1.5 h-1.5 w-1.5 rounded-full bg-zinc-600 flex-shrink-0" />
                            {point}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {mapData.parts && (
          <section id="parts" className="mb-28 scroll-mt-24">
            <h2 className="text-4xl sm:text-5xl font-serif font-bold text-white mb-4">{copy.howToReadParts}</h2>
            <p className="text-lg text-zinc-400 mb-12">{copy.partsDesc}</p>

            <div className="flex flex-col lg:flex-row gap-8">
              <div className="lg:w-1/3 space-y-4">
                {mapData.parts.map((part) => (
                  <button
                    key={part.id}
                    onClick={() => setActivePart(part.id)}
                    className={clsx(
                      'w-full text-left p-6 rounded-2xl border transition-all',
                      activePart === part.id ? 'border-amber-500/50 bg-amber-500/5' : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04]'
                    )}
                  >
                    <div className="text-xs text-amber-500/80 mb-2">{part.subtitle}</div>
                    <h3 className="text-xl font-bold text-white mb-2">{part.title}</h3>
                    <p className="text-sm text-zinc-400">{part.navDesc}</p>
                  </button>
                ))}
              </div>

              <div className="lg:w-2/3">
                {mapData.parts.map((part) => (
                  <div key={part.id} className={clsx(activePart === part.id ? 'block' : 'hidden')}>
                    <div className="rounded-3xl border border-white/5 bg-white/[0.02] p-8 sm:p-10">
                      <div className="text-xs text-amber-500/80 mb-2">{part.subtitle}</div>
                      <h3 className="text-4xl font-serif font-bold text-white mb-6">{part.title}</h3>
                      <p className="text-base text-zinc-300 leading-relaxed mb-8">{part.intro}</p>

                      <div className="flex flex-wrap gap-3 mb-10">
                        {part.tags.map((tag) => (
                          <span key={tag} className="rounded-full border border-white/10 px-4 py-1.5 text-xs text-zinc-400">
                            {tag}
                          </span>
                        ))}
                      </div>

                      <div className="grid sm:grid-cols-2 gap-6">
                        <div className="rounded-2xl bg-white/[0.02] p-6 border border-white/5">
                          <h4 className="text-sm font-bold text-white mb-4">{copy.partTask}</h4>
                          <p className="text-sm text-zinc-400">{part.task}</p>
                        </div>
                        <div className="rounded-2xl bg-white/[0.02] p-6 border border-white/5">
                          <h4 className="text-sm font-bold text-white mb-4">{copy.priorityChapters}</h4>
                          <div className="flex flex-wrap gap-2">
                            {part.chapters.map((chapter) => (
                              <span key={chapter} className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-400">
                                {chapter}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="rounded-2xl bg-white/[0.02] p-6 border border-white/5">
                          <h4 className="text-sm font-bold text-white mb-4">{copy.takeAway}</h4>
                          <ul className="space-y-2">
                            {part.takeaways.map((takeaway) => (
                              <li key={takeaway} className="text-sm text-zinc-400 flex items-start">
                                <span className="mr-2 mt-1.5 h-1.5 w-1.5 rounded-full bg-zinc-600 flex-shrink-0" />
                                {takeaway}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="rounded-2xl bg-white/[0.02] p-6 border border-white/5">
                          <h4 className="text-sm font-bold text-white mb-4">{copy.position}</h4>
                          <p className="text-sm text-zinc-400">{part.position}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {mapData.methods && (
          <section id="methods" className="mb-28 scroll-mt-24">
            <h2 className="text-4xl sm:text-5xl font-serif font-bold text-white mb-4">
              {mapData.methods.items.length} {copy.methodTitleSuffix}
            </h2>
            <p className="text-lg text-zinc-400 mb-10">{copy.methodDesc}</p>

            <div className="flex flex-wrap gap-3 mb-8">
              {[allCategoryLabel, ...mapData.methods.categories].map((category) => {
                const isActive = activeCategory === category;
                const count =
                  category === allCategoryLabel
                    ? mapData.methods?.items.length || 0
                    : mapData.methods?.items.filter((item) => item.category === category).length || 0;
                return (
                  <button
                    key={category}
                    onClick={() => setActiveCategory(category)}
                    className={clsx(
                      'rounded-full border px-4 py-1.5 text-xs transition-colors',
                      isActive ? 'border-amber-500/50 text-amber-500 bg-amber-500/10' : 'border-white/10 text-zinc-400 hover:text-white'
                    )}
                  >
                    {category} · {count}
                  </button>
                );
              })}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
              {visibleMethodItems.map((item) => (
                  <div key={item.id} className="group rounded-[1.4rem] border border-white/5 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] p-5 transition-all hover:-translate-y-1 hover:border-amber-500/20 hover:bg-white/[0.05]">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="text-[10px] text-zinc-500">{item.category}</div>
                      <div className="text-[10px] font-medium tracking-[0.2em] text-amber-400/80">{item.id}</div>
                    </div>
                    <h4 className="text-sm font-bold leading-snug text-white mb-3">{item.title}</h4>
                    <p className="text-xs leading-relaxed text-zinc-400">{item.desc}</p>
                    <div className="mt-4 h-px w-full bg-gradient-to-r from-amber-500/30 via-white/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                ))}
            </div>
          </section>
        )}

        <section id="timeline" className="mb-28 scroll-mt-24">
          <div className="grid lg:grid-cols-2 gap-8">
            <div className="rounded-3xl border border-white/5 bg-white/[0.02] p-8">
              <div className="text-xs text-amber-500/80 mb-4">{t('map', 'timelineLabel')}</div>
              <h2 className="text-3xl font-serif font-bold text-white mb-8">{copy.timelineTitle}</h2>
              <div className="space-y-6">
                {mapData.timeline?.map((item) => (
                  <div key={`${item.year}-${item.title}`} className="relative pl-6">
                    <div className="absolute left-0 top-2 h-3 w-3 rounded-full bg-amber-500" />
                    <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">{item.year}</div>
                    <h3 className="mt-2 text-lg font-bold text-white">{item.title}</h3>
                    <p className="mt-2 text-sm text-zinc-400">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-white/5 bg-white/[0.02] p-8">
              <div className="text-xs text-amber-500/80 mb-4">{t('map', 'quotesLabel')}</div>
              <h2 className="text-3xl font-serif font-bold text-white mb-8">{copy.quotesTitle}</h2>
              <div className="space-y-5">
                {mapData.quotes?.map((quote) => (
                  <blockquote key={quote.quote} className="rounded-2xl border border-white/5 bg-zinc-950/30 p-5">
                    <p className="text-base text-white leading-relaxed">“{quote.quote}”</p>
                    <footer className="mt-3 text-sm text-zinc-500">{quote.note}</footer>
                  </blockquote>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="routes" className="scroll-mt-24">
          <div className="grid lg:grid-cols-2 gap-8">
            <div className="rounded-3xl border border-white/5 bg-white/[0.02] p-8">
              <div className="text-xs text-amber-500/80 mb-4">{t('map', 'debate')}</div>
              <h2 className="text-3xl font-serif font-bold text-white mb-8">{copy.debateTitle}</h2>
              <div className="space-y-6">
                {mapData.debates?.map((debate) => (
                  <div key={debate.title} className="rounded-2xl border border-white/5 bg-zinc-950/30 p-5">
                    <h3 className="text-lg font-bold text-white">{debate.title}</h3>
                    <p className="mt-3 text-sm text-zinc-300">{`值得带走：${debate.value}`}</p>
                    <p className="mt-2 text-sm text-zinc-500">{`需要保留看：${debate.reservation}`}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-white/5 bg-white/[0.02] p-8">
              <div className="text-xs text-amber-500/80 mb-4">{t('map', 'routesLabel')}</div>
              <h2 className="text-3xl font-serif font-bold text-white mb-8">{copy.routeTitle}</h2>
              <div className="space-y-6">
                {mapData.routes?.map((route) => (
                  <div key={route.audience} className="rounded-2xl border border-white/5 bg-zinc-950/30 p-5">
                    <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">{route.audience}</div>
                    <h3 className="mt-3 text-lg font-bold text-white">{route.route}</h3>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {route.focus.map((focus) => (
                        <span key={focus} className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-400">
                          {focus}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
