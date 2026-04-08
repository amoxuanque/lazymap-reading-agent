export type BillingAction = 'search' | 'generateCatalog' | 'generateUpload';
export type CreditPackId = 'pack-1000' | 'pack-5000' | 'pack-10000';

export interface UsageRecord {
  id: string;
  kind: BillingAction;
  title?: string;
  creditsCharged: number;
  createdAt: string;
}

export interface CreditPack {
  id: CreditPackId;
  name: string;
  price: number;
  baseCredits: number;
  bonusRate: number;
  highlight: string;
}

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  creditBalance: number;
  usageHistory: UsageRecord[];
}

export const ACTION_COSTS: Record<BillingAction, number> = {
  search: 20,
  generateCatalog: 150,
  generateUpload: 50,
};

export const CREDIT_PACKS: CreditPack[] = [
  {
    id: 'pack-1000',
    name: '1000 积分',
    price: 9.9,
    baseCredits: 1000,
    bonusRate: 0,
    highlight: '入门包，无赠送积分，适合轻量试用。',
  },
  {
    id: 'pack-5000',
    name: '5000 积分',
    price: 49.9,
    baseCredits: 5000,
    bonusRate: 0.1,
    highlight: '加赠 10% 积分，适合高频搜书与连续生成。',
  },
  {
    id: 'pack-10000',
    name: '10000 积分',
    price: 99.9,
    baseCredits: 10000,
    bonusRate: 0.15,
    highlight: '加赠 15% 积分，适合长期深度使用。',
  },
];

export function getPackById(packId: CreditPackId) {
  return CREDIT_PACKS.find((pack) => pack.id === packId) || CREDIT_PACKS[1];
}

export function getPackCredits(pack: CreditPack) {
  return Math.round(pack.baseCredits * (1 + pack.bonusRate));
}

export function createDemoAccount(): UserAccount {
  return {
    id: 'demo-user',
    name: 'Amo',
    email: 'amo@lazymap.local',
    creditBalance: getPackCredits(getPackById('pack-5000')),
    usageHistory: [],
  };
}

export function estimatePackCapacity(pack: CreditPack) {
  const totalCredits = getPackCredits(pack);
  return {
    searches: Math.floor(totalCredits / ACTION_COSTS.search),
    uploadMaps: Math.floor(totalCredits / ACTION_COSTS.generateUpload),
    searchMaps: Math.floor(totalCredits / ACTION_COSTS.generateCatalog),
  };
}

export function actionLabel(kind: BillingAction) {
  if (kind === 'search') {
    return '全网搜书';
  }
  if (kind === 'generateUpload') {
    return '上传文件生成';
  }
  return '搜索并生成地图';
}

export function consumeAccountCredits(account: UserAccount | null, kind: BillingAction, title?: string) {
  if (!account) {
    return {
      ok: false as const,
      error: '请先登录账户。',
    };
  }

  const creditsNeeded = ACTION_COSTS[kind];
  if (account.creditBalance < creditsNeeded) {
    return {
      ok: false as const,
      error: `当前积分不足。${actionLabel(kind)}需要 ${creditsNeeded} 积分。`,
    };
  }

  const nextAccount: UserAccount = {
    ...account,
    creditBalance: account.creditBalance - creditsNeeded,
    usageHistory: [
      {
        id: `usage-${Date.now()}`,
        kind,
        title,
        creditsCharged: creditsNeeded,
        createdAt: new Date().toISOString(),
      },
      ...account.usageHistory,
    ].slice(0, 24),
  };

  return {
    ok: true as const,
    account: nextAccount,
    chargedCredits: creditsNeeded,
  };
}

export function purchaseCredits(account: UserAccount | null, packId: CreditPackId) {
  const pack = getPackById(packId);
  const credits = getPackCredits(pack);
  const base = account || createDemoAccount();

  return {
    ...base,
    creditBalance: base.creditBalance + credits,
  };
}
