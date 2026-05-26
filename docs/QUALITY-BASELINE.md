# Quality Baseline

## Goal

P2-1 的目标不是优化内容质量，而是建立后续内容优化的固定评价基线。

当前阶段只解决三件事：
- 固定样本
- 固定人工评分 rubric
- 固定性能预算口径

真正调整 prompt、生成策略或内容密度，应放到后续 `P2-2`，不要混在本轮。

## Sample Set

当前固定样本清单定义在：
- [tests/fixtures/quality/samples.json](/Users/wangxuesong/Documents/懒人阅读项目/tests/fixtures/quality/samples.json:1)

样本说明：

1. `catalog-atomic-habits`
- 类型：英文热门书 `catalog`
- 关注点：结构是否齐、是否仍围绕书名、formal 与 fallback 差异

2. `catalog-the-lever-of-riches`
- 类型：英文冷门书 `catalog`
- 关注点：是否错配、是否围绕真实书名、fallback 与耗时

3. `catalog-zhizhenshinei`
- 类型：中文书 `catalog`
- 关注点：中文书名贴合度、结构齐备性、是否误配到英文热门书

4. `upload-reading-map-sample`
- 类型：`upload`
- 样本来源：[tests/fixtures/upload-sample.txt](/Users/wangxuesong/Documents/懒人阅读项目/tests/fixtures/upload-sample.txt:1)
- 关注点：正文贴合度、日志不泄露正文、upload 模式耗时

5. `share-fixture-read`
- 类型：`share`
- 样本来源：[tests/fixtures/share-map.json](/Users/wangxuesong/Documents/懒人阅读项目/tests/fixtures/share-map.json:1)
- 关注点：shareId 读取稳定性，不回落第一本书

## Manual Rubric

人工评分不要交给脚本，先按以下维度做 1-5 分记录：

1. 结构完整性
- 看 `oneLiner / overview / parts / methods / routes` 是否齐

2. 贴合度
- `catalog` 是否围绕书名与作者
- `upload` 是否围绕正文结构与判断

3. 判断感
- 是否有明确观点，而不是泛化套话

4. 可读性
- 普通用户是否能快速理解，不需要阅读内部术语

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

## Suggested Score Sheet

| sampleId | 结构完整性 | 贴合度 | 判断感 | 可读性 | 误配风险 | fallback 状态 | 性能备注 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| catalog-atomic-habits |  |  |  |  |  |  |  |  |
| catalog-the-lever-of-riches |  |  |  |  |  |  |  |  |
| catalog-zhizhenshinei |  |  |  |  |  |  |  |  |
| upload-reading-map-sample |  |  |  |  |  |  |  |  |
| share-fixture-read |  |  |  |  |  |  |  |  |

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
- `pass / warn / fail`
- `notes`
