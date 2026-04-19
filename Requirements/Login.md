# 登录模块 (Login) — Cookie 管理

## 概述

Login 模块是一个**纯 Cookie 管理工具**，负责：

1. **保存 Cookie** — 用户手动从浏览器复制后写入数据库
2. **验证 Cookie** — 调用 API 检测有效性
3. **读取 Cookie** — 为 GetArticle / LoopTask 提供统一获取入口
4. **状态检测** — 报告 Cookie 是否过期

**不包含**: 无 Puppeteer、无浏览器、无验证码处理、无自动登录。

---

## 获取并设置 Cookie（唯一方式）

### 步骤一：从浏览器获取 Cookie

```
1️⃣ 浏览器打开 https://wx.zsxq.com/ 并正常登录（扫码或手机号+验证码）

2️⃣ 按 F12 打开开发者工具 → 切换到 Network（网络）面板

3️⃣ 刷新页面（F5），在请求列表中找到任意 api.zsxq.com 域名的请求

4️⃣ 点击该请求 → 找到 Request Headers 中的 Cookie 字段

5️⃣ 复制完整的 Cookie 值
```

Cookie 预期格式：
```
zsxq_access_token=eyJhbGciOiJIUzI1NiIs...; zsxqsessionid=abc123def456; ...
```

关键字段是 `zsxq_access_token`（JWT 格式的认证令牌）。

### 步骤二：调用 login 函数保存

```json
// 请求
{
  "action": "setCookie",
  "cookie": "zsxq_access_token=xxxxxxxxxxxx; zsxqsessionid=yyyyyyy"
}

// 成功响应
{
  "code": 0,
  "success": true,
  "message": "✅ Cookie 已保存并验证通过",
  "hint": "Cookie 有效期通常为 1-3 个月，过期后需重新获取"
}
```

### Cookie 有效期

| 场景 | 大致有效期 |
|------|-----------|
| 正常使用 | 1-3 个月 |
| 长时间未活跃 | 可能缩短至 2-4 周 |

> 过期后重复上述步骤重新获取即可，操作约 1 分钟。

---

## API 接口说明

### 入口: Express API `/api/login`

通过 `event.action` 或 `req.body.action` 区分操作：

| action | 功能 | 参数 | 说明 |
|--------|------|------|------|
| `setCookie` | 保存 Cookie | `cookie` (必填) | 自动验证有效性后再保存 |
| `getCookie` | 读取当前有效 Cookie | - | 供其他模块调用 |
| `checkStatus` | 检查 Cookie 状态 | - | 返回详细状态报告 |

#### checkStatus 响应示例

```json
{
  "code": 0,
  "data": {
    "hasEnvCookie": true,      // 是否配置了环境变量
    "hasDbCookie": true,       // 数据库是否有存储
    "valid": true,             // 当前是否有效
    "source": "env",           // 有效Cookie的来源 (env/db)
    "lastUpdated": "2026-04-12T08:00:00Z"
  }
}
```

---

## Cookie 存储机制

### 存储位置（两处，有优先级）

```
┌─────────────────────────────┐
│  ZSXQ_COOKIE (环境变量)       │ ← 最高优先级（可选）
├─────────────────────────────┤
│  config.zsxq_cookie (数据库)  │ ← 通过 /api/login setCookie 写入
└─────────────────────────────┘
```

读取逻辑：环境变量优先 → 回退到数据库 → 都没有则报错

### 数据库字段结构

集合: `config`, 文档ID: `zsxq_cookie`

```json
{
  "_id": "zsxq_cookie",
  "value": "zsxq_access_token=xxx; ...",
  "source": "manual",
  "updatedAt": "2026-04-12T08:00:00.000Z",
  "createdAt": "2026-04-12T08:00:00.000Z"
}
```

---

## 与其他模块的关系

```
                ┌──────────────┐
                │   Login      │
                │ (Cookie管理)  │
                └──────┬───────┘
                       │ 提供 Cookie
          ┌────────────┼────────────┐
          ▼            ▼            ▼
   ┌──────────┐ ┌───────────┐ ┌──────────┐
   │ Monitor  │ │ GetArticle│ │LoopTask  │
   │          │ │           │ │          │
   │ 🔓不需要  │ │ 👤需要    │ │ 👤需要   │
   │ (pub-api)│ │ (私有API) │ │ (私有API)│
   └──────────┘ └───────────┘ └──────────┘
```

> **注意**: Monitor 走公开 API，**不需要 Cookie**。
> 只有 GetArticle 和 LoopTask（获取文章全文）才需要。

---

## 环境变量

| 变量名 | 必填 | 说明 |
|--------|:----:|------|
| `ZSXQ_COOKIE` | ⚠️ 二选一 | 手动设置的 Cookie（可选） |
| `DB_HOST` | ✅ 是 | MySQL 数据库地址 |
| `DB_USER` | ✅ 是 | 数据库用户名 |
| `DB_PASSWORD` | ✅ 是 | 数据库密码 |
| `DB_NAME` | ✅ 是 | 数据库名称 |

---

## 错误处理

| 错误场景 | 错误信息 | 解决方案 |
|----------|---------|---------|
| 无 Cookie | `没有可用的 Cookie！` | 调用 setCookie 或设置环境变量 |
| Cookie 过期 | `Cookie 已失效` | 从浏览器重新复制新 Cookie |
| setCookie 验证失败 | `Cookie 验证失败！` | 检查复制完整性，确保已登录 |

---

## 首次配置步骤

```
1. 启动服务（本地或云托管）
2. 从浏览器获取 Cookie（见上方步骤一）
3. 调用 /api/login 接口 { action: "setCookie", cookie: "..." }
4. 验证: 调用 { action: "checkStatus" } 确认 valid=true
5. 在 config 表配置 monitorUrls → 启动定时任务
```

---

## 依赖文件

| 文件 | 用途 |
|------|------|
| `functions/zsxqApi.js` | API 请求封装 + validateCookie() |
| `functions/cookieManager.js` | Cookie 存取管理 |
