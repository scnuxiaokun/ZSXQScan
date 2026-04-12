# 知识星球监控抓取系统

## 项目概述

本系统用于自动监控知识星球博主的更新，并在发现新文章时自动拉取内容。

## 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                      腾讯云开发环境                          │
│  ┌──────────────┐    ┌───────────────┐    ┌──────────────┐  │
│  │ updatedMonitor│───▶│   云数据库     │◀──│loopLastUpdate │  │
│  │ (定时触发)     │    │  tasks集合    │    │ ArticleTask   │  │
│  └──────────────┘    └───────────────┘    │ (定时触发)     │  │
│         │                                    └──────┬───────┘  │
│         ▼                                           │          │
│  ┌──────────────┐                           ┌──────▼───────┐  │
│  │ Puppeteer     │                           │ Puppeteer    │  │
│  │ (无登录容器)  │                           │ (已登录容器)  │  │
│  └──────────────┘                           └──────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 核心流程

1. **updatedMonitor** (每分钟执行)
   - 使用无登录状态的浏览器访问星球页面
   - 解析"最近更新时间"
   - 如果是"刚刚"，在数据库创建拉取任务

2. **loopLastUpdateArticleTask** (每分钟执行)
   - 查询数据库中状态为`pending`的任务
   - 使用已登录的浏览器获取文章完整内容
   - 更新任务状态为`completed`

## 目录结构

```
ZSXQScan/
├── functions/                          # 云函数目录
│   ├── login/                          # 登录模块（被其他模块引用）
│   │   └── index.js                    # 手机号验证码登录逻辑
│   ├── getLastUpdatedArticle/          # 获取文章模块
│   │   └── index.js                    # 文章抓取与解析
│   ├── updatedMonitor/                 # 更新监控模块 ⭐定时入口
│   │   ├── index.js                    # 监控主逻辑
│   │   └── config.json                 # 定时触发器配置
│   └── loopLastUpdateArticleTask/      # 文章拉取模块 ⭐定时入口
│       ├── index.js                    # 任务处理主逻辑
│       └── config.json                 # 定时触发器配置
├── database.md                         # 数据库设计文档
├── package.json                        # 项目依赖
├── README.md                           # 本文件
└── Requirements/                       # 需求文档目录
```

## 部署指南

### 前置要求

1. **腾讯云开发环境**: 在 [腾讯云 CloudBase 控制台](https://tcb.cloud.tencent.com/) 创建环境
2. **Node.js 18+**: 云函数运行时
3. **浏览器服务**: 需要一个可远程连接的 Chrome/Puppeteer 浏览器实例

### 步骤一：创建云开发环境

1. 登录 [腾讯云 CloudBase 控制台](https://tcb.cloud.tencent.com/)
2. 创建新的云开发环境，选择「按量付费」以降低成本
3. 记录下环境ID（Env ID）

### 步骤二：初始化数据库集合

在云开发控制台的「数据库」中创建以下集合：

#### tasks 集合（任务表）

| 字段 | 类型 | 说明 |
|------|------|------|
| planetId | string | 星球ID |
| planetName | string | 星球名称 |
| planetUrl | string | 星球URL |
| status | string | `pending`(未开始) / `completed`(完成) / `failed`(失败) |
| article | string | 文章JSON内容 |
| lastUpdateTime | string | 最近更新时间文案 |
| createdAt | Date | 创建时间 |
| updatedAt | Date | 更新时间 |

#### config 集合（配置表）

手动添加以下文档：

```json
// _id: monitorInterval
{
  "_id": "monitorInterval",
  "value": 60000,
  "updatedAt": "2026-04-12T00:00:00.000Z"
}

// _id: monitorUrls
{
  "_id": "monitorUrls", 
  "value": [
    "https://wx.zsxq.com/apppzzlxxxxx"
  ],
  "updatedAt": "2026-04-12T00:00:00.000Z"
}
```

> ⚠️ 将 `monitorUrls.value` 替换为实际需要监控的星球URL列表

### 步骤三：部署云函数

方式一：使用 CloudBase CLI

```bash
# 安装 CLI
npm install -g @cloudbase/cli

# 登录
tcb login

# 初始化项目（如果还没有）
tcb init

# 部署所有函数
tcb fn deploy updatedMonitor
tcb fn deploy loopLastUpdateArticleTask
```

方式二：通过控制台上传

1. 进入云开发控制台 → 云函数
2. 分别创建以下函数：
   - `updatedMonitor`
   - `loopLastUpdateArticleTask`
3. 上传对应文件夹内的代码
4. 配置定时触发器（见下方 config.json 配置）

### 步骤四：配置环境变量

在每个云函数的环境变量中添加：

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `TCB_ENV` | 云开发环境ID | `your-env-id` |
| `BROWSER_ENDPOINT` | 浏览器CDP端点 | `ws://xxx:9222` |
| `SMS_ENDPOINT` | 验证码获取接口(可选) | `http://xxx/get-sms` |

### 步骤五：启动浏览器服务

由于云函数是无状态的，需要一个持久运行的浏览器服务。推荐方案：

**方案A：使用腾讯云无服务器容器 (推荐)**

```dockerfile
# Dockerfile
FROM browserless/chrome:latest

# 启动参数
CMD ["--port", "3000", "--max-concurrent-sessions", "5"]
```

**方案B：使用 CVM 云服务器 + Chrome**

```bash
# 安装Chrome
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo dpkg -i google-chrome-stable_current_amd64.deb
sudo apt-get install -f

# 以远程调试模式启动
google-chrome --headless --no-sandbox --disable-gpu --remote-debugging-port=9222
```

### 步骤六：安装依赖

每个云函数都需要安装依赖：

```bash
cd functions/login && npm install
cd functions/getLastUpdatedArticle && npm install
cd functions/updatedMonitor && npm install
cd functions/loopLastUpdateArticleTask && npm install
```

或者统一在项目根目录：
```bash
npm install
```

## 成本优化建议

| 项目 | 方案 | 预估成本 |
|------|------|----------|
| 云函数 | 按量付费 | ~￥5-20/月（取决于调用频率） |
| 云数据库 | 按量付费 | ~￥5-10/月 |
| 浏览器服务 | CVM基础型或Serverless Container | ~￥30-80/月 |
| **总计** | | **~￥40-110/月** |

进一步降低成本的策略：
- 调整监控间隔（从1分钟改为3-5分钟）
- 使用 Serverless Container 的按量计费模式
- 合并两个云函数为一个，减少资源占用

## 使用说明

### 手动触发测试

可以通过云函数控制台的「测试」功能手动调用：

**测试 Monitor：**
```json
{}
// 或指定某个星球
{ "planetUrl": "https://wx.zsxq.com/apppzzlxxxxx" }
```

**测试 Task：**
```json
{}
// 或指定处理某个星球
{ "planetUrl": "https://wx.zsxq.com/apppzzlxxxxx" }
```

### 查看日志

进入云函数控制台 → 日志查询，可以查看每次执行的详细日志。

### 查看数据

在云数据库控制台查看 `tasks` 集合中的记录，了解任务执行情况和文章内容。

## 注意事项

1. **登录态管理**: 登录后的浏览器会话可能会过期，需要定期重新登录或实现自动续期机制
2. **验证码获取**: 验证码接口地址 (`SMS_ENDPOINT`) 需要配合双卡助手配置
3. **频率限制**: 避免过于频繁地请求知识星球，防止被风控
4. **错误重试**: 当前实现会在失败时标记任务为 `failed`，可后续扩展重试机制
5. **反爬对抗**: 知识星球可能更新页面结构，需定期维护选择器
