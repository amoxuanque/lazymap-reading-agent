# 懒人读书 Agent 发布与维护 SOP

## 目标

把 LazyMap 阅读地图 Agent 以可复用、可部署、可继续迭代的方式发布到 GitHub 与 Zeabur，并把关键工作流沉淀为长期资产。

## 代码基线

发布前必须确认：
- 上传链路可解析 `EPUB / TXT / MD`
- 搜书入口不依赖 Tavily 兜底候选，优先本地图库、Google Books、Open Library
- 地图 grounding 仍保留 Tavily，用于章节、金句、结构线索补强
- 地图只保留中文界面
- 积分逻辑只有两种用户动作：
  - 上传文件生成：`50` 积分
  - 全网搜索生成：`150` 积分

## 发布步骤

1. 在正式目录执行：

```bash
npm install
npm run build
node --check server.js
```

2. 检查敏感信息：
- `.env.local` 不提交
- 只保留 `.env.example`

3. 初始化或更新 git：

```bash
git init
git add .
git commit -m "feat: release LazyMap reading agent"
```

4. 新建远端仓库并推送：

```bash
gh repo create amoxuanque/lazymap-reading-agent --public --source=. --remote=origin --push
```

## Zeabur 部署

环境变量：
- `PORT`
- `SILICONFLOW_API_KEY`
- `SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1`
- `TAVILY_API_KEY`

运行建议：
- 前端：Vite build 后静态托管
- 后端：`node server.js`

## 日常迭代规则

1. 搜书质量问题优先检查：
- 作者命中率
- 封面命中率
- 候选卡是否出现无作者脏结果

2. 地图质量问题优先检查：
- 方法卡数量是否被压缩
- 金句是否来自 grounding
- 模块标题是否是“编辑式判断”而不是摘要标题

3. UI 改动约束：
- 默认只保留中文
- 不向用户暴露内部 API 成本、利润率、模型切换逻辑
- 积分提示只保留动作级表达

## 回归清单

每次发布前至少做这 6 项：
- 搜一本中文书
- 搜一本英文书
- 上传一个 EPUB
- 打开地图详情页
- 复制分享链接
- 查看积分扣减是否正确
