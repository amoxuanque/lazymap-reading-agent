# LazyMap Reading Agent

LazyMap 是一个面向中文阅读地图生成的开源公益体验版 / Demo Beta。

当前版本重点能力：
- 上传 `EPUB / TXT / MD` 直接生成阅读地图
- 输入书名，全网搜索后生成阅读地图
- 阅读地图支持更深的模块、方法卡、时间线、关键句、争议与阅读路线
- 已建立发布闸门、请求诊断、健康检查、阶段观测和质量基线

## 项目定位

当前上线定位：
- 开源公益体验版
- 用于体验阅读地图生成链路，不承诺商用 SLA
- 优先适配 Vercel 体验版部署

当前边界：
- `shareId` 是进程内存存储，在 Vercel 多实例 / 冷启动 / 重新部署后可能失效
- 无数据库、无账号体系、无长期持久化分享
- 无 `SILICONFLOW_API_KEY` 时，生产环境无法使用正式生成链路

## 本地运行

前置：
- Node.js 20+

安装依赖：

```bash
npm install
```

配置环境变量：

```bash
cp .env.example .env.local
```

环境变量说明：
- 正式生成必需：`SILICONFLOW_API_KEY`
- Tavily 可选：`TAVILY_API_KEY`
  仅用于 grounding 增强，不是正式生成必需项

开发启动：

```bash
npm run dev
npm run dev:api
```

本地生产方式：

```bash
npm run build
npm start
```

默认地址：
- 前端：`http://localhost:3000`
- API：`http://localhost:8787`

## 发布与回归

上线前先跑：

```bash
npm run check:release
npm run baseline:quality
```

说明：
- `npm run check:release` 是强发布闸门
- `npm run baseline:quality` 是观察命令，不是强 gate

## 运行诊断

关键接口：
- `GET /api/health`
- `GET /api/ready`

说明：
- `/api/health`：服务存活与依赖摘要
- `/api/ready`：正式生成链路是否就绪

当前服务还具备：
- `X-Request-Id` 响应头
- `request_completed` 请求日志
- `generate_map_summary` 生成链路阶段观测日志

## 部署

当前最推荐部署方式：Vercel 体验版。

推荐配置：
- Framework Preset: 保持自动检测即可，运行细节以 `vercel.json` 为准
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`

最低环境变量：
- `SILICONFLOW_API_KEY`

可选增强环境变量：
- `TAVILY_API_KEY`

生产建议：
- 显式设置 `ALLOW_PROTOTYPE_FALLBACK=false`

Vercel 当前适配说明：
- `server.js` 同时兼容本地 `npm start` 和 Vercel Function
- 非 `/api/*` 路由由 `dist/index.html` 承接
- `/api/*` 继续由 Express 处理
- `shareId` 仅作为不稳定体验能力保留，不承诺长期可读

## 目录

- `src/`：前端页面、组件、状态
- `server.js`：后端 API、搜书、地图生成、分享支持
- `tests/`：smoke、fixtures、质量基线样本
- `scripts/`：发布检查、扫描、质量基线命令
- `docs/`：SOP、质量基线与运维说明
- `skills/`：项目级可复用 skill 源文件
