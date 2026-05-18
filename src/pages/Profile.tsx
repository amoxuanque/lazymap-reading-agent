import React, { useMemo, useState } from 'react';
import { Coins, LogOut, RefreshCw, ShoppingBag, UserRound } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { ACTION_COSTS, CREDIT_PACKS, actionLabel, estimatePackCapacity, getPackCredits } from '../lib/billing';
import { Button } from '../components/ui/Button';

export function Profile() {
  const { account, signInDemo, signOut, purchasePack, resetCredits } = useApp();
  const [name, setName] = useState('Amo');
  const [email, setEmail] = useState('amo@lazymap.local');

  const usageSummary = useMemo(() => {
    if (!account) {
      return { generations: 0 };
    }

    return account.usageHistory.reduce(
      (summary) => {
        summary.generations += 1;
        return summary;
      },
      { generations: 0 },
    );
  }, [account]);

  if (!account) {
    return (
      <div className="mx-auto max-w-3xl min-h-screen px-4 pb-16 pt-10 text-zinc-300 sm:px-6 lg:px-8">
        <div className="rounded-[2rem] border border-white/5 bg-white/[0.02] p-8 sm:p-10">
          <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
            <UserRound className="h-7 w-7" />
          </div>
          <h1 className="text-4xl font-serif font-bold text-white">登录账户</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-400">
            当前版本先把账户、积分购买和消耗链路跑通。登录后会先发放一份演示积分，方便你直接体验搜索、生成和分享。
          </p>

          <div className="mt-8 grid gap-4">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="昵称"
              className="rounded-2xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-white outline-none transition focus:border-amber-500/40"
            />
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="邮箱"
              className="rounded-2xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-white outline-none transition focus:border-amber-500/40"
            />
          </div>

          <div className="mt-6">
            <Button
              className="w-full bg-amber-500 text-zinc-900 hover:bg-amber-600"
              onClick={() => signInDemo({ name, email })}
            >
              登录并领取演示积分
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl min-h-screen px-4 pb-16 pt-10 text-zinc-300 sm:px-6 lg:px-8">
      <section className="rounded-[2rem] border border-white/5 bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.08),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] p-8 sm:p-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-zinc-300">我的积分</div>
            <h1 className="mt-6 text-5xl font-serif font-bold text-white">{account.creditBalance.toLocaleString()} 积分</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-400">
              上传文件生成 {ACTION_COSTS.generateUpload} 积分一次；全网搜索生成 {ACTION_COSTS.generateCatalog} 积分一次。
            </p>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="border-white/10 text-zinc-300 hover:bg-white/5" onClick={resetCredits}>
              <RefreshCw className="mr-2 h-4 w-4" />
              重置演示积分
            </Button>
            <Button variant="outline" className="border-white/10 text-zinc-300 hover:bg-white/5" onClick={signOut}>
              <LogOut className="mr-2 h-4 w-4" />
              退出
            </Button>
          </div>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[1.8rem] border border-white/5 bg-black/15 p-6 sm:p-8">
            <div className="flex items-center gap-2 text-zinc-500">
              <Coins className="h-4 w-4" />
              <span className="text-sm">账户概览</span>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-4">
                <div className="text-xs text-zinc-500">当前积分</div>
                <div className="mt-2 text-2xl font-semibold text-white">{account.creditBalance}</div>
              </div>
              <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-4">
                <div className="text-xs text-zinc-500">累计生成</div>
                <div className="mt-2 text-2xl font-semibold text-white">{usageSummary.generations}</div>
              </div>
              <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-4">
                <div className="text-xs text-zinc-500">累计消耗</div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {account.usageHistory.reduce((sum, item) => sum + item.creditsCharged, 0)}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[1.8rem] border border-white/5 bg-black/15 p-6 sm:p-8">
            <div className="text-sm text-zinc-500">账户</div>
            <div className="mt-3 text-2xl font-semibold text-white">{account.name}</div>
            <div className="mt-1 text-sm text-zinc-400">{account.email}</div>
            <div className="mt-6 grid gap-3 text-sm text-zinc-400">
              <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">上传文件生成：{ACTION_COSTS.generateUpload} 积分 / 次</div>
              <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">全网搜索生成：{ACTION_COSTS.generateCatalog} 积分 / 次</div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-3">
        {CREDIT_PACKS.map((pack) => {
          const totalCredits = getPackCredits(pack);
          const capacity = estimatePackCapacity(pack);

          return (
            <div key={pack.id} className="rounded-[1.8rem] border border-white/5 bg-white/[0.02] p-6 sm:p-7">
              <div className="text-xs uppercase tracking-[0.24em] text-zinc-500">积分购买</div>
              <h2 className="mt-3 text-3xl font-serif font-bold text-white">{pack.name}</h2>
              <div className="mt-4 text-4xl font-semibold text-white">¥{pack.price}</div>
              <p className="mt-3 text-sm leading-7 text-zinc-400">{pack.highlight}</p>

              <div className="mt-6 grid gap-3 text-sm text-zinc-300">
                <div className="rounded-2xl border border-white/5 bg-black/15 px-4 py-3">到账积分：{totalCredits.toLocaleString()}</div>
                <div className="rounded-2xl border border-white/5 bg-black/15 px-4 py-3">可支持上传生成：约 {capacity.uploadMaps} 次</div>
                <div className="rounded-2xl border border-white/5 bg-black/15 px-4 py-3">可支持全网搜索生成：约 {capacity.searchMaps} 次</div>
              </div>

              <div className="mt-6">
                <Button
                  className="w-full bg-amber-500 text-zinc-900 hover:bg-amber-600"
                  onClick={() => purchasePack(pack.id)}
                >
                  <ShoppingBag className="mr-2 h-4 w-4" />
                  购买并充值
                </Button>
              </div>
            </div>
          );
        })}
      </section>

      <section className="mt-10 rounded-[1.8rem] border border-white/5 bg-white/[0.02] p-6 sm:p-7">
        <div className="text-sm text-zinc-500">最近消耗</div>
        <div className="mt-5 space-y-3">
          {account.usageHistory.length > 0 ? (
            account.usageHistory.map((usage) => (
              <div key={usage.id} className="flex items-start justify-between gap-4 rounded-2xl border border-white/5 bg-black/15 px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-white">{actionLabel(usage.kind)}</div>
                  <div className="mt-1 text-xs text-zinc-500">{usage.title || 'LazyMap action'} · {usage.createdAt.slice(0, 10)}</div>
                </div>
                <div className="text-sm text-amber-400">-{usage.creditsCharged} 积分</div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-white/5 bg-black/15 px-4 py-6 text-sm text-zinc-500">还没有使用记录，先去搜一本书试试。</div>
          )}
        </div>
      </section>
    </div>
  );
}
