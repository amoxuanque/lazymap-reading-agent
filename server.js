import express from 'express';
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 8787);
const NODE_ENV = process.env.NODE_ENV || 'development';
const SILICONFLOW_API_KEY = process.env.SILICONFLOW_API_KEY || process.env.GEMINI_API_KEY || '';
const SILICONFLOW_BASE_URL = process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1';
const SILICONFLOW_MODEL = process.env.SILICONFLOW_MODEL || 'Qwen/Qwen3-32B';
const SILICONFLOW_POLISH_MODEL = process.env.SILICONFLOW_POLISH_MODEL || SILICONFLOW_MODEL;
const SILICONFLOW_COMPACT_MODEL = process.env.SILICONFLOW_COMPACT_MODEL || 'Qwen/Qwen2.5-7B-Instruct';
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '';
const TAVILY_BASE_URL = process.env.TAVILY_BASE_URL || 'https://api.tavily.com/search';
const GOOGLE_BOOKS_BASE_URL = process.env.GOOGLE_BOOKS_BASE_URL || 'https://www.googleapis.com/books/v1/volumes';
const OPEN_LIBRARY_BASE_URL = process.env.OPEN_LIBRARY_BASE_URL || 'https://openlibrary.org/search.json';
const SILICONFLOW_TIMEOUT_MS = Number(process.env.SILICONFLOW_TIMEOUT_MS || 90000);
const TAVILY_TIMEOUT_MS = Number(process.env.TAVILY_TIMEOUT_MS || 6000);
const GOOGLE_BOOKS_TIMEOUT_MS = Number(process.env.GOOGLE_BOOKS_TIMEOUT_MS || 12000);
const OPEN_LIBRARY_TIMEOUT_MS = Number(process.env.OPEN_LIBRARY_TIMEOUT_MS || 12000);
const SHARE_TTL_MS = Number(process.env.SHARE_TTL_MS || 1000 * 60 * 60 * 6);
const SHARE_STORE_LIMIT = Number(process.env.SHARE_STORE_LIMIT || 200);
const CATALOG_GENERATION_BUDGET_MS = Number(process.env.CATALOG_GENERATION_BUDGET_MS || 45000);
const UPLOAD_GENERATION_BUDGET_MS = Number(process.env.UPLOAD_GENERATION_BUDGET_MS || 55000);
const ANALYSIS_STAGE_TIMEOUT_MS = Number(process.env.ANALYSIS_STAGE_TIMEOUT_MS || 10000);
const SECTION_STAGE_TIMEOUT_MS = Number(process.env.SECTION_STAGE_TIMEOUT_MS || 14000);
const SPARSE_STAGE_TIMEOUT_MS = Number(process.env.SPARSE_STAGE_TIMEOUT_MS || 8000);
const COVER_LOOKUP_TIMEOUT_MS = Number(process.env.COVER_LOOKUP_TIMEOUT_MS || 2500);
const MIN_STAGE_BUDGET_MS = Number(process.env.MIN_STAGE_BUDGET_MS || 1200);
const COMPACT_GROUNDING_TIMEOUT_MS = Number(process.env.COMPACT_GROUNDING_TIMEOUT_MS || 3500);
const CATALOG_COMPACT_TIMEOUT_MS = Number(process.env.CATALOG_COMPACT_TIMEOUT_MS || 24000);
const UPLOAD_COMPACT_TIMEOUT_MS = Number(process.env.UPLOAD_COMPACT_TIMEOUT_MS || 32000);
const UPLOAD_COMPRESSED_TEXT_MAX_CHARS = Number(process.env.UPLOAD_COMPRESSED_TEXT_MAX_CHARS || 2200);
const ALLOW_PROTOTYPE_FALLBACK = process.env.ALLOW_PROTOTYPE_FALLBACK
  ? ['1', 'true', 'yes', 'on'].includes(String(process.env.ALLOW_PROTOTYPE_FALLBACK).toLowerCase())
  : NODE_ENV !== 'production';

const fallbackCover = 'https://images.unsplash.com/photo-1512820790803-83ca734da794?q=80&w=800&auto=format&fit=crop';
const shareStore = new Map();
const requestContextStorage = new AsyncLocalStorage();
const REQUEST_ID_HEADER = 'X-Request-Id';
const LOG_REDACTED_KEYS = new Set(['content', 'prompt', 'rawContent', 'raw_content']);

function buildRequestId() {
  return randomUUID().split('-')[0];
}

function redactSensitiveText(value) {
  return String(value || '')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[redacted-secret]')
    .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, '[redacted-secret]')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]{12,}/gi, '$1[redacted-secret]')
    .replace(/\b(?:SILICONFLOW_API_KEY|TAVILY_API_KEY|GEMINI_API_KEY)\b\s*[:=]\s*["']?[^"'\s]+/gi, '[redacted-secret]');
}

function sanitizeLogValue(key, value) {
  if (value === null || value === undefined) {
    return value;
  }

  if (LOG_REDACTED_KEYS.has(key) || /content|prompt/i.test(key)) {
    return `[redacted:${String(value).length}]`;
  }

  if (typeof value === 'string') {
    const cleaned = redactSensitiveText(value);
    return cleaned.length > 240 ? `${cleaned.slice(0, 237)}...` : cleaned;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 8).map((item) => sanitizeLogValue('', item));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 12)
        .map(([entryKey, entryValue]) => [entryKey, sanitizeLogValue(entryKey, entryValue)]),
    );
  }

  return String(value);
}

function sanitizeLogMeta(meta = {}) {
  return Object.fromEntries(
    Object.entries(meta).map(([key, value]) => [key, sanitizeLogValue(key, value)]),
  );
}

function summarizeError(error) {
  if (error instanceof Error) {
    return sanitizeLogMeta({
      name: error.name,
      message: error.message,
    });
  }

  return sanitizeLogMeta({
    message: String(error || 'Unknown error'),
  });
}

function classifyError(error, options = {}) {
  const message = error instanceof Error ? error.message : String(error || '');

  if (options.statusCode >= 400 && options.statusCode < 500) {
    return 'user_input_error';
  }

  if (error instanceof SyntaxError) {
    return 'parse_error';
  }

  if (/(timeout|aborted|insufficient remaining budget)/i.test(message)) {
    return 'timeout_error';
  }

  if (options.source === 'siliconflow') {
    return 'model_error';
  }

  if (['google_books', 'open_library', 'tavily', 'cover_lookup'].includes(options.source || '')) {
    return 'external_dependency_error';
  }

  return 'internal_error';
}

function getRequestContext() {
  return requestContextStorage.getStore() || null;
}

function appendRequestLogMeta(meta = {}) {
  const context = getRequestContext();
  if (!context) {
    return;
  }

  const sanitized = sanitizeLogMeta(meta);
  Object.entries(sanitized).forEach(([key, value]) => {
    if (key === 'degradedDependencies' && Array.isArray(value)) {
      const merged = new Set([...(context.meta.degradedDependencies || []), ...value]);
      context.meta.degradedDependencies = Array.from(merged);
      return;
    }

    context.meta[key] = value;
  });
}

function addDegradedDependency(dependency) {
  const context = getRequestContext();
  if (!context || !dependency) {
    return;
  }

  const nextDependencies = new Set([...(context.meta.degradedDependencies || []), dependency]);
  context.meta.degraded = true;
  context.meta.degradedDependencies = Array.from(nextDependencies);
}

function getLogMethod(level) {
  return level === 'error' ? console.error : (level === 'warn' ? console.warn : console.log);
}

function logEvent(level, event, meta = {}) {
  const context = getRequestContext();
  const payload = sanitizeLogMeta({
    event,
    requestId: context?.requestId,
    ...meta,
  });
  getLogMethod(level)(`[api] ${JSON.stringify(payload)}`);
}

function getRequestRouteLabel(request) {
  const routePath = request.route?.path;
  if (routePath) {
    return `${request.baseUrl || ''}${routePath}`;
  }
  return request.path || String(request.originalUrl || '').split('?')[0];
}

function summarizeGenerateInput(input) {
  const sourceKind = input?.sourceKind === 'upload' ? 'upload' : 'catalog';
  return {
    sourceKind,
    hasAuthor: Boolean(String(input?.author || '').trim()),
    contentLength: sourceKind === 'upload' ? String(input?.content || '').length : 0,
  };
}

app.use(express.json({ limit: '2mb' }));
app.use((request, response, next) => {
  const requestId = buildRequestId();
  const startedAt = Date.now();
  const context = {
    requestId,
    meta: {},
  };

  response.setHeader(REQUEST_ID_HEADER, requestId);
  response.on('finish', () => {
    const requestMeta = {
      requestId,
      method: request.method,
      route: getRequestRouteLabel(request),
      status: response.statusCode,
      durationMs: Date.now() - startedAt,
      ...context.meta,
    };

    if (!requestMeta.outcome) {
      requestMeta.outcome = response.statusCode >= 400 ? 'error' : 'success';
    }
    if (!requestMeta.errorType && response.statusCode >= 400 && response.statusCode < 500) {
      requestMeta.errorType = 'user_input_error';
    }
    if (!requestMeta.errorType && response.statusCode >= 500) {
      requestMeta.errorType = 'internal_error';
    }

    const level = response.statusCode >= 500
      ? 'error'
      : ((requestMeta.degraded || requestMeta.errorType || response.statusCode >= 400) ? 'warn' : 'log');

    logEvent(level, 'request_completed', requestMeta);
  });

  requestContextStorage.run(context, next);
});

const libraryMaps = [
  {
    id: '1',
    title: 'The Book of Elon',
    author: 'Walter Isaacson',
    aliases: ['The Book of Elon', 'Elon Musk', '马斯克传', '书 of Elon'],
    cover: 'https://images.unsplash.com/photo-1617791160505-6f00504e3519?q=80&w=800&auto=format&fit=crop',
    oneLiner: {
      zh: '把马斯克的世界观、方法论与文明野心拆成一张可浏览的阅读地图。',
      en: 'A map of Musk’s worldview, operating methods, and civilizational ambition.',
    },
    saves: 12450,
    status: 'has_map',
    visibility: 'public',
    sourceMeta: {
      kind: 'library',
      mode: 'source-grounded',
      summary: '来自项目内已整理样本，适合拿来对标阅读深度与页面结构。',
    },
  },
  {
    id: '2',
    title: '定位 (Positioning)',
    author: 'Al Ries, Jack Trout',
    aliases: ['定位', 'Positioning', '品牌定位', 'Al Ries', 'Jack Trout'],
    cover: 'https://images.unsplash.com/photo-1557804506-669a67965ba0?q=80&w=800&auto=format&fit=crop',
    oneLiner: {
      zh: '品牌不是把自己讲完整，而是先在用户心智里抢到一个清楚的位置。',
      en: 'Brands win by owning a clear slot in the customer’s mind.',
    },
    saves: 8920,
    status: 'has_map',
    visibility: 'public',
    sourceMeta: {
      kind: 'library',
      mode: 'source-grounded',
      summary: '来自项目内已整理样本，适合验证方法论书的地图结构。',
    },
  },
];

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s'"“”‘’.,:;!?()[\]{}\-_/]+/g, '');
}

function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[\s/,:;!?()[\]{}"'“”‘’.\-]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractGroundingKeywords(value) {
  return String(value || '')
    .split(/[《》:：,，、\/\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
}

function toSlug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function splitParagraphs(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter((item) => item.length > 20);
}

function hasKnownAuthor(value) {
  const author = String(value || '').trim();
  return Boolean(author) && author !== '待补充作者' && author !== 'Unknown' && author !== '作者待识别';
}

function dedupeBooks(books) {
  const seen = new Set();
  return books.filter((book) => {
    const key = `${normalize(book.title)}::${normalize(book.author)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function getLibraryLookupFields(book) {
  return [book.title, ...(book.aliases || [])]
    .map((value) => normalize(value))
    .filter(Boolean);
}

function scoreLibraryBook(book, query) {
  const normalizedQuery = normalize(query);
  const fields = getLibraryLookupFields(book);

  if (!normalizedQuery || fields.length === 0) {
    return 0;
  }

  let score = 0;
  let strongMatch = false;
  fields.forEach((field) => {
    if (field === normalizedQuery) {
      strongMatch = true;
      score = Math.max(score, 320);
    } else if (field.startsWith(normalizedQuery) || normalizedQuery.startsWith(field)) {
      strongMatch = true;
      score = Math.max(score, 220);
    } else if (normalizedQuery.length >= 8 && field.includes(normalizedQuery)) {
      strongMatch = true;
      score = Math.max(score, 140);
    }
  });

  if (!strongMatch) {
    return 0;
  }

  tokenize(query).forEach((token) => {
    const normalizedToken = normalize(token);
    if (!normalizedToken || normalizedToken.length < 3) {
      return;
    }
    fields.forEach((field) => {
      if (field.includes(normalizedToken)) {
        score += 10;
      }
    });
  });

  return score;
}

function searchLocalLibrary(query) {
  const trimmed = String(query || '').trim();
  if (!trimmed) {
    return libraryMaps;
  }

  return libraryMaps
    .map((book) => ({ book, score: scoreLibraryBook(book, trimmed) }))
    .filter((item) => item.score >= 180)
    .sort((a, b) => b.score - a.score)
    .map(({ book }) => book);
}

function scoreCandidateTitleMatch(query, title) {
  const normalizedQuery = normalize(query);
  const normalizedTitle = normalize(title);

  if (!normalizedQuery || !normalizedTitle) {
    return 0;
  }

  if (normalizedQuery === normalizedTitle) {
    return 320;
  }

  if (normalizedTitle.startsWith(normalizedQuery) || normalizedQuery.startsWith(normalizedTitle)) {
    return 220;
  }

  if (normalizedQuery.length >= 8 && normalizedTitle.includes(normalizedQuery)) {
    return 140;
  }

  return 0;
}

function findStrongLocalBookByTitle(title) {
  const normalizedTitle = normalize(title);
  if (!normalizedTitle) {
    return null;
  }

  return libraryMaps.find((book) => getLibraryLookupFields(book).includes(normalizedTitle)) || null;
}

function getGenerationBudgetMs(input) {
  return input?.sourceKind === 'upload' ? UPLOAD_GENERATION_BUDGET_MS : CATALOG_GENERATION_BUDGET_MS;
}

function getRemainingTimeMs(deadline) {
  return Math.max(0, deadline - Date.now());
}

function capStageTimeout(deadline, desiredTimeoutMs, floorMs = MIN_STAGE_BUDGET_MS) {
  const remaining = getRemainingTimeMs(deadline);
  if (remaining < floorMs) {
    return 0;
  }

  return Math.max(floorMs, Math.min(desiredTimeoutMs, remaining));
}

function cleanupShareStore(now = Date.now()) {
  for (const [shareId, entry] of shareStore.entries()) {
    if (!entry || typeof entry.expiresAt !== 'number' || entry.expiresAt <= now) {
      shareStore.delete(shareId);
    }
  }

  while (shareStore.size > SHARE_STORE_LIMIT) {
    const oldestShareId = shareStore.keys().next().value;
    if (!oldestShareId) {
      break;
    }
    shareStore.delete(oldestShareId);
  }
}

function buildPrototypeMap(input) {
  const title = input.title || '未命名书稿';
  const paragraphs = splitParagraphs(input.content);
  const excerpt = paragraphs.slice(0, 4);
  const aboutText =
    excerpt.length > 0
      ? excerpt.join(' ').slice(0, 240)
      : `这张阅读地图围绕《${title}》的核心问题、结构展开、关键判断与阅读路线进行整理，帮助先抓骨架，再进入细节。`;
  const titleSlug = toSlug(title) || `generated-${Date.now()}`;

  return {
    id: `generated-${titleSlug}-${Date.now()}`,
    title,
    author: input.author || (input.sourceKind === 'upload' ? '上传文件' : ''),
    cover: fallbackCover,
    aliases: [title],
    oneLiner: {
      zh: `把《${title}》的核心问题、结构展开与关键判断压成一张可浏览的阅读地图。`,
      en: `A reading map for ${title}.`,
    },
    about: {
      zh: aboutText,
      en: aboutText,
    },
    stats: {
      structure: 4,
      volume: Math.min(Math.max(Math.ceil(String(input.content || '').length / 900), 80), 480),
    },
    readingPosition: {
      zh: '先看总览与核心模块，再回到关键章节、方法卡和阅读路线，对照原书理解整本书的推进逻辑。',
    },
    overview: {
      title: '先抓全书骨架，再进入关键细节',
      subtitle: '从核心问题、结构展开、判断工具和阅读路线四层进入这本书。',
      cards: [
        {
          layer: '第一层',
          title: '这本书到底在处理什么问题',
          desc: excerpt[0] || `先围绕《${title}》的核心命题建立阅读入口，避免一上来就掉进细节。`,
          points: ['主问题', '核心判断', '阅读价值'],
          color: 'from-orange-500 to-amber-500',
        },
        {
          layer: '第二层',
          title: '作者主要用什么结构展开',
          desc: excerpt[1] || '把章节重新压缩成模块，让阅读先看到骨架再进细节。',
          points: ['背景铺垫', '结构骨架', '关键转折'],
          color: 'from-sky-500 to-cyan-500',
        },
        {
          layer: '第三层',
          title: '读完真正该带走什么',
          desc: excerpt[2] || '把原文里可复用的判断、方法和提醒收成携带型结构。',
          points: ['判断标准', '方法提炼', '行动抓手'],
          color: 'from-emerald-500 to-teal-500',
        },
        {
          layer: '第四层',
          title: '不同读者该怎么读',
          desc: excerpt[3] || '不是每个人都要完整读完，所以地图要给不同阅读路径。',
          points: ['速读路线', '工作路线', '深读路线'],
          color: 'from-fuchsia-500 to-pink-500',
        },
      ],
    },
    knowledgeMap: {
      areas: [
        { title: '核心命题', status: '已抽取', progress: 86, color: 'bg-orange-500', desc: '先看作者究竟要解决什么问题。' },
        { title: '结构骨架', status: '已抽取', progress: 72, color: 'bg-cyan-500', desc: '把章节内容压成更适合浏览的模块。' },
        { title: '方法与工具', status: '已整理', progress: 58, color: 'bg-emerald-500', desc: '把能迁移到工作与思考里的判断动作先捞出来。' },
        { title: '今天再读的价值', status: '已整理', progress: 44, color: 'bg-pink-500', desc: '把这本书今天仍值得带走的部分收成可用的阅读抓手。' },
      ],
      tools: [
        { title: '先看问题，不急着看目录', desc: '先回答“这本书在解决什么”。', points: ['看命题', '看结构', '看方法'] },
        { title: '把章节压成模块', desc: '模块化后，阅读地图才不会变成目录复述。', points: ['先抽主题', '再压层次', '最后定阅读路线'] },
      ],
    },
    parts: [
      {
        id: 'part-1',
        title: '问题定义',
        subtitle: '第一部分',
        navDesc: '先判断这本书要解决的核心问题。',
        intro: excerpt[0] || '第一部分用于建立进入这本书的基本语境。',
        tags: ['先看命题', '适合快速判断值不值得读'],
        task: '搞清楚作者真正的主问题。',
        takeaways: ['别急着记结论，先抓问题定义。'],
        chapters: ['背景', '命题', '切入角度'],
        position: '这是所有后续内容的入口。',
      },
      {
        id: 'part-2',
        title: '结构展开',
        subtitle: '第二部分',
        navDesc: '把原始章节压成更容易浏览的中层结构。',
        intro: excerpt[1] || '这一部分回答作者如何一步步展开论证。',
        tags: ['适合扫骨架', '适合快速浏览'],
        task: '理解全书结构不是目录，而是推进路径。',
        takeaways: ['先看模块关系，再决定要不要精读。'],
        chapters: ['模块 A', '模块 B', '模块 C'],
        position: '它决定你怎么读这本书更省时间。',
      },
      {
        id: 'part-3',
        title: '方法提炼',
        subtitle: '第三部分',
        navDesc: '把可复用的方法和判断从文本里捞出来。',
        intro: excerpt[2] || '这里不是复述，而是提取对工作和思考有用的方法。',
        tags: ['可复用', '适合做工作素材'],
        task: '提炼值得带走的方法、判断和提醒。',
        takeaways: ['方法要能迁移到别的场景。'],
        chapters: ['判断标准', '方法动作', '常见误区'],
        position: '这是把阅读结果资产化的关键一层。',
      },
      {
        id: 'part-4',
        title: '阅读路线',
        subtitle: '第四部分',
        navDesc: '不同读者不必读同一条路线。',
        intro: excerpt[3] || '最后一层负责把地图变成真正可用的阅读产品。',
        tags: ['速读', '深读', '复盘'],
        task: '把不同阅读目标切成不同路线。',
        takeaways: ['地图不是只有一种读法。'],
        chapters: ['速读路线', '工作路线', '深读路线'],
        position: '它让地图比普通摘要更可用。',
      },
    ],
    methods: {
      categories: ['问题定义', '结构压缩', '方法提炼', '阅读路线'],
      items: [
        { id: '01', category: '问题定义', title: '先问主问题', desc: '每本书都有一个真正的主问题，先抓这个。' },
        { id: '02', category: '结构压缩', title: '章节不等于结构', desc: '要把章节压成少数几个真正有用的模块。' },
        { id: '03', category: '方法提炼', title: '把观点改写成动作', desc: '能迁移的内容，才适合变成地图资产。' },
        { id: '04', category: '阅读路线', title: '给不同用户不同读法', desc: '速读、工作、深读的入口要明确分开。' },
      ],
    },
    timeline: [
      { year: '第一步', title: '先读命题', desc: '先确认这本书在处理什么问题。' },
      { year: '第二步', title: '再看结构', desc: '把全书压成几个真正有用的核心模块。' },
      { year: '第三步', title: '提炼判断', desc: '把能迁移到工作和思考中的方法先拿出来。' },
      { year: '第四步', title: '选择读法', desc: '根据目标在速读、工作和深读之间选择路线。' },
    ],
    quotes: [{ quote: `《${title}》真正值得看的，不只是结论，而是作者如何组织问题、展开结构并提出判断。`, note: '先抓问题和结构，再决定要深读哪些章节。' }],
    debates: [{ title: '这本书最值得先抓住什么', value: '先抓核心命题、结构推进和可迁移的方法卡，再进入细节。', reservation: '如果要做更细的章节级阅读，仍需要回到原书逐章对照。' }],
    routes: [
      { audience: '先快速判断值不值得读的人', route: '先看总览、知识地图、阅读路线。', focus: ['主问题', '四层结构', '速读入口'] },
      { audience: '要拿来工作的用户', route: '重点看方法提炼和 debate。', focus: ['方法卡', '适用边界', '行动抓手'] },
    ],
    saves: 0,
    status: 'has_map',
    visibility: 'private',
    sourceMeta: {
      kind: input.sourceKind === 'upload' ? 'upload' : 'generated',
      mode: 'prototype-fallback',
      summary: input.sourceKind === 'upload'
        ? '围绕文本中的核心问题、结构线索和关键判断整理出的阅读地图。'
        : '围绕书名与公开书目信息整理出的阅读入口，帮助先抓骨架，再进入细节。',
    },
  };
}

function buildConfigStatus() {
  return {
    siliconflowConfigured: Boolean(SILICONFLOW_API_KEY),
    tavilyConfigured: Boolean(TAVILY_API_KEY),
    allowPrototypeFallback: ALLOW_PROTOTYPE_FALLBACK,
    nodeEnv: NODE_ENV,
  };
}

function hasConfiguredValue(value) {
  return Boolean(String(value || '').trim());
}

function isValidHttpUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function summarizeUrl(value) {
  try {
    return new URL(String(value || '')).host || null;
  } catch {
    return null;
  }
}

function getConfiguredProvider() {
  const config = buildConfigStatus();
  return config.siliconflowConfigured
    ? 'siliconflow'
    : (config.allowPrototypeFallback ? 'prototype-fallback' : 'unconfigured');
}

function buildServiceDiagnostics() {
  const config = buildConfigStatus();
  const siliconflowBaseUrlConfigured = isValidHttpUrl(SILICONFLOW_BASE_URL);
  const googleBooksConfigured = isValidHttpUrl(GOOGLE_BOOKS_BASE_URL);
  const openLibraryConfigured = isValidHttpUrl(OPEN_LIBRARY_BASE_URL);
  const modelConfigured = hasConfiguredValue(SILICONFLOW_MODEL);
  const compactModelConfigured = hasConfiguredValue(SILICONFLOW_COMPACT_MODEL);
  const polishModelConfigured = hasConfiguredValue(SILICONFLOW_POLISH_MODEL);
  const formalGenerationReady =
    config.siliconflowConfigured &&
    siliconflowBaseUrlConfigured &&
    modelConfigured &&
    compactModelConfigured &&
    polishModelConfigured;

  const degradedReasons = [];
  const issues = [];
  let status = 'ready';

  if (!formalGenerationReady) {
    status = 'unconfigured';
    issues.push('formal_generation_unavailable');
    if (!config.siliconflowConfigured) {
      issues.push('siliconflow_key_missing');
    }
    if (!siliconflowBaseUrlConfigured) {
      issues.push('siliconflow_base_url_invalid');
    }
    if (!modelConfigured || !compactModelConfigured || !polishModelConfigured) {
      issues.push('siliconflow_model_config_incomplete');
    }
  } else {
    if (!config.tavilyConfigured) {
      degradedReasons.push('tavily_unconfigured');
    }
    if (!googleBooksConfigured) {
      degradedReasons.push('google_books_base_url_invalid');
    }
    if (!openLibraryConfigured) {
      degradedReasons.push('open_library_base_url_invalid');
    }
    if (degradedReasons.length > 0) {
      status = 'degraded';
    }
  }

  const provider = getConfiguredProvider();

  return {
    live: true,
    ready: formalGenerationReady,
    status,
    provider,
    dependencies: {
      siliconflow: {
        configured: config.siliconflowConfigured,
        formalGenerationReady,
        baseUrlConfigured: siliconflowBaseUrlConfigured,
        baseUrlHost: summarizeUrl(SILICONFLOW_BASE_URL),
        modelConfigured,
        compactModelConfigured,
        polishModelConfigured,
      },
      tavily: {
        configured: config.tavilyConfigured,
        requiredForFormalGeneration: false,
        impact: 'grounding',
      },
      googleBooks: {
        configured: googleBooksConfigured,
        baseUrlHost: summarizeUrl(GOOGLE_BOOKS_BASE_URL),
        impact: 'search_and_cover_metadata',
      },
      openLibrary: {
        configured: openLibraryConfigured,
        baseUrlHost: summarizeUrl(OPEN_LIBRARY_BASE_URL),
        impact: 'search_metadata',
      },
      prototypeFallback: {
        enabled: config.allowPrototypeFallback,
      },
    },
    checks: {
      live: {
        ok: true,
        state: 'live',
        summary: 'Express process is serving requests.',
      },
      ready: {
        ok: formalGenerationReady,
        state: formalGenerationReady ? 'ready' : 'unconfigured',
        summary: formalGenerationReady
          ? 'SiliconFlow formal generation path is configured.'
          : 'Formal generation path is not fully configured.',
      },
      tavily: {
        ok: config.tavilyConfigured,
        state: config.tavilyConfigured ? 'ready' : 'degraded',
        summary: config.tavilyConfigured
          ? 'Grounding enhancement is configured.'
          : 'Grounding enhancement is unavailable; generation can still run without it.',
      },
      searchMetadata: {
        ok: googleBooksConfigured && openLibraryConfigured,
        state: googleBooksConfigured && openLibraryConfigured ? 'ready' : 'degraded',
        summary: googleBooksConfigured && openLibraryConfigured
          ? 'External catalog metadata sources are configured.'
          : 'One or more catalog metadata sources are unavailable or invalid.',
      },
    },
    diagnostics: {
      nodeEnv: NODE_ENV,
      port: PORT,
      provider,
      model: SILICONFLOW_MODEL,
      compactModel: SILICONFLOW_COMPACT_MODEL,
      allowPrototypeFallback: config.allowPrototypeFallback,
      degradedReasons,
      issues,
    },
  };
}

function buildHealthPayload() {
  const config = buildConfigStatus();
  const diagnostics = buildServiceDiagnostics();
  return {
    ok: true,
    live: diagnostics.live,
    ready: diagnostics.ready,
    status: diagnostics.status,
    provider: diagnostics.provider,
    model: SILICONFLOW_MODEL,
    tavily: config.tavilyConfigured,
    config,
    checks: diagnostics.checks,
    dependencies: diagnostics.dependencies,
    diagnostics: diagnostics.diagnostics,
  };
}

function buildReadyPayload() {
  const config = buildConfigStatus();
  const diagnostics = buildServiceDiagnostics();
  return {
    ok: diagnostics.ready,
    live: diagnostics.live,
    ready: diagnostics.ready,
    status: diagnostics.status,
    provider: diagnostics.provider,
    model: SILICONFLOW_MODEL,
    tavily: config.tavilyConfigured,
    config,
    checks: diagnostics.checks,
    dependencies: diagnostics.dependencies,
    diagnostics: diagnostics.diagnostics,
  };
}

function isUploadSource(input) {
  return input?.sourceKind === 'upload' && trimText(input?.content).length > 0;
}

function getSourceStrategy(input) {
  return isUploadSource(input) ? 'upload' : 'catalog';
}

function getSourceMode(input) {
  return isUploadSource(input) ? 'source-grounded' : 'title-only';
}

function buildPromptStrategyNotes(input, section = 'general') {
  const strategy = getSourceStrategy(input);
  if (strategy === 'upload') {
    const shared = [
      '这是 upload 模式：优先依据上传正文，不要用书名常识替代正文证据。',
      '如果正文没有支撑，就保守表达，不要写成确定事实。',
      '方法卡必须尽量来自正文里的判断动作、章节推进或作者反复强调的结构。',
      'quotes 只能写正文短句或明确标注为“关键判断”，不要伪装成原书逐字金句。',
    ];
    const catalogLikeRoute = '阅读路线必须基于正文结构安排“先读哪里、再读哪里”，不要写成泛泛的使用说明。';
    const sectionNotes = {
      analysis: [
        '先抽正文里的结构层次、关键概念和论证推进，再用补充线索校正作者与书目事实。',
        '不要把补充线索里的目录或评价直接当成正文结构。',
      ],
      meta: [
        '入口层要回答“正文真正推进的主命题是什么”，不是普通内容简介。',
        'overview 的递进关系要贴着正文推进顺序。',
      ],
      knowledge: [
        'knowledgeMap 优先抽正文里的问题块、概念块、方法块，不要假装拥有额外章外知识。',
      ],
      parts: [
        'parts 要像正文结构压缩后的阅读模块，而不是目录复述。',
        '每个模块都要解释它在正文推进中承担什么任务。',
      ],
      methods: [
        'methods 必须来自正文中可迁移的判断、动作或识别框架，少写概念标签。',
      ],
      synthesis: [
        'quotes 可以是正文短句，也可以是“关键判断”，但 note 里要说明它为什么重要。',
        'debates 要优先围绕正文里的适用边界、反例和保留看。',
        catalogLikeRoute,
      ],
      enrichment: [
        '补强时优先补正文结构深度、方法迁移和按章节推进的阅读路线。',
        catalogLikeRoute,
      ],
      polish: [
        '如果当前 quote 不能确认是正文短句，就改写成“关键判断”口径，不要装成原句。',
        '优先修复正文利用不足、弱方法卡和弱阅读路线。',
      ],
    };
    return [...shared, ...(sectionNotes[section] || [])].join('\n');
  }

  const shared = [
    '这是 catalog 模式：只能基于 grounding 和公开资料生成，不要伪装拥有原书全文。',
    '不确定的信息必须保守表达，不要写成章节级实锤细节。',
    '不要把“可能是作者观点”写成“书中逐字原句”。',
    '阅读路线要更像“如何进入这本书”，不是“如何直接应用这套理论”。',
  ];
  const sectionNotes = {
    analysis: [
      '先整理公开资料里稳定可确认的主题、结构线索、适用边界和误读风险。',
      '如果来源不足，宁可写得克制，也不要补出像读过原书一样的细节。',
    ],
    meta: [
      '入口层重点是“这本书大概率在处理什么问题、读时该警惕什么不确定性”。',
    ],
    knowledge: [
      'knowledgeMap 应更像主题块、争议块和阅读框架，不要伪造章节级深描。',
    ],
    parts: [
      'parts 更像阅读模块和理解切口，而不是假装还原作者的真实章节结构。',
    ],
    methods: [
      'methods 只能提炼公开资料可支撑的阅读框架、识别角度和判断动作。',
    ],
    synthesis: [
      'quotes 一律按“关键判断/高概率核心表达”处理，不要写成原书摘录口吻。',
      'debates 要优先写公开争议、适用边界和误读风险。',
      'routes 必须回答“先看什么、再看什么、为什么这样读”。',
    ],
    enrichment: [
      '补强时优先补阅读入口、边界提醒和争议点，不要硬补章回细节。',
    ],
    polish: [
      '如果 quote 看起来像原句但没有原文支撑，必须降级成“关键判断”表达。',
      '优先修复伪原句、空泛标题和过度应用化的 routes。',
    ],
  };
  return [...shared, ...(sectionNotes[section] || [])].join('\n');
}

function buildSectionFallbackTexts(input, title) {
  const safeTitle = title || input.title || '这本书';
  if (getSourceStrategy(input) === 'upload') {
    return {
      toolDesc: '从正文里反复出现的概念、判断动作和结构推进里抽取阅读抓手。',
      partTitle: `${safeTitle} 的正文推进支点`,
      partNav: '先看正文在这里推进了什么，再决定后面哪些章节值得深读。',
      partTask: '把这部分当作正文结构中的关键拐点来理解。',
      partPosition: '它决定这本书不是零散观点，而是一套如何推进判断的结构。',
      methodCategory: '正文判断',
      methodTitle: '先按正文推进找判断',
      methodDesc: '不要只记结论，先看作者在这一段是如何提出问题、转折和压缩方法的。',
      quotePrefix: '关键判断：',
      debateTitle: '正文里最值得带走的判断，和最该保留看的边界',
      debateValue: `读 ${safeTitle} 时，真正该带走的是它如何用结构推进判断，而不只是某个单点结论。`,
      debateReservation: '如果缺少逐章回看，很多判断仍可能被读成过度简化的口号。',
      routeAudience: '已经有正文、想高效读完的人',
      route: '先看总览和 parts，再顺着正文结构读方法卡和 routes。',
      routeFocus: ['正文主命题', '章节推进', '方法提炼'],
    };
  }

  return {
    toolDesc: '基于公开资料整理主题线索、适用边界和阅读入口，不伪装成完整原文解析。',
    partTitle: `先用一个阅读切口进入 ${safeTitle}`,
    partNav: '先看这部分为什么值得读，而不是假装已经掌握原书全部章节细节。',
    partTask: '把公开资料里较稳定的主题线索压成一个可进入的阅读模块。',
    partPosition: '它帮助读者先建立理解框架，再决定是否回到原书深读。',
    methodCategory: '阅读框架',
    methodTitle: '先确认公开线索能支撑什么',
    methodDesc: '在没有原文时，先分清哪些判断来自公开资料，哪些只是高概率推断。',
    quotePrefix: '关键判断：',
    debateTitle: '公开资料能帮助进入这本书，但不能替代原书细读',
    debateValue: `读 ${safeTitle} 时，公开线索足够帮助判断主题、价值和入口。`,
    debateReservation: '但很多章节推进、论证顺序和语气细节，仍需要回到原书确认。',
    routeAudience: '还没读原书、先判断值不值得读的人',
    route: '先看总览、争议和阅读路线，再决定要不要回原书补正文。',
    routeFocus: ['主题入口', '适用边界', '误读风险'],
  };
}

function buildFallbackKnowledgeMap(input, title) {
  const safeTitle = title || input.title || '这本书';
  if (getSourceStrategy(input) === 'upload') {
    return {
      areas: [
        { title: '主命题', status: '已抽取', progress: 84, color: 'bg-orange-500', desc: `先抓 ${safeTitle} 在正文里真正反复推进的核心问题。` },
        { title: '结构推进', status: '已抽取', progress: 76, color: 'bg-cyan-500', desc: '把章节压成推进链，而不是停留在目录层。' },
        { title: '判断动作', status: '已整理', progress: 68, color: 'bg-emerald-500', desc: '从正文里提炼可迁移的识别动作和判断标准。' },
        { title: '适用边界', status: '已整理', progress: 58, color: 'bg-pink-500', desc: '把哪些地方要保留看、不能直接套用收进地图。' },
      ],
      tools: [
        { title: '先找正文的主问题', desc: `先看 ${safeTitle} 在解决什么，而不是先记结论。`, points: ['主问题', '判断入口', '阅读价值'] },
        { title: '把章节压成推进链', desc: '观察作者如何从背景、论证到方法一步步推进。', points: ['结构转折', '论证顺序', '重点回看'] },
        { title: '把观点改写成动作', desc: '把正文里的高频判断改成可以迁移的识别动作。', points: ['识别条件', '判断动作', '应用边界'] },
        { title: '先读路线后读细节', desc: '先用地图决定阅读顺序，再回到原书精读关键段落。', points: ['先总览', '再模块', '后精读'] },
      ],
    };
  }

  return {
    areas: [
      { title: '主题入口', status: '已整理', progress: 80, color: 'bg-orange-500', desc: `先回答 ${safeTitle} 大概率在处理什么问题。` },
      { title: '公开结构线索', status: '已整理', progress: 64, color: 'bg-cyan-500', desc: '只整理公开资料能稳定支撑的结构线索。' },
      { title: '阅读判断框架', status: '已整理', progress: 56, color: 'bg-emerald-500', desc: '给读者一个进入这本书的阅读框架，而不是假装已经完成精读。' },
      { title: '误读风险', status: '待校准', progress: 42, color: 'bg-pink-500', desc: '把这本书最容易被过度简化或误用的地方先指出来。' },
    ],
    tools: [
      { title: '先确认公开线索', desc: '先看哪些观点能被公开资料稳定支持。', points: ['来源可信度', '稳定主题', '不确定信息'] },
      { title: '把主题压成阅读切口', desc: '不要假装还原全书结构，先压成可进入的理解框架。', points: ['进入问题', '阅读切口', '预期收益'] },
      { title: '先看边界再看结论', desc: '争议和保留看能避免把一本书读成单向口号。', points: ['适用边界', '常见误读', '保留看'] },
      { title: '让路线服务于是否深读', desc: '阅读路线先帮助判断值不值得读，再决定如何深读。', points: ['先总览', '再争议', '后回原书'] },
    ],
  };
}

function buildFallbackQuotes(input, title) {
  const safeTitle = title || input.title || '这本书';
  if (getSourceStrategy(input) === 'upload') {
    return [
      { quote: `关键判断：读 ${safeTitle} 时，真正该抓的是作者如何推进判断，而不只是最后结论。`, note: '当模型无法确认正文原句时，统一降级成关键判断，避免伪装成摘录。' },
      { quote: '关键判断：先看结构里的转折点，再回到具体段落精读。', note: '阅读地图的价值是先定阅读顺序，再处理细节。' },
      { quote: '关键判断：能迁移的方法，通常藏在作者反复出现的动作和判断里。', note: '这帮助把正文从信息变成可带走的工具。' },
      { quote: '关键判断：任何看起来过于顺滑的结论，都值得回正文确认它是怎样成立的。', note: '提醒读者保留对上下文和论证过程的敏感度。' },
    ];
  }

  return [
    { quote: `关键判断：${safeTitle} 更适合先建立阅读入口，而不是直接替代原书精读。`, note: 'catalog 模式下把 quote 统一处理成关键判断，避免伪原句。' },
    { quote: '关键判断：公开资料足够帮助判断主题，但不足以替代章节级理解。', note: '把来源保守性明确写出来，比假装完整更可信。' },
    { quote: '关键判断：先看这本书解决什么问题，再决定要不要读它的全部细节。', note: '这是书名搜索路径下最稳定的阅读入口。' },
    { quote: '关键判断：争议、边界和误读风险，往往比一句漂亮金句更值得先看。', note: '帮助读者避免把一本书消费成单向口号。' },
  ];
}

function buildFallbackDebates(input, title) {
  const fallbackTexts = buildSectionFallbackTexts(input, title);
  const safeTitle = title || input.title || '这本书';
  if (getSourceStrategy(input) === 'upload') {
    return [
      {
        title: fallbackTexts.debateTitle,
        value: fallbackTexts.debateValue,
        reservation: fallbackTexts.debateReservation,
      },
      {
        title: `正文结构足够清楚时，${safeTitle} 值不值得完整读完`,
        value: '如果正文已经把问题、方法和边界推进得足够清楚，这本书就值得完整走一遍。',
        reservation: '但如果只盯结论不看结构，读完整本也可能只记住几个被压平的口号。',
      },
    ];
  }

  return [
    {
      title: fallbackTexts.debateTitle,
      value: fallbackTexts.debateValue,
      reservation: fallbackTexts.debateReservation,
    },
    {
      title: `在没有原文时，如何避免把 ${safeTitle} 读成“广义正确”`,
      value: '先看公开资料里的主题、争议和阅读入口，仍然可以帮助判断这本书今天是否值得读。',
      reservation: '但不要把这种判断误以为已经等于读懂作者的全部论证和章节安排。',
    },
  ];
}

function buildFallbackRoutes(input, title) {
  const safeTitle = title || input.title || '这本书';
  if (getSourceStrategy(input) === 'upload') {
    return [
      { audience: '先判断整本书骨架的人', route: `先看 ${safeTitle} 的总览和 parts，再回正文核对每个模块的推进关系。`, focus: ['主命题', '结构推进', '模块位置'] },
      { audience: '要提炼工作方法的人', route: '先看 methods 和 debates，再回到支撑这些判断的正文段落。', focus: ['判断动作', '适用边界', '回文验证'] },
      { audience: '准备完整精读的人', route: '先按 routes 确定阅读顺序，再逐章深读最关键的转折段落。', focus: ['阅读顺序', '关键转折', '深读章节'] },
    ];
  }

  return [
    { audience: '先判断值不值得读的人', route: `先看 ${safeTitle} 的总览、争议和 routes，再决定是否回原书。`, focus: ['主题入口', '争议边界', '阅读价值'] },
    { audience: '已经听过这本书但没读过原书的人', route: '先看 knowledgeMap 和 debates，建立阅读框架后再去找原书章节。', focus: ['阅读框架', '误读风险', '回原书点位'] },
    { audience: '想快速进入作者问题意识的人', route: '先抓 oneLiner、about 和 parts，再顺着 routes 决定下一步是速读还是精读。', focus: ['主问题', '理解切口', '下一步读法'] },
  ];
}

function buildFallbackTimeline(input, title) {
  const safeTitle = title || input.title || '这本书';
  if (getSourceStrategy(input) === 'upload') {
    return [
      { year: '第一步', title: '先抓正文主命题', desc: `先判断 ${safeTitle} 在正文里反复推进的到底是什么问题。` },
      { year: '第二步', title: '再看结构推进', desc: '把章节压成推进链，找出作者论证真正发生转折的地方。' },
      { year: '第三步', title: '提炼判断动作', desc: '把重复出现的观察角度、判断动作和方法框架收成可迁移工具。' },
      { year: '第四步', title: '按路线回原文', desc: '根据阅读目标回到最关键的章节和段落，而不是平均用力。' },
    ];
  }

  return [
    { year: '入口', title: '先确认主题线索', desc: `先看公开资料如何描述 ${safeTitle} 的核心问题。` },
    { year: '结构', title: '再整理公开框架', desc: '把能确认的结构线索压成阅读模块，而不是伪造章节推进。' },
    { year: '边界', title: '随后识别争议与误读', desc: '先知道这本书容易被过度简化的地方。' },
    { year: '回原书', title: '最后决定是否深读', desc: '阅读地图帮助判断入口，但最终仍要靠原书验证。' },
  ];
}

function buildFallbackSummary(input, fallbackSections, quoteMode) {
  const segments = [];
  if (getSourceStrategy(input) === 'upload') {
    segments.push('基于上传正文优先生成，并用补充线索校正书目事实。');
  } else {
    segments.push('基于书名与公开 grounding 线索生成，采用保守表达，不伪装成原书全文解析。');
  }
  if (fallbackSections.length > 0) {
    segments.push(`partial-fallback: ${fallbackSections.join(', ')}`);
  }
  if (quoteMode === 'judgment-based') {
    segments.push('quotes=judgment-based');
  }
  if (getSourceStrategy(input) === 'catalog') {
    segments.push('grounding-only');
  }
  return segments.join(' ');
}

function sendGenerationUnavailable(response, detail) {
  response.status(503).json({
    error: '当前无法生成阅读地图。',
    code: 'GENERATION_UNAVAILABLE',
    detail,
    config: buildConfigStatus(),
  });
}

function normalizeGeneratedMap(raw, input) {
  const fallback = buildPrototypeMap(input);
  const fallbackTexts = buildSectionFallbackTexts(input, raw?.title || input.title);
  const fallbackSections = [];
  const sectionOrdinals = ['第一部分', '第二部分', '第三部分', '第四部分', '第五部分', '第六部分'];
  const overviewOrdinals = ['第一层', '第二层', '第三层', '第四层'];
  const normalizedOverview = raw?.overview?.cards?.length >= 4
    ? {
        ...raw.overview,
        title: trimText(raw?.overview?.title) || fallback.overview.title,
        subtitle: trimText(raw?.overview?.subtitle) || fallback.overview.subtitle,
        cards: raw.overview.cards.slice(0, 4).map((card, index) => {
          const fallbackCard = fallback.overview.cards[index];
          const title = trimText(card?.title);
          const desc = trimText(card?.desc);
          const useFallbackCard = isWeakOverviewCard(card);
          if (useFallbackCard) {
            fallbackSections.push('overview');
          }
          return {
            ...(useFallbackCard ? fallbackCard : card),
            layer: overviewOrdinals[index],
            title: useFallbackCard ? fallbackCard.title : title,
            desc: useFallbackCard ? fallbackCard.desc : desc,
            points: Array.isArray(card?.points) && card.points.length >= 3
              ? card.points.map((item) => trimText(item)).filter(Boolean).slice(0, 3)
              : fallbackCard.points,
            color: trimText(card?.color) || fallbackCard.color,
          };
        }),
      }
    : (() => {
        fallbackSections.push('overview');
        return fallback.overview;
      })();
  const normalizedParts = raw?.parts?.length >= 4
    ? raw.parts.slice(0, 6).map((part, index) => {
        const fallbackPart = fallback.parts[index] || fallback.parts[fallback.parts.length - 1];
        const title = trimText(part?.title);
        const useFallbackTitle = !title || isGenericPartTitle(title);
        const navDesc = trimText(part?.navDesc) || trimText(part?.task) || trimText(part?.intro) || fallbackTexts.partNav;
        const intro = trimText(part?.intro) || `${useFallbackTitle ? fallbackTexts.partTitle : title} 不是普通章节概括，而是这本书里值得先读懂的一段结构。`;
        const task = trimText(part?.task) || fallbackTexts.partTask;
        const position = trimText(part?.position) || fallbackTexts.partPosition;
        const takeaways = Array.isArray(part?.takeaways) && part.takeaways.length >= 3
          ? part.takeaways.map((item) => trimText(item)).filter(Boolean).slice(0, 3)
          : [navDesc, task, position].filter(Boolean).slice(0, 3);
        const chapters = Array.isArray(part?.chapters) && part.chapters.length >= 3
          ? part.chapters.map((item) => trimText(item)).filter(Boolean).slice(0, 4)
          : takeaways.slice(0, 3);
        const tags = Array.isArray(part?.tags) && part.tags.length
          ? part.tags.map((item) => trimText(item)).filter(Boolean).slice(0, 3)
          : [useFallbackTitle ? fallbackPart.title : title, trimText(part?.subtitle), chapters[0]].filter(Boolean).slice(0, 3);
        const normalizedPart = {
          ...part,
          id: part?.id || `part-${index + 1}`,
          title: useFallbackTitle ? fallbackPart.title : title,
          subtitle: sectionOrdinals[index] || `第${index + 1}部分`,
          navDesc,
          intro,
          tags,
          task,
          takeaways,
          chapters,
          position,
        };
        if (isWeakPartItem(normalizedPart, input)) {
          fallbackSections.push('parts');
          return {
            ...fallbackPart,
            id: normalizedPart.id,
            subtitle: sectionOrdinals[index] || fallbackPart.subtitle,
          };
        }
        return normalizedPart;
      })
    : (() => {
        fallbackSections.push('parts');
        return fallback.parts;
      })();
  const normalizedKnowledgeMap =
    raw?.knowledgeMap?.areas?.length >= 4 && raw?.knowledgeMap?.tools?.length >= 4
      ? {
          areas: raw.knowledgeMap.areas.slice(0, 6).map((area, index) => ({
            title: trimText(area?.title) || buildFallbackKnowledgeMap(input, raw?.title || input.title).areas[index % 4].title,
            status: trimText(area?.status) || '已整理',
            progress: Number(area?.progress) > 0 ? Math.min(Number(area.progress), 100) : 55 + index * 8,
            color: trimText(area?.color) || ['bg-orange-500', 'bg-cyan-500', 'bg-emerald-500', 'bg-pink-500'][index % 4],
            desc: trimText(area?.desc) || buildFallbackKnowledgeMap(input, raw?.title || input.title).areas[index % 4].desc,
          })),
          tools: raw.knowledgeMap.tools.slice(0, 6).map((tool, index) => {
            const fallbackTool = buildFallbackKnowledgeMap(input, raw?.title || input.title).tools[index % 4];
            return {
              title: trimText(tool?.title) || fallbackTool.title,
              desc: trimText(tool?.desc) || fallbackTool.desc,
              points: Array.isArray(tool?.points) && tool.points.length >= 3
                ? tool.points.map((item) => trimText(item)).filter(Boolean).slice(0, 3)
                : fallbackTool.points,
            };
          }),
        }
      : (() => {
          fallbackSections.push('knowledgeMap');
          return buildFallbackKnowledgeMap(input, raw?.title || input.title);
        })();
  const normalizedTimeline = raw?.timeline?.length >= 4
    ? raw.timeline.slice(0, 6).map((item, index) => ({
        year: trimText(item?.year) || fallback.timeline[index % fallback.timeline.length].year,
        title: trimText(item?.title) || buildFallbackTimeline(input, raw?.title || input.title)[index % 4].title,
        desc: trimText(item?.desc) || buildFallbackTimeline(input, raw?.title || input.title)[index % 4].desc,
      }))
    : (() => {
        fallbackSections.push('timeline');
        return buildFallbackTimeline(input, raw?.title || input.title);
      })();
  let quoteMode = getSourceStrategy(input) === 'catalog' ? 'judgment-based' : null;
  const normalizedQuotes = raw?.quotes?.length >= 2
    ? raw.quotes.slice(0, 8).map((item, index) => {
        const fallbackQuote = buildFallbackQuotes(input, raw?.title || input.title)[index % 4];
        const quote = trimText(item?.quote);
        const note = trimText(item?.note);
        const tooWeak = isWeakQuoteItem(item, input);
        if (tooWeak) {
          fallbackSections.push('quotes');
          quoteMode = 'judgment-based';
          return fallbackQuote;
        }
        if (getSourceStrategy(input) === 'catalog') {
          quoteMode = 'judgment-based';
          return {
            quote: quote.startsWith(fallbackTexts.quotePrefix) ? quote : `${fallbackTexts.quotePrefix}${quote.replace(/^["“”'']+|["“”'']+$/g, '')}`,
            note: note || '基于公开线索提炼的关键判断，不代表原书逐字引文。',
          };
        }
        return {
          quote,
          note: note || '这是从正文主判断里提炼出的阅读抓手，建议回原文核对上下文。',
        };
      })
    : (() => {
        fallbackSections.push('quotes');
        quoteMode = 'judgment-based';
        return buildFallbackQuotes(input, raw?.title || input.title);
      })();
  const normalizedDebates = raw?.debates?.length >= 1
    ? raw.debates.slice(0, 4).map((item, index) => {
      const fallbackDebate = buildFallbackDebates(input, raw?.title || input.title)[index % 2];
      const title = trimText(item?.title) || fallbackDebate.title;
      const value = trimText(item?.value);
      const reservation = trimText(item?.reservation);
        if (value.length < 18 || reservation.length < 18) {
          fallbackSections.push('debates');
          return fallbackDebate;
        }
        return {
          title,
          value,
          reservation,
        };
      })
    : (() => {
        fallbackSections.push('debates');
        return buildFallbackDebates(input, raw?.title || input.title);
      })();
  const normalizedRoutes = raw?.routes?.length >= 2
    ? raw.routes.slice(0, 4).map((item, index) => {
      const fallbackRoute = buildFallbackRoutes(input, raw?.title || input.title)[index % 3];
      const route = trimText(item?.route);
        const focus = Array.isArray(item?.focus) ? item.focus.map((point) => trimText(point)).filter(Boolean).slice(0, 3) : [];
        const audience = trimText(item?.audience) || fallbackRoute.audience;
        const looksTooApplied = /(落地|执行|应用|实操|打法|增长|运营|产品化)/.test(route) && getSourceStrategy(input) === 'catalog';
        if (!route || focus.length < 2 || looksTooApplied) {
          fallbackSections.push('routes');
          return fallbackRoute;
        }
        return {
          audience,
          route,
          focus,
        };
      })
    : (() => {
        fallbackSections.push('routes');
        return buildFallbackRoutes(input, raw?.title || input.title);
      })();
  let normalizedMethods;
  if (raw?.methods?.items?.length >= 4 && raw?.methods?.categories?.length >= 2) {
    const structuralFallbackMethods = extendMethodsFallback({
      ...fallback,
      knowledgeMap: normalizedKnowledgeMap,
      parts: normalizedParts,
    });
    const categories = raw.methods.categories.map((item) => trimText(item)).filter(Boolean).slice(0, 6);
    const safeCategories = categories.length ? categories : structuralFallbackMethods.categories;
    const weakMethodCount = raw.methods.items.filter((item) => isWeakMethodItem(item, input)).length;
    if (raw.methods.items.length < 4 || weakMethodCount > 2) {
      fallbackSections.push('methods');
      normalizedMethods = extendMethodsFallback({
        ...fallback,
        knowledgeMap: normalizedKnowledgeMap,
        parts: normalizedParts,
        methods: raw.methods,
      });
    } else {
      normalizedMethods = {
        categories: safeCategories,
        items: renumberMethodItems(raw.methods.items.slice(0, 16).map((item, index) => {
          const title = trimText(item?.title);
          const desc = trimText(item?.desc);
          const fallbackMethod = structuralFallbackMethods.items[index % 16];
          if (isWeakMethodItem(item, input)) {
            fallbackSections.push('methods');
            return fallbackMethod;
          }
          return {
            id: String(index + 1).padStart(2, '0'),
            category: safeCategories.includes(trimText(item?.category)) ? trimText(item?.category) : safeCategories[0] || fallbackTexts.methodCategory,
            title,
            desc,
          };
        })),
      };
    }
  } else {
    fallbackSections.push('methods');
    normalizedMethods = extendMethodsFallback({
      ...fallback,
      knowledgeMap: normalizedKnowledgeMap,
      parts: normalizedParts,
    });
  }

  const dedupedFallbackSections = [...new Set(fallbackSections)];
  return {
    ...fallback,
    ...raw,
    overview: normalizedOverview,
    knowledgeMap: normalizedKnowledgeMap,
    parts: normalizedParts,
    methods: normalizedMethods,
    timeline: normalizedTimeline,
    quotes: normalizedQuotes,
    debates: normalizedDebates,
    routes: normalizedRoutes,
    id: `generated-${toSlug(raw?.title || input.title || 'map')}-${Date.now()}`,
    title: raw?.title || input.title,
    author: hasKnownAuthor(raw?.author) ? raw.author : (input.author || fallback.author || ''),
    aliases: [raw?.title || input.title].filter(Boolean),
    saves: 0,
    status: 'has_map',
    visibility: 'private',
    sourceMeta: {
      kind: input.sourceKind === 'upload' ? 'upload' : 'generated',
      mode: raw?.sourceMeta?.mode === 'prototype-fallback' ? 'prototype-fallback' : getSourceMode(input),
      summary: raw?.sourceMeta?.mode === 'prototype-fallback'
        ? raw?.sourceMeta?.summary || fallback.sourceMeta.summary
        : buildFallbackSummary(input, dedupedFallbackSections, quoteMode),
    },
  };
}

function buildEnrichmentPrompt(input, groundingContext, analysisBrief, currentMap) {
  return `
你现在要补强一份“阅读地图”，目标不是重写全量 JSON，而是专门补齐当前过薄的区块，让它更接近成熟的阅读地图产品。

规则：
1. 只返回 JSON。
2. 只补这些字段：knowledgeMap、parts、methods、timeline、quotes、debates、routes。
3. 内容要具体，不要空话。
4. 如果是 title-only 模式，可以基于补充线索和常识做高质量概括，但不要假造非常细碎的章节原文。
5. 目标数量：
   - knowledgeMap.areas: 4 到 6 个
   - knowledgeMap.tools: 4 到 6 个
   - parts: 4 到 6 个
   - methods.items: 14 到 18 条
   - timeline: 4 到 6 条
   - quotes: 4 到 6 条
   - debates: 2 到 4 条
   - routes: 3 到 4 条

来源策略：
${buildPromptStrategyNotes(input, 'enrichment')}

书名：${input.title}
作者：${input.author || '待确认'}

${editorialStyleGuide}
${benchmarkDensityGuide}

内容架构草稿：
${analysisBrief || '无'}

补充线索：
${groundingContext || '无'}

当前地图 JSON：
${JSON.stringify(currentMap).slice(0, 12000)}

返回 JSON：
{
  "knowledgeMap": {
    "areas": [
      { "title": "领域", "status": "状态", "progress": 80, "color": "bg-orange-500", "desc": "描述" }
    ],
    "tools": [
      { "title": "工具", "desc": "描述", "points": ["点1", "点2", "点3"] }
    ]
  },
  "parts": [
    {
      "id": "part-1",
      "title": "模块名",
      "subtitle": "第一部分",
      "navDesc": "导航描述",
      "intro": "模块介绍",
      "tags": ["标签1", "标签2"],
      "task": "这一部分的任务",
      "takeaways": ["要点1", "要点2"],
      "chapters": ["章节1", "章节2"],
      "position": "怎么理解它的位置"
    }
  ],
  "methods": {
    "categories": ["分类1", "分类2"],
    "items": [
      { "id": "01", "category": "分类1", "title": "方法名", "desc": "方法描述" }
    ]
  },
  "timeline": [
    { "year": "阶段", "title": "标题", "desc": "描述" }
  ],
  "quotes": [
    { "quote": "关键句或关键判断", "note": "为什么重要" }
  ],
  "debates": [
    { "title": "争议点", "value": "值得带走", "reservation": "需要保留看" }
  ],
  "routes": [
    { "audience": "读者类型", "route": "阅读路线", "focus": ["重点1", "重点2"] }
  ]
}
  `.trim();
}

function renumberMethodItems(items) {
  return items.map((item, index) => ({
    ...item,
    id: String(index + 1).padStart(2, '0'),
  }));
}

function extendMethodsFallback(currentMap) {
  const baseItems = Array.isArray(currentMap?.methods?.items) ? [...currentMap.methods.items] : [];
  const seen = new Set(baseItems.map((item) => normalize(`${item.category}-${item.title}`)));
  const categories = Array.isArray(currentMap?.methods?.categories) ? [...currentMap.methods.categories] : [];

  const pushMethod = (category, title, desc) => {
    const key = normalize(`${category}-${title}`);
    if (!title || seen.has(key) || baseItems.length >= 16) {
      return;
    }
    seen.add(key);
    if (category && !categories.includes(category)) {
      categories.push(category);
    }
    baseItems.push({
      id: String(baseItems.length + 1).padStart(2, '0'),
      category: category || categories[0] || '阅读方法',
      title,
      desc,
    });
  };

  (currentMap?.knowledgeMap?.tools || []).forEach((tool) => {
    pushMethod('判断工具', tool.title, tool.desc);
    (tool.points || []).forEach((point) => {
      pushMethod('判断工具', point, `${tool.title} 的具体观察点，用来把抽象观点落成可操作的判断动作。`);
    });
  });

  (currentMap?.parts || []).forEach((part) => {
    pushMethod('阅读骨架', part.title, part.task || part.navDesc || '把这部分当作理解全书结构的支点。');
    (part.takeaways || []).forEach((takeaway) => {
      pushMethod('阅读骨架', takeaway, `${part.title} 里最值得迁移的一条判断。`);
    });
  });

  return {
    categories: categories.slice(0, 6),
    items: renumberMethodItems(baseItems.slice(0, 16)),
  };
}

const genericPartTitlePattern = /^(背景|导论|结论|总结|问题定义|结构展开|方法提炼|阅读路线|主要内容|核心观点|政策分析|历史背景|总体介绍|基本情况|社会矛盾|治理策略|经济发展|发展阶段|制度分析)(中|的|与|及|：|:)?/;
const genericMethodTitlePattern = /^(方法|策略|框架|路径|机制|判断|分析|观察|治理|平衡|重构|优化|理解)(论|法|性)?$/;
const genericQuotePattern = /(本书|这本书|作者认为|作者指出|演示版|已生成|值得一读|非常重要|需要关注)/;
const possibleOffTopicEntityPattern = /(俄罗斯|格鲁吉亚|乌克兰|欧盟|美国|日本|韩国|苏联|中东|北约)/;

function trimText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isGenericPartTitle(title) {
  const cleaned = trimText(title);
  return cleaned.length < 4 || cleaned.includes('标题') || cleaned.includes('模块') || genericPartTitlePattern.test(cleaned);
}

function isWeakMethodItem(item, input) {
  const title = trimText(item?.title);
  const desc = trimText(item?.desc);
  const looksLikeConceptLabel = /(机制|框架|体系|模型|方法论|策略|思维)/.test(title) && !/(先|再|把|用|别|看|拆|对照|确认|识别|判断|回到|压缩)/.test(title);
  const uploadTooAbstract = getSourceStrategy(input) === 'upload' && !/(正文|章节|段落|判断|动作|线索|结构|证据)/.test(desc);
  const catalogTooAssertive = getSourceStrategy(input) === 'catalog' && /(作者提出|书中指出|本书证明|原书告诉我们)/.test(desc);
  return !title || !desc || title.length < 4 || title.includes('方法') || desc.length < 24 || genericMethodTitlePattern.test(title) || looksLikeConceptLabel || uploadTooAbstract || catalogTooAssertive;
}

function isWeakOverviewCard(card) {
  const title = trimText(card?.title);
  const desc = trimText(card?.desc);
  const points = Array.isArray(card?.points) ? card.points.filter(Boolean) : [];
  return !title || !desc || isGenericPartTitle(title) || desc.length < 26 || points.length < 3;
}

function isWeakPartItem(part, input) {
  const navDesc = trimText(part?.navDesc);
  const task = trimText(part?.task);
  const position = trimText(part?.position);
  const intro = trimText(part?.intro);
  const routeToneMismatch = getSourceStrategy(input) === 'catalog' && /(章节|逐章|原文|正文证明)/.test(`${navDesc} ${task} ${position} ${intro}`);
  return (
    isGenericPartTitle(part?.title) ||
    navDesc.length < 18 ||
    task.length < 18 ||
    position.length < 18 ||
    intro.length < 40 ||
    routeToneMismatch ||
    !Array.isArray(part?.takeaways) || part.takeaways.length < 3 ||
    !Array.isArray(part?.chapters) || part.chapters.length < 3
  );
}

function isWeakQuoteItem(item, input) {
  const quote = trimText(item?.quote);
  const note = trimText(item?.note);
  const looksOriginalButUnsupported = getSourceStrategy(input) === 'catalog' && !quote.startsWith('关键判断：') && !/判断|入口|边界|误读/.test(quote);
  const uploadPseudoQuote = getSourceStrategy(input) === 'upload' && quote.includes('作者认为') && note.length < 16;
  return !quote || quote.length < 8 || quote.length > 46 || quote.includes('关键句') || genericQuotePattern.test(quote) || note.length < 10 || looksOriginalButUnsupported || uploadPseudoQuote;
}

function isWeakRouteItem(item, input) {
  const route = trimText(item?.route);
  const focus = Array.isArray(item?.focus) ? item.focus.filter(Boolean) : [];
  const looksTooApplied = getSourceStrategy(input) === 'catalog' && /(落地|执行|应用|打法|增长|运营|实操)/.test(route);
  return !route || route.length < 16 || focus.length < 2 || looksTooApplied;
}

function isWeakDebateItem(item, input) {
  const value = trimText(item?.value);
  const reservation = trimText(item?.reservation);
  const title = trimText(item?.title);
  const catalogTooSoft = getSourceStrategy(input) === 'catalog' && !/(边界|误读|保留|适用|条件)/.test(`${title} ${reservation}`);
  return value.length < 14 || reservation.length < 14 || !title || catalogTooSoft;
}

function collectQualityIssues(map, input) {
  const issues = [];
  const weakPartTitles = (map?.parts || []).map((item) => item?.title).filter((title) => isGenericPartTitle(title));
  const weakPartCount = (map?.parts || []).filter((item) => isWeakPartItem(item, input)).length;
  const weakMethodCount = (map?.methods?.items || []).filter((item) => isWeakMethodItem(item, input)).length;
  const weakQuoteCount = (map?.quotes || []).filter((item) => isWeakQuoteItem(item, input)).length;
  const weakRouteCount = (map?.routes || []).filter((item) => isWeakRouteItem(item, input)).length;
  const weakDebateCount = (map?.debates || []).filter((item) => isWeakDebateItem(item, input)).length;
  const weakOverviewCount = (map?.overview?.cards || []).filter((card) => isWeakOverviewCard(card)).length;
  const invalidOverviewLayerCount = (map?.overview?.cards || []).filter((card, index) => trimText(card?.layer) !== ['第一层', '第二层', '第三层', '第四层'][index]).length;
  const overviewPlaceholder = /总览标题|总览副标题|标题|副标题/.test(trimText(map?.overview?.title)) || /总览标题|总览副标题|标题|副标题/.test(trimText(map?.overview?.subtitle));
  const weakKnowledgeCount =
    !map?.knowledgeMap?.areas || map.knowledgeMap.areas.length < 4 ||
    !map?.knowledgeMap?.tools || map.knowledgeMap.tools.length < 4
      ? 1
      : (map.knowledgeMap.tools || []).filter((item) => trimText(item?.desc).length < 14).length;

  if (weakOverviewCount > 0 || invalidOverviewLayerCount > 0 || overviewPlaceholder || trimText(map?.oneLiner?.zh).length < 20 || trimText(map?.about?.zh).length < 60) {
    issues.push(`入口层偏弱：一句话结论或 overview 还不够像成熟阅读产品，存在占位或泛标题。overview 弱卡片数 ${weakOverviewCount}。`);
  }
  if (weakKnowledgeCount > 0) {
    issues.push(`知识地图偏弱：关键领域或思维工具不够具体，当前工具数量 ${map?.knowledgeMap?.tools?.length || 0}。`);
  }
  if (weakPartTitles.length > 0 || weakPartCount > 0) {
    issues.push(`模块层偏弱：${weakPartTitles.slice(0, 4).join(' / ') || '存在泛标题'}。需要改成带判断的阅读模块名，并把 navDesc、task、position 写得更像“为什么读这一部分”。`);
  }
  if (!map?.methods?.items || map.methods.items.length < 14 || weakMethodCount > 3) {
    issues.push(`方法卡不足或不够硬：当前 ${map?.methods?.items?.length || 0} 条，其中较弱 ${weakMethodCount} 条。`);
  }
  if (!map?.quotes || map.quotes.length < 5 || weakQuoteCount > 2) {
    issues.push(getSourceStrategy(input) === 'upload'
      ? `关键句不够像正文支撑下的可摘记短句或关键判断：当前 ${map?.quotes?.length || 0} 条，其中较弱 ${weakQuoteCount} 条。`
      : `关键句看起来过于像原书原句或来源不够保守：当前 ${map?.quotes?.length || 0} 条，其中较弱 ${weakQuoteCount} 条。`);
  }
  if (!map?.routes || map.routes.length < 3 || weakRouteCount > 0) {
    issues.push(getSourceStrategy(input) === 'upload'
      ? `阅读路线不够像按正文结构推进的读法：当前 ${map?.routes?.length || 0} 条，其中较弱 ${weakRouteCount} 条。`
      : `阅读路线更像“如何应用理论”而不是“如何进入这本书”：当前 ${map?.routes?.length || 0} 条，其中较弱 ${weakRouteCount} 条。`);
  }
  if (!map?.debates || map.debates.length < 2 || weakDebateCount > 0) {
    issues.push(getSourceStrategy(input) === 'upload'
      ? `争议与边界不够锋利：当前 ${map?.debates?.length || 0} 条，其中较弱 ${weakDebateCount} 条。`
      : `争议与边界不够像公开争议、适用边界和误读风险：当前 ${map?.debates?.length || 0} 条，其中较弱 ${weakDebateCount} 条。`);
  }
  if (getSourceStrategy(input) === 'upload' && trimText(input?.content).length > 4000 && weakPartCount > 1) {
    issues.push('upload 模式下正文结构利用仍偏弱，parts 还不够像章节压缩后的阅读模块。');
  }
  if (getSourceStrategy(input) === 'catalog' && (map?.quotes || []).some((item) => !trimText(item?.quote).startsWith('关键判断：'))) {
    issues.push('catalog 模式下 quotes 仍像原书原句，需要统一收口成关键判断口径。');
  }

  return issues;
}

function textMatchesQuery(text, input) {
  const haystack = normalize(text);
  const keywords = extractGroundingKeywords([input?.title, input?.author].filter(Boolean).join(' ')).map(normalize).filter(Boolean);
  return keywords.some((keyword) => haystack.includes(keyword));
}

function isPossiblyOffTopic(text, input) {
  const cleaned = trimText(text);
  return possibleOffTopicEntityPattern.test(cleaned) && !textMatchesQuery(cleaned, input);
}

function removeOffTopicItems(map, input) {
  return {
    ...map,
    timeline: (map?.timeline || []).filter((item) => !isPossiblyOffTopic(`${item?.title || ''} ${item?.desc || ''}`, input)),
    quotes: (map?.quotes || []).filter((item) => !isPossiblyOffTopic(`${item?.quote || ''} ${item?.note || ''}`, input)),
    debates: (map?.debates || []).filter((item) => !isPossiblyOffTopic(`${item?.title || ''} ${item?.value || ''} ${item?.reservation || ''}`, input)),
  };
}

function buildQualityPolishPrompt(input, groundingContext, analysisBrief, currentMap, issues) {
  return `
你现在是“阅读地图主编”，负责最后一轮审稿和定向重写。

目标：
1. 让结果更接近高质量 reading-map skill，而不是结构化摘要。
2. 只重写薄弱区块，不要把整张地图改散。
3. 标题必须有编辑判断，不要泛泛复述主题。
4. 方法卡必须像可迁移的判断工具。
5. 关键句必须诚实：upload 可以写正文短句或关键判断；catalog 只能写关键判断，不能伪装成原书摘录。
6. 禁止引入与这本书无直接关联的外国案例、书外事件或噪音实体，除非补充线索明确支持。

来源策略：
${buildPromptStrategyNotes(input, 'polish')}

当前审稿意见：
${issues.map((item, index) => `${index + 1}. ${item}`).join('\n')}

请只返回 JSON，允许补这些字段：
{
  "oneLiner": { "zh": "一句话结论" },
  "about": { "zh": "这本书到底在讲什么" },
  "readingPosition": { "zh": "怎么读这本书" },
  "knowledgeMap": {
    "areas": [
      { "title": "领域", "status": "状态", "progress": 80, "color": "bg-orange-500", "desc": "描述" }
    ],
    "tools": [
      { "title": "工具", "desc": "描述", "points": ["点1", "点2", "点3"] }
    ]
  },
  "overview": {
    "title": "总览标题",
    "subtitle": "总览副标题",
    "cards": [
      { "layer": "第一层", "title": "标题", "desc": "描述", "points": ["点1", "点2", "点3"], "color": "from-orange-500 to-amber-500" }
    ]
  },
  "parts": [
    {
      "id": "part-1",
      "title": "模块名",
      "subtitle": "第一部分",
      "navDesc": "导航描述",
      "intro": "模块介绍",
      "tags": ["标签1", "标签2"],
      "task": "这一部分的任务",
      "takeaways": ["要点1", "要点2"],
      "chapters": ["章节1", "章节2"],
      "position": "怎么理解它的位置"
    }
  ],
  "quotes": [
    { "quote": "关键句", "note": "为什么重要" }
  ],
  "debates": [
    { "title": "争议点", "value": "值得带走", "reservation": "需要保留看" }
  ],
  "routes": [
    { "audience": "读者类型", "route": "阅读路线", "focus": ["重点1", "重点2"] }
  ]
}

硬性要求：
- overview.cards 的 layer 固定写“第一层 / 第二层 / 第三层 / 第四层”，真正的判断句写在 title。
- parts 保持 4 到 6 个，但把标题改成更有判断的名字。
- parts.subtitle 固定写“第一部分 / 第二部分 ...”。
- knowledgeMap.tools 至少 4 个，且要更像作者在这本书里真正提供的观察工具。
- quotes 目标 5 到 8 条。upload 可用正文短句；catalog 必须写成“关键判断：...”口径，不要伪装成原书原句。
- routes 保持 3 到 4 条，focus 每条至少 2 个点。
- debates 每条都要写清“为什么今天仍值得带走”和“为什么还要保留看”。
- catalog 的 routes 要更像“如何读这本书”；upload 的 routes 要更像“如何按正文结构读这本书”。

书名：${input.title}
作者：${input.author || 'Unknown'}

${editorialStyleGuide}
${benchmarkDensityGuide}

内容架构草稿：
${analysisBrief || '无'}

补充线索：
${groundingContext || '无'}

当前地图：
${JSON.stringify(currentMap).slice(0, 14000)}
  `.trim();
}

async function polishMapQuality(input, groundingContext, analysisBrief, currentMap) {
  const issues = collectQualityIssues(currentMap, input);
  const possibleNoise = [
    ...(currentMap?.timeline || []).map((item) => `${item?.title || ''} ${item?.desc || ''}`),
    ...(currentMap?.quotes || []).map((item) => `${item?.quote || ''} ${item?.note || ''}`),
  ].filter((item) => isPossiblyOffTopic(item, input));
  if (possibleNoise.length > 0) {
    issues.push(`出现可能不相关的书外案例或实体：${possibleNoise.slice(0, 3).join(' / ')}。请删掉这些噪音。`);
  }
  if (issues.length === 0) {
    return removeOffTopicItems(currentMap, input);
  }

  try {
    const polished = await callSiliconFlow({
      prompt: buildQualityPolishPrompt(input, groundingContext, analysisBrief, currentMap, issues),
      maxTokens: 2200,
      temperature: 0.2,
      model: SILICONFLOW_POLISH_MODEL,
      responseFormat: 'json_object',
    });

    return removeOffTopicItems({
      ...currentMap,
      oneLiner: polished?.oneLiner?.zh ? polished.oneLiner : currentMap.oneLiner,
      about: polished?.about?.zh ? polished.about : currentMap.about,
      readingPosition: polished?.readingPosition?.zh ? polished.readingPosition : currentMap.readingPosition,
      knowledgeMap:
        polished?.knowledgeMap?.areas?.length >= 4 && polished?.knowledgeMap?.tools?.length >= 4
          ? polished.knowledgeMap
          : currentMap.knowledgeMap,
      overview: polished?.overview?.cards?.length >= 4 ? polished.overview : currentMap.overview,
      parts: Array.isArray(polished?.parts) && polished.parts.length >= 4 ? polished.parts : currentMap.parts,
      quotes: Array.isArray(polished?.quotes) && polished.quotes.length >= 4 ? polished.quotes.slice(0, 8) : currentMap.quotes,
      debates: Array.isArray(polished?.debates) && polished.debates.length >= 2 ? polished.debates : currentMap.debates,
      routes: Array.isArray(polished?.routes) && polished.routes.length >= 3 ? polished.routes : currentMap.routes,
    }, input);
  } catch (error) {
    logEvent('warn', 'quality_polish_failed', {
      errorType: classifyError(error, { source: 'siliconflow' }),
      error: summarizeError(error),
    });
    return removeOffTopicItems(currentMap, input);
  }
}

function buildOverviewPolishPrompt(input, groundingContext, analysisBrief, currentMap) {
  return `
你现在只负责重写这本书阅读地图的入口层，不要输出其它字段。

只返回 JSON：
{
  "oneLiner": { "zh": "一句话结论" },
  "about": { "zh": "这本书到底在处理什么问题，真正该带走什么" },
  "readingPosition": { "zh": "最有效的阅读方式" },
  "overview": {
    "title": "总览标题",
    "subtitle": "总览副标题",
    "cards": [
      { "layer": "第一层", "title": "标题", "desc": "描述", "points": ["点1", "点2", "点3"], "color": "from-orange-500 to-amber-500" }
    ]
  }
}

要求：
- oneLiner 要像编辑下判断，优先用“不是 X，而是 Y”“真正要读的不是 A，而是 B”这种压缩句式。
- about 要回答两件事：这本书真正处理什么问题；读者该带走什么，不要写成普通简介。
- readingPosition 要像阅读建议，不重复 about。
- overview.cards 必须恰好 4 张，并且形成递进链，不要四个并列标签。
- 四张卡的 title 优先使用动作性结构，例如“先…… / 再…… / 把…… / 最后……”。
- 每张卡必须有 3 个 points，每个 point 都要短、硬、可带走。

${editorialStyleGuide}

${benchmarkDensityGuide}

书名：${input.title}
作者：${input.author || 'Unknown'}

内容架构草稿：
${analysisBrief || '无'}

补充线索：
${groundingContext || '无'}

当前入口层：
${JSON.stringify({
  oneLiner: currentMap.oneLiner,
  about: currentMap.about,
  readingPosition: currentMap.readingPosition,
  overview: currentMap.overview,
}).slice(0, 10000)}
  `.trim();
}

function buildMethodsBoosterPrompt(input, groundingContext, analysisBrief, currentMap) {
  return `
你现在只负责把 methods 扩写到成熟阅读地图的水平。

只返回 JSON：
{
  "methods": {
    "categories": ["分类1", "分类2", "分类3"],
    "items": [
      { "id": "01", "category": "分类1", "title": "方法名", "desc": "方法描述" }
    ]
  }
}

要求：
- 目标是 16 到 18 条方法卡。
- 不要重复当前已有方法卡。
- 方法卡要像“判断工具、分析动作、识别框架”，不是概念复述。
- 如果当前地图已有不错的方法卡，可以保留并补足。

书名：${input.title}
作者：${input.author || 'Unknown'}

${editorialStyleGuide}
${benchmarkDensityGuide}

内容架构草稿：
${analysisBrief || '无'}

补充线索：
${groundingContext || '无'}

当前地图：
${JSON.stringify({ methods: currentMap.methods, knowledgeMap: currentMap.knowledgeMap, parts: currentMap.parts }).slice(0, 10000)}
  `.trim();
}

function buildPartPolishPrompt(input, groundingContext, analysisBrief, currentMap) {
  return `
你现在只负责重写这本书阅读地图里的 parts，让模块名、导航说明和任务更像成熟阅读产品。

只返回 JSON：
{
  "parts": [
    {
      "id": "part-1",
      "title": "更锋利的模块名",
      "subtitle": "第一部分",
      "navDesc": "导航描述",
      "intro": "模块介绍",
      "tags": ["标签1", "标签2"],
      "task": "这一部分的任务",
      "takeaways": ["要点1", "要点2"],
      "chapters": ["章节1", "章节2"],
      "position": "怎么理解它的位置"
    }
  ]
}

要求：
- 保持 4 到 6 个模块。
- title 必须带判断，不要只是主题名。
- subtitle 固定写“第一部分 / 第二部分 ...”。
- navDesc 要像“这一部分为什么值得读”，不能只是内容摘要。
- task 要像读者在这部分真正要完成的认知动作。
- 可以保留原有 chapters 和大结构，但把表达打磨得更锋利。

书名：${input.title}
作者：${input.author || 'Unknown'}

${editorialStyleGuide}
${benchmarkDensityGuide}

内容架构草稿：
${analysisBrief || '无'}

补充线索：
${groundingContext || '无'}

当前 parts：
${JSON.stringify(currentMap.parts).slice(0, 10000)}
  `.trim();
}

function buildWeakMethodsPolishPrompt(input, groundingContext, analysisBrief, currentMap, weakMethods) {
  return `
你现在只负责重写阅读地图里较弱的 methods 条目，不要输出其它字段。

只返回 JSON：
{
  "methods": {
    "categories": ["分类1", "分类2", "分类3"],
    "items": [
      { "id": "01", "category": "分类1", "title": "更像判断工具的名字", "desc": "更具体的描述" }
    ]
  }
}

要求：
- 只重写这几条较弱的方法卡，但返回时可包含整组 methods.items。
- title 不能像概念标签，要像读者能拿走的判断动作。
- desc 要解释“怎么用”，而不只是“它是什么”。
- 保持 category 结构稳定。

书名：${input.title}
作者：${input.author || 'Unknown'}

${editorialStyleGuide}
${benchmarkDensityGuide}

内容架构草稿：
${analysisBrief || '无'}

补充线索：
${groundingContext || '无'}

当前 methods：
${JSON.stringify(currentMap.methods).slice(0, 10000)}

较弱条目：
${JSON.stringify(weakMethods).slice(0, 4000)}
  `.trim();
}

function buildQuotesBoosterPrompt(input, groundingContext, analysisBrief, currentMap) {
  return `
你现在只负责输出 quotes。

只返回 JSON：
{
  "quotes": [
    { "quote": "关键句", "note": "为什么重要" }
  ]
}

要求：
- 目标是 5 到 8 条。
- 如果补充线索里有“候选原句”，优先直接使用这些短句，并尽量保留原始措辞。
- quote 尽量短、硬、可记忆。
- note 要解释这句为什么是这本书真正的判断，不要空话。

书名：${input.title}
作者：${input.author || 'Unknown'}

${editorialStyleGuide}
${benchmarkDensityGuide}

内容架构草稿：
${analysisBrief || '无'}

补充线索：
${groundingContext || '无'}

当前地图：
${JSON.stringify({ quotes: currentMap.quotes, overview: currentMap.overview, parts: currentMap.parts }).slice(0, 8000)}
  `.trim();
}

async function enrichEditorialDepth(input, groundingContext, analysisBrief, currentMap) {
  let nextMap = { ...currentMap };

  const weakOverviewCount = (nextMap?.overview?.cards || []).filter((card) => isWeakOverviewCard(card)).length;
  const weakPartCount = (nextMap?.parts || []).filter((item) => isWeakPartItem(item, input)).length;

  if (weakOverviewCount > 0 || trimText(nextMap?.oneLiner?.zh).length < 20 || trimText(nextMap?.about?.zh).length < 60) {
    try {
      const polishedOverview = await callSiliconFlow({
        prompt: buildOverviewPolishPrompt(input, groundingContext, analysisBrief, nextMap),
        maxTokens: 1200,
        temperature: 0.2,
        responseFormat: 'json_object',
      });
      nextMap = {
        ...nextMap,
        oneLiner: polishedOverview?.oneLiner?.zh ? polishedOverview.oneLiner : nextMap.oneLiner,
        about: polishedOverview?.about?.zh ? polishedOverview.about : nextMap.about,
        readingPosition: polishedOverview?.readingPosition?.zh ? polishedOverview.readingPosition : nextMap.readingPosition,
        overview: polishedOverview?.overview?.cards?.length === 4 ? polishedOverview.overview : nextMap.overview,
      };
    } catch (error) {
      logEvent('warn', 'overview_polish_failed', {
        errorType: classifyError(error, { source: 'siliconflow' }),
        error: summarizeError(error),
      });
    }
  }

  if (!nextMap?.methods?.items || nextMap.methods.items.length < 14) {
    try {
      const boostedMethods = await callSiliconFlow({
        prompt: buildMethodsBoosterPrompt(input, groundingContext, analysisBrief, nextMap),
        maxTokens: 1400,
        temperature: 0.25,
        responseFormat: 'json_object',
      });

      if (Array.isArray(boostedMethods?.methods?.items) && boostedMethods.methods.items.length) {
        nextMap.methods = {
          categories: boostedMethods.methods.categories || nextMap.methods?.categories || [],
          items: renumberMethodItems(boostedMethods.methods.items.slice(0, 16)),
        };
      }
    } catch (error) {
      logEvent('warn', 'methods_booster_failed', {
        errorType: classifyError(error, { source: 'siliconflow' }),
        error: summarizeError(error),
      });
      nextMap.methods = extendMethodsFallback(nextMap);
    }
  }

  if (!nextMap?.quotes || nextMap.quotes.length < 5) {
    try {
      const boostedQuotes = await callSiliconFlow({
        prompt: buildQuotesBoosterPrompt(input, groundingContext, analysisBrief, nextMap),
        maxTokens: 900,
        temperature: 0.2,
        responseFormat: 'json_object',
      });

      if (Array.isArray(boostedQuotes?.quotes) && boostedQuotes.quotes.length) {
        nextMap.quotes = boostedQuotes.quotes.slice(0, 8);
      }
    } catch (error) {
      logEvent('warn', 'quotes_booster_failed', {
        errorType: classifyError(error, { source: 'siliconflow' }),
        error: summarizeError(error),
      });
    }
  }

  if (weakPartCount > 1) {
    try {
      const polishedParts = await callSiliconFlow({
        prompt: buildPartPolishPrompt(input, groundingContext, analysisBrief, nextMap),
        maxTokens: 1400,
        temperature: 0.2,
        responseFormat: 'json_object',
      });
      if (Array.isArray(polishedParts?.parts) && polishedParts.parts.length >= 4) {
        nextMap.parts = polishedParts.parts;
      }
    } catch (error) {
      logEvent('warn', 'part_polish_failed', {
        errorType: classifyError(error, { source: 'siliconflow' }),
        error: summarizeError(error),
      });
    }
  }

  const weakMethods = (nextMap?.methods?.items || []).filter((item) => isWeakMethodItem(item, input));
  if (weakMethods.length > 2) {
    try {
      const polishedMethods = await callSiliconFlow({
        prompt: buildWeakMethodsPolishPrompt(input, groundingContext, analysisBrief, nextMap, weakMethods.slice(0, 8)),
        maxTokens: 1400,
        temperature: 0.2,
        responseFormat: 'json_object',
      });
      if (Array.isArray(polishedMethods?.methods?.items) && polishedMethods.methods.items.length >= 10) {
        nextMap.methods = {
          categories: polishedMethods.methods.categories || nextMap.methods?.categories || [],
          items: renumberMethodItems(polishedMethods.methods.items.slice(0, 16)),
        };
      }
    } catch (error) {
      logEvent('warn', 'weak_methods_polish_failed', {
        errorType: classifyError(error, { source: 'siliconflow' }),
        error: summarizeError(error),
      });
    }
  }

  return nextMap;
}

async function enrichSparseMap(input, groundingContext, analysisBrief, currentMap, timeoutMs = SPARSE_STAGE_TIMEOUT_MS) {
  const needsEnrichment =
    !currentMap?.knowledgeMap?.tools || currentMap.knowledgeMap.tools.length < 4 ||
    !currentMap?.parts || currentMap.parts.length < 4 ||
    !currentMap?.methods?.items || currentMap.methods.items.length < 12 ||
    !currentMap?.quotes || currentMap.quotes.length < 4 ||
    !currentMap?.routes || currentMap.routes.length < 3;

  if (!needsEnrichment) {
    return currentMap;
  }

  try {
    const enriched = await callSiliconFlow({
      prompt: buildEnrichmentPrompt(input, groundingContext, analysisBrief, currentMap),
      maxTokens: 2200,
      temperature: 0.25,
      responseFormat: 'json_object',
      timeoutMs,
    });

    return {
      ...currentMap,
      knowledgeMap:
        enriched?.knowledgeMap?.areas?.length || enriched?.knowledgeMap?.tools?.length
          ? enriched.knowledgeMap
          : currentMap.knowledgeMap,
      parts: Array.isArray(enriched?.parts) && enriched.parts.length ? enriched.parts : currentMap.parts,
      methods:
        Array.isArray(enriched?.methods?.items) && enriched.methods.items.length
          ? enriched.methods
          : currentMap.methods,
      timeline: Array.isArray(enriched?.timeline) && enriched.timeline.length ? enriched.timeline : currentMap.timeline,
      quotes: Array.isArray(enriched?.quotes) && enriched.quotes.length ? enriched.quotes : currentMap.quotes,
      debates: Array.isArray(enriched?.debates) && enriched.debates.length ? enriched.debates : currentMap.debates,
      routes: Array.isArray(enriched?.routes) && enriched.routes.length ? enriched.routes : currentMap.routes,
    };
  } catch (error) {
    logEvent('warn', 'sparse_map_enrichment_failed', {
      errorType: classifyError(error, { source: 'siliconflow' }),
      error: summarizeError(error),
    });
    return currentMap;
  }
}

function stripCodeFence(text) {
  return String(text || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function deepCleanChineseText(value) {
  if (Array.isArray(value)) {
    return value.map((item) => deepCleanChineseText(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, deepCleanChineseText(item)]));
  }

  return value;
}

function extractStringField(segment, key) {
  const match = String(segment || '').match(new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'i'));
  if (!match) {
    return '';
  }
  return trimText(match[1].replace(/\\"/g, '"'));
}

function extractLooseStringField(segment, key) {
  const strict = extractStringField(segment, key);
  if (strict) {
    return strict;
  }
  const match = String(segment || '').match(new RegExp(`"${key}"\\s*:\\s*"([^"\\n\\r]{2,120})`, 'i'));
  return match ? trimText(match[1]) : '';
}

function sliceKeySegment(text, key, nextKeys = [], aliases = []) {
  const source = String(text || '');
  const candidateKeys = [key, ...aliases].filter(Boolean);
  let keyIndex = -1;
  let matchedKey = '';
  candidateKeys.some((candidateKey) => {
    const index = source.search(new RegExp(`"${candidateKey}"\\s*:`, 'i'));
    if (index !== -1) {
      keyIndex = index;
      matchedKey = candidateKey;
      return true;
    }
    return false;
  });
  if (keyIndex === -1) {
    return '';
  }

  let endIndex = source.length;
  nextKeys.forEach((nextKey) => {
    const nextAliases = Array.isArray(nextKey) ? nextKey : [nextKey];
    nextAliases.forEach((nextAlias) => {
      const candidateIndex = source.slice(keyIndex + matchedKey.length).search(new RegExp(`"${nextAlias}"\\s*:`, 'i'));
      if (candidateIndex !== -1) {
        const absoluteIndex = keyIndex + matchedKey.length + candidateIndex;
        if (absoluteIndex < endIndex) {
          endIndex = absoluteIndex;
        }
      }
    });
  });

  return source.slice(keyIndex, endIndex);
}

function extractLooseStringArray(segment, limit) {
  const normalizedSegment = String(segment || '');
  const isUsefulSeedText = (value) => {
    const cleaned = trimText(String(value || ''))
      .replace(/^[:：,\-_\s"'`]+|[:：,\-_\s"'`]+$/g, '');
    return cleaned.length >= 2 && !/^[,.:;'"`\-\s]+$/.test(cleaned) && !/^(part\d+|title|desc|quote|route|method)$/i.test(cleaned);
  };
  const directMatch = normalizedSegment.match(/\[[\s\S]*\]/);
  if (directMatch) {
    try {
      const parsed = JSON.parse(directMatch[0].replace(/,\s*([}\]])/g, '$1'));
      if (Array.isArray(parsed)) {
        return parsed
          .flatMap((item) => (typeof item === 'string' ? [item] : Object.values(item || {})))
          .map((item) => trimText(item))
          .filter(isUsefulSeedText)
          .slice(0, limit);
      }
    } catch (_error) {
      // fall through to lightweight regex extraction
    }
  }

  const values = [];
  const regex = /"((?:\\.|[^"\\])*)"(?=\s*(?:,|\]|$))/g;
  let match;
  while ((match = regex.exec(normalizedSegment))) {
    const value = trimText(match[1].replace(/\\"/g, '"'));
    if (isUsefulSeedText(value)) {
      values.push(value);
    }
    if (values.length >= limit) {
      break;
    }
  }
  return values;
}

function repairCompactSeedJson(text) {
  const cleaned = stripCodeFence(text)
    .replace(/[\u0000-\u0019]+/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
  const orderedKeys = ['oneLiner', 'about', 'overview', 'parts', 'methods', 'quotes', 'routes'];
  const overviewSegment = sliceKeySegment(cleaned, 'overview', [['parts', 'part'], 'methods', ['quotes', 'quote'], ['routes', 'route']]);
  const partsSegment = sliceKeySegment(cleaned, 'parts', ['methods', ['quotes', 'quote'], ['routes', 'route']], ['part']);
  const methodsSegment = sliceKeySegment(cleaned, 'methods', [['quotes', 'quote'], ['routes', 'route']]);
  const quotesSegment = sliceKeySegment(cleaned, 'quotes', [['routes', 'route']], ['quote']);
  const routesSegment = sliceKeySegment(cleaned, 'routes', [], ['route']);

  const repaired = {
    oneLiner: extractLooseStringField(cleaned, 'oneLiner'),
    about: extractLooseStringField(cleaned, 'about'),
    overview: extractLooseStringArray(overviewSegment, 16).slice(0, 4),
    parts: extractLooseStringArray(partsSegment, 16).slice(0, 4),
    methods: extractLooseStringArray(methodsSegment, 16).slice(0, 4),
    quotes: extractLooseStringArray(quotesSegment, 8).slice(0, 2),
    routes: extractLooseStringArray(routesSegment, 8).slice(0, 2),
  };

  if (repaired.overview.length === 0) {
    repaired.overview = [extractLooseStringField(overviewSegment, 'overview')].filter(Boolean);
  }
  if (repaired.parts.length === 0) {
    repaired.parts = [
      extractLooseStringField(partsSegment, 'parts'),
      extractLooseStringField(partsSegment, 'part'),
    ].filter(Boolean);
  }
  if (repaired.methods.length === 0) {
    repaired.methods = [extractLooseStringField(methodsSegment, 'methods')].filter(Boolean);
  }
  if (repaired.quotes.length === 0) {
    repaired.quotes = [
      extractLooseStringField(quotesSegment, 'quotes'),
      extractLooseStringField(quotesSegment, 'quote'),
    ].filter(Boolean);
  }
  if (repaired.routes.length === 0) {
    repaired.routes = [
      extractLooseStringField(routesSegment, 'routes'),
      extractLooseStringField(routesSegment, 'route'),
    ].filter(Boolean);
  }

  if (!repaired.oneLiner) {
    repaired.oneLiner = repaired.overview[0] || repaired.parts[0] || repaired.methods[0] || '';
  }
  if (!repaired.about) {
    repaired.about = repaired.overview.slice(0, 2).join('，') || repaired.parts.slice(0, 2).join('，');
  }

  const populatedFieldCount = orderedKeys.filter((key) => {
    const value = repaired[key];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  }).length;

  return populatedFieldCount >= 3 ? repaired : null;
}

function extractJsonCandidate(text, repairMode = '') {
  const cleaned = stripCodeFence(text);
  const candidates = [cleaned];
  const objectStart = cleaned.indexOf('{');
  const objectEnd = cleaned.lastIndexOf('}');
  if (objectStart !== -1 && objectEnd !== -1 && objectEnd > objectStart) {
    candidates.push(cleaned.slice(objectStart, objectEnd + 1));
  }

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    try {
      return JSON.parse(candidate);
    } catch (_error) {
      continue;
    }
  }

  const repairedCandidates = candidates.map((candidate) =>
    String(candidate || '')
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/[\u0000-\u0019]+/g, ' ')
      .trim(),
  );

  for (const candidate of repairedCandidates) {
    if (!candidate) {
      continue;
    }
    try {
      return JSON.parse(candidate);
    } catch (_error) {
      continue;
    }
  }

  if (repairMode === 'compact-seed') {
    const repaired = repairCompactSeedJson(cleaned);
    if (repaired) {
      return repaired;
    }
  }

  throw new SyntaxError(`Unable to parse model JSON. Preview: ${cleaned.slice(0, 240)}`);
}

async function callSiliconFlow({
  prompt,
  maxTokens = 5000,
  temperature = 0.35,
  responseFormat = 'json_object',
  model = SILICONFLOW_MODEL,
  timeoutMs = SILICONFLOW_TIMEOUT_MS,
  jsonRepairMode = '',
}) {
  const supportsThinkingToggle = /^(Qwen\/Qwen3|tencent\/Hunyuan-A13B-Instruct|deepseek-ai\/DeepSeek-V3\.(1|2)|zai-org\/GLM-(5V-Turbo|4\.[56]V))/.test(model);
  const response = await fetch(`${SILICONFLOW_BASE_URL}/chat/completions`, {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Authorization: `Bearer ${SILICONFLOW_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      stream: false,
      max_tokens: maxTokens,
      temperature,
      enable_thinking: supportsThinkingToggle ? false : undefined,
      response_format: responseFormat === 'json_object' ? { type: 'json_object' } : undefined,
      messages: [
        {
          role: 'system',
          content: responseFormat === 'json_object'
            ? 'You are a senior reading-map editor. Output valid JSON only.'
            : 'You are a senior reading-map editor. Output concise, high-density working notes in Chinese.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`SiliconFlow API error ${response.status}: ${detail}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('SiliconFlow returned an empty response.');
  }

  return responseFormat === 'json_object' ? extractJsonCandidate(content, jsonRepairMode) : content.trim();
}

async function translateMapToEnglish(map) {
  if (!SILICONFLOW_API_KEY) {
    return map;
  }

  const prompt = `
You are a professional literary translator for a reading-product UI.

Translate all user-facing Chinese text in the following reading-map JSON into natural English.

Rules:
1. Return JSON only.
2. Keep structure, ids, numbers, arrays, colors, URLs, and object keys unchanged.
3. Translate every visible Chinese sentence into English.
4. Keep book titles and author names in their original language when they are proper nouns, but translate explanatory copy around them.
5. Do not leave Chinese text in the result unless it is a proper noun that should remain unchanged.

JSON:
${JSON.stringify(map).slice(0, 40000)}
  `.trim();

  try {
    const translated = await callSiliconFlow({
      prompt,
      maxTokens: 2600,
      temperature: 0.15,
      responseFormat: 'json_object',
    });
    return deepCleanChineseText(translated);
  } catch (error) {
    const errorType = classifyError(error, { source: 'siliconflow' });
    addDegradedDependency('siliconflow');
    logEvent('warn', 'translate_map_fallback', {
      dependency: 'siliconflow',
      degraded: true,
      errorType,
      error: summarizeError(error),
    });
    return map;
  }
}

async function searchTavily(query, options = {}) {
  if (!TAVILY_API_KEY || !String(query || '').trim()) {
    return [];
  }

  const {
    searchDepth = 'basic',
    maxResults = 5,
    includeRawContent = false,
    timeoutMs = TAVILY_TIMEOUT_MS,
  } = options;

  const response = await fetch(TAVILY_BASE_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: TAVILY_API_KEY,
      query,
      topic: 'general',
      search_depth: searchDepth,
      max_results: maxResults,
      include_answer: false,
      include_raw_content: includeRawContent,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Tavily API error ${response.status}: ${detail}`);
  }

  const payload = await response.json();
  return Array.isArray(payload.results) ? payload.results : [];
}

async function searchGoogleBooks(query, maxResults = 5, timeoutMs = GOOGLE_BOOKS_TIMEOUT_MS) {
  if (!String(query || '').trim()) {
    return [];
  }

  const url = new URL(GOOGLE_BOOKS_BASE_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('maxResults', String(maxResults));
  url.searchParams.set('printType', 'books');

  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Google Books API error ${response.status}: ${detail}`);
  }

  const payload = await response.json();
  return Array.isArray(payload.items) ? payload.items : [];
}

async function searchOpenLibrary(query, limit = 5) {
  if (!String(query || '').trim()) {
    return [];
  }

  const url = new URL(OPEN_LIBRARY_BASE_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', String(limit));

  const response = await fetch(url, {
    signal: AbortSignal.timeout(OPEN_LIBRARY_TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Open Library API error ${response.status}: ${detail}`);
  }

  const payload = await response.json();
  return Array.isArray(payload.docs) ? payload.docs : [];
}

function sanitizeCoverUrl(url) {
  return String(url || '').replace(/^http:\/\//i, 'https://');
}

function buildGoogleCandidates(query, googleItems) {
  return googleItems.map((item, index) => {
    const volumeInfo = item.volumeInfo || {};
    const title = volumeInfo.title || query;
    const author = Array.isArray(volumeInfo.authors) ? volumeInfo.authors.join(', ') : '';
    const cover =
      sanitizeCoverUrl(volumeInfo.imageLinks?.thumbnail) ||
      sanitizeCoverUrl(volumeInfo.imageLinks?.smallThumbnail) ||
      fallbackCover;

    return {
      id: `google-${item.id || toSlug(title)}-${index}`,
      title,
      author,
      cover,
      oneLiner: { zh: volumeInfo.description ? String(volumeInfo.description).slice(0, 120) : `来自全网检索，可继续生成《${title}》阅读地图。` },
      saves: 0,
      status: 'no_map_paid',
      aliases: [title, ...(volumeInfo.subtitle ? [volumeInfo.subtitle] : [])],
      subtitle: volumeInfo.subtitle,
      firstPublishYear: volumeInfo.publishedDate ? Number(String(volumeInfo.publishedDate).slice(0, 4)) : undefined,
      source: 'catalog',
      matchReason: volumeInfo.categories?.[0] || '来自 Google Books 书籍元数据。',
      matchStrength: scoreCandidateTitleMatch(query, title),
    };
  });
}

function buildOpenLibraryCandidates(query, docs) {
  return docs.map((doc, index) => {
    const title = doc.title || query;
    const author = Array.isArray(doc.author_name) ? doc.author_name.join(', ') : '';
    const cover = doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : fallbackCover;

    return {
      id: `openlibrary-${doc.key || toSlug(title)}-${index}`,
      title,
      author,
      cover,
      oneLiner: {
        zh: doc.first_sentence?.[0] || doc.subject?.slice(0, 3).join(' / ') || `已识别到《${title}》的公开书目信息。`,
      },
      saves: 0,
      status: 'no_map_paid',
      aliases: [title, ...(doc.alternate_title || [])].filter(Boolean),
      firstPublishYear: doc.first_publish_year,
      source: 'openlibrary',
      matchReason: doc.publisher?.[0] || '来自 Open Library 书目元数据。',
      matchStrength: scoreCandidateTitleMatch(query, title),
    };
  });
}

function mergeTavilyResults(resultGroups) {
  const seen = new Set();
  const merged = [];

  resultGroups.flat().forEach((item) => {
    const key = `${item.url || ''}::${normalize(item.title || '')}`;
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    merged.push(item);
  });

  return merged;
}

function isRelevantGroundingResult(item, query) {
  const haystack = normalize(`${item?.title || ''} ${item?.content || ''} ${item?.raw_content || ''}`);
  const keywords = extractGroundingKeywords(query).map(normalize).filter(Boolean);
  if (!haystack || keywords.length === 0) {
    return true;
  }

  const hitCount = keywords.filter((keyword) => haystack.includes(keyword)).length;
  return hitCount >= 1;
}

function formatTavilyResults(results) {
  return results
    .map((item, index) => {
      const title = item.title || 'Untitled';
      const url = item.url || '';
      const content = (item.content || '').slice(0, 480);
      return `${index + 1}. ${title}\nURL: ${url}\n摘要: ${content}`;
    })
    .join('\n\n');
}

function splitSentences(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[。！？!?.；;])/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractCandidateQuotes(results) {
  const collected = [];
  const seen = new Set();

  const pushQuote = (quote, sourceTitle) => {
    const cleaned = String(quote || '')
      .replace(/\s+/g, ' ')
      .replace(/^[“"'「『]+|[”"'」』]+$/g, '')
      .trim();

    if (cleaned.length < 8 || cleaned.length > 42) {
      return;
    }

    const key = normalize(cleaned);
    if (!key || seen.has(key)) {
      return;
    }

    seen.add(key);
    collected.push({ quote: cleaned, sourceTitle });
  };

  results.forEach((item) => {
    const texts = [item.content, item.raw_content].filter(Boolean);

    texts.forEach((text) => {
      const matches = String(text).match(/[“"「『]([^”“"「『」』]{8,42})[”"」』]/g) || [];
      matches.forEach((match) => pushQuote(match, item.title || '网页线索'));

      splitSentences(text)
        .filter((sentence) => sentence.length >= 10 && sentence.length <= 42)
        .filter((sentence) => /政府|市场|地方|改革|财政|增长|经济|政策|土地/.test(sentence))
        .slice(0, 4)
        .forEach((sentence) => pushQuote(sentence, item.title || '网页线索'));
    });
  });

  return collected.slice(0, 8);
}

function buildGroundingDossier(results) {
  const sourceBlock = formatTavilyResults(results.slice(0, 6));
  const quoteCandidates = extractCandidateQuotes(results);

  if (quoteCandidates.length === 0) {
    return sourceBlock;
  }

  const quoteBlock = quoteCandidates
    .map((item, index) => `${index + 1}. ${item.quote}\n来源线索: ${item.sourceTitle}`)
    .join('\n\n');

  return `${sourceBlock}\n\n候选原句（若适合，请优先保留这些短句的原始措辞）：\n${quoteBlock}`;
}

function buildCompactGroundingDossier(results) {
  return results
    .slice(0, 3)
    .map((item, index) => {
      const title = trimText(item?.title) || '网页线索';
      const content = trimText(item?.content).slice(0, 160);
      return `${index + 1}. ${title}${content ? `：${content}` : ''}`;
    })
    .filter(Boolean)
    .join('\n');
}

function extractHeadingHints(text) {
  const seen = new Set();
  return String(text || '')
    .split('\n')
    .map((line) => trimText(line.replace(/^#+\s*/, '')))
    .filter((line) => {
      if (!line || line.length < 4 || line.length > 48) {
        return false;
      }
      if (/^[0-9]+$/.test(line)) {
        return false;
      }
      if (
        /^第[\d一二三四五六七八九十百千]+[章节部卷篇回]/.test(line) ||
        /^chapter\s+\d+/i.test(line) ||
        /^part\s+\d+/i.test(line) ||
        /^section\s+\d+/i.test(line) ||
        /^book\s+\d+/i.test(line)
      ) {
        return true;
      }
      if (/^[-*•]/.test(line)) {
        return false;
      }
      return !/[。！？!?；;，,]$/.test(line);
    })
    .filter((line) => {
      const key = normalize(line);
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, 12);
}

function collectParagraphWindow(paragraphs, startIndex, maxChars = 2400, maxParagraphs = 4) {
  const picked = [];
  let remaining = Math.max(400, maxChars);

  for (let index = Math.max(0, startIndex); index < paragraphs.length; index += 1) {
    const paragraph = trimText(paragraphs[index]);
    if (!paragraph) {
      continue;
    }

    picked.push(paragraph.slice(0, Math.min(paragraph.length, remaining)));
    remaining -= paragraph.length + 1;

    if (remaining <= 120 || picked.length >= maxParagraphs) {
      break;
    }
  }

  return picked.join('\n\n').slice(0, maxChars);
}

function buildCompressedUploadContent(text) {
  const normalizedText = String(text || '').replace(/\r/g, '\n');
  const paragraphs = splitParagraphs(normalizedText);
  const plainText = normalizedText.replace(/\s+/g, ' ').trim();

  if (paragraphs.length === 0) {
    return plainText.slice(0, UPLOAD_COMPRESSED_TEXT_MAX_CHARS);
  }

  const midIndex = Math.max(0, Math.floor(paragraphs.length / 2) - 1);
  const chunks = [
    ['开头片段', collectParagraphWindow(paragraphs, 0, 900, 2)],
    ['中段片段', collectParagraphWindow(paragraphs, midIndex, 700, 1)],
    ['结尾片段', collectParagraphWindow(paragraphs, Math.max(0, paragraphs.length - 2), 700, 1)],
  ].filter(([, value]) => trimText(value));

  const headingHints = extractHeadingHints(normalizedText);
  if (headingHints.length > 0) {
    chunks.push(['标题线索', headingHints.join('\n')]);
  }

  const compressed = [
    `全文长度：${plainText.length} 字符`,
    ...chunks.map(([label, value]) => `${label}：\n${value}`),
  ].join('\n\n');

  return compressed.slice(0, UPLOAD_COMPRESSED_TEXT_MAX_CHARS);
}

const editorialStyleGuide = `
写作标准：
1. 不要写成百科简介，要写成“这本书真正值得读的地方”。
2. 避免空泛模块名，例如“背景介绍”“政策分析”“经济发展机制”。模块标题要带判断或张力。
3. 多用这样的句式：
   - 它真正解释的不是 X，而是 Y
   - 这部分的重点不在于 A，而在于 B
   - 作者最有力的判断是……
   - 增长的代价不是别的，而是……
   - 真正决定结果的不是表面变量，而是……
4. 方法卡必须像“可迁移的判断工具”，不要写成正确废话。
5. 争议部分必须写出“为什么值得带走”以及“今天为什么要保留看”。
6. 如果线索有限，宁可保守，也不要凑概念。
7. 标题和文案优先追求编辑感、压缩感和可读性，不要堆术语。
8. 严禁输出占位词，例如“总览标题”“总览副标题”“方法名”“模块名”“关键句”。
9. 坏标题示例：
   - 社会矛盾的平衡
   - 经济发展的社会矛盾
   - 核心观点
   好标题示例：
   - 增长不是一路放大，而是把冲突留在可控区间
   - 政府不是裁判，而是增长机器的一部分
   - 真正要读的不是政策表面，而是地方政府怎么做账
`.trim();

const benchmarkDensityGuide = `
对标页的内容密度规律：
1. 入口层不是简介，而是“判断句 + 反转句 + 阅读定位”。
2. overview 的四张卡必须形成递进，不是四个并列标签。优先使用这类结构：
   - 先界定什么值得做
   - 再决定用什么脑子思考
   - 把组织改造成执行机器
   - 最后把公司放进更大的长期叙事
3. parts 不只解释“这一部分讲什么”，还要解释“为什么值得读”和“读完要完成什么认知动作”。
4. methods 要像短硬的判断动作，例如“先质疑需求”“别优化不该存在的东西”“让系统直接接触真实反馈”。
5. quotes 要短、稳、能摘记，note 要解释这句话为什么代表整本书的判断核心。
6. 同一层里要有节奏差异：一句总结、一个判断、三个带走点，而不是统一写成说明文。
`.trim();

function buildTavilyCandidates(query, tavilyResults) {
  if (!Array.isArray(tavilyResults) || tavilyResults.length === 0) {
    return [];
  }

  return tavilyResults.slice(0, 4).map((item, index) => {
    const title = String(item.title || query)
      .split(/[-|｜]/)[0]
      .trim() || query;
    const summary = String(item.content || '').trim().slice(0, 140);

    return {
      id: `web-${toSlug(title || query)}-${index}`,
      title: title.length > 2 ? title : query,
      author: '',
      cover: fallbackCover,
      oneLiner: { zh: summary || `网页检索命中到与《${query}》相关的图书线索。` },
      saves: 0,
      status: 'no_map_paid',
      aliases: [title, query].filter(Boolean),
      source: 'catalog',
      matchReason: summary || '来自网页检索结果，建议继续进入制作链路。',
      matchStrength: scoreCandidateTitleMatch(query, title),
    };
  });
}

function mergeSearchCandidates(query, localMatches, candidates) {
  const merged = [...localMatches];

  candidates.forEach((candidate, index) => {
    const localHit = findStrongLocalBookByTitle(candidate.title);
    if (localHit) {
      if (!merged.find((item) => item.id === localHit.id)) {
        merged.push(localHit);
      }
      return;
    }

    merged.push({
      id: `web-${toSlug(candidate.title || query)}-${index}`,
      title: candidate.title || query,
      author: candidate.author || '',
      cover: candidate.cover || fallbackCover,
      oneLiner: { zh: candidate.reason || '来自网页检索结果，当前还没有现成地图。' },
      saves: 0,
      status: 'no_map_paid',
      aliases: [candidate.title || query],
      source: 'catalog',
      matchReason: candidate.reason || '网页检索命中到相关图书线索。',
    });
  });

  const deduped = dedupeBooks(merged);
  if (localMatches.length > 0) {
    return deduped;
  }

  const strongExternalMatches = deduped
    .filter((item) => item.status !== 'has_map')
    .filter((item) => Number(item.matchStrength || 0) >= 140)
    .sort((a, b) => Number(b.matchStrength || 0) - Number(a.matchStrength || 0));

  const withKnownAuthors = strongExternalMatches.filter((item) => hasKnownAuthor(item.author));
  if (withKnownAuthors.length > 0) {
    return withKnownAuthors.slice(0, 6);
  }

  if (strongExternalMatches.length > 0) {
    return strongExternalMatches.slice(0, 6);
  }

  return query.trim()
    ? [
        {
          id: `title-only-${toSlug(query)}`,
          title: query,
          author: '',
          cover: fallbackCover,
          oneLiner: { zh: `暂时没有识别到稳定作者信息，建议直接按书名《${query}》继续生成。` },
          saves: 0,
          status: 'no_map_paid',
          aliases: [query],
          source: 'catalog',
          matchReason: '作者信息不稳定时，默认按书名继续后续生成链路。',
        },
      ]
    : deduped;
}

async function resolveBookCover(title, author, currentCover, timeoutMs = GOOGLE_BOOKS_TIMEOUT_MS) {
  const safeCurrentCover = String(currentCover || '').trim();
  if (safeCurrentCover && safeCurrentCover !== fallbackCover && !safeCurrentCover.includes('example.com')) {
    return safeCurrentCover;
  }

  try {
    const results = await searchGoogleBooks([title, author].filter(Boolean).join(' '), 1, timeoutMs);
    const candidate = buildGoogleCandidates(title, results)[0];
    return candidate?.cover || safeCurrentCover || fallbackCover;
  } catch (error) {
    const errorType = classifyError(error, { source: 'google_books' });
    addDegradedDependency('google_books');
    logEvent('warn', 'cover_lookup_failed', {
      dependency: 'google_books',
      degraded: true,
      errorType,
      error: summarizeError(error),
    });
    return safeCurrentCover || fallbackCover;
  }
}

async function buildGroundingContext(input) {
  const query = [input.title, input.author].filter(Boolean).join(' ');
  if (!query) {
    return '';
  }

  try {
    const [coreResults, structureResults, quoteResults] = await Promise.all([
      searchTavily(`${query} 这本书讲什么 核心观点 主要内容`, { searchDepth: 'advanced', maxResults: 3 }).catch((error) => {
        const errorType = classifyError(error, { source: 'tavily' });
        addDegradedDependency('tavily');
        logEvent('warn', 'grounding_source_failed', {
          dependency: 'tavily',
          stage: 'core',
          degraded: true,
          errorType,
          error: summarizeError(error),
        });
        return [];
      }),
      searchTavily(`${query} 目录 章节 框架`, { searchDepth: 'advanced', maxResults: 3 }).catch((error) => {
        const errorType = classifyError(error, { source: 'tavily' });
        addDegradedDependency('tavily');
        logEvent('warn', 'grounding_source_failed', {
          dependency: 'tavily',
          stage: 'structure',
          degraded: true,
          errorType,
          error: summarizeError(error),
        });
        return [];
      }),
      searchTavily(`${query} 书摘 金句 摘录 摘抄`, { searchDepth: 'advanced', maxResults: 3, includeRawContent: true }).catch((error) => {
        const errorType = classifyError(error, { source: 'tavily' });
        addDegradedDependency('tavily');
        logEvent('warn', 'grounding_source_failed', {
          dependency: 'tavily',
          stage: 'quotes',
          degraded: true,
          errorType,
          error: summarizeError(error),
        });
        return [];
      }),
    ]);
    const results = mergeTavilyResults([coreResults, structureResults, quoteResults])
      .filter((item) => isRelevantGroundingResult(item, query));
    if (results.length === 0) {
      return '';
    }
    return buildGroundingDossier(results);
  } catch (error) {
    const errorType = classifyError(error, { source: 'tavily' });
    addDegradedDependency('tavily');
    logEvent('warn', 'grounding_search_failed', {
      dependency: 'tavily',
      degraded: true,
      errorType,
      error: summarizeError(error),
    });
    return '';
  }
}

async function buildCompactGroundingContext(input, timeoutMs = COMPACT_GROUNDING_TIMEOUT_MS) {
  const query = [input.title, input.author].filter(Boolean).join(' ');
  if (!query || !TAVILY_API_KEY || timeoutMs < 1200) {
    return '';
  }

  try {
    const results = await searchTavily(`${query} 这本书讲什么 核心观点 适用边界`, {
      searchDepth: 'basic',
      maxResults: 3,
      timeoutMs,
    });
    const filtered = results.filter((item) => isRelevantGroundingResult(item, query));
    return filtered.length ? buildCompactGroundingDossier(filtered) : '';
  } catch (error) {
    const errorType = classifyError(error, { source: 'tavily' });
    addDegradedDependency('tavily');
    logEvent('warn', 'compact_grounding_failed', {
      dependency: 'tavily',
      degraded: true,
      errorType,
      error: summarizeError(error),
    });
    return '';
  }
}

async function buildAnalysisBrief(input, groundingContext, timeoutMs = ANALYSIS_STAGE_TIMEOUT_MS) {
  if (!SILICONFLOW_API_KEY) {
    return '';
  }

  const prompt = `
你现在是“阅读地图内容架构师”。请先基于书籍内容和补充线索，产出一份高密度中文分析草稿，供后续生成阅读地图。

要求：
1. 不要复述目录，要重新压缩成知识系统。
2. 必须输出这些部分：
   - 一句话结论
   - 4 到 6 个核心模块
   - 8 到 12 条关键方法/判断
   - 4 到 6 个关键领域
   - 4 到 6 个时间线/发展阶段
   - 4 到 6 条关键句或关键判断
   - 2 到 4 个争议/边界
   - 3 条阅读路线
3. 写得像高质量编辑工作笔记，不要写空话。
4. 如果来源不足，要明确保守，不要硬编。
5. 模块标题和判断要有编辑压缩感，不要落成泛泛而谈的章节概括。
6. 入口层和模块层要学习成熟阅读地图的节奏：先给判断，再给“为什么重要”，最后给可带走点。
7. 明确区分“正文可确认”“公开资料可确认”“需要保守表达”的层次，不要混成一个确定口吻。

来源策略：
${buildPromptStrategyNotes(input, 'analysis')}

书名：${input.title}
作者：${input.author || 'Unknown'}
来源模式：${input.sourceKind}

${editorialStyleGuide}
${benchmarkDensityGuide}

正文摘要：
${String(input.content || '').slice(0, 120000)}

补充线索：
${groundingContext || '无'}
  `.trim();

  return callSiliconFlow({ prompt, maxTokens: 1600, temperature: 0.25, responseFormat: 'text', timeoutMs });
}

function buildMapPrompt(input, groundingContext, analysisBrief) {
  return `
你现在要把一本书整理成“高质量阅读地图”，风格目标接近成熟的知识地图产品，而不是普通摘要。

输出原则：
1. 用中文写主要内容。
2. 先给骨架，再给方法，再给争议与阅读路线。
3. 不允许目录复述，不允许空泛鸡汤。
4. 每个区块都要有明确的信息密度和阅读价值。
5. 输出字段必须完整，数组数量尽量满足下列标准：
   - overview.cards: 恰好 4 张
   - knowledgeMap.areas: 4 到 6 个
   - knowledgeMap.tools: 4 到 6 个
   - parts: 4 到 6 个
   - methods.items: 14 到 18 条
   - timeline: 4 到 6 条
   - quotes: 4 到 6 条
   - debates: 2 到 4 条
   - routes: 3 到 4 条
6. 如果是 title-only 模式，也要尽量利用补充线索把书讲深，但不要假造无法支撑的细节。

书名：${input.title}
作者：${input.author || 'Unknown'}
来源模式：${input.sourceKind}

内容架构草稿：
${analysisBrief || '无'}

补充线索：
${groundingContext || '无'}

原始文本：
${String(input.content || '').slice(0, 120000)}

返回 JSON，结构如下：
{
  "title": "书名",
  "author": "作者，未知时留空字符串",
  "cover": "https://...",
  "oneLiner": { "zh": "一句话结论", "en": "..." },
  "about": { "zh": "这本书到底在讲什么", "en": "..." },
  "stats": { "structure": 4, "volume": 280 },
  "readingPosition": { "zh": "怎么读这本书" },
  "overview": {
    "title": "总览标题",
    "subtitle": "总览副标题",
    "cards": [
      { "layer": "第一层", "title": "标题", "desc": "描述", "points": ["点1", "点2", "点3"], "color": "from-orange-500 to-amber-500" }
    ]
  },
  "knowledgeMap": {
    "areas": [
      { "title": "领域", "status": "状态", "progress": 80, "color": "bg-orange-500", "desc": "描述" }
    ],
    "tools": [
      { "title": "工具", "desc": "描述", "points": ["点1", "点2", "点3"] }
    ]
  },
  "parts": [
    {
      "id": "part-1",
      "title": "模块名",
      "subtitle": "第一部分",
      "navDesc": "导航描述",
      "intro": "模块介绍",
      "tags": ["标签1", "标签2"],
      "task": "这一部分的任务",
      "takeaways": ["要点1", "要点2"],
      "chapters": ["章节1", "章节2"],
      "position": "怎么理解它的位置"
    }
  ],
  "methods": {
    "categories": ["分类1", "分类2", "分类3"],
    "items": [
      { "id": "01", "category": "分类1", "title": "方法名", "desc": "方法描述" }
    ]
  },
  "timeline": [
    { "year": "阶段", "title": "标题", "desc": "描述" }
  ],
  "quotes": [
    { "quote": "关键句或关键判断", "note": "为什么重要" }
  ],
  "debates": [
    { "title": "争议点", "value": "值得带走", "reservation": "需要保留看" }
  ],
  "routes": [
    { "audience": "读者类型", "route": "阅读路线", "focus": ["重点1", "重点2"] }
  ]
}
  `.trim();
}

function buildCompactCatalogPrompt(input, groundingContext) {
  return `
只返回合法 JSON，不要解释，不要 markdown。
基于书名与公开线索，为《${input.title}》生成极简 reading-map seed。
不要伪装成读过原书全文。

作者：${input.author || '待确认'}
${groundingContext ? `grounding：${groundingContext}` : 'grounding：无'}

返回这个结构，所有元素都写短句：
{
  "oneLiner": "18字内",
  "about": "40字内",
  "overview": ["短判断1", "短判断2", "短判断3", "短判断4"],
  "parts": ["模块名1", "模块名2", "模块名3", "模块名4"],
  "methods": ["动作1", "动作2", "动作3", "动作4"],
  "quotes": ["关键判断：...", "关键判断：..."],
  "routes": ["路线1", "路线2"]
}

要求：
- overview 恰好 4 条，用来概括四个阅读判断
- parts 恰好 4 条，必须像阅读模块名，不要写“问题定义/结构展开”
- methods 恰好 4 条，写成动作短句
- quotes 恰好 2 条，必须以“关键判断：”开头
- routes 恰好 2 条，只写如何进入这本书
  `.trim();
}

function buildCompactUploadPrompt(input, compressedContent, groundingContext) {
  return `
只返回合法 JSON，不要解释，不要 markdown。
基于压缩正文，为《${input.title}》生成极小 reading-map seed。
正文证据优先；如果正文与书名常识冲突，优先相信正文。

作者：${input.author || '待确认'}
压缩正文：
${compressedContent || '无'}
${groundingContext ? `辅助 grounding：${groundingContext}` : '辅助 grounding：无'}

返回这个结构，所有元素都写短句。字段可以很少，服务端会补齐：
{
  "oneLiner": "18字内",
  "about": "40字内",
  "overview": ["短判断1", "短判断2"],
  "parts": ["模块名1", "模块名2"],
  "methods": ["动作1", "动作2"],
  "quotes": ["关键判断：..."],
  "routes": ["路线1"]
}

要求：
- overview 2 条
- parts 2 条，必须像正文阅读模块名，不要写“问题定义/结构展开”
- methods 2 条，写成动作短句
- quotes 1 条，优先写“关键判断：...”
- routes 1 条，只写按正文进入的读法
  `.trim();
}

function inflateCompactReadingMapSeed(seed, input) {
  const fallback = buildPrototypeMap(input);
  const overviewColors = [
    'from-orange-500 to-amber-500',
    'from-sky-500 to-cyan-500',
    'from-emerald-500 to-teal-500',
    'from-fuchsia-500 to-pink-500',
  ];
  const overviewLayers = ['第一层', '第二层', '第三层', '第四层'];
  const partSubtitles = ['第一部分', '第二部分', '第三部分', '第四部分'];
  const fallbackKnowledge = buildFallbackKnowledgeMap(input, seed?.title || input.title);
  const fallbackTimeline = buildFallbackTimeline(input, seed?.title || input.title);

  const overview = Array.isArray(seed?.overview) ? seed.overview.slice(0, 4) : [];
  const parts = Array.isArray(seed?.parts) ? seed.parts.slice(0, 4) : [];
  const methods = Array.isArray(seed?.methods) ? seed.methods.slice(0, input.sourceKind === 'upload' ? 6 : 5) : [];
  const quotes = Array.isArray(seed?.quotes) ? seed.quotes.slice(0, input.sourceKind === 'upload' ? 3 : 2) : [];
  const debates = Array.isArray(seed?.debates) ? seed.debates.slice(0, 2) : [];
  const routes = Array.isArray(seed?.routes) ? seed.routes.slice(0, 2) : [];
  const methodCategories = [...new Set(methods.map((item) => trimText(typeof item === 'string' ? '' : item?.category)).filter(Boolean))].slice(0, 3);
  const defaultMethodCategories = input.sourceKind === 'upload'
    ? ['正文入口', '结构判断', '迁移动作']
    : ['阅读入口', '判断框架', '边界提醒'];

  return {
    title: trimText(seed?.title) || input.title,
    author: hasKnownAuthor(seed?.author) ? trimText(seed.author) : (input.author || ''),
    oneLiner: {
      zh: trimText(seed?.oneLiner) || fallback.oneLiner.zh,
    },
    about: {
      zh: trimText(seed?.about) || fallback.about.zh,
    },
    readingPosition: {
      zh: trimText(seed?.readingPosition) || fallback.readingPosition.zh,
    },
    stats: {
      structure: 4,
      volume: Math.min(Math.max(Math.ceil(String(input.content || '').length / 900), 80), 480),
    },
    overview: {
      title: trimText(seed?.overviewTitle) || fallback.overview.title,
      subtitle: trimText(seed?.overviewSubtitle) || fallback.overview.subtitle,
      cards: overview.map((item, index) => ({
        layer: overviewLayers[index],
        title: trimText(typeof item === 'string' ? item : item?.title) || fallback.overview.cards[index]?.title,
        desc: trimText(typeof item === 'string' ? '' : item?.desc) || fallback.overview.cards[index]?.desc,
        points: Array.isArray(typeof item === 'string' ? null : item?.points) && item.points.length >= 3
          ? item.points.map((point) => trimText(point)).filter(Boolean).slice(0, 3)
          : [
              trimText(typeof item === 'string' ? item : item?.title) || fallback.overview.cards[index]?.points?.[0],
              trimText(typeof item === 'string' ? item : item?.desc).slice(0, 16) || fallback.overview.cards[index]?.points?.[1],
              input.sourceKind === 'upload' ? '回原文核对' : '回原书确认',
            ].filter(Boolean).slice(0, 3),
        color: overviewColors[index],
      })),
    },
    knowledgeMap: fallbackKnowledge,
    parts: parts.map((item, index) => {
      const title = trimText(typeof item === 'string' ? item : item?.title) || fallback.parts[index]?.title;
      const desc = trimText(typeof item === 'string' ? '' : item?.desc);
      const navDesc = trimText(typeof item === 'string' ? '' : item?.navDesc) || desc || `${title} 是进入这本书的一段核心阅读模块。`;
      const task = trimText(typeof item === 'string' ? '' : item?.task) || desc || `先用“${title}”判断这一部分值得读什么。`;
      const takeaways = Array.isArray(typeof item === 'string' ? null : item?.takeaways) ? item.takeaways.map((entry) => trimText(entry)).filter(Boolean).slice(0, 3) : [];
      const chapters = Array.isArray(typeof item === 'string' ? null : item?.chapters) ? item.chapters.map((entry) => trimText(entry)).filter(Boolean).slice(0, 3) : [];
      const derivedTakeaways = [
        navDesc,
        task,
        input.sourceKind === 'upload' ? '回到正文验证这一段的推进动作。' : '回到原书确认这一部分的真实展开。',
      ].filter(Boolean).slice(0, 3);
      const derivedChapters = [
        title,
        navDesc.slice(0, 14),
        task.slice(0, 14),
      ].filter(Boolean).slice(0, 3);
      return {
        id: `part-${index + 1}`,
        title,
        subtitle: partSubtitles[index],
        navDesc,
        intro: trimText(item?.intro) || `${navDesc} ${task}`.slice(0, 90) || fallback.parts[index]?.intro,
        tags: [title, derivedTakeaways[0], derivedChapters[0]].filter(Boolean).slice(0, 3),
        task,
        takeaways: takeaways.length >= 3 ? takeaways : derivedTakeaways,
        chapters: chapters.length >= 3 ? chapters : derivedChapters,
        position: trimText(item?.position) || `${title} 帮助读者把这一段放回整本书的推进链里。`,
      };
    }),
    methods: {
      categories: methodCategories.length >= 2 ? methodCategories : defaultMethodCategories.slice(0, 2),
      items: methods.map((item, index) => ({
        id: String(index + 1).padStart(2, '0'),
        category: trimText(typeof item === 'string' ? '' : item?.category) || methodCategories[0] || defaultMethodCategories[index % defaultMethodCategories.length],
        title: trimText(typeof item === 'string' ? item : item?.title) || fallback.methods.items[index]?.title,
        desc: trimText(typeof item === 'string' ? '' : item?.desc) || `把“${trimText(typeof item === 'string' ? item : item?.title) || fallback.methods.items[index]?.title}”当作进入这本书的一步动作。`,
      })),
    },
    timeline: fallbackTimeline,
    quotes: quotes.map((item, index) => {
      const fallbackQuote = buildFallbackQuotes(input, seed?.title || input.title)[index];
      if (typeof item === 'string') {
        return {
          quote: trimText(item) || fallbackQuote?.quote,
          note: input.sourceKind === 'upload'
            ? '基于压缩正文提炼的关键判断。'
            : '基于书名与公开线索提炼的关键判断。',
        };
      }
      return {
        quote: trimText(item?.quote) || fallbackQuote?.quote,
        note: trimText(item?.note) || fallbackQuote?.note,
      };
    }),
    debates: debates.map((item, index) => ({
      title: trimText(item?.title) || buildFallbackDebates(input, seed?.title || input.title)[index]?.title,
      value: trimText(item?.value) || buildFallbackDebates(input, seed?.title || input.title)[index]?.value,
      reservation: trimText(item?.reservation) || buildFallbackDebates(input, seed?.title || input.title)[index]?.reservation,
    })),
    routes: routes.map((item, index) => ({
      audience: trimText(typeof item === 'string' ? '' : item?.audience) || buildFallbackRoutes(input, seed?.title || input.title)[index]?.audience,
      route: trimText(typeof item === 'string' ? item : item?.route) || buildFallbackRoutes(input, seed?.title || input.title)[index]?.route,
      focus: Array.isArray(typeof item === 'string' ? null : item?.focus) && item.focus.length >= 2
        ? item.focus.map((entry) => trimText(entry)).filter(Boolean).slice(0, 2)
        : buildFallbackRoutes(input, seed?.title || input.title)[index]?.focus,
    })),
  };
}

async function buildCompactReadingMap(input, prompt, timeoutMs) {
  return callSiliconFlow({
    prompt,
    maxTokens: input.sourceKind === 'upload' ? 320 : 500,
    temperature: 0,
    responseFormat: 'json_object',
    model: SILICONFLOW_COMPACT_MODEL,
    timeoutMs,
    jsonRepairMode: 'compact-seed',
  });
}

function buildMetaPrompt(input, groundingContext, analysisBrief) {
  return `
你现在是阅读地图总编辑。请先只生成这本书的“阅读入口层”，不要输出知识地图、模块、方法、时间线等其它区块。

目标：
1. 让读者一进来就知道这本书真正讲什么。
2. 语言要像成熟阅读产品，不像普通摘要。
3. 如果是 title-only 模式，可以依据补充线索做稳健概括，但不要假造细碎章节。
4. 一句话结论要有判断，不要只是“本书探讨了……”。

来源策略：
${buildPromptStrategyNotes(input, 'meta')}

只返回 JSON：
{
  "title": "书名",
  "author": "作者",
  "cover": "https://...",
  "oneLiner": { "zh": "一句话结论", "en": "optional" },
  "about": { "zh": "这本书到底在讲什么", "en": "optional" },
  "stats": { "structure": 4, "volume": 280 },
  "readingPosition": { "zh": "这本书应该怎么读" },
  "overview": {
    "title": "总览标题",
    "subtitle": "总览副标题",
    "cards": [
      { "layer": "第一层", "title": "先界定什么值得看", "desc": "描述", "points": ["点1", "点2", "点3"], "color": "from-orange-500 to-amber-500" },
      { "layer": "第二层", "title": "再决定用什么框架理解", "desc": "描述", "points": ["点1", "点2", "点3"], "color": "from-sky-500 to-cyan-500" },
      { "layer": "第三层", "title": "把关键机制放回同一张图", "desc": "描述", "points": ["点1", "点2", "点3"], "color": "from-emerald-500 to-teal-500" },
      { "layer": "第四层", "title": "最后看它留下什么边界", "desc": "描述", "points": ["点1", "点2", "点3"], "color": "from-fuchsia-500 to-pink-500" }
    ]
  }
}

要求：
- overview.cards 必须恰好 4 张。
- 四张卡必须形成清晰递进，不要写成 4 个并列维度。
- 四张卡 title 优先使用“先…… / 再…… / 把…… / 最后……”这种结构。
- layer 字段固定写“第一层 / 第二层 / 第三层 / 第四层”，不要把判断句塞进 layer。
- about.zh 要讲清楚“这本书在处理什么问题”和“读者真正该带走什么”。
- readingPosition.zh 要给出阅读建议，而不是重复简介。

书名：${input.title}
作者：${input.author || 'Unknown'}
来源模式：${input.sourceKind}

${editorialStyleGuide}
${benchmarkDensityGuide}

内容架构草稿：
${analysisBrief || '无'}

补充线索：
${groundingContext || '无'}

原始文本：
${String(input.content || '').slice(0, 60000)}
  `.trim();
}

function buildStructurePrompt(input, groundingContext, analysisBrief) {
  return `
你现在负责这本书阅读地图的“骨架层”。不要写概述，不要写介绍文案，只输出知识地图、模块结构和方法卡。

只返回 JSON：
{
  "knowledgeMap": {
    "areas": [
      { "title": "领域", "status": "状态", "progress": 80, "color": "bg-orange-500", "desc": "描述" }
    ],
    "tools": [
      { "title": "工具", "desc": "描述", "points": ["点1", "点2", "点3"] }
    ]
  },
  "parts": [
    {
      "id": "part-1",
      "title": "模块名",
      "subtitle": "第一部分",
      "navDesc": "导航描述",
      "intro": "模块介绍",
      "tags": ["标签1", "标签2"],
      "task": "这一部分的任务",
      "takeaways": ["要点1", "要点2"],
      "chapters": ["章节1", "章节2"],
      "position": "怎么理解它的位置"
    }
  ],
  "methods": {
    "categories": ["分类1", "分类2", "分类3"],
    "items": [
      { "id": "01", "category": "分类1", "title": "方法名", "desc": "方法描述" }
    ]
  }
}

要求：
- knowledgeMap.areas 输出 4 到 6 个关键领域。
- knowledgeMap.tools 输出 4 到 6 个思考工具或判断框架。
- parts 输出 4 到 6 个模块，要体现“怎么读”，不是目录复述。
- methods.items 输出 14 到 18 条方法卡。
- 每一条方法卡都要可操作，不能只是观点标题。
- parts 的 navDesc、task、position 要有“为什么值得读这一部分”的阅读感。
- parts.subtitle 固定写“第一部分 / 第二部分 ...”，不要把判断句写进 subtitle。

书名：${input.title}
作者：${input.author || 'Unknown'}
来源模式：${input.sourceKind}

${benchmarkDensityGuide}

内容架构草稿：
${analysisBrief || '无'}

补充线索：
${groundingContext || '无'}

原始文本：
${String(input.content || '').slice(0, 90000)}
  `.trim();
}

function buildKnowledgePrompt(input, groundingContext, analysisBrief) {
  return `
你现在只负责输出这本书阅读地图里的 knowledgeMap，不要输出任何其它字段。

只返回 JSON：
{
  "knowledgeMap": {
    "areas": [
      { "title": "领域", "status": "状态", "progress": 80, "color": "bg-orange-500", "desc": "描述" }
    ],
    "tools": [
      { "title": "工具", "desc": "描述", "points": ["点1", "点2", "点3"] }
    ]
  }
}

要求：
- knowledgeMap.areas 输出 4 到 6 个关键领域。
- knowledgeMap.tools 输出 4 到 6 个思考工具或判断框架。
- 每个 desc 都要具体说明这一领域或工具为什么重要。
- 领域名称不要只是学科名，要更接近作者真正处理的问题块。

来源策略：
${buildPromptStrategyNotes(input, 'knowledge')}

书名：${input.title}
作者：${input.author || 'Unknown'}
来源模式：${input.sourceKind}

${editorialStyleGuide}
${benchmarkDensityGuide}

内容架构草稿：
${analysisBrief || '无'}

补充线索：
${groundingContext || '无'}

原始文本：
${String(input.content || '').slice(0, 60000)}
  `.trim();
}

function buildPartsPrompt(input, groundingContext, analysisBrief) {
  return `
你现在只负责输出这本书阅读地图里的 parts，不要输出任何其它字段。

只返回 JSON：
{
  "parts": [
    {
      "id": "part-1",
      "title": "模块名",
      "subtitle": "第一部分",
      "navDesc": "导航描述",
      "intro": "模块介绍",
      "tags": ["标签1", "标签2"],
      "task": "这一部分的任务",
      "takeaways": ["要点1", "要点2"],
      "chapters": ["章节1", "章节2"],
      "position": "怎么理解它的位置"
    }
  ]
}

要求：
- parts 输出 4 到 6 个模块。
- 这不是目录复述，而是“读者该怎么理解这部分”。
- 每个模块都必须写出任务、带走什么、和它在整本书中的位置。
- title 和 navDesc 要体现阅读视角，不要只是主题名。
- subtitle 固定写“第一部分 / 第二部分 ...”，不要把判断句写进 subtitle。
- navDesc 要像“为什么这部分值得读”，task 要像读者要完成的认知动作。
- takeaways 至少 3 条，chapters 至少 3 个，position 要说明它在整本书中的作用。

来源策略：
${buildPromptStrategyNotes(input, 'parts')}

书名：${input.title}
作者：${input.author || 'Unknown'}
来源模式：${input.sourceKind}

${editorialStyleGuide}
${benchmarkDensityGuide}

内容架构草稿：
${analysisBrief || '无'}

补充线索：
${groundingContext || '无'}

原始文本：
${String(input.content || '').slice(0, 70000)}
  `.trim();
}

function buildMethodsPrompt(input, groundingContext, analysisBrief) {
  return `
你现在只负责输出这本书阅读地图里的 methods，不要输出任何其它字段。

只返回 JSON：
{
  "methods": {
    "categories": ["分类1", "分类2", "分类3"],
    "items": [
      { "id": "01", "category": "分类1", "title": "方法名", "desc": "方法描述" }
    ]
  }
}

要求：
- methods.categories 输出 3 到 5 个分类。
- methods.items 输出 14 到 18 条方法卡。
- 每条方法卡都要写成可迁移的判断、工具或行动方式，不要写空泛观点。
- category 必须来自 categories 列表。
- 优先提炼“判断框架、观察角度、分析动作”，少写口号。
- title 优先写成短硬动作句，不要用“某某机制”“某某框架”这类概念名糊弄过去。
- desc 要回答“这个动作怎么用，为什么在这本书里重要”。

来源策略：
${buildPromptStrategyNotes(input, 'methods')}

书名：${input.title}
作者：${input.author || 'Unknown'}
来源模式：${input.sourceKind}

${editorialStyleGuide}
${benchmarkDensityGuide}

内容架构草稿：
${analysisBrief || '无'}

补充线索：
${groundingContext || '无'}

原始文本：
${String(input.content || '').slice(0, 70000)}
  `.trim();
}

function buildSynthesisPrompt(input, groundingContext, analysisBrief) {
  return `
你现在负责这本书阅读地图的“收束层”。不要重写总览和模块，只输出时间线、关键句、争议边界和阅读路线。

只返回 JSON：
{
  "timeline": [
    { "year": "阶段", "title": "标题", "desc": "描述" }
  ],
  "quotes": [
    { "quote": "关键句或关键判断", "note": "为什么重要" }
  ],
  "debates": [
    { "title": "争议点", "value": "值得带走", "reservation": "需要保留看" }
  ],
  "routes": [
    { "audience": "读者类型", "route": "阅读路线", "focus": ["重点1", "重点2"] }
  ]
}

要求：
- timeline 输出 4 到 6 条，优先展示问题演化、作者论证推进或现实阶段。
- quotes 输出 4 到 6 条。upload 可以用正文短句或关键判断；catalog 只能写关键判断，不要伪装成原书逐字摘录。
- debates 输出 2 到 4 条，必须写出价值与保留。
- routes 输出 3 到 4 条，针对不同读者给出清晰阅读入口。
- quote 优先选“能代表作者判断”的句子，不要写空洞正确话。
- 如果补充线索里提供了“候选原句”，只有在 upload 或来源足够明确时才可保留原始措辞。

来源策略：
${buildPromptStrategyNotes(input, 'synthesis')}

书名：${input.title}
作者：${input.author || 'Unknown'}
来源模式：${input.sourceKind}

${editorialStyleGuide}
${benchmarkDensityGuide}

内容架构草稿：
${analysisBrief || '无'}

补充线索：
${groundingContext || '无'}

原始文本：
${String(input.content || '').slice(0, 60000)}
  `.trim();
}

async function buildReadingMapSinglePass(input, groundingContext, analysisBrief, timeoutMs) {
  return callSiliconFlow({
    prompt: buildMapPrompt(input, groundingContext, analysisBrief),
    maxTokens: 2200,
    temperature: 0.25,
    responseFormat: 'json_object',
    timeoutMs,
  });
}

async function buildReadingMapBySections(input, groundingContext, analysisBrief, options = {}) {
  const {
    deadline = Date.now() + SILICONFLOW_TIMEOUT_MS,
    sectionTimeoutMs = SECTION_STAGE_TIMEOUT_MS,
  } = options;
  const merged = {};
  const sections = [
    { key: 'meta', prompt: buildMetaPrompt(input, groundingContext, analysisBrief), maxTokens: 900, temperature: 0.3 },
    { key: 'structure', prompt: buildStructurePrompt(input, groundingContext, analysisBrief), maxTokens: 1600, temperature: 0.25 },
    { key: 'synthesis', prompt: buildSynthesisPrompt(input, groundingContext, analysisBrief), maxTokens: 900, temperature: 0.25 },
  ];

  for (const section of sections) {
    const timeoutMs = capStageTimeout(deadline, sectionTimeoutMs);
    if (!timeoutMs) {
      logEvent('warn', 'map_section_skipped', {
        section: section.key,
        errorType: 'timeout_error',
        reason: 'insufficient_remaining_budget',
      });
      break;
    }

    try {
      const partial = await callSiliconFlow({
        prompt: section.prompt,
        maxTokens: section.maxTokens,
        temperature: section.temperature,
        responseFormat: 'json_object',
        timeoutMs,
      });
      Object.assign(merged, partial);
    } catch (error) {
      logEvent('warn', 'map_section_generation_failed', {
        section: section.key,
        errorType: classifyError(error, { source: 'siliconflow' }),
        error: summarizeError(error),
      });
    }
  }

  if (!Object.keys(merged).length) {
    throw new Error('All map section generations failed.');
  }

  return merged;
}

app.get('/api/health', (_request, response) => {
  const payload = buildHealthPayload();
  appendRequestLogMeta({
    provider: payload.provider,
    tavilyConfigured: payload.config.tavilyConfigured,
    serviceStatus: payload.status,
    ready: payload.ready,
  });
  response.json(payload);
});

app.get('/api/ready', (_request, response) => {
  const payload = buildReadyPayload();
  appendRequestLogMeta({
    provider: payload.provider,
    tavilyConfigured: payload.config.tavilyConfigured,
    serviceStatus: payload.status,
    ready: payload.ready,
  });
  response.status(payload.ready ? 200 : 503).json(payload);
});

app.get('/api/search-books', async (request, response) => {
  const query = String(request.query.q || '').trim();
  appendRequestLogMeta({
    queryPresent: Boolean(query),
    queryLength: query.length,
  });

  if (!query) {
    appendRequestLogMeta({ resultsCount: libraryMaps.length });
    response.json({ results: libraryMaps });
    return;
  }

  try {
    const localMatches = searchLocalLibrary(query);
    const [googleResults, openLibraryResults] = await Promise.all([
      searchGoogleBooks(query, 5).catch((error) => {
        const errorType = classifyError(error, { source: 'google_books' });
        addDegradedDependency('google_books');
        logEvent('warn', 'search_source_failed', {
          dependency: 'google_books',
          degraded: true,
          errorType,
          queryLength: query.length,
          error: summarizeError(error),
        });
        return [];
      }),
      searchOpenLibrary(query, 5).catch((error) => {
        const errorType = classifyError(error, { source: 'open_library' });
        addDegradedDependency('open_library');
        logEvent('warn', 'search_source_failed', {
          dependency: 'open_library',
          degraded: true,
          errorType,
          queryLength: query.length,
          error: summarizeError(error),
        });
        return [];
      }),
    ]);
    const googleCandidates = buildGoogleCandidates(query, googleResults);
    const openLibraryCandidates = buildOpenLibraryCandidates(query, openLibraryResults);
    const results = mergeSearchCandidates(query, localMatches, [...googleCandidates, ...openLibraryCandidates]);

    appendRequestLogMeta({
      resultsCount: results.length,
      localMatches: localMatches.length,
    });
    response.json({ results });
  } catch (error) {
    const fallbackResults = searchLocalLibrary(query);
    const errorType = classifyError(error);
    appendRequestLogMeta({
      degraded: true,
      outcome: 'fallback_used',
      errorType: 'fallback_used',
      fallbackReason: 'search_pipeline_failed',
      fallbackReasonType: errorType,
      resultsCount: fallbackResults.length,
    });
    logEvent('warn', 'search_pipeline_fallback', {
      degraded: true,
      errorType,
      queryLength: query.length,
      error: summarizeError(error),
    });
    response.json({ results: fallbackResults });
  }
});

app.post('/api/share-map', (request, response) => {
  cleanupShareStore();

  const map = request.body?.map;
  if (!map || typeof map !== 'object' || !map.id || !map.title) {
    appendRequestLogMeta({
      outcome: 'error',
      errorType: 'user_input_error',
    });
    response.status(400).json({ error: '缺少可分享的地图数据。' });
    return;
  }

  const now = Date.now();
  const shareId = randomUUID();
  const expiresAt = now + SHARE_TTL_MS;

  shareStore.set(shareId, {
    map,
    createdAt: now,
    expiresAt,
  });
  cleanupShareStore(now);

  appendRequestLogMeta({
    shareCreated: true,
  });
  response.json({
    shareId,
    expiresAt: new Date(expiresAt).toISOString(),
  });
});

app.get('/api/share-map/:id', (request, response) => {
  cleanupShareStore();

  const shareId = String(request.params.id || '').trim();
  appendRequestLogMeta({
    shareIdPresent: Boolean(shareId),
  });
  const entry = shareStore.get(shareId);

  if (!entry) {
    appendRequestLogMeta({
      outcome: 'error',
      errorType: 'user_input_error',
    });
    response.status(404).json({ error: '分享已失效或不存在' });
    return;
  }

  response.json({
    shareId,
    expiresAt: new Date(entry.expiresAt).toISOString(),
    map: entry.map,
  });
});

app.post('/api/generate-map', async (request, response) => {
  const input = request.body || {};
  const generateMeta = summarizeGenerateInput(input);
  appendRequestLogMeta(generateMeta);
  logEvent('log', 'generate_map_started', generateMeta);

  if (!input.title) {
    appendRequestLogMeta({
      outcome: 'error',
      errorType: 'user_input_error',
    });
    response.status(400).json({ error: '缺少必填字段：title。请先提供书名。' });
    return;
  }

  if (!SILICONFLOW_API_KEY) {
    if (!ALLOW_PROTOTYPE_FALLBACK) {
      appendRequestLogMeta({
        provider: 'unconfigured',
        outcome: 'error',
        errorType: 'internal_error',
      });
      logEvent('error', 'generate_map_unavailable', {
        reason: 'missing_siliconflow_api_key',
        errorType: 'internal_error',
        ...generateMeta,
      });
      sendGenerationUnavailable(response, '当前环境缺少 SILICONFLOW_API_KEY，暂时无法使用正式生成链路。');
      return;
    }
    const map = buildPrototypeMap(input);
    appendRequestLogMeta({
      provider: 'prototype-fallback',
      mode: 'prototype-fallback',
      degraded: true,
      outcome: 'fallback_used',
      errorType: 'fallback_used',
      fallbackReason: 'missing_siliconflow_api_key',
    });
    logEvent('warn', 'generate_map_fallback', {
      provider: 'prototype-fallback',
      mode: 'prototype-fallback',
      degraded: true,
      errorType: 'fallback_used',
      fallbackReason: 'missing_siliconflow_api_key',
      ...generateMeta,
    });
    response.json({ map, provider: 'prototype-fallback', mode: 'prototype-fallback' });
    return;
  }

  try {
    const deadline = Date.now() + getGenerationBudgetMs(input);
    const groundingTimeoutMs = capStageTimeout(deadline, COMPACT_GROUNDING_TIMEOUT_MS, 1200);
    const useCompactGrounding = input.sourceKind === 'catalog'
      ? hasKnownAuthor(input.author)
      : Boolean(input.author);
    const groundingContext = useCompactGrounding && groundingTimeoutMs
      ? await buildCompactGroundingContext(input, groundingTimeoutMs)
      : '';
    const compressedContent = input.sourceKind === 'upload'
      ? buildCompressedUploadContent(input.content)
      : '';
    const modelTimeoutMs = input.sourceKind === 'upload'
      ? capStageTimeout(deadline, UPLOAD_COMPACT_TIMEOUT_MS, 12000)
      : capStageTimeout(deadline, CATALOG_COMPACT_TIMEOUT_MS, 10000);

    if (!modelTimeoutMs) {
      throw new Error('Remaining generation budget is insufficient for compact map generation.');
    }

    const prompt = input.sourceKind === 'upload'
      ? buildCompactUploadPrompt(input, compressedContent, groundingContext)
      : buildCompactCatalogPrompt(input, groundingContext);
    const seed = await buildCompactReadingMap(input, prompt, modelTimeoutMs);
    const raw = inflateCompactReadingMapSeed(seed, input);
    const map = normalizeGeneratedMap(raw, input);
    const coverLookupTimeoutMs = capStageTimeout(deadline, COVER_LOOKUP_TIMEOUT_MS, 1000);
    map.cover = coverLookupTimeoutMs
      ? await resolveBookCover(map.title, map.author, map.cover, coverLookupTimeoutMs)
      : (map.cover || fallbackCover);
    appendRequestLogMeta({
      provider: 'siliconflow',
      mode: map.sourceMeta.mode,
    });
    response.json({ map, provider: 'siliconflow', mode: map.sourceMeta.mode });
  } catch (error) {
    const fallbackReasonType = classifyError(error, { source: 'siliconflow' });
    logEvent('warn', 'generate_map_failed', {
      provider: 'siliconflow',
      errorType: fallbackReasonType,
      error: summarizeError(error),
      ...generateMeta,
    });
    const canUseCompactFallback =
      error instanceof SyntaxError ||
      (error instanceof Error && /(timeout|aborted)/i.test(error.message));
    if (canUseCompactFallback) {
      const map = buildPrototypeMap(input);
      const coverLookupTimeoutMs = capStageTimeout(Date.now() + COVER_LOOKUP_TIMEOUT_MS, COVER_LOOKUP_TIMEOUT_MS, 0);
      map.cover = coverLookupTimeoutMs
        ? await resolveBookCover(map.title, map.author, map.cover, coverLookupTimeoutMs)
        : (map.cover || fallbackCover);
      appendRequestLogMeta({
        provider: 'prototype-fallback',
        mode: 'prototype-fallback',
        degraded: true,
        outcome: 'fallback_used',
        errorType: 'fallback_used',
        fallbackReason: 'compact_generation_failed',
        fallbackReasonType,
      });
      response.json({ map, provider: 'prototype-fallback', mode: 'prototype-fallback' });
      return;
    }
    if (!ALLOW_PROTOTYPE_FALLBACK) {
      appendRequestLogMeta({
        provider: 'siliconflow',
        outcome: 'error',
        errorType: fallbackReasonType,
      });
      sendGenerationUnavailable(
        response,
        error instanceof Error ? error.message : '生成失败，暂时没有产出可用的阅读地图。',
      );
      return;
    }
    const map = buildPrototypeMap(input);
    map.cover = await resolveBookCover(map.title, map.author, map.cover);
    appendRequestLogMeta({
      provider: 'prototype-fallback',
      mode: 'prototype-fallback',
      degraded: true,
      outcome: 'fallback_used',
      errorType: 'fallback_used',
      fallbackReason: 'generation_failed',
      fallbackReasonType,
    });
    response.json({ map, provider: 'prototype-fallback', mode: 'prototype-fallback' });
  }
});

app.post('/api/translate-map', async (request, response) => {
  const inputMap = request.body?.map;
  if (!inputMap) {
    appendRequestLogMeta({
      outcome: 'error',
      errorType: 'user_input_error',
    });
    response.status(400).json({ error: 'Missing required field: map' });
    return;
  }

  try {
    const map = await translateMapToEnglish(inputMap);
    response.json({ map });
  } catch (error) {
    const errorType = classifyError(error, { source: 'siliconflow' });
    appendRequestLogMeta({
      outcome: 'error',
      errorType,
      provider: 'siliconflow',
    });
    logEvent('error', 'translate_map_failed', {
      errorType,
      error: summarizeError(error),
    });
    response.status(500).json({ error: 'Map translation failed.' });
  }
});

const distDir = path.join(__dirname, 'dist');
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (request, response, next) => {
    if (request.path.startsWith('/api/')) {
      next();
      return;
    }
    response.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  logEvent('log', 'server_started', {
    port: PORT,
    nodeEnv: NODE_ENV,
  });
});
