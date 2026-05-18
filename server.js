import express from 'express';
import dotenv from 'dotenv';
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
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '';
const TAVILY_BASE_URL = process.env.TAVILY_BASE_URL || 'https://api.tavily.com/search';
const GOOGLE_BOOKS_BASE_URL = process.env.GOOGLE_BOOKS_BASE_URL || 'https://www.googleapis.com/books/v1/volumes';
const OPEN_LIBRARY_BASE_URL = process.env.OPEN_LIBRARY_BASE_URL || 'https://openlibrary.org/search.json';
const SILICONFLOW_TIMEOUT_MS = Number(process.env.SILICONFLOW_TIMEOUT_MS || 90000);
const TAVILY_TIMEOUT_MS = Number(process.env.TAVILY_TIMEOUT_MS || 12000);
const GOOGLE_BOOKS_TIMEOUT_MS = Number(process.env.GOOGLE_BOOKS_TIMEOUT_MS || 12000);
const OPEN_LIBRARY_TIMEOUT_MS = Number(process.env.OPEN_LIBRARY_TIMEOUT_MS || 12000);
const ALLOW_PROTOTYPE_FALLBACK = process.env.ALLOW_PROTOTYPE_FALLBACK
  ? ['1', 'true', 'yes', 'on'].includes(String(process.env.ALLOW_PROTOTYPE_FALLBACK).toLowerCase())
  : NODE_ENV !== 'production';

app.use(express.json({ limit: '2mb' }));

const fallbackCover = 'https://images.unsplash.com/photo-1512820790803-83ca734da794?q=80&w=800&auto=format&fit=crop';

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

function scoreLibraryBook(book, query) {
  const normalizedQuery = normalize(query);
  const fields = [book.title, book.author, ...(book.aliases || [])].map(normalize);

  let score = 0;
  fields.forEach((field) => {
    if (!field) {
      return;
    }

    if (field === normalizedQuery) {
      score += 160;
    } else if (field.startsWith(normalizedQuery)) {
      score += 90;
    } else if (field.includes(normalizedQuery)) {
      score += 45;
    }
  });

  tokenize(query).forEach((token) => {
    const normalizedToken = normalize(token);
    fields.forEach((field) => {
      if (normalizedToken && field.includes(normalizedToken)) {
        score += 18;
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
    .filter((item) => item.score >= 60)
    .sort((a, b) => b.score - a.score)
    .map(({ book }) => book);
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
  const sectionOrdinals = ['第一部分', '第二部分', '第三部分', '第四部分', '第五部分', '第六部分'];
  const overviewOrdinals = ['第一层', '第二层', '第三层', '第四层'];
  const normalizedOverview =
    raw?.overview?.cards?.length >= 4
      ? {
          ...raw.overview,
          cards: raw.overview.cards.slice(0, 4).map((card, index) => ({
            ...card,
            layer: overviewOrdinals[index],
            points: Array.isArray(card?.points) && card.points.length >= 3
              ? card.points.slice(0, 3)
              : [`抓住 ${trimText(card?.title) || '这一层'}`, '看清它为何重要', '记住最该带走的判断'],
          })),
        }
      : fallback.overview;
  const normalizedParts =
    raw?.parts?.length >= 4
      ? raw.parts.slice(0, 6).map((part, index) => {
          const title = trimText(part?.title) || `${input.title} 的关键模块`;
          const navDesc = trimText(part?.navDesc) || trimText(part?.task) || trimText(part?.intro) || `这一部分最该读的，是 ${title} 到底怎样影响全书判断。`;
          const intro = trimText(part?.intro) || `${title} 不是普通章节概括，而是这本书里必须先读懂的一段结构。`;
          const task = trimText(part?.task) || `先搞清 ${title} 在整本书里到底承担什么任务。`;
          const position = trimText(part?.position) || `把这一部分当作整本书的关键转折点来看。`;
          const takeaways = Array.isArray(part?.takeaways) && part.takeaways.length >= 3
            ? part.takeaways.slice(0, 3)
            : [navDesc, task, position].map((item) => trimText(item)).filter(Boolean).slice(0, 3);
          const chapters = Array.isArray(part?.chapters) && part.chapters.length >= 3
            ? part.chapters.slice(0, 4)
            : takeaways.slice(0, 3);
          const tags = Array.isArray(part?.tags) && part.tags.length
            ? part.tags.slice(0, 3)
            : [title, trimText(part?.subtitle), chapters[0]].filter(Boolean).slice(0, 3);

          return {
            ...part,
            id: part?.id || `part-${index + 1}`,
            title,
            subtitle: trimText(part?.subtitle) || sectionOrdinals[index] || `第${index + 1}部分`,
            navDesc,
            intro,
            tags,
            task,
            takeaways,
            chapters,
            position,
          };
        })
      : fallback.parts;
  return {
    ...fallback,
    ...raw,
    overview: normalizedOverview,
    knowledgeMap:
      raw?.knowledgeMap?.areas?.length >= 4 && raw?.knowledgeMap?.tools?.length >= 3
        ? raw.knowledgeMap
        : fallback.knowledgeMap,
    parts: normalizedParts,
    methods:
      raw?.methods?.items?.length >= 12 && raw?.methods?.categories?.length >= 3
        ? raw.methods
        : fallback.methods,
    timeline: raw?.timeline?.length >= 4 ? raw.timeline : fallback.timeline,
    quotes: raw?.quotes?.length >= 4 ? raw.quotes : fallback.quotes,
    debates: raw?.debates?.length >= 2 ? raw.debates : fallback.debates,
    routes: raw?.routes?.length >= 3 ? raw.routes : fallback.routes,
    id: `generated-${toSlug(raw?.title || input.title || 'map')}-${Date.now()}`,
    title: raw?.title || input.title,
    author: raw?.author || input.author || fallback.author || '',
    aliases: [raw?.title || input.title].filter(Boolean),
    saves: 0,
    status: 'has_map',
    visibility: 'private',
    sourceMeta: {
      kind: input.sourceKind === 'upload' ? 'upload' : 'generated',
      mode: input.content ? 'source-grounded' : 'title-only',
      summary: input.content
        ? '基于上传内容和补充书目线索做出的结构化阅读地图。'
        : '基于书名与网页检索线索生成的 reading map，优先保证结构完整与可读性。',
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

书名：${input.title}
作者：${input.author || 'Unknown'}

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

function isWeakMethodItem(item) {
  const title = trimText(item?.title);
  const desc = trimText(item?.desc);
  return !title || !desc || title.length < 4 || title.includes('方法') || desc.length < 22 || genericMethodTitlePattern.test(title);
}

function isWeakOverviewCard(card) {
  const title = trimText(card?.title);
  const desc = trimText(card?.desc);
  const points = Array.isArray(card?.points) ? card.points.filter(Boolean) : [];
  return !title || !desc || isGenericPartTitle(title) || desc.length < 26 || points.length < 3;
}

function isWeakPartItem(part) {
  const navDesc = trimText(part?.navDesc);
  const task = trimText(part?.task);
  const position = trimText(part?.position);
  const intro = trimText(part?.intro);
  return (
    isGenericPartTitle(part?.title) ||
    navDesc.length < 18 ||
    task.length < 18 ||
    position.length < 18 ||
    intro.length < 40 ||
    !Array.isArray(part?.takeaways) || part.takeaways.length < 3 ||
    !Array.isArray(part?.chapters) || part.chapters.length < 3
  );
}

function isWeakQuoteItem(item) {
  const quote = trimText(item?.quote);
  const note = trimText(item?.note);
  return !quote || quote.length < 8 || quote.length > 42 || quote.includes('关键句') || genericQuotePattern.test(quote) || note.length < 10;
}

function collectQualityIssues(map) {
  const issues = [];
  const weakPartTitles = (map?.parts || []).map((item) => item?.title).filter((title) => isGenericPartTitle(title));
  const weakPartCount = (map?.parts || []).filter((item) => isWeakPartItem(item)).length;
  const weakMethodCount = (map?.methods?.items || []).filter((item) => isWeakMethodItem(item)).length;
  const weakQuoteCount = (map?.quotes || []).filter((item) => isWeakQuoteItem(item)).length;
  const weakRouteCount = (map?.routes || []).filter((item) => !trimText(item?.route) || !Array.isArray(item?.focus) || item.focus.length < 2).length;
  const weakDebateCount = (map?.debates || []).filter((item) => trimText(item?.value).length < 12 || trimText(item?.reservation).length < 12).length;
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
    issues.push(`关键句不够像可摘记原句：当前 ${map?.quotes?.length || 0} 条，其中较弱 ${weakQuoteCount} 条。`);
  }
  if (!map?.routes || map.routes.length < 3 || weakRouteCount > 0) {
    issues.push(`阅读路线不够清晰：当前 ${map?.routes?.length || 0} 条，其中较弱 ${weakRouteCount} 条。`);
  }
  if (!map?.debates || map.debates.length < 2 || weakDebateCount > 0) {
    issues.push(`争议与边界不够锋利：当前 ${map?.debates?.length || 0} 条，其中较弱 ${weakDebateCount} 条。`);
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
5. 关键句必须像能被读者摘记的硬句，不要写成说明句。
6. 禁止引入与这本书无直接关联的外国案例、书外事件或噪音实体，除非补充线索明确支持。

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
- quotes 目标 5 到 8 条，优先使用补充线索里的候选原句或高度贴近原意的关键判断。
- routes 保持 3 到 4 条，focus 每条至少 2 个点。
- debates 每条都要写清“为什么今天仍值得带走”和“为什么还要保留看”。

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
  const issues = collectQualityIssues(currentMap);
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
    console.warn('Quality polish failed, keeping current map.', error);
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
  const weakPartCount = (nextMap?.parts || []).filter((item) => isWeakPartItem(item)).length;

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
      console.warn('Overview polish failed, keeping existing overview.', error);
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
      console.warn('Methods booster failed, using structural fallback.', error);
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
      console.warn('Quotes booster failed, keeping existing quotes.', error);
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
      console.warn('Part polish failed, keeping existing parts.', error);
    }
  }

  const weakMethods = (nextMap?.methods?.items || []).filter((item) => isWeakMethodItem(item));
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
      console.warn('Weak methods polish failed, keeping existing methods.', error);
    }
  }

  return nextMap;
}

async function enrichSparseMap(input, groundingContext, analysisBrief, currentMap) {
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
    console.warn('Sparse map enrichment failed, keeping base map.', error);
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

function extractJsonCandidate(text) {
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

  throw new SyntaxError(`Unable to parse model JSON. Preview: ${cleaned.slice(0, 240)}`);
}

async function callSiliconFlow({ prompt, maxTokens = 5000, temperature = 0.35, responseFormat = 'json_object', model = SILICONFLOW_MODEL }) {
  const response = await fetch(`${SILICONFLOW_BASE_URL}/chat/completions`, {
    method: 'POST',
    signal: AbortSignal.timeout(SILICONFLOW_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${SILICONFLOW_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      stream: false,
      max_tokens: maxTokens,
      temperature,
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

  return responseFormat === 'json_object' ? extractJsonCandidate(content) : content.trim();
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
    console.warn('Map translation failed, keeping original map.', error);
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
  } = options;

  const response = await fetch(TAVILY_BASE_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(TAVILY_TIMEOUT_MS),
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

async function searchGoogleBooks(query, maxResults = 5) {
  if (!String(query || '').trim()) {
    return [];
  }

  const url = new URL(GOOGLE_BOOKS_BASE_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('maxResults', String(maxResults));
  url.searchParams.set('printType', 'books');

  const response = await fetch(url, {
    signal: AbortSignal.timeout(GOOGLE_BOOKS_TIMEOUT_MS),
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
      oneLiner: { zh: volumeInfo.description ? String(volumeInfo.description).slice(0, 120) : `来自全网检索，可继续消耗积分生成《${title}》地图。` },
      saves: 0,
      status: 'no_map_paid',
      aliases: [title, ...(volumeInfo.subtitle ? [volumeInfo.subtitle] : [])],
      subtitle: volumeInfo.subtitle,
      firstPublishYear: volumeInfo.publishedDate ? Number(String(volumeInfo.publishedDate).slice(0, 4)) : undefined,
      source: 'catalog',
      matchReason: volumeInfo.categories?.[0] || '来自 Google Books 书籍元数据。',
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
    };
  });
}

function mergeSearchCandidates(query, localMatches, candidates) {
  const localByTitle = new Map();
  libraryMaps.forEach((item) => {
    [item.title, ...(item.aliases || [])].forEach((alias) => {
      localByTitle.set(normalize(alias), item);
    });
  });

  const merged = [...localMatches];

  candidates.forEach((candidate, index) => {
    const localHit = localByTitle.get(normalize(candidate.title));
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
  const withKnownAuthors = deduped.filter((item) => hasKnownAuthor(item.author));

  if (withKnownAuthors.length > 0) {
    return withKnownAuthors;
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

async function resolveBookCover(title, author, currentCover) {
  const safeCurrentCover = String(currentCover || '').trim();
  if (safeCurrentCover && safeCurrentCover !== fallbackCover && !safeCurrentCover.includes('example.com')) {
    return safeCurrentCover;
  }

  try {
    const results = await searchGoogleBooks([title, author].filter(Boolean).join(' '), 1);
    const candidate = buildGoogleCandidates(title, results)[0];
    return candidate?.cover || safeCurrentCover || fallbackCover;
  } catch (error) {
    console.warn('Cover lookup failed, keeping fallback cover.', error);
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
      searchTavily(`${query} 这本书讲什么 核心观点 主要内容`, { searchDepth: 'advanced', maxResults: 3 }),
      searchTavily(`${query} 目录 章节 框架`, { searchDepth: 'advanced', maxResults: 3 }),
      searchTavily(`${query} 书摘 金句 摘录 摘抄`, { searchDepth: 'advanced', maxResults: 3, includeRawContent: true }),
    ]);
    const results = mergeTavilyResults([coreResults, structureResults, quoteResults])
      .filter((item) => isRelevantGroundingResult(item, query));
    if (results.length === 0) {
      return '';
    }
    return buildGroundingDossier(results);
  } catch (error) {
    console.warn('Tavily grounding search failed.', error);
    return '';
  }
}

async function buildAnalysisBrief(input, groundingContext) {
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

  return callSiliconFlow({ prompt, maxTokens: 1600, temperature: 0.25, responseFormat: 'text' });
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
  "author": "作者",
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

function buildMetaPrompt(input, groundingContext, analysisBrief) {
  return `
你现在是阅读地图总编辑。请先只生成这本书的“阅读入口层”，不要输出知识地图、模块、方法、时间线等其它区块。

目标：
1. 让读者一进来就知道这本书真正讲什么。
2. 语言要像成熟阅读产品，不像普通摘要。
3. 如果是 title-only 模式，可以依据补充线索做稳健概括，但不要假造细碎章节。
4. 一句话结论要有判断，不要只是“本书探讨了……”。

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
- quotes 输出 4 到 6 条，允许是高度贴近原意的关键判断，不必强行逐字引用。
- debates 输出 2 到 4 条，必须写出价值与保留。
- routes 输出 3 到 4 条，针对不同读者给出清晰阅读入口。
- quote 优先选“能代表作者判断”的句子，不要写空洞正确话。
- 如果补充线索里提供了“候选原句”，优先使用这些短句作为 quote，尽量保留原始措辞。

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

async function buildReadingMapBySections(input, groundingContext, analysisBrief) {
  const merged = {};
  const sections = [
    { key: 'meta', prompt: buildMetaPrompt(input, groundingContext, analysisBrief), maxTokens: 1200, temperature: 0.3 },
    { key: 'knowledge', prompt: buildKnowledgePrompt(input, groundingContext, analysisBrief), maxTokens: 1100, temperature: 0.25 },
    { key: 'parts', prompt: buildPartsPrompt(input, groundingContext, analysisBrief), maxTokens: 1400, temperature: 0.25 },
    { key: 'methods', prompt: buildMethodsPrompt(input, groundingContext, analysisBrief), maxTokens: 1200, temperature: 0.25 },
    { key: 'synthesis', prompt: buildSynthesisPrompt(input, groundingContext, analysisBrief), maxTokens: 1200, temperature: 0.25 },
  ];

  for (const section of sections) {
    try {
      const partial = await callSiliconFlow({
        prompt: section.prompt,
        maxTokens: section.maxTokens,
        temperature: section.temperature,
        responseFormat: 'json_object',
      });
      Object.assign(merged, partial);
    } catch (error) {
      console.warn(`Map section generation failed for ${section.key}.`, error);
    }
  }

  if (!Object.keys(merged).length) {
    throw new Error('All map section generations failed.');
  }

  return merged;
}

app.get('/api/health', (_request, response) => {
  const config = buildConfigStatus();
  response.json({
    ok: true,
    provider: config.siliconflowConfigured ? 'siliconflow' : (config.allowPrototypeFallback ? 'prototype-fallback' : 'unconfigured'),
    model: SILICONFLOW_MODEL,
    tavily: config.tavilyConfigured,
    config,
  });
});

app.get('/api/search-books', async (request, response) => {
  const query = String(request.query.q || '').trim();

  if (!query) {
    response.json({ results: libraryMaps });
    return;
  }

  try {
    const localMatches = searchLocalLibrary(query);
    const [googleResults, openLibraryResults] = await Promise.all([
      searchGoogleBooks(query, 5).catch(() => []),
      searchOpenLibrary(query, 5).catch(() => []),
    ]);
    const googleCandidates = buildGoogleCandidates(query, googleResults);
    const openLibraryCandidates = buildOpenLibraryCandidates(query, openLibraryResults);
    const results = mergeSearchCandidates(query, [...localMatches, ...googleCandidates, ...openLibraryCandidates], []);

    response.json({ results });
  } catch (error) {
    console.error('Search pipeline failed, falling back to local library only.', error);
    response.json({ results: searchLocalLibrary(query) });
  }
});

app.post('/api/generate-map', async (request, response) => {
  const input = request.body || {};
  if (!input.title) {
    response.status(400).json({ error: '缺少必填字段：title。请先提供书名。' });
    return;
  }

  if (!SILICONFLOW_API_KEY) {
    if (!ALLOW_PROTOTYPE_FALLBACK) {
      sendGenerationUnavailable(response, '当前环境缺少 SILICONFLOW_API_KEY，暂时无法使用正式生成链路。');
      return;
    }
    const map = buildPrototypeMap(input);
    response.json({ map, provider: 'prototype-fallback', mode: 'prototype-fallback' });
    return;
  }

  try {
    const groundingContext = await buildGroundingContext(input);
    const useDeepAnalysisStage = Boolean(input.content && String(input.content).length > 4000);
    const analysisBrief = useDeepAnalysisStage || input.sourceKind === 'catalog'
      ? await buildAnalysisBrief(input, groundingContext)
      : '';
    const raw = await buildReadingMapBySections(input, groundingContext, analysisBrief);
    const shouldRunSparsePass = Boolean(input.content && String(input.content).length > 6000);
    const enrichedRaw = shouldRunSparsePass
      ? await enrichSparseMap(input, groundingContext, analysisBrief, raw)
      : raw;
    const editorialRaw = await enrichEditorialDepth(input, groundingContext, analysisBrief, enrichedRaw);
    const polishedRaw = await polishMapQuality(input, groundingContext, analysisBrief, editorialRaw);
    const map = normalizeGeneratedMap(polishedRaw, input);
    map.cover = await resolveBookCover(map.title, map.author, map.cover);
    response.json({ map, provider: 'siliconflow', mode: map.sourceMeta.mode });
  } catch (error) {
    console.error('SiliconFlow generation failed, falling back.', error);
    if (!ALLOW_PROTOTYPE_FALLBACK) {
      sendGenerationUnavailable(
        response,
        error instanceof Error ? error.message : '生成失败，暂时没有产出可用的阅读地图。',
      );
      return;
    }
    const map = buildPrototypeMap(input);
    map.cover = await resolveBookCover(map.title, map.author, map.cover);
    response.json({ map, provider: 'prototype-fallback', mode: 'prototype-fallback' });
  }
});

app.post('/api/translate-map', async (request, response) => {
  const inputMap = request.body?.map;
  if (!inputMap) {
    response.status(400).json({ error: 'Missing required field: map' });
    return;
  }

  try {
    const map = await translateMapToEnglish(inputMap);
    response.json({ map });
  } catch (error) {
    console.error('Map translation failed.', error);
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
  console.log(`Lanren Read API listening on http://localhost:${PORT}`);
});
