import { loadGeneratedMaps, persistGeneratedMaps } from './storage';
import { ReadingMap, SearchBook } from './types';

const fallbackCover = 'https://images.unsplash.com/photo-1512820790803-83ca734da794?q=80&w=800&auto=format&fit=crop';

const baseMaps: ReadingMap[] = [
  {
    id: '1',
    title: 'The Book of Elon',
    author: 'Walter Isaacson',
    cover: 'https://images.unsplash.com/photo-1617791160505-6f00504e3519?q=80&w=800&auto=format&fit=crop',
    aliases: ['书 of Elon', 'Elon Musk', '马斯克传', 'The Book of Elon'],
    oneLiner: {
      zh: '把马斯克的世界观、方法论与文明野心拆成一张可浏览的阅读地图。',
      en: 'A map of Musk’s worldview, operating methods, and civilizational ambition.'
    },
    about: {
      zh: '这本书不是普通传记，更像一份把公开言论、公司实践、工程方法和未来主张重新编排后的认知系统图。真正有价值的不是八卦，而是他如何把价值判断、第一性原理、组织设计和长期议题连在一起。',
      en: 'More operating system than biography, this book turns Musk’s decisions into an integrated worldview.'
    },
    stats: {
      structure: 4,
      volume: 371
    },
    readingPosition: {
      zh: '先别把它当人物故事。更准确地说，这是一份关于目标、工程、组织与文明愿景的操作手册。'
    },
    overview: {
      title: '整本书其实只做了四件事',
      subtitle: '先定义什么值得做，再定义怎么想、怎么干，最后把公司嵌入对人类未来的想象。',
      cards: [
        {
          layer: '第一层',
          title: '先界定什么值得做',
          desc: '这本书先解决价值判断，再谈成功技巧。真正重要的是你做的事是否有用，是否提升了未来变好的概率。',
          points: ['有用比荣耀更重要', '使命先于标签', '长期问题值得更大投入'],
          color: 'from-orange-500 to-amber-500'
        },
        {
          layer: '第二层',
          title: '再决定用什么脑子思考',
          desc: '核心认知姿态不是聪明感，而是回到物理约束、材料成本、真实反馈和第一性原理，减少认知自欺。',
          points: ['默认自己可能有错', '先找真实约束', '别把惯例当答案'],
          color: 'from-pink-500 to-rose-500'
        },
        {
          layer: '第三层',
          title: '把组织改造成执行机器',
          desc: '愿景不能自动落地，真正把事情做出来的是删流程、去瓶颈、贴近现场、压缩周期和明确责任。',
          points: ['速度来自删减', '工厂也是产品', '执行是组织设计问题'],
          color: 'from-blue-500 to-cyan-500'
        },
        {
          layer: '第四层',
          title: '把公司放进文明叙事',
          desc: '能源、火箭、人工智能、脑机接口和火星被放进同一张长期地图里，公司被视为推动文明向前的机器。',
          points: ['企业承担长期目标', '技术被赋予文明含义', '未来议题进入战略'],
          color: 'from-violet-500 to-indigo-500'
        }
      ]
    },
    knowledgeMap: {
      areas: [
        { title: '互联网', status: '已验证', progress: 100, color: 'bg-orange-500', desc: 'Zip2 与支付阶段证明他先掌握的是信息与软件层面的杠杆。' },
        { title: '可持续能源', status: '主战场', progress: 68, color: 'bg-cyan-400', desc: 'Tesla、储能与太阳能被当作同一套能源系统，而不只是卖车。' },
        { title: '太空探索', status: '长期下注', progress: 42, color: 'bg-blue-500', desc: 'SpaceX 的终点不是发射业务，而是把进入太空和去火星的成本打到可持续。' },
        { title: '人工智能', status: '双刃剑', progress: 50, color: 'bg-purple-500', desc: '既兴奋又警惕，AI 被视为文明级变量，不能只看增长潜力。' },
        { title: '脑机接口', status: '前沿试探', progress: 22, color: 'bg-indigo-400', desc: '短期是医疗，长期是人类与更强系统并存时的带宽升级。' }
      ],
      tools: [
        {
          title: '第一性原理',
          desc: '不从类比出发，而从物理规律、材料成本和底层约束出发，重新判断什么是真的难、什么只是传统太重。',
          points: ['把问题拆到不能再拆', '别把行业经验当自然法则', '从底层重算成本与可能性']
        },
        {
          title: '白痴指数',
          desc: '用零件成本与成品成本的比值反查浪费，逼迫团队面对系统里的低效率。',
          points: ['先找浪费最高的环节', '用数字暴露流程幻觉', '把改进落到具体部件']
        },
        {
          title: '删减优先于优化',
          desc: '先删掉不必要的需求，再优化、再自动化，否则你只是在加速错误流程。',
          points: ['别急着自动化', '每一个流程都要有人能解释存在理由', '把现场反馈拉回决策层']
        }
      ]
    },
    parts: [
      {
        id: 'part1',
        title: '追求使命',
        subtitle: '第一部分',
        navDesc: '先解决什么值得投入，否则后面所有高强度执行都会像无意义透支。',
        intro: '这是价值底盘。它把“有用性”放在个人成功和职业荣耀之前，再把第一性原理接进来，形成马斯克式成功定义。',
        tags: ['先抓价值标准', '第一次读建议从这里开始'],
        task: '先解决“什么值得投入”，否则后面所有高强度执行都会像无意义透支。',
        takeaways: ['职业选择先过“是否有用”这一关。', '第一性原理是绕开行业惯性的工具。'],
        chapters: ['有用的人生', '像物理学家一样思考', '工程创造价值', '为未来而战'],
        position: '如果不理解这一层，后面的高压执行会显得像偏执。'
      },
      {
        id: 'part2',
        title: '极限硬核执行',
        subtitle: '第二部分',
        navDesc: '回答怎样把极难的事真的做出来，而不是做成一堆漂亮幻灯片。',
        intro: '这是全书最具现实指导意义的部分，详细拆解了如何通过删减流程、打破部门墙和压缩周期来重塑制造和工程体系。',
        tags: ['适合管理者和工程师', '最具实操价值'],
        task: '把组织变成一台高效执行机器，消除一切不增加价值的环节。',
        takeaways: ['最好的流程就是没有流程。', '设计如果很少被打回，通常说明你还不够激进。'],
        chapters: ['白痴指数', '删减与加速', '拥抱硬核', '工厂即产品'],
        position: '这是连接愿景与现实的桥梁。'
      },
      {
        id: 'part3',
        title: '建立公司',
        subtitle: '第三部分',
        navDesc: '这里不只是讲创业故事，而是讲连续下注、熬过危机和压回下一局的结构。',
        intro: '从 Zip2 到 PayPal，再到 SpaceX 和 Tesla，重点不是传奇，而是控制权、现金流和危机决策。',
        tags: ['适合创业者和高管', '理解风险与下注'],
        task: '在资源极度受限和不确定性极高时，如何保持生存并持续扩张。',
        takeaways: ['把退出收益变成更大问题的筹码。', '危机中仍要守住核心目标。'],
        chapters: ['Zip2 与 PayPal', 'SpaceX 的豪赌', 'Tesla 的产能地狱', '度过至暗时刻'],
        position: '它展示了理论在现实约束下如何变形和存活。'
      },
      {
        id: 'part4',
        title: '文明级议题',
        subtitle: '第四部分',
        navDesc: '最后一层不是公司管理，而是把企业放进人类未来的故事里。',
        intro: '当能源、太空、AI、脑机接口和人口问题放在一起看，你才会理解他为何总做“看起来不合理”的长期下注。',
        tags: ['适合战略视角', '理解长期叙事'],
        task: '理解他为什么不满足于做一家成功公司，而是不断把公司推向更大议题。',
        takeaways: ['长远叙事会改变今天的组织决策。', '企业不只是利润机器，也可能是文明基础设施。'],
        chapters: ['能源未来', '火星叙事', 'AI 风险', '脑机接口'],
        position: '这一层把全书从个人传记升级为文明议题索引。'
      }
    ],
    methods: {
      categories: ['价值标准', '认知方式', '执行机制', '组织管理', '创业下注', '文明议题'],
      items: [
        { id: '01', category: '价值标准', title: '先问是否有用，再问是否好看', desc: '有贡献的工作比体面的叙事更重要。' },
        { id: '02', category: '价值标准', title: '长期问题比热点问题更值钱', desc: '如果你只追逐当下热闹，通常很难形成真正高杠杆。' },
        { id: '03', category: '认知方式', title: '第一性原理拆解', desc: '把问题拆回物理规律、成本和底层约束。' },
        { id: '04', category: '认知方式', title: '用极限值倒逼判断', desc: '先看理论极限，再判断今天的优化空间。' },
        { id: '05', category: '执行机制', title: '先删减，再优化，再自动化', desc: '先干掉不必要的需求，否则你只是在加速错误流程。' },
        { id: '06', category: '执行机制', title: '工厂也是产品', desc: '制造系统本身必须被设计、迭代和压测。' },
        { id: '07', category: '组织管理', title: '责任落到具体个人', desc: '抽象团队不会负责，只有明确 owner 才会推进。' },
        { id: '08', category: '组织管理', title: '贴近现场做判断', desc: '不要只在会议室里管理产线和工程。' },
        { id: '09', category: '创业下注', title: '把退出收益变成下一次大下注的筹码', desc: '不是见好就收，而是把资源压回更长期问题。' },
        { id: '10', category: '文明议题', title: '把企业嵌入未来叙事', desc: '当你定义的是文明级问题，组织会按不同逻辑运行。' }
      ]
    },
    timeline: [
      { year: '1995-2002', title: '互联网与支付', desc: '从 Zip2 到 PayPal，先学习软件杠杆和创业游戏规则。' },
      { year: '2002-2008', title: 'SpaceX 与 Tesla 起盘', desc: '开始把注意力从赚钱转向更长期、资本更重的现实问题。' },
      { year: '2008-2018', title: '多线危机与产能地狱', desc: '愿景开始接受制造、现金流和组织能力的真实检验。' },
      { year: '2018-Now', title: '文明级议题集中爆发', desc: '能源、AI、脑机接口和火星计划被放进同一张长期路线图。' }
    ],
    quotes: [
      { quote: '有用比荣耀更重要。', note: '这是全书价值判断的地基。' },
      { quote: '最好的流程就是没有流程。', note: '执行部分最值得反复回看的管理判断。' },
      { quote: '工厂也是产品。', note: '把制造当成可设计对象，是他与很多企业家的分野。' }
    ],
    debates: [
      { title: '高压执行是否可持续', value: '它能极大压缩周期，让不可能的项目继续推进。', reservation: '个人代价极高，且难以大规模复制到所有组织。' },
      { title: '文明叙事是否遮蔽现实问题', value: '长期叙事会给团队更强意义感和资源动员能力。', reservation: '一旦叙事失控，容易把局部失败包装成历史必然。' }
    ],
    routes: [
      { audience: '第一次接触的人', route: '先看总览，再读第一部分和方法地图。', focus: ['使命判断', '第一性原理', '删减优先'] },
      { audience: '管理者 / 创业者', route: '重点读第二、第三部分，再回看知识地图。', focus: ['执行机制', '组织设计', '危机决策'] },
      { audience: '对未来议题感兴趣的人', route: '先看第四部分和时间线，再回到总览。', focus: ['能源', 'AI', '火星', '文明叙事'] }
    ],
    saves: 12450,
    status: 'has_map',
    visibility: 'public',
    sourceMeta: {
      kind: 'library',
      mode: 'source-grounded',
      summary: '来自项目内已整理样本，适合拿来对标阅读深度与页面结构。'
    }
  },
  {
    id: '2',
    title: '定位 (Positioning)',
    author: 'Al Ries, Jack Trout',
    cover: 'https://images.unsplash.com/photo-1557804506-669a67965ba0?q=80&w=800&auto=format&fit=crop',
    aliases: ['定位', 'Positioning', '品牌定位', 'Al Ries'],
    oneLiner: {
      zh: '品牌不是把自己讲完整，而是先在用户心智里抢到一个清楚的位置。',
      en: 'Brands win by owning a clear slot in the customer’s mind.'
    },
    about: {
      zh: '《定位》最核心的判断是：营销竞争的主战场不在工厂、不在渠道，甚至不完全在货架，而是在顾客心智里。信息过载时代，品牌首先要争夺的是一个可以被记住、被区分、被反复强化的位置。',
      en: 'Positioning argues that the key battlefield of marketing is the customer’s mind.'
    },
    stats: {
      structure: 4,
      volume: 220
    },
    readingPosition: {
      zh: '别把它当营销技巧手册，更适合把它当“心智竞争理论”的入门书来读。'
    },
    overview: {
      title: '这本书要你先抢心智，再谈传播',
      subtitle: '不是讲完整自己，而是找到类别、对手和用户已有认知之间最有利的位置。',
      cards: [
        { layer: '第一层', title: '心智容量有限', desc: '用户不会完整理解你，只会记住少数几个名字和标签。', points: ['信息过载', '记忆槽位有限', '先占位再扩展'], color: 'from-emerald-500 to-teal-500' },
        { layer: '第二层', title: '类别比产品更重要', desc: '多数人先记住类别，再记住代表品牌。', points: ['先当第一', '重新定义类别', '占据代表词'], color: 'from-sky-500 to-cyan-500' },
        { layer: '第三层', title: '竞争不是自说自话', desc: '定位必须相对某个强对手、强认知或强品类。', points: ['利用对手', '借旧认知进入', '别空讲优势'], color: 'from-amber-500 to-orange-500' },
        { layer: '第四层', title: '传播的任务是强化位置', desc: '传播不是讲更多，而是持续重复一个能被记住的位置。', points: ['清楚比全面重要', '重复比新奇重要', '一致性比花样重要'], color: 'from-fuchsia-500 to-pink-500' }
      ]
    },
    knowledgeMap: {
      areas: [
        { title: '用户心智', status: '主战场', progress: 100, color: 'bg-emerald-500', desc: '顾客心智是定位理论的真正战场。' },
        { title: '类别竞争', status: '高优先级', progress: 80, color: 'bg-cyan-500', desc: '先定义你在哪个类别打仗，再谈卖点。' },
        { title: '对手借力', status: '关键技巧', progress: 72, color: 'bg-amber-500', desc: '定位常常需要借用或反衬现有强品牌。' },
        { title: '传播压缩', status: '持续动作', progress: 76, color: 'bg-pink-500', desc: '一句话、一个词、一个位置，要反复强化。' }
      ],
      tools: [
        { title: '心智槽位', desc: '先理解用户脑中已经有什么，再决定你如何进入。', points: ['理解原有认知', '别从空白出发', '位置优先于功能'] },
        { title: '类别优先', desc: '多数时候，成为某一类的代表，比成为全能品牌更有效。', points: ['要么第一', '要么改写类别', '不要泛化'] }
      ]
    },
    parts: [
      { id: 'part1', title: '心智竞争', subtitle: '第一部分', navDesc: '先说明为什么传播战场在用户脑中。', intro: '如果不理解用户心智的有限容量，后面的定位动作都会失焦。', tags: ['基础判断', '进入全书入口'], task: '先确定传播对象的心智结构。', takeaways: ['心智容量有限。', '用户不会认真比较所有选项。'], chapters: ['传播过载', '心智简化', '记忆占位'], position: '这是全书的理论底盘。' },
      { id: 'part2', title: '如何占位', subtitle: '第二部分', navDesc: '讲清楚一个品牌如何进入已有认知结构。', intro: '定位不是自说自话，而是依附已有认知寻找最佳切口。', tags: ['方法论', '适合营销从业者'], task: '找到一个能被记住的位置。', takeaways: ['类别先于卖点。', '位置先于表达完整。'], chapters: ['第一法则', '类别代表', '重新定义'], position: '这是从理论到动作的第一跳。' },
      { id: 'part3', title: '借力竞争', subtitle: '第三部分', navDesc: '定位通常要相对对手或现有强势认知来做。', intro: '真正有效的定位常常不是单独成立，而是在竞争格局中成立。', tags: ['竞争视角', '实战强'], task: '利用已有认知降低进入成本。', takeaways: ['好定位往往是相对位置。', '借力比硬讲更省力。'], chapters: ['对手参照', '差异表达', '品类对抗'], position: '帮助你从“说自己”转向“卡位置”。' },
      { id: 'part4', title: '长期强化', subtitle: '第四部分', navDesc: '位置不是喊出来的，而是靠持续传播强化出来的。', intro: '品牌真正要做的是不断强化那个位置，而不是频繁换叙事。', tags: ['品牌建设', '长期主义'], task: '把定位变成可长期复用的传播动作。', takeaways: ['一致性高于变化。', '重复是定位真正的朋友。'], chapters: ['传播节奏', '长期一致', '品牌记忆'], position: '它回答了定位如何长期存活。' }
    ],
    methods: {
      categories: ['心智判断', '类别策略', '竞争打法', '传播动作'],
      items: [
        { id: '01', category: '心智判断', title: '先看心智里还有没有位置', desc: '传播前先判断用户脑中还有没有你能占的槽位。' },
        { id: '02', category: '类别策略', title: '争当某一类的代表词', desc: '品牌更容易被记住的方式，是绑定一个明确类别。' },
        { id: '03', category: '竞争打法', title: '借已有强认知切入', desc: '依附对手或行业结构来建立理解速度。' },
        { id: '04', category: '传播动作', title: '一句话说清核心位置', desc: '用户不会帮你总结，你必须自己压缩。' }
      ]
    },
    timeline: [
      { year: '传播环境', title: '信息过载成为常态', desc: '顾客不再完整理解品牌，只会记住极少数关键词。' },
      { year: '竞争逻辑', title: '从产品竞争转向心智竞争', desc: '谁先抢到位置，谁更容易形成长期优势。' },
      { year: '执行动作', title: '长期重复同一位置', desc: '定位不是一次创意，而是持续强化。' }
    ],
    quotes: [
      { quote: '营销不是产品之战，而是认知之战。', note: '全书最浓缩的一句话。' },
      { quote: '你不能在顾客心智中成为所有东西。', note: '这句话是许多品牌失败的原因说明。' }
    ],
    debates: [
      { title: '定位是否会压缩创新空间', value: '清楚的位置能显著提高被记住的概率。', reservation: '过度僵化也可能让品牌失去拓展空间。' }
    ],
    routes: [
      { audience: '品牌新手', route: '先读总览、心智竞争，再看传播动作。', focus: ['心智容量', '类别优先', '一句话表达'] },
      { audience: '操盘手', route: '先看竞争打法与长期强化。', focus: ['对手参照', '传播一致性', '位置维护'] }
    ],
    saves: 8920,
    status: 'has_map',
    visibility: 'public',
    sourceMeta: {
      kind: 'library',
      mode: 'source-grounded',
      summary: '来自项目内已整理样本，适合验证方法论书的地图结构。'
    }
  }
];

let generatedMaps: ReadingMap[] = loadGeneratedMaps();

export const catalogSeeds: SearchBook[] = [
  ...baseMaps,
  {
    id: 'seed-thinking-fast-slow',
    title: '思考，快与慢 (Thinking, Fast and Slow)',
    author: 'Daniel Kahneman',
    cover: fallbackCover,
    oneLiner: { zh: '系统 1 与系统 2，解释我们如何判断、偏误和决策。' },
    saves: 0,
    status: 'no_map_upload',
    aliases: ['思考快与慢', 'Thinking Fast and Slow', '丹尼尔 卡尼曼'],
    source: 'catalog'
  },
  {
    id: 'seed-peak',
    title: '刻意练习 (Peak)',
    author: 'Anders Ericsson',
    cover: fallbackCover,
    oneLiner: { zh: '高手不是天赋神话，而是训练结构设计的结果。' },
    saves: 0,
    status: 'no_map_paid',
    aliases: ['刻意练习', 'Peak', 'Ericsson'],
    source: 'catalog'
  },
  {
    id: 'seed-sapiens',
    title: '人类简史 (Sapiens)',
    author: 'Yuval Noah Harari',
    cover: fallbackCover,
    oneLiner: { zh: '从认知革命到虚构秩序，解释人类为何成为地球主导物种。' },
    saves: 0,
    status: 'no_map_paid',
    aliases: ['Sapiens', '人类简史', '尤瓦尔 赫拉利'],
    source: 'catalog'
  },
  {
    id: 'seed-atomic-habits',
    title: 'Atomic Habits',
    author: 'James Clear',
    cover: fallbackCover,
    oneLiner: { zh: '习惯不是靠意志力，而是靠环境和系统设计。' },
    saves: 0,
    status: 'no_map_paid',
    aliases: ['原子习惯', 'Atomic Habits', 'James Clear'],
    source: 'catalog'
  },
  {
    id: 'seed-lean-startup',
    title: '精益创业 (The Lean Startup)',
    author: 'Eric Ries',
    cover: fallbackCover,
    oneLiner: { zh: '用最小可行产品和反馈回路降低创业试错成本。' },
    saves: 0,
    status: 'no_map_paid',
    aliases: ['精益创业', 'Lean Startup', 'Eric Ries'],
    source: 'catalog'
  },
  {
    id: 'seed-zero-to-one',
    title: '从 0 到 1 (Zero to One)',
    author: 'Peter Thiel',
    cover: fallbackCover,
    oneLiner: { zh: '真正重要的创业不是复制，而是创造别人还没有做出的新东西。' },
    saves: 0,
    status: 'no_map_paid',
    aliases: ['Zero to One', '从0到1', 'Peter Thiel'],
    source: 'catalog'
  }
];

function dedupeMaps(maps: ReadingMap[]) {
  const seen = new Set<string>();
  return maps.filter((map) => {
    if (seen.has(map.id)) {
      return false;
    }
    seen.add(map.id);
    return true;
  });
}

export function getAllMaps() {
  return dedupeMaps([...generatedMaps, ...baseMaps]);
}

export function getFeaturedMaps() {
  return getAllMaps().slice(0, 6);
}

export function getMapById(mapId: string | null) {
  return getAllMaps().find((item) => item.id === mapId) || getAllMaps()[0];
}

export function addGeneratedMap(map: ReadingMap) {
  generatedMaps = [map, ...generatedMaps.filter((item) => item.id !== map.id)];
  persistGeneratedMaps(generatedMaps);
}

export function getShelfData() {
  const allMaps = getAllMaps();
  return {
    wantToRead: catalogSeeds.filter((item) => item.status !== 'has_map').slice(0, 3),
    organized: allMaps.slice(0, 4),
    favorited: allMaps.slice(0, 2),
    shared: allMaps.filter((item) => item.visibility === 'public').slice(0, 3),
  };
}
