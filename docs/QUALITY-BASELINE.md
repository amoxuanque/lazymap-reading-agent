# Quality Baseline

## Goal

`baseline:quality` 仍然是观察命令，不是强 gate。

P2-3a / P2-3b 开始，这个基线除了记录耗时，还要显式暴露 `catalog` 结果是否已经跌回“空壳模板”，以及是否达到 full-density 下限：
- 是否有内部提示外露
- 是否有高重复模板句
- 是否缺少具体推进线
- 方法卡、路线、误读风险是否像成品
- `knowledgeMap / methods / timeline / debates / routes` 是否仍停在 compact 密度

## Sample Set

固定样本定义在：
- [tests/fixtures/quality/samples.json](/Users/wangxuesong/Documents/懒人阅读项目/tests/fixtures/quality/samples.json:1)

当前关键样本：

1. `catalog-siddhartha`
- 类型：英文经典书 `catalog`
- 关注点：人物、阶段、关键转折能否进入地图；不能退化成空骨架或模板句

2. `catalog-atomic-habits`
- 类型：英文热门书 `catalog`
- 关注点：热门书不能只剩泛化效率学摘要，方法卡和路线要稳定

3. `catalog-the-lever-of-riches`
- 类型：英文冷门书 `catalog`
- 关注点：不能错配到 `The Book of Elon`，也不能为了保守而写成空壳

4. `catalog-zhizhenshinei`
- 类型：中文书 `catalog`
- 关注点：中文 title-only 结果是否仍有判断感、结构和边界

5. `upload-reading-map-sample`
- 类型：`upload`
- 样本来源：[tests/fixtures/upload-sample.txt](/Users/wangxuesong/Documents/懒人阅读项目/tests/fixtures/upload-sample.txt:1)
- 关注点：正文贴合度、正文不泄露到日志、upload 质量不被 catalog 改动带坏

6. `share-fixture-read`
- 类型：`share`
- 样本来源：[tests/fixtures/share-map.json](/Users/wangxuesong/Documents/懒人阅读项目/tests/fixtures/share-map.json:1)
- 关注点：shareId 读取稳定，不回落第一本书

## Catalog Quality Floor

`catalog` 的合格线不是“字段齐”，而是“像能体验的阅读地图”。

好结果至少应具备：
- 有明确总体判断，而不是“本书讨论了……”
- 有清晰阅读定位，告诉读者先看什么、为什么这样读
- 有 4 个以上具体模块，并尽量贴着真实推进线
- 有 10 条以上可迁移的方法卡，不是抽象概念标签
- 有推进线或时间线，而不是四张并列卡片
- 有争议、边界和误读风险
- 有至少 3 条面向不同人群的阅读路线
- `parts` 里的 `task / chapters / takeaways / position` 像编辑成品，不像填空
- `knowledgeMap.tools` 至少 4 条，而且要像作者真正提供的观察工具，不是 fallback 概述

不合格结果的典型症状：
- 模板感太强，标题、正文、bullets 反复套同一句
- `overview / parts / methods / routes` 只是换壳重复
- 文本里出现 `catalog 模式`、`partial-fallback`、`seed` 等内部口径
- `quotes` 像内部说明，不像用户可读的关键判断
- 章节、人物、关系、关键转折完全没进入地图
- 看起来像兜底模板，不像一张能读的地图

## Quality Reference

`The Book of Elon` 当前可作为“质量下限参考”，原因不是它完美，而是它至少满足：
- 有总体判断
- 有阅读定位
- 有模块拆解
- 有方法卡
- 有推进线
- 有争议与边界
- 有面向不同读者的路线

`Siddhartha / 悉达多` 之前不合格的原因：
- 模块虽然凑够了，但大量文案是模板扩写
- 标题和 bullets 反复复用同一句
- `quotes` 区域出现内部说明
- `parts` 缺少人物、关系和转折的阅读任务
- 路线、方法和误读风险更像兜底文案，不像编辑成品

## Manual Rubric

人工评分继续按 1-5 分记录：

1. 结构完整性
- 看 `oneLiner / overview / parts / methods / routes / debates` 是否齐

2. 贴合度
- `catalog` 是否围绕真实书名、作者和稳定线索
- `upload` 是否围绕正文结构与判断

3. 判断感
- 是否有明确总体判断、阅读定位和模块任务

4. 可读性
- 普通用户是否能直接读，不需要翻译内部术语

5. 误配风险
- 是否明显错到别的书、别的作者、别的领域

6. fallback 状态
- `formal`
- `partial-fallback`
- `prototype-fallback`

7. 性能表现
- `totalDurationMs`
- `compact_model.durationMs`
- `cover_lookup.durationMs`

## Baseline Observation Fields

`baseline:quality` 对 `catalog` 样本新增这几项观察字段：
- `knowledgeToolCount`
- `timelineCount`
- `debateCount`
- `routeCount`
- `methodItemCount`
- `fullDensityCoverage`
- `repeatedTemplateRisk`
- `internalLeakRisk`
- `specificityLevel`
- `routeQuality`
- `methodQuality`
- `misreadRiskCoverage`

这些字段目前只是启发式判断，不参与 `check:release`。

## Suggested Score Sheet

| sampleId | 结构完整性 | 贴合度 | 判断感 | 可读性 | 误配风险 | fallback 状态 | 模板风险 | 内部泄露 | 性能备注 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| catalog-siddhartha |  |  |  |  |  |  |  |  |  |  |
| catalog-atomic-habits |  |  |  |  |  |  |  |  |  |  |
| catalog-the-lever-of-riches |  |  |  |  |  |  |  |  |  |  |
| catalog-zhizhenshinei |  |  |  |  |  |  |  |  |  |  |
| upload-reading-map-sample |  |  |  |  |  |  |  |  |  |  |
| share-fixture-read |  |  |  |  |  |  |  |  |  |  |

## Acceptable Standards

当前阶段可以接受：
- `partial-fallback`
- `cover fallback`
- 无真实 key 时的 `prototype-fallback`
- 外部依赖未配置导致的性能 `warn`

当前阶段必须判失败：
- 接口 `500`
- 明显错配到其他书
- `shareId` 读取回落第一本书
- 日志泄露上传正文
- 日志泄露 prompt
- 日志泄露 API Key
- `catalog` 正文出现内部提示词

## Performance Budget

当前只记录，不作为强 gate：

- `catalog formal`
  - 目标：15s-25s
  - 超过 30s：`warn`

- `upload formal`
  - 目标：10s-20s
  - 超过 30s：`warn`

- `check:release`
  - 继续作为强 gate

- `baseline:quality`
  - 只作为观察命令
  - 不纳入强 gate，避免外部依赖漂移造成误封锁

## Command

运行观察命令：

```bash
npm run baseline:quality
```

输出字段包括：
- `sampleId`
- `sourceKind`
- `expectedMode`
- `provider`
- `mode`
- `totalDurationMs`
- `fallbackUsed`
- `fallbackReasonType`
- `knowledgeToolCount`
- `timelineCount`
- `debateCount`
- `routeCount`
- `methodItemCount`
- `fullDensityCoverage`
- `repeatedTemplateRisk`
- `internalLeakRisk`
- `specificityLevel`
- `routeQuality`
- `methodQuality`
- `misreadRiskCoverage`
- `pass / warn / fail`
- `notes`
