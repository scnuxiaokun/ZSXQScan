# 消费文章拉取任务 (LoopLastUpdateArticleTask)

## 概述

定时/触发式任务消费者。从 `tasks` 集合中读取 **pending** 状态的任务，通过 API 调用获取文章全文并保存。

## 输入参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| planetUrl | string | 否 | 手动指定处理的星球 URL（不传则处理所有 pending 任务） |

## 触发方式

### 方式 A：定时触发
```json
{ "triggers": [{ "name": "taskConsumer", "type": "timer", "config": "30 */1 * * * * *" }] }
```
每分钟第 30 秒触发（与 Monitor 错开）。

### 方式 B：事件驱动（更优）
```
tasks 集合新增记录 → 自动触发 LoopTask（无需轮询）
```

### 方式 C：手动调用
```json
{ "planetUrl": "https://wx.zsxq.com/group/48418518458448" }
```

## 处理流程

### 步骤 1：确定待处理列表

```javascript
if (event.planetUrl) {
  urls = [event.planetUrl];           // 手动指定
} else {
  // 从 tasks 表查询所有 pending（去重）
  const result = await tasksCollection
    .where({ status: 'pending' })
    .field({ planetUrl: true, topicId: true })
    .get();
  urls = unique(result.data.map(t => t.planetUrl));
}
```

### 步骤 2：逐个处理

#### 2a. 查询 pending 任务

取该星球最新的一条 pending 记录：
```javascript
const task = await tasksCollection
  .where({ planetId: groupId, status: 'pending' })
  .orderBy('createdAt', 'desc')
  .limit(1)
  .get();
```

#### 2b. 获取文章

```javascript
// 优先使用 topicId 直接调详情接口（高效路径）
const article = task.topicId
  ? await getLatestArticle(planetUrl, task.topicId)
  : await fetchLatestArticle(planetUrl);               // 备用路径
```

#### 2c. 更新任务状态

```javascript
await tasksCollection.doc(task._id).update({
  data: {
    status: 'completed',
    article: JSON.stringify(articleData),
    articleTitle: articleData.title,
    articleLength: articleData.content.length,
    topicId: articleData.topicId,
    topicType: articleData.type,
    updatedAt: new Date()
  }
});
```

### 步骤 3：返回结果

```json
{
  "code": 0,
  "message": "任务完成",
  "mode": "api",
  "data": [
    { "planetId": "48418518458448", "status": "success",
      "taskId": "abc123", "articleTitle": "...", "articleLength": 2580,
      "topicId": "88888888", "topicType": "talk" },
    { "planetId": "88522222114488", "status": "skipped", "reason": "no_pending_task" }
  ]
}
```

## 与 Monitor 的协作关系

```
每分钟触发 ──────────────────────────────────────────────
     │
     ▼
┌─────────────┐  GET pub-api.zsxq.com    ┌──────────────────┐
│ UpdatedMonitor│ ──获取 topicCreateTime─▶ │ tasks 集合       │
│ (公开API检测)  │   去重检查               │                  │
└─────────────┘                          ● pending ──▶ LoopTask
       │          ↓ 不匹配则创建          ● completed       │
       │          写入任务                ● failed          └── 纯API拉取全文
       └──────────────────┬─────────────────────────────────┘
                          │
                          ▼ LoopTask 回填:
  article, articleTitle, articleLength, topicId, topicType
```

**去重**: Monitor 以 `topicCreateTime` 为去重键，同一星球的同一篇帖子只创建一次任务，无论 `pending/completed/failed`。

## 数据流

```
Monitor 写入:
{ planetId, planetName, planetUrl, status:"pending",
  lastUpdateTime, topicCreateTime(🔑去重键), createdAt }

        ↓ LoopTask 处理后:

{ ..., status:"completed",
  article:'{title,content,...}', articleTitle, articleLength,
  topicId, topicType, updatedAt }
```

`topicCreateTime` 由 Monitor 写入，LoopTask **不修改**此字段。

## 设计要点

| 决策 | 原因 |
|------|------|
| 无外部参数依赖 | 纯函数，可独立运行在任何 Node.js 环境 |
| 利用 topicId 高效路径 | 省一次 getTopics() 调用 |
| 存储完整 JSON | 保留结构化数据，便于后续扩展 |
| 请求间随机延迟 | 避免触发频率限制 |
| 失败标记而非删除 | 方便重试和排查 |

## 错误处理

| 场景 | 行为 | task.status |
|------|------|-------------|
| 无 pending 任务 | 正常结束 | - |
| Cookie 过期 (401) | 记录错误 | `failed` |
| API 限流 (429) | 下次自动重试 | `failed` |
| 话题不存在/已删除 | 记录错误 | `failed` |
| 文章内容过短 (<10字) | 抛出异常 | `failed` |

## 依赖

- `functions/zsxqApi.js` — API 核心层
- `functions/getLastUpdatedArticle/index.js` — 文章获取逻辑
- `functions/loopLastUpdateArticleTask/index.js` — 本模块主逻辑
- [GetLastUpdatedArticle.md](./GetLastUpdatedArticle.md) — 文章获取模块文档
- [ApiDesign.md](./ApiDesign.md) — API 接口规范

## 认证

本模块调用私有 API 获取文章全文，**需要 Cookie**（通过 `zsxqApi.js` 统一读取）。
