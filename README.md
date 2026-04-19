# 知识星球文章更新监控系统

## 项目概述

自动监控知识星球博主的文章更新，发现新文章后自动拉取内容并发送飞书通知。

**核心特性**：
- 🔓 **Monitor 监控完全公开接口** — 无需 Cookie、无需登录、零封号风险
- ⚡ **纯 HTTP API 调用** — 轻量级，无外部依赖
- 💰 **低成本** — 腾讯云托管 + MySQL，成本可控
- 🚀 **快速响应** — 单次检测 < 1 秒
- 📨 **飞书通知** — 自动推送新文章内容

### 快速开始（云托管部署）⭐

```bash
# 1. 克隆代码
git clone https://github.com/your-repo/ZSXQScan.git
cd ZSXQScan

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入你的配置

# 4. 一键部署到腾讯云托管
tcb login
tcb cloudrun deploy -s zsxq-scan --source . --force
```

部署完成后，服务会自动启动定时任务，按照配置的频率执行监控和文章拉取。

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                    腾讯云托管 (Cloud Run)                     │
│                                                             │
│  ┌──────────────────┐    ┌──────────────┐                  │
│  │  Express Server   │    │ node-cron    │                  │
│  │                   │    │ 定时调度      │                  │
│  │  GET /api/monitor │◀──▶│ Monitor: */5 │                  │
│  │  POST /api/task   │    │ Task: */5    │                  │
│  │  POST /api/login  │    └──────┬───────┘                  │
│  │  GET /api/article │           │                          │
│  └────────┬──────────┘           ▼                          │
│           │              ┌──────────────┐                   │
│           │              │ monitorService│                  │
│           │              │ taskService   │                  │
│           │              └──────┬───────┘                   │
│           │                     │                           │
│           ▼                     ▼                           │
│  ┌─────────────────────────────────────┐                   │
│  │       MySQL 数据库 (CynosDB)         │                   │
│  │                                     │                   │
│  │  tasks 表: 任务队列                  │                   │
│  │  config 表: 配置信息                 │                   │
│  └─────────────────────────────────────┘                   │
│                                                             │
│  外部依赖:                                                   │
│  • pub-api.zsxq.com (公开API - 监控)                        │
│  • api.zsxq.com (私有API - 获取文章)                        │
│  • 飞书机器人 Webhook (通知)                                │
└─────────────────────────────────────────────────────────────┘
```

### 核心流程

1. **Monitor 监控**（每5分钟执行）
   - 调用 `pub-api.zsxq.com/v2/groups/{groupId}` 获取星球公开信息
   - 比较 `topicCreateTime` 判断是否最近更新
   - 检测到更新 → 在数据库创建 `pending` 任务
   - 全程无需任何认证，零封号风险

2. **Task 任务处理**（每5分钟执行）
   - 查询数据库中状态为 `pending` 或 `failed` 的任务
   - 调用 `api.zsxq.com` + Cookie 获取文章完整内容
   - 保存到数据库并标记为 `completed`
   - 发送飞书通知（异步）

3. **飞书通知**
   - 提取文章标题和内容
   - 长文本自动分条发送（每条最多500字符）
   - 不阻塞主流程

## 目录结构

```
ZSXQScan/
├── functions/                          # 业务逻辑模块
│   ├── server.js                       # Express 服务器入口
│   ├── zsxqApi.js                      # API 封装(公开 + 私有)
│   ├── cookieManager.js                # Cookie 管理
│   ├── monitorService.js               # Monitor 监控服务
│   ├── taskService.js                  # Task 任务服务
│   ├── feishuNotifier.js               # 飞书通知模块
│   ├── htmlToPlainText.js              # HTML转纯文本工具
│   ├── db-mysql.js                     # MySQL 数据库适配器
│   └── jsonDb.js                       # JSON 文件数据库(兼容层)
├── Requirements/                       # 需求文档
│   ├── README.md                       # 架构总览
│   ├── ApiDesign.md                    # API 规范
│   ├── UpdatedMonitor.md               # Monitor 模块设计
│   └── Login.md                        # Cookie 管理文档
├── tests/                              # 测试脚本
├── .env.example                        # 环境变量模板
├── Dockerfile                          # Docker 构建文件
└── package.json                        # 项目依赖
```

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Node.js | 22-alpine | Docker 容器运行时 |
| Express | ^4.18 | HTTP 服务器框架 |
| node-cron | ^3.0 | 定时任务调度 |
| mysql2 | ^3.6 | MySQL 数据库驱动 |
| 腾讯云托管 | - | 云托管部署平台 |
| 腾讯云 CynosDB | - | MySQL 数据库 |

## 快速开始

### 本地开发

```bash
# 1. 克隆代码
git clone https://github.com/scnuxiaokun/ZSXQScan.git
cd ZSXQScan

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入 MySQL 配置

# 4. 启动服务
DB_HOST=xxx DB_USER=xxx DB_PASSWORD=xxx DB_NAME=xxx node server.js
```

### 云托管部署

```bash
# 1. 登录腾讯云
tcb login

# 2. 一键部署
tcb cloudrun deploy -s zsxq-scan --source . --force
```

## 数据库设计

### tasks 表（任务表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(32) | 主键 |
| planetId | VARCHAR(20) | 星球 ID |
| planetName | VARCHAR(100) | 星球名称 |
| planetUrl | VARCHAR(200) | 星球 URL |
| status | VARCHAR(20) | `pending` / `completed` / `failed` |
| article | TEXT | 文章 JSON 内容 |
| lastUpdateTime | VARCHAR(50) | 最近更新时间文案 |
| topicCreateTime | VARCHAR(50) | 🔑 去重键: ISO 时间戳 |
| topicId | VARCHAR(50) | 话题 ID |
| articleTitle | VARCHAR(200) | 文章标题 |
| articleLength | INT | 文章长度 |
| topicType | VARCHAR(20) | 话题类型 |
| errorMsg | TEXT | 错误信息 |
| createdAt | DATETIME | 创建时间 |
| updatedAt | DATETIME | 更新时间 |

### config 表（配置表）

| _id | value | 说明 |
|-----|-------|------|
| monitorUrls | ["https://..."] | 监控的星球 URL 列表 |
| zsxq_cookie | "cookie字符串" | 知识星球 Cookie |

## API 接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/monitor` | POST | 手动触发监控 |
| `/api/task` | POST | 手动触发任务处理 |
| `/api/login` | POST | Cookie 管理（setCookie/checkStatus/getCookie） |
| `/api/article` | GET | 获取指定文章内容 |

## 安全特性

| 操作 | 带 Cookie？ | 频率 | 风险等级 |
|------|:----------:|------|:--------:|
| Monitor 监控检测 | ❌ 不带 | 每5分钟 | 🟢 **零** |
| Task 获取全文 | ✅ 带 | 按需 | 🟢 低 |

99%+ 的请求完全不关联你的账号。

## 注意事项

1. **Cookie 管理**: 仅用于获取文章全文，有效期约 1-3 个月，过期后从浏览器重新复制并通过 `/api/login` 接口 `setCookie` 保存
2. **频率限制**: pub-api 为公开接口，礼貌性请求即可；`api.zsxq.com` 带 Cookie 请求应保持低频
3. **错误重试**: 失败的任务标记为 `failed`，下次 Task 执行时会自动重试
4. **定时任务配置**: 通过 `.env` 文件中的 `MONITOR_CRON` 和 `TASK_CRON` 环境变量调整执行频率
5. **飞书通知**: 长文本自动分条发送，每条最多500字符，不阻塞主流程

## 详细文档

- [Requirements/README.md](./Requirements/README.md) - 架构总览、完整流程图
- [Requirements/ApiDesign.md](./Requirements/ApiDesign.md) - API 接口规范、签名算法
- [Requirements/UpdatedMonitor.md](./Requirements/UpdatedMonitor.md) - Monitor 监控模块详细设计
- [Requirements/Login.md](./Requirements/Login.md) - Cookie 管理工具（设置/读取/验证）
