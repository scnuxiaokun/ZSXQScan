# 获取星球最新文章内容 (GetLastUpdatedArticle)

## 概述

通过**纯 HTTP API**获取知识星球最新文章的完整内容。调用 `GET /v2/topics/{topicId}` 返回结构化 JSON（正文、图片、附件等）。

## 输入参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| planetUrl | string | ✅ | 星球完整 URL 或纯 ID |
| topicId | string | 否 | 话题 ID（如有可跳过列表查询） |

## 输出

```typescript
interface ArticleData {
  topicId: string;          // 话题 ID
  url: string;              // 话题 URL
  title: string;            // 标题（知识星球话题可能无标题，取正文前 80 字）
  content: string;          // 纯文本正文（HTML 已清理）
  type: string;             // talk / question / vote / file / answer
  createTime: string;       // 发布时间 ISO 格式
  author: { id: string; name: string; avatar?: string } | null;
  stats: { likeCount: number; commentCount: number; viewCount: number };
  images: Array<{ url: string; width?: number; height?: number }>;
  files: Array<{ name: string; url: string; size?: number; type?: string }>;
  raw: Object;              // API 原始数据（调试用）
}
```

## 处理流程

### 步骤1：确定 topicId

**A. 已知 topicId（高效路径）**
```javascript
const article = await getLatestArticle(planetUrl, topicId);
// 直接跳到步骤 3，省一次 API 调用
```

**B. 未知 topicId（自动检测）**
```javascript
const topicsResult = await getTopics(groupId, { count: 1 });
const latestTopic = topicsResult.topics[0];
const topicId = latestTopic.id;
```

### 步骤2：调用话题详情接口

```javascript
const detail = await getTopicDetail(topicId);
// GET https://api.zsxq.com/v2/topics/{topicId} (需 Cookie)
```

### 步骤3：解析并标准化数据

#### 正文提取优先级

```
1. topic.text          ← 最完整（HTML 或 Markdown）
2. topic.text_summary   ← 纯文本摘要（可能截断）
3. topic.content         ← 备用字段
4. 抛出异常              ← 都没有则失败
```

#### HTML 清理

`text` 字段通常是 HTML 格式，需要清理：

```
输入: <p>大家好，这是<strong>一篇新文章</strong></p><ul><li>要点一</li></ul>
输出: 大家好，这是一篇新文章\n- 要点一
```

规则：`<p>/<div>/<br>/<li>` → 换行符；其他标签移除；HTML 实体还原；连续空白压缩。

#### 标题处理

```javascript
title = topic.title || content.split('\n')[0].trim().substring(0, 80);
```

#### 数据类型映射

| API 字段 → 标准化字段 |
|----------|-----------|
| `id` → `topicId` |
| `type` → `type` (talk/question/vote/file/answer) |
| `created_time` → `createTime` (→ ISO 字符串) |
| `text` → `content` (HTML → 纯文本) |
| `images[]` → `images[]` |
| `files[]` → `files[]` |
| `like_count` → `stats.likeCount` |
| `comment_count` → `stats.commentCount` |
| `owner` → `author` |

## 调用方式

### 方式 A：指定 topicId（推荐）
```javascript
const { getLatestArticle } = require('../getLastUpdatedArticle');
const article = await getLatestArticle('48418518458448', '88888888');
```

### 方式 B：自动查询最新帖子
```javascript
const { fetchLatestArticle } = require('../getLastUpdatedArticle');
const article = await fetchLatestArticle('https://wx.zsxq.com/group/48418518458448');
// 内部自动查询最新话题 ID
```

## 错误处理

| 场景 | 建议 |
|------|------|
| Cookie 过期/无效 (401) | 触发 login 刷新 |
| 话题不存在 (404) | 检查 topicId |
| 内容为空 | 该话题可能已被删除 |
| API 限流 (429) | 增加延迟后重试 |

## 依赖

- `functions/zsxqApi.js` — `getTopicDetail()` / `getTopics()` / `resolveGroupId()`
- `functions/getLastUpdatedArticle/index.js` — 本模块主逻辑
- [ApiDesign.md](./ApiDesign.md) — API 接口规范

## 认证

本模块调用私有 API，**需要 Cookie 认证**：
- Cookie 通过 `login` 模块的 `setCookie` 写入云数据库
- 有效期约 1-3 个月，过期后需重新从浏览器复制
