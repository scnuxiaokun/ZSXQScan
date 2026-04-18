# 监控星球更新 (UpdatedMonitor)

## 概述

云函数定时主入口。通过**公开 API 接口**检测星球是否有新文章更新。

- 调用 `pub-api.zsxq.com/v2/groups/{groupId}` — 无需任何认证，付费/免费星球均可
- 返回 `topicCreateTime`（精确到毫秒的 ISO 时间戳）
- 检测到 `topicCreateTime` 变化（新帖） → 创建拉取任务到 `tasks` 集合

## 为什么可以完全不用登录？

知识星球网页端 (`wx.zsxq.com`) 展示星球介绍页时需要显示：星球名称、成员数、最近更新时间、价格等信息。这些信息来自一个**完全公开的 API 端点**，无需任何认证。

## 两套 API 的分工

```
┌─────────────────────────────────────────────────────────┐
│                    Monitor (每分钟触发)                    │
│                                                          │
│   GET pub-api.zsxq.com/v2/groups/{groupId}              │
│     ├── 无需 Cookie · 无签名                             │
│     ├── 付费/免费星球均可                                │
│     └── 返回 topicCreateTime                            │
│           ↓                                              │
│     与已有任务比较(topicCreateTime 去重)                   │
│           ↓                                              │
│     有新帖子 → 创建 GetArticle 任务                      │
│                                                          │
├─────────────────────────────────────────────────────────┤
│              LoopTask / GetArticle (按需触发)              │
│                                                          │
│   GET api.zsxq.com/v2/topics/{topicId}                  │
│     ├── 需要 Cookie（获取全文必须登录）                    │
│     └── 返回文章完整内容                                  │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## 输入参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| planetUrl | string | 否 | 手动指定监控的星球 URL |

不传参数时（定时器自动触发），从数据库 `config.monitorUrls` 读取监控列表。

## 处理流程

```
1. 读取监控列表（数据库或 event.planetUrl）
      ↓
2. 对每个星球:
   │
   ├─ GET pub-api.zsxq.com/v2/groups/{groupId}
   │
   ├─ 解析响应:
   │   ├── topicCreateTime (ISO 格式)
   │   ├── name (星球名称)
   │   └── statistics.members.count (成员数)
   │
   ├─ 🔑 去重: 查询 tasks 表是否存在相同 topicCreateTime
   │   └─ WHERE { planetId, topicCreateTime }
   │      ├── 已存在(任意状态) → 跳过 ⏭️
   │      └── 不存在 → 创建 pending 任务到 tasks 集合
   │         字段: {planetId, planetName, planetUrl,
   │                lastUpdateTime, topicCreateTime, ...}
```

## 去重规则

同一星球的同一篇帖子（`topicCreateTime` 一致）只创建一次任务，无论该任务是 `pending` / `completed` 还是 `failed`。只有博主发了新帖（新的 `topicCreateTime`）才会创建新任务。

**去重键**: `planetId` + `topicCreateTime`（ISO 时间戳字符串，精确到毫秒）

## 输出数据

```json
{
  "code": 0,
  "message": "监控完成",
  "mode": "pub-api",
  "authRequired": false,
  "elapsedMs": 1234,
  "data": [
    {
      "groupId": "48418518458448",
      "url": "https://wx.zsxq.com/group/48418518458448",
      "planetName": "六爷漫谈",
      "hasUpdate": true,
      "relativeTime": "19小时前",
      "topicCreateTime": "2026-04-11T21:34:39.008+0800",
      "memberCount": 1476,
      "topicCount": 1918
    },
    {
      "groupId": "88522222114488",
      "hasUpdate": false,
      "skipped": true,
      "reason": "same_topic_time_exists",
      "topicCreateTime": "2026-04-10T15:20:00.000+0800"
    }
  ]
}
```

## 错误处理

| 错误类型 | reason | 说明 | 处理方式 |
|----------|--------|------|---------|
| 已有相同时间戳任务 | `same_topic_time_exists` | 去重命中 | 正常跳过 |
| 星球不存在 | `group_not_found` | 404 或 groupId 无效 | 检查 URL |
| 公开接口异常 | `auth_required` | 极罕见 | 记录日志并告警 |
| 网络超时 | `network` | 请求超时或网络错误 | 下轮重试 |
| 其他未知 | `unknown` | 未分类错误 | 记录日志 |

## 配置项

| 配置键 | 类型 | 说明 |
|--------|------|------|
| `config.monitorUrls` | Array\<string\> | 监控的星球 URL 列表 |
| `config.monitorInterval` | number | 定时触发间隔(ms)，默认 60000 |
