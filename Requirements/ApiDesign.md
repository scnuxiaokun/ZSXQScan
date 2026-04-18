# 知识星球 API 接口设计文档

## 概述

本文档描述知识星球的两套 API 接口规范：

| API 类型 | 域名 | 认证 | 适用场景 |
|----------|------|:----:|---------|
| **公开 API** | `pub-api.zsxq.com` | ❌ 无需认证 | 监控星球更新（**推荐用于 Monitor**）|
| **私有 API** | `api.zsxq.com` | ✅ Cookie + MD5签名 | 获取文章全文、评论等（需登录） |

> ⚠️ 本文档基于非官方逆向分析，API 可能随知识星球版本更新而变化。

## 基础信息

### 公开 API (pub-api.zsxq.com) — Monitor 使用

| 项目 | 值 |
|------|-----|
| **API 基地址** | `https://pub-api.zsxq.com` |
| **认证方式** | **无** — 不需要 Cookie、不需要签名、不需要登录 |
| **数据格式** | JSON |
| **适用场景** | 获取星球公开信息（名称/成员数/最新更新时间等）|
| **付费星球可用?** | ✅ **是** — 付费星球也能访问！ |
| **封号风险** | 🟢 **零** — 与你的账号完全无关 |

### 私有 API (api.zsxq.com) — 需要登录的操作

| 项目 | 值 |
|------|-----|
| **API 基地址** | `https://api.zsxq.com` |
| **认证方式** | Cookie（`zsxq_access_token=xxx`）+ MD5 签名 |
| **签名密钥** | `zsxqapi2020` (客户端硬编码) |
| **数据格式** | JSON |
| **适用场景** | 获取文章全文、评论、用户信息等需要登录态的数据 |

---

## 公开 API 接口

用于获取星球公开信息（名称、成员数、最新话题时间戳等），无需任何认证。

### 获取星球公开信息 ⭐ Monitor 核心接口

获取星球的公开介绍信息，包括最新话题时间戳。

```
GET https://pub-api.zsxq.com/v2/groups/{groupId}
```

#### 请求示例

```bash
# 最简调用 — 完全无需任何认证信息
curl "https://pub-api.zsxq.com/v2/groups/48418518458448"

# 甚至不需要 User-Agent
curl "https://pub-api.zsxq.com/v2/groups/48418518458448"
```

#### Node.js 调用

```javascript
// 一行代码搞定，零配置
const res = await fetch('https://pub-api.zsxq.com/v2/groups/' + groupId);
const data = await res.json();
console.log(data.resp_data.group.latest_topic_create_time); // "2026-04-11T21:34:39.008+0800"
```

#### 响应结构

```json
{
  "succeeded": true,
  "resp_data": {
    "group": {
      "group_id": 48418518458448,
      "name": "六爷漫谈",
      "description": "普通人的财富增值之路...",
      
      // ⭐ 关键字段：最新话题创建时间（精确到毫秒）
      "latest_topic_create_time": "2026-04-11T21:34:39.008+0800",
      
      // 其他有用的公开信息
      "create_time": "2019-11-28T08:05:01.033+0800",     // 星球创建时间
      "alive_time": "2026-04-11T00:00:00.000+0800",     // 最后活跃时间
      "type": "pay",                                      // pay=付费, free=免费
      "background_url": "https://images.zsxq.com/...",
      
      // 统计数据
      "statistics": {
        "topics": { "topics_count": 1918 },               // 总话题数
        "members": { "count": 1476 }                      // 成员数
      },
      
      // 星主信息
      "owner": {
        "name": "六爷leoyeer",
        "avatar_url": "https://images.zsxq.com/..."
      },
      
      // 合伙人列表
      "partners": [
        { "name": "六爷", "avatar_url": "..." },
        ...
      ],
      
      // 付费星球的价格信息
      "policies": {
        "payment": {
          "amount": 299900,           // 单位：分
          "duration": "1Y",
          "daily_price": { "enabled": true }
        }
      }
    }
  }
}
```

#### 监控用法

```javascript
// 每次调用只需比较 topicCreateTime (字段: latest_topic_create_time) 是否变化
async function checkPlanetUpdate(groupId) {
  const res = await fetch(`https://pub-api.zsxq.com/v2/groups/${groupId}`);
  const data = await res.json();
  
  const topicCreateTime = data.resp_data.group.latest_topic_create_time;
  const planetName = data.resp_data.group.name;

  // 通过 topicCreateTime 去重：与任务表中已有的记录比较
  // 如果该 topicCreateTime 不存在 → 新帖 → 创建任务

  return {
    hasUpdate: true,   // topicCreateTime 变化即视为新帖
    planetName,
    latestTime: topicCreateTime,
    memberCount: data.resp_data.group.statistics.members.count,
  };
}
```

### pub-api vs api.zsxq.com 对比

| 维度 | pub-api (公开) | api.zsxq.com (私有) |
|------|:-:|:-:|
| 需要Cookie | ❌ | ✅ |
| 需要MD5签名 | ❌ | ✅ |
| 付费星球可访问 | ✅ | ✅ |
| 返回最新更新时间 | ✅ `latest_topic_create_time`(即 topicCreateTime) | ✅ (通过topics接口) |
| 返回话题全文 | ❌ (不提供topics接口) | ✅ |
| 返回评论 | ❌ | ✅ |
| 封号风险 | 🟢 **零** | 🟡 有 |
| 用途 | **Monitor监控检测** | GetArticle获取全文 |

## 安全与风控策略

### 核心原则：Monitor 零认证，零风险

v2.2 架构下，Monitor 走的是**完全公开的 pub-api**，不需要任何风控策略来保护账号——因为根本不带任何身份信息。

```
┌──────────────────────────────────────────────────────┐
│                 风控策略（极简）                        │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Monitor 监控（pub-api 公开接口）:                     │
│  ├── 无 Cookie · 无签名 · 无登录态                     │
│  ├── 付费星球 ✅ 免费星球 ✅                           │
│  ├── 风险等级: 🟢 **零** — 与你的账号完全无关           │
│  └── 不需要任何风控策略                                │
│                                                      │
│  GetArticle 获取全文（api.zsxq.com + Cookie）:        │
│  ├── 仅在发现更新时触发（低频，通常 <100 次/天）         │
│  ├── 正常用户行为范围                                  │
│  └── 风险等级: 🟢 低                                   │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### 公开 API vs 私有 API 风控对比

| 维度 | pub-api (公开) — Monitor 用 | api.zsxq.com (私有) — GetArticle 用 |
|------:|:---:|:---:|
| 是否带 Cookie | ❌ | ✅ |
| 封号风险 | 🟢 **零** | 🟢 低（低频使用）|
| 每日请求量 | ~72,000 次（50星球）| <100 次 |
| 风控策略需要 | ❌ 不需要 | 正常使用即可 |

### GetArticle（私有API）注意事项

虽然 v2.2 的核心风险已消除，GetArticle 使用私有 API 时仍需注意：

| 行为 | 风险等级 | 说明 |
|------|:-------:|------|
| 带 Cookie 低频请求 (<100次/天)| 🟢 低 | 正常用户行为范围 |
| 带 Cookie 高频请求 (>500次/天)| 🔴 高 | 明显异常，容易被标记 |
| 多个 IP 共用同一 Token | 🟡 中 | 可能触发异地登录检测 |

### 每日请求量估算（50 个星球）

```
Monitor (pub-api, 完全公开):
  50星球 × 1440分钟 = 72,000 次/天
  → 全部匿名 · 零认证 · 零风险 ✅

GetArticle (api.zsxq.com, 有Cookie):
  仅在发现更新时触发
  取决于博主活跃度，通常 <100 次/天

总计:
├── 72,000 次无认证请求 (零风险)
└── <100 次有Cookie请求 (正常用户行为)

实际风险: 🟢 极低
```

## 签名机制

### 算法流程

```
1. 收集所有参数（公共 + 业务参数），按键名字典序升序排列
2. 拼接为 key1=value1&key2=value2 格式
3. 构造待签名字符串: {path}&{参数字符串}&{签名密钥}
4. MD5(待签名字符串) → 32位小写十六进制签名值
```

### 公共参数

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|:----:|------|
| `app_version` | string | 是 | 客户端版本号，如 `3.11.0` |
| `platform` | string | 是 | 平台标识，固定 `ios` 或 `android` |
| `timestamp` | string | 是 | 毫秒级时间戳，如 `1712937600000` |

### 签名示例

```javascript
// 请求: GET /v2/groups/12345/topics?count=1

// 1. 参数排序拼接
params = "app_version=3.11.0&count=1&platform=ios&timestamp=1712937600000"

// 2. 待签名字符串
signString = "/v2/groups/12345/topics&app_version=3.11.0&count=1&platform=ios&timestamp=1712937600000&zsxqapi2020"

// 3. MD5 结果
X-Signature = "a1b2c3d4e5f6..." // 32位小写
```

### 请求头模板

```http
GET /v2/groups/{groupId}/topics?count=1 HTTP/1.1
Host: api.zsxq.com
Accept: application/json, text/plain, */*
Accept-Language: zh-CN,zh;q=0.9,en;q=0.8
Content-Type: application/json
Cookie: zsxq_access_token=YOUR_TOKEN_HERE; zsxqsessionid=xxx
Referer: https://wx.zsxq.com/
User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ...
X-Signature: a1b2c3d4e5f6...        ← 动态生成
X-Timestamp: 1712937600000           ← 与签名时一致
```

---

## API 接口列表

### 1. 获取话题列表（星球动态流）

获取指定星球的最新帖子/话题列表，这是**监控更新的核心接口**。

```
GET /v2/groups/{groupId}/topics
```

#### 请求参数

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|:----:|:------:|------|
| `groupId` | path | ✅ | - | 星球ID（URL最后一段） |
| `count` | query | 否 | `20` | 返回数量（监控用设为 1） |
| `scope` | query | 否 | `all` | 范围：`all`=全部 `today`=今天 `owners`=星主 |

#### 响应结构

```json
{
  "topics": [
    {
      "id": "topic_id_string",
      "type": "talk",              // talk=普通帖 question=问答 vote=投票
      "created_time": 1712937600000,  // 创建时间(毫秒时间戳)
      "updated_time": 1712937660000,
      "text": "文章正文内容...",
      "text_summary": "纯文本摘要",
      "images": [
        { "url": "https://...", "width": 800, "height": 600 }
      ],
      "like_count": 42,
      "comment_count": 10,
      "group": {
        "id": "group_id",
        "name": "星球名称",
        "display_name": "显示名称"
      },
      "owner": {
        "id": "user_id",
        "name": "用户昵称",
        "avatar": "头像URL"
      }
    }
  ],
  "total_count": 150,
  "has_more": true
}
```

#### 监控用法

只需请求 `count=1`，比较第一条话题的 `created_time`（即 topicCreateTime）是否在任务表中已存在：

```javascript
const result = await getTopics(groupId, { count: 1 });
const latest = result.topics[0];
// 用 latest.created_time 作为 topicCreateTime，去重查询 tasks 表
// 不存在 → 新帖 → 创建任务
```

---

### 2. 获取话题详情（文章全文）

获取单篇话题的完整内容，包括正文、图片、附件等。

```
GET /v2/topics/{topicId}
```

#### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `topicId` | path | ✅ | 话题ID |

#### 响应结构

```json
{
  "topic": {
    "id": "topic_id",
    "type": "talk",
    "title": "",                    // 可能为空（知识星球话题不一定有标题）
    "text": "<p>完整的HTML/Markdown正文</p>",
    "text_summary": "纯文本摘要（自动生成）",
    "images": [...],
    "files": [                      // 附件
      {
        "name": "文件名.pdf",
        "url": "https://...",
        "size": 1024000,
        "type": "application/pdf"
      }
    ],
    "like_count": 42,
    "comment_count": 10,
    "view_count": 500,
    "created_time": 1712937600000,
    "owner": { "id": "...", "name": "..." },
    "group": { "id": "...", "name": "..." }
  }
}
```

> **注意**: `text` 字段可能是 HTML 格式或 Markdown 格式，需要做清理转换为纯文本。
> `text_summary` 字段是服务端生成的纯文本摘要，可直接使用但可能截断。

---

### 3. 获取评论列表

```
GET /v2/topics/{topicId}/comments
```

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|:----:|:------:|------|
| `topicId` | path | ✅ | - | 话题ID |
| `page` | query | 否 | `1` | 页码 |
| `count` | query | 否 | `20` | 每页数量 |

---

### 4. 获取用户加入的星球列表

```
GET /v2/groups
```

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|:----:|:------:|------|
| `page` | query | 否 | `1` | 页码 |
| `count` | query | 否 | `20` | 每页数量 |

用于发现/确认当前账号加入了哪些星球。

---

### 5. 获取星球详情

```
GET /v2/groups/{groupId}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `groupId` | path | ✅ | 星球ID |

返回星球的名称、简介、成员数等信息。

---

### 6. 获取当前用户信息（Cookie 验证用）

```
GET /v2/user
```

无需额外参数，仅依赖 Cookie 认证。用于检测 Cookie 是否有效：

- 返回 200 + 用户数据 → Cookie 有效
- 返回 401/403 → Cookie 过期或无效

---

## 错误处理

### HTTP 状态码

| 状态码 | 含义 | 处理方式 |
|--------|------|----------|
| `200` | 成功 | 正常解析响应体 |
| `401` | 未认证 | Cookie 无效或过期，需重新登录 |
| `403` | 无权限 | 可能是未加入该星球 |
| `429` | 请求过频 | 降低请求频率，增加延迟 |
| `500` | 服务端错误 | 稍后重试 |

### 业务错误码

响应体中可能包含错误信息字段（不同版本可能不同）:

```json
{
  "error_code": 1001,
  "msg": "具体错误信息"
}

// 或另一种格式:
{
  "code": -1,
  "message": "具体错误信息"
}
```

## 频率限制建议

### 公开 API (pub-api) — Monitor 监控

公开接口**不需要认证**，但为保持礼貌和避免被临时封禁：

| 操作 | 建议间隔 | 最大频率 |
|------|---------|---------|
| Monitor 检测更新（单星球）| 60s（跟随定时器） | ~1440次/天/星球 |
| 星球间串行请求 | 200-500ms | - |

**由于 pub-api 无需认证，即使触发频率限制也不会影响你的账号。**

### 私有 API (api.zsxq.com) — GetArticle 获取全文

需要 Cookie 认证的操作应更谨慎：

| 操作 | 建议间隔 | 最大频率 |
|------|---------|---------|
| 获取文章详情 | 1-2s | 不超过 3000次/天 |
| 获取评论 | 1-2s | 视需求而定 |
| 同一星球连续请求 | 500ms+随机 | - |

### 架构下的每日请求量估算（50 个星球）

```
Monitor (pub-api, 无Cookie):
  50星球 × 1440分钟 = 72,000 次/天  → 全部匿名 · 零风险 ✅

GetArticle (api.zsxq.com, 有Cookie):
  仅在发现更新时触发
  取决于博主活跃度，通常 <100 次/天

总计:
├── 72,000 次无Cookie请求 (零风险)
└── <100 次有Cookie请求 (正常用户行为)

实际风险: 🟢 极低
```

---

## 数据参考来源

- [zsxq-sdk (GitHub)](https://github.com/yiancode/zsxq-sdk) — 多语言非官方SDK
- [Python 进阶爬虫：解析知识星球 API](https://developer.aliyun.com/article/1710293) — 详细逆向分析
- 知识星球网页版 (`wx.zsxq.com`) Network 抓包
