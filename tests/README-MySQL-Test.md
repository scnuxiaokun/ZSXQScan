# Task接口MySQL测试指南

## 概述

本目录包含两个用于直接连接腾讯云MySQL数据库进行测试的脚本：

1. **testTask-mysql.js** - Task接口单元测试
2. **testTaskFlow-mysql.js** - Task完整流程测试（Monitor → LoopTask → Verify）

## 前置条件

### 1. 配置环境变量

在 `.env` 文件中确保已配置：

```bash
# 知识星球 Cookie（必需）
ZSXQ_COOKIE=你的Cookie字符串

# MySQL数据库配置（已在测试脚本中硬编码，也可通过环境变量覆盖）
# DB_HOST=sh-cynosdbmysql-grp-5aqhxbwa.sql.tencentcdb.com
# DB_PORT=22871
# DB_USER=zsxq_scan_dbuser
# DB_PASSWORD=zsxq@123
# DB_NAME=temu-tools-prod-3g8yeywsda972fae
```

### 2. 安装依赖

```bash
npm install
```

## 使用方法

### 方法1：直接运行测试脚本

#### 单元测试（推荐快速测试）

```bash
node tests/testTask-mysql.js
```

**测试流程：**
1. 连接腾讯云MySQL数据库
2. 创建测试任务（pending状态）
3. 调用知识星球API获取文章
4. 更新任务状态为completed，保存文章数据
5. 验证数据写入成功
6. 自动清理测试数据

**配置：**
编辑 `tests/testTask-mysql.js`，设置：
```javascript
const TEST_GROUP_ID = '48418518458448';  // 要测试的星球ID
const TEST_TOPIC_ID = '';                 // 可选，指定话题ID可跳过查询
```

---

#### 完整流程测试

```bash
node tests/testTaskFlow-mysql.js
```

**测试流程：**
1. **阶段1 - Monitor**：检测星球更新，创建任务
2. **阶段2 - LoopTask**：拉取文章内容，更新任务
3. **阶段3 - Verify**：验证数据完整性
4. 自动清理测试数据

**配置：**
编辑 `tests/testTaskFlow-mysql.js`，设置：
```javascript
const TEST_GROUP_IDS = [
  '48418518458448',
  '28885884288111',
];
```

或设置环境变量：
```bash
export MONITOR_URLS='["https://wx.zsxq.com/group/48418518458448"]'
node tests/testTaskFlow-mysql.js
```

---

### 方法2：通过 runLocal.js 运行

```bash
# 单元测试
node scripts/runLocal.js task:mysql

# 完整流程测试
node scripts/runLocal.js task:flow
```

---

## 测试输出示例

### 单元测试输出

```
╔══════════════════════════════════════╗
║     Task接口单元测试 (MySQL版)       ║
╚══════════════════════════════════════╝

[Test] 星球ID: 48418518458448
[Test] 话题ID: (自动检测)
[Test] 数据库: 腾讯云 MySQL

[MySQL] 正在连接腾讯云数据库...
[MySQL] ✅ 连接成功

📝 步骤1: 创建测试任务...
  [MySQL] ✅ 创建任务: k9x2m4n7p1q3

📄 步骤2: 获取最新文章...
⏱️  耗时: 1234ms

========== 文章内容 ==========
  标题:     测试文章标题
  类型:     text
  话题ID:   1234567890
  ...

💾 步骤3: 更新任务到数据库...
  [MySQL] ✅ 更新任务: k9x2m4n7p1q3

✅ 步骤4: 验证数据...
  任务ID: k9x2m4n7p1q3
  状态: completed
  文章标题: 测试文章标题
  文章长度: 5678
  话题ID: 1234567890
  ✅ 数据已成功写入MySQL数据库

🧹 步骤5: 清理测试数据...
  [MySQL] 🧹 清理测试数据: 删除 1 条记录

🎉 测试完成！所有步骤通过
```

---

## 数据库表结构

### tasks 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(50) | 任务ID（主键） |
| planetId | VARCHAR(50) | 星球ID |
| planetName | VARCHAR(200) | 星球名称 |
| planetUrl | VARCHAR(500) | 星球URL |
| status | VARCHAR(20) | 状态：pending/completed/failed |
| topicCreateTime | DATETIME | 话题创建时间 |
| topicId | VARCHAR(50) | 话题ID |
| article | TEXT | 文章JSON数据 |
| articleTitle | VARCHAR(500) | 文章标题 |
| articleLength | INT | 文章长度 |
| createdAt | DATETIME | 创建时间 |
| updatedAt | DATETIME | 更新时间 |

---

## 常见问题

### 1. 连接失败：ECONNREFUSED

**原因：** 无法连接到腾讯云数据库

**解决：**
- 检查网络连接
- 确认数据库地址和端口正确
- 确认防火墙允许访问

### 2. 认证失败：ER_ACCESS_DENIED_ERROR

**原因：** 用户名或密码错误

**解决：**
- 检查 `dbConfig` 中的 `user` 和 `password`
- 联系数据库管理员确认凭据

### 3. Cookie过期：401/403错误

**原因：** ZSXQ_COOKIE 已失效

**解决：**
```bash
node scripts/runLocal.js login
```
重新获取并设置Cookie

### 4. 表不存在

**原因：** 数据库中缺少 `tasks` 表

**解决：**
运行数据库初始化脚本或手动创建表结构

---

## 与本地JSON模式的对比

| 特性 | 本地JSON模式 | MySQL模式 |
|------|-------------|-----------|
| 数据存储 | data/tasks.json | 腾讯云MySQL |
| 需要TCB_ENV | ❌ 否 | ❌ 否 |
| 需要网络 | ❌ 否 | ✅ 是 |
| 并发支持 | ❌ 弱 | ✅ 强 |
| 数据持久化 | ⚠️ 本地文件 | ✅ 云端数据库 |
| 适用场景 | 开发调试 | 生产环境测试 |

---

## 最佳实践

1. **开发阶段**：使用本地JSON模式（无需网络，速度快）
2. **集成测试**：使用MySQL模式（模拟生产环境）
3. **测试后清理**：脚本会自动清理测试数据，但建议定期检查数据库
4. **批量测试**：使用 `testTaskFlow-mysql.js` 测试多个星球
5. **快速验证**：使用 `testTask-mysql.js` 测试单个星球

---

## 相关文档

- [README.md](../README.md) - 项目总览
- [database.md](../database.md) - 数据库设计
- [Requirements/](../Requirements/) - 需求文档
