# 知识星球文章更新监控系统

## 项目概述

自动监控知识星球博主的文章更新，发现新文章后自动拉取内容保存到云数据库。

**核心特性**：
- 🔓 **Monitor 监控完全公开接口** — 无需 Cookie、无需登录、零封号风险
- ⚡ **纯 HTTP API 调用** — 轻量级，无外部依赖
- 💰 **低成本** — 腾讯云 CloudBase 免费额度即可运行
- 🚀 **快速响应** — 单次检测 < 1 秒

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
│                      腾讯云开发环境 (CloudBase)               │
│                                                             │
│  ┌──────────────────┐    ┌───────────────┐                 │
│  │  updatedMonitor   │───▶│   云数据库     │◀──┌──────────┐ │
│  │  (定时触发/每分钟) │    │  tasks集合    │    │loopLastUp │ │
│  │                   │    └───────────────┘    │dateArticle│ │
│  │  🔓 pub-api.zsxq  │                         │Task       │ │
│  │  公开接口·无认证   │    发现更新             │(定时触发)  │ │
│  └────────┬──────────┘    写入任务              │           │ │
│           │              pending               │👤api.zsxq │ │
│           ▼                                    │+Cookie    │ │
│  GET /v2/groups/{groupId}                      └─────┬─────┘ │
│  · 无Cookie · 无签名 · 付费星球可用              获取全文   │
│  · 返回 topicCreateTime                        写入article │
└─────────────────────────────────────────────────────────────┘
```

### 核心流程

1. **updatedMonitor**（每分钟定时执行）
   - 调用 `pub-api.zsxq.com/v2/groups/{groupId}` 获取星球公开信息
   - 比较 `topicCreateTime` 判断是否最近更新
   - 检测到更新 → 在数据库创建 `pending` 任务（以 `topicCreateTime` 为去重键）
   - 全程无需任何认证，零封号风险

2. **loopLastUpdateArticleTask**（每分钟定时执行）
   - 查询数据库中状态为 `pending` 的任务
   - 调用 `api.zsxq.com` + Cookie 获取文章完整内容
   - 保存到数据库并标记为 `completed`
   - 仅此步骤需要 Cookie（低频、正常用户行为）

## 目录结构

```
ZSXQScan/
├── functions/                          # 云函数目录
│   ├── zsxqApi.js                      # API 签名 + 请求封装(公开 + 私有)
│   ├── cookieManager.js                # Cookie 存储与生命周期管理
│   ├── login/                          # Cookie 管理模块
│   │   └── index.js                    # Cookie 设置 / 读取 / 状态检测
│   ├── getLastUpdatedArticle/          # 获取文章模块
│   │   └── index.js                    # 通过私有 API 获取最新文章全文
│   ├── updatedMonitor/                 # 更新监控模块 ⭐定时入口
│   │   ├── index.js                    # 监控主逻辑(公开 API)
│   │   └── config.json                 # 定时触发器配置
│   └── loopLastUpdateArticleTask/      # 文章拉取模块 ⭐定时入口
│       ├── index.js                    # 任务处理主逻辑
│       └── config.json                 # 定时触发器配置
├── Requirements/                       # 需求文档
│   ├── README.md                       # 总纲: 架构 / 流程图 / 技术决策
│   ├── ApiDesign.md                    # API 规范: 接口定义 / 签名算法
│   ├── Login.md                        # Cookie 管理工具文档
│   ├── GetLastUpdatedArticle.md        # 文章获取模块需求
│   ├── UpdatedMonitor.md               # 监控模块需求
│   └── LoopLastUpdateArticleTask.md    # 任务循环模块需求
├── tests/                              # 测试脚本
│   ├── testLogin.js                    # 登录功能测试
│   ├── testMonitor.js                  # Monitor 模块测试
│   ├── testTask.js                     # Task 循环模块测试
│   └── mockDatabase.js                 # 数据库 Mock
├── scripts/
│   └── runLocal.js                     # 本地运行入口
├── database.md                         # 数据库设计文档
├── package.json                        # 项目依赖
└── .env.example                        # 环境变量模板
```

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Node.js | 22-alpine | Docker 容器运行时 |
| Express | ^4.18 | HTTP 服务器框架 |
| node-cron | ^3.0 | 定时任务调度 |
| mysql2 | ^3.6 | MySQL 数据库驱动 |
| @cloudbase/node-sdk | ^2.6.0 | CloudBase SDK（可选） |
| 腾讯云 CloudBase | - | 云托管部署平台 + 定时触发器 |

## 部署指南

### 前置要求

1. **腾讯云开发环境**: 在 [CloudBase 控制台](https://tcb.cloud.tencent.com/) 创建环境
2. **Node.js 18+**: 本地开发和云函数运行时
3. **知识星球 Cookie**: 从浏览器复制 `zsxq_access_token`（仅用于获取文章全文）

### 步骤一：创建云开发环境

1. 登录 [CloudBase 控制台](https://tcb.cloud.tencent.com/)
2. 创建新的云开发环境，选择「按量付费」以降低成本
3. 记录下环境 ID（Env ID）

### 步骤二：初始化数据库集合

在云开发控制台的「数据库」中创建以下集合：

#### tasks 集合（任务表）

| 字段 | 类型 | 说明 |
|------|------|------|
| planetId | string | 星球 ID |
| planetName | string | 星球名称 |
| planetUrl | string | 星球 URL |
| status | string | `pending` / `completed` / `failed` |
| article | string | 文章 JSON 内容 |
| lastUpdateTime | string | 最近更新时间文案 |
| topicCreateTime | **string** | 🔑 去重键: ISO 时间戳，同一时间戳不重复创建任务 |
| topicId | string | 话题 ID（LoopTask 回填） |
| articleTitle | string | 文章标题（LoopTask 回填） |
| articleLength | number | 文章长度（LoopTask 回填） |
| topicType | string | 话题类型（LoopTask 回填） |
| createdAt | Date | 创建时间 |
| updatedAt | Date | 更新时间 |

#### config 集合（配置表）

手动添加以下文档：

```json
// _id: monitorInterval
{ "_id": "monitorInterval", "value": 60000, "updatedAt": "2026-04-12T00:00:00.000Z" }

// _id: monitorUrls
{
  "_id": "monitorUrls",
  "value": ["https://wx.zsxq.com/group/48418518458448"],
  "updatedAt": "2026-04-12T00:00:00.000Z"
}

// _id: zsxq_cookie（通过 login 函数 setCookie 写入）
{ "_id": "zsxq_cookie", "value": "", "updatedAt": "2026-04-12T00:00:00.000Z" }
```

> ⚠️ 将 `monitorUrls.value` 替换为实际需要监控的星球 URL 列表

### 步骤三：部署云函数

方式一：使用 CloudBase CLI

```bash
npm install -g @cloudbase/cli
tcb login
tcb fn deploy updatedMonitor
tcb fn deploy loopLastUpdateArticleTask
tcb fn deploy login
tcb fn deploy getLastUpdatedArticle
```

方式二：通过控制台上传

1. 进入云开发控制台 → 云函数
2. 分别创建以下函数：`updatedMonitor`、`loopLastUpdateArticleTask`、`login`、`getLastUpdatedArticle`
3. 上传对应文件夹内的代码
4. 配置定时触发器（见下方 config.json 配置）

### 步骤四：配置环境变量

在每个云函数的环境变量中添加：

| 变量名 | 说明 | 示例值 | 必填 |
|--------|------|--------|:----:|
| `TCB_ENV` | 云开发环境 ID | `your-env-id` | ✅ |

### 步骤五：安装依赖 & 部署

```bash
npm install
cd functions/login && npm install
cd functions/getLastUpdatedArticle && npm install
cd functions/updatedMonitor && npm install
cd functions/loopLastUpdateArticleTask && npm install
```

## 云托管部署（推荐）⭐

项目支持通过 CloudBase CLI 一键部署到腾讯云托管服务，云端自动构建 Docker 镜像。

### 前置要求

1. **安装 CloudBase CLI**:
   ```bash
   npm install -g @cloudbase/cli
   ```

2. **登录腾讯云**:
   ```bash
   tcb login
   ```

3. **配置环境变量文件** (`.env`):
   ```bash
   # 复制模板
   cp .env.example .env
   
   # 编辑 .env 文件，填入以下配置
   TCB_ENV=temu-tools-prod-3g8yeywsda972fae
   MONITOR_CRON=*/1 * * * *          # Monitor定时任务：每1分钟执行
   TASK_CRON=*/5 * * * *             # Task定时任务：每5分钟执行
   DB_HOST=sh-cynosdbmysql-grp-xxx.sql.tencentcdb.com
   DB_PORT=22871
   DB_USER=zsxq_scan_dbuser
   DB_PASSWORD=your_password
   DB_NAME=temu-tools-prod-3g8yeywsda972fae
   ```

### 部署命令

```bash
# 从当前目录上传代码到云托管，云端自动构建
tcb cloudrun deploy -s zsxq-scan --source . --force
```

**参数说明**:
- `-s zsxq-scan`: 云托管服务名称
- `--source .`: 从当前目录上传代码包
- `--force`: 强制部署，跳过确认提示

### 部署流程

1. **打包代码**: CLI 自动将当前目录打包为 zip 文件
2. **上传到 COS**: 代码包上传到腾讯云对象存储
3. **云端构建**: 使用项目中的 `Dockerfile` 在云端自动构建镜像
4. **部署服务**: 创建新版本并自动切换流量

### 查看部署状态

部署完成后，CLI 会输出部署任务链接，点击即可查看实时构建进度和日志。

也可以访问 [腾讯云托管控制台](https://tcb.cloud.tencent.com/) 查看服务状态。

### 修改定时任务频率

如需调整监控频率，修改 `.env` 文件中的 cron 表达式后重新部署：

```bash
# 示例：每30秒执行一次 Monitor
MONITOR_CRON="*/30 * * * * *"

# 示例：每10分钟执行一次 Task
TASK_CRON="*/10 * * * *"
```

> 💡 **提示**: 云托管使用内置的 node-cron 库实现定时任务，通过环境变量灵活配置。

## 本地测试

### 快速测试（公开API）

```bash
# 最快验证公开 API（无需任何配置）
node scripts/runLocal.js pub-api 48418518458448

# 或用 npm
npm run test:pub -- 48418518458448
```

### MySQL数据库测试 ⭐

直接连接腾讯云MySQL数据库进行Task接口测试，无需CloudBase SDK：

```bash
# 1. 验证数据库连接
node verify-mysql-connection.js

# 2. Task单元测试（单个星球）
node tests/testTask-mysql.js

# 3. Task完整流程测试（Monitor → LoopTask → Verify）
node tests/testTaskFlow-mysql.js

# 或通过runLocal.js
node scripts/runLocal.js task:mysql   # 单元测试
node scripts/runLocal.js task:flow    # 完整流程
```

**详细文档**: [MYSQL_TEST_GUIDE.md](MYSQL_TEST_GUIDE.md) | [tests/README-MySQL-Test.md](tests/README-MySQL-Test.md)

### 完整测试（需 .env 配置 TCB_ENV）

```bash
npm test
```

## 成本估算

| 项目 | 方案 | 预估成本 |
|------|------|----------|
| 云函数 | 按量付费 | ~￥5-15/月 |
| 云数据库 | 按量付费 | ~￥5-10/月 |
| **总计** | | **~￥10-25/月** |

降低成本：调整监控间隔（1分钟 → 3-5 分钟）可减少约 60%-80% 的调用量。

## 安全特性

| 操作 | 带 Cookie？ | 每日次数 | 风险等级 |
|------|:----------:|:--------:|:--------:|
| Monitor 监控检测 | ❌ 不带 | ~72,000 | 🟢 **零** |
| GetArticle 获取全文 | ✅ 带 | <100 | 🟢 低 |

99.9% 的请求完全不关联你的账号。

## 注意事项

1. **Cookie 管理**: 仅用于获取文章全文，有效期约 1-3 个月，过期后从浏览器重新复制并通过 `login` 函数 `setCookie` 保存
2. **频率限制**: pub-api 为公开接口，礼貌性请求即可；`api.zsxq.com` 带 Cookie 请求应保持低频
3. **错误重试**: 失败的任务标记为 `failed`，可后续扩展重试机制
4. **云托管部署**: 推荐使用 CloudBase CLI 的 `tcb cloudrun deploy` 命令部署，云端自动构建 Docker 镜像
5. **定时任务配置**: 通过 `.env` 文件中的 `MONITOR_CRON` 和 `TASK_CRON` 环境变量调整执行频率

## 详细文档

| 文档 | 内容 |
|------|------|
| [Requirements/README.md](./Requirements/README.md) | 架构总览、完整流程图、技术决策 |
| [Requirements/ApiDesign.md](./Requirements/ApiDesign.md) | API 接口规范、签名算法、风控策略 |
| [Requirements/Login.md](./Requirements/Login.md) | Cookie 管理工具（设置/读取/验证） |
| [Requirements/GetLastUpdatedArticle.md](./Requirements/GetLastUpdatedArticle.md) | 文章获取逻辑 |
| [Requirements/UpdatedMonitor.md](./Requirements/UpdatedMonitor.md) | 监控模块详细设计 |
| [Requirements/LoopLastUpdateArticleTask.md](./Requirements/LoopLastUpdateArticleTask.md) | 任务消费循环设计 |
