# LazyMap Reading Agent

一个面向中文阅读地图生成的单页应用原型。

当前版本重点能力：
- 上传 `EPUB / TXT / MD` 直接生成阅读地图
- 输入书名，全网搜索后生成阅读地图
- 阅读地图支持更深的模块、方法卡、时间线、关键句、争议与阅读路线
- 积分制计费：
  - 上传文件生成：`50` 积分 / 次
  - 全网搜索生成：`150` 积分 / 次

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

至少需要：
- `SILICONFLOW_API_KEY`
- `TAVILY_API_KEY`

启动：

```bash
npm run dev
npm run dev:api
```

默认地址：
- 前端：`http://localhost:3000`
- API：`http://localhost:8787`

## 部署

推荐 Zeabur：
- Web Service 运行前端
- Node Service 运行 `server.js`
- 在平台配置同名环境变量

## 目录

- `src/`：前端页面、组件、状态
- `server.js`：后端代理、搜书、地图生成、分享支持
- `docs/`：SOP 沉淀
- `skills/`：项目级可复用 skill 源文件
