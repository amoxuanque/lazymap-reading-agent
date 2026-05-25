import React, { useState } from 'react';
import { LogOut, UserRound } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { Button } from '../components/ui/Button';

export function Profile() {
  const { account, signInDemo, signOut } = useApp();
  const [name, setName] = useState('Amo');
  const [email, setEmail] = useState('amo@lazymap.local');

  if (!account) {
    return (
      <div className="mx-auto max-w-3xl min-h-screen px-4 pb-16 pt-10 text-zinc-300 sm:px-6 lg:px-8">
        <div className="rounded-[2rem] border border-white/5 bg-white/[0.02] p-8 sm:p-10">
          <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
            <UserRound className="h-7 w-7" />
          </div>
          <h1 className="text-4xl font-serif font-bold text-white">进入演示账户</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-400">
            这是开源公益分享版 LazyMap Reading Agent。登录本地演示账户后，你可以直接体验上传生成、全网搜索生成和分享链路。
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
              进入演示账户
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl min-h-screen px-4 pb-16 pt-10 text-zinc-300 sm:px-6 lg:px-8">
      <section className="rounded-[2rem] border border-white/5 bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.08),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] p-8 sm:p-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-zinc-300">本地演示账户</div>
            <h1 className="mt-6 text-5xl font-serif font-bold text-white">{account.name || '演示账户'}</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-400">
              这个项目面向 GitHub 开源分发。使用者 clone 项目后，复制 `.env.example` 为 `.env.local`，填入自己的
              SiliconFlow 与 Tavily Key，即可体验完整阅读地图生成链路。
            </p>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="border-white/10 text-zinc-300 hover:bg-white/5" onClick={signOut}>
              <LogOut className="mr-2 h-4 w-4" />
              退出
            </Button>
          </div>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-[1.8rem] border border-white/5 bg-black/15 p-6 sm:p-8">
            <div className="text-sm text-zinc-500">账户信息</div>
            <div className="mt-3 text-2xl font-semibold text-white">{account.name}</div>
            <div className="mt-1 text-sm text-zinc-400">{account.email}</div>
            <div className="mt-6 rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-zinc-400">
              当前版本不内置任何 API Key，也不启用积分购买或扣费逻辑。所有生成能力都依赖使用者在本地环境中自行配置密钥。
            </div>
          </div>

          <div className="rounded-[1.8rem] border border-white/5 bg-black/15 p-6 sm:p-8">
            <div className="text-sm text-zinc-500">开源使用说明</div>
            <div className="mt-5 space-y-3 text-sm leading-7 text-zinc-400">
              <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
                1. clone 项目后执行 `cp .env.example .env.local`
              </div>
              <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
                2. 在 `.env.local` 中配置你自己的 `SILICONFLOW_API_KEY` 与 `TAVILY_API_KEY`
              </div>
              <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
                3. 启动 `npm run dev:api` 与 `npm run dev`，即可体验上传生成、搜书生成与临时分享
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
