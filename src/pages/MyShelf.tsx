import React, { useEffect, useRef, useState } from 'react';
import { Bookmark, ChevronRight, Clock3, Search, X } from 'lucide-react';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { useApp } from '../contexts/AppContext';
import { getAllMaps } from '../lib/mockData';
import './MyShelf.css';

type DashboardBook = {
  title: string;
  originalTitle?: string;
  author: string;
  progress: number;
  cover: string;
};

const libraryBooks: DashboardBook[] = [
  {
    title: '悉达多',
    originalTitle: 'Siddhartha',
    author: 'Hermann Hesse',
    progress: 76,
    cover: '/assets/reading-dashboard/siddhartha-cover.jpg',
  },
  {
    title: '原子习惯',
    originalTitle: 'Atomic Habits',
    author: 'James Clear',
    progress: 64,
    cover: '/assets/reading-dashboard/atomic-habits-cover.jpg',
  },
  {
    title: '沙丘',
    originalTitle: 'Dune',
    author: 'Frank Herbert',
    progress: 12,
    cover: '/assets/reading-dashboard/dune-cover.jpg',
  },
  {
    title: '午夜图书馆',
    originalTitle: 'The Midnight Library',
    author: 'Matt Haig',
    progress: 91,
    cover: '/assets/reading-dashboard/midnight-library-cover.webp',
  },
  {
    title: '人类简史',
    originalTitle: 'Sapiens',
    author: 'Yuval Noah Harari',
    progress: 43,
    cover: '/assets/reading-dashboard/sapiens-cover.webp',
  },
  {
    title: '沉默的病人',
    originalTitle: 'The Silent Patient',
    author: 'Alex Michaelides',
    progress: 28,
    cover: '/assets/reading-dashboard/silent-patient-cover.jpg',
  },
];

const recentBooks: DashboardBook[] = [
  {
    title: '克拉拉与太阳',
    originalTitle: 'Klara and the Sun',
    author: 'Kazuo Ishiguro',
    progress: 0,
    cover: '/assets/reading-dashboard/klara-cover.jpg',
  },
  libraryBooks[4],
  libraryBooks[5],
  {
    title: '蛤蟆先生去看心理医生',
    originalTitle: 'Counselling for Toads',
    author: 'Robert de Board',
    progress: 0,
    cover: '/assets/reading-dashboard/counselling-for-toads-cover.jpg',
  },
];

export function MyShelf() {
  const { navigate } = useApp();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleBooks = libraryBooks
    .filter((book) =>
      [book.title, book.originalTitle, book.author].some((value) => value?.toLowerCase().includes(normalizedQuery)),
    )
    .slice(0, showAll || normalizedQuery ? libraryBooks.length : 4);

  const openBook = (book: DashboardBook) => {
    navigate('search', { query: book.originalTitle || book.title, author: book.author });
  };

  const continueReading = () => {
    const existingMap = getAllMaps().find((map) => map.title.includes('置身事内'));
    if (existingMap) {
      navigate('map', { mapId: existingMap.id });
      return;
    }
    navigate('gen', { query: '置身事内：中国政府与经济发展', author: '兰小欢' });
  };

  return (
    <div className="reading-dashboard">
      <header className="reading-dashboard__header">
        <div>
          <p className="reading-dashboard__eyebrow">READING SPACE</p>
          <h1>我的阅读</h1>
        </div>
        <div className="reading-dashboard__header-actions">
          <button
            className="reading-dashboard__icon-button"
            type="button"
            aria-label={searchOpen ? '关闭搜索' : '搜索书库'}
            onClick={() => {
              setSearchOpen((open) => !open);
              setQuery('');
            }}
          >
            {searchOpen ? <X aria-hidden="true" /> : <Search aria-hidden="true" />}
          </button>
          <button className="reading-dashboard__avatar" type="button" aria-label="打开个人中心" onClick={() => navigate('profile')}>
            <img src="/assets/reading-dashboard/mountain-avatar.webp" alt="水墨山景头像" />
          </button>
        </div>
      </header>

      {searchOpen && (
        <div className="reading-dashboard__search">
          <Search aria-hidden="true" />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索书名或作者"
            aria-label="搜索书名或作者"
          />
        </div>
      )}

      <section className="reading-hero" aria-labelledby="current-reading-title">
        <div className="reading-hero__cover-wrap">
          <img
            className="reading-hero__cover"
            src="/assets/reading-dashboard/zhizhenshinei-cover.webp"
            alt="《置身事内》封面"
          />
        </div>
        <div className="reading-hero__content">
          <p className="reading-hero__label">当前在读</p>
          <h2 id="current-reading-title">置身事内</h2>
          <p className="reading-hero__subtitle">中国政府与经济发展</p>
          <p className="reading-hero__author">兰小欢</p>
          <div className="reading-hero__progress" aria-label="阅读进度 43%">
            <CircularProgressbar
              value={43}
              text="43%"
              styles={buildStyles({
                pathColor: '#c75b2d',
                trailColor: '#eadfcd',
                textColor: '#35261d',
                strokeLinecap: 'round',
                textSize: '25px',
              })}
            />
            <span>阅读进度</span>
          </div>
          <button className="reading-hero__cta" type="button" onClick={continueReading}>继续阅读</button>
        </div>
      </section>

      <section className="reading-dashboard__section" aria-labelledby="library-title">
        <div className="reading-dashboard__section-heading">
          <h2 id="library-title">书库</h2>
          <button type="button" onClick={() => setShowAll((current) => !current)}>
            {showAll ? '收起' : '查看全部'} <ChevronRight aria-hidden="true" />
          </button>
        </div>
        {visibleBooks.length > 0 ? (
          <div className="reading-library-grid">
            {visibleBooks.map((book) => (
              <button className="reading-book-card" type="button" key={book.originalTitle} onClick={() => openBook(book)}>
                <img src={book.cover} alt={`${book.title}封面`} />
                <div className="reading-book-card__body">
                  <h3>{book.title}</h3>
                  <p>{book.author}</p>
                  <div className="reading-book-card__progress-row">
                    <span className="reading-book-card__track" aria-hidden="true">
                      <span style={{ width: `${book.progress}%` }} />
                    </span>
                    <span>{book.progress}%</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="reading-dashboard__empty">没有找到匹配的书籍</p>
        )}
      </section>

      <section className="reading-stats" aria-label="阅读数据">
        <article className="reading-stat-card">
          <span className="reading-stat-card__icon reading-stat-card__icon--goal"><Clock3 aria-hidden="true" /></span>
          <div>
            <p>每日阅读目标</p>
            <strong>38</strong>
            <span>分钟 / 天</span>
          </div>
        </article>
        <article className="reading-stat-card">
          <span className="reading-stat-card__icon"><Bookmark aria-hidden="true" /></span>
          <div>
            <p>书签</p>
            <strong>3</strong>
            <span>最新：Chapter 14</span>
          </div>
        </article>
      </section>

      <section className="reading-dashboard__section reading-dashboard__section--recent" aria-labelledby="recent-title">
        <div className="reading-dashboard__section-heading">
          <h2 id="recent-title">最近添加</h2>
          <span>4 本新书</span>
        </div>
        <div className="reading-recent-list">
          {recentBooks.map((book) => (
            <button type="button" key={book.originalTitle} onClick={() => openBook(book)} aria-label={`查看${book.title}`}>
              <img src={book.cover} alt={`${book.title}封面`} />
              <span>{book.title}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
