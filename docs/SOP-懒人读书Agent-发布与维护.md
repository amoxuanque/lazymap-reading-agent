# 懒人读书 Agent 发布与维护 SOP

## 目标

把 LazyMap 以“Vercel 体验版”的方式稳定上线，并确保发布前可验证、发布后可诊断。

## 当前发布定位

当前版本适合：
- Vercel 体验版部署
- 开源体验和 Demo 演示
- 持续迭代内容质量，但不承诺商用 SLA

当前边界：
- `shareId` 是进程内存存储，在 Vercel 多实例 / 冷启动 / 重新部署后可能失效
- 无数据库、无账号体系、无长期持久化分享
- `baseline:quality` 是观察命令，不是发布强 gate

## 代码基线

发布前必须确认：
- 上传链路可解析 `EPUB / TXT / MD`
- 搜书入口优先本地图库、Google Books、Open Library
- Tavily 仅用于 grounding 增强，不是正式生成必需项
- 地图只保留中文界面
- `check:release` 与 `baseline:quality` 均通过

## 发布前命令

在正式目录执行：

```bash
npm install
npm run check:release
npm run baseline:quality
```

`npm run check:release` 当前会串行执行：
- `node --check server.js`
- `npm run lint`
- `npm run build`
- `npm run test:smoke`
- `npm run scan:decredit`
- `npm run scan:secrets`

通过口径：
- 构建、类型检查、后端语法检查全部通过
- 核心 API smoke 通过：`/api/health`、`/api/search-books`、`/api/generate-map`、`/api/share-map`
- `src/` 中不出现被禁止的积分文案与 `consumeCredits`
- `.env.local` 未入库，tracked files 中无明显明文 API Key

## 敏感信息规则

- `.env.local` 不提交
- 仓库只保留 `.env.example`
- 日志默认不记录：
  - API Key
  - 上传全文正文
  - prompt 原文

## Vercel 部署

当前最推荐：Vercel 体验版。

推荐配置：
- Framework Preset: 保持自动检测即可，运行细节以 `vercel.json` 为准
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: `dist`

最低环境变量：
- `SILICONFLOW_API_KEY`

可选增强：
- `TAVILY_API_KEY`
- 其他模型和超时变量按 `.env.example` 补充

生产建议：
- 显式设置 `ALLOW_PROTOTYPE_FALLBACK=false`

说明：
- 当前 `server.js` 会在本地 `npm start` 时 `listen`
- 在 Vercel 上则作为 Function 入口导出
- 非 `/api/*` 路由由前端静态产物承接
- `/api/*` 继续由 Express 处理
- `shareId` 仅作为不稳定体验能力保留

## 诊断口径

1. 后端每个请求都会返回 `X-Request-Id` 响应头。
2. 排查问题时，优先按 `requestId` 对照终端结构化日志，看：
- `route / method / status / durationMs`
- `errorType`
- 是否 `degraded`
- 是否 `fallback_used`
- `provider / mode / sourceKind`
- 若是 `/api/generate-map`，继续看 `generate_map_summary`
3. 健康检查优先看两个接口：
- `GET /api/health`
- `GET /api/ready`
4. 当前状态解释：
- `live`：进程正常、接口可响应
- `ready`：SiliconFlow 正式生成链路配置齐全
- `degraded`：正式生成可用，但 Tavily 或书目元数据依赖缺失
- `unconfigured`：缺关键正式生成配置，只能 fallback 或无法正式生成
5. 当前生成链路阶段观测重点看：
- `request_validation`
- `search_or_source_parse`
- `grounding`
- `compact_model`
- `seed_parse_or_repair`
- `inflate`
- `normalize`
- `cover_lookup`
- `fallback`
- `response_build`

## 上线后验收

上线后至少做一次：

1. 打开首页 `/`
2. `GET /api/health`
3. `GET /api/ready`
4. 搜书 `The Lever of Riches`，确认不误配 `The Book of Elon`
5. catalog 生成一次
6. upload 生成一次
7. `shareId` 创建和读取一次
8. 检查响应头存在 `X-Request-Id`
9. 检查日志存在 `request_completed`
10. 检查生成日志存在 `generate_map_summary`

## 回归清单

每次发布前先跑：

```bash
npm run check:release
npm run baseline:quality
```

自动检查通过后，再做这些人工回归：
- 搜一本中文书
- 搜一本英文书
- 上传一个 `EPUB` 或 `TXT`
- 打开地图详情页
- 创建一条分享链接并读取一次
