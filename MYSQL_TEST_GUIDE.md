# MySQL数据库测试快速开始

## 📋 概述

本项目已添加对**直接连接腾讯云MySQL数据库**进行测试的支持。所有Task接口的单元测试和完整流程测试都可以直接使用MySQL数据库进行数据读写，无需通过CloudBase SDK。

## 🚀 快速开始

### 1️⃣ 验证数据库连接

```bash
node verify-mysql-connection.js
```

这个脚本会：
- ✅ 测试MySQL连接
- 📋 显示数据库中的表
- 📊 显示tasks表结构和统计信息
- 📝 显示最新的任务记录

### 2️⃣ 运行Task单元测试

```bash
# 方法1：直接运行
node tests/testTask-mysql.js

# 方法2：通过runLocal.js
node scripts/runLocal.js task:mysql
```

**测试内容：**
- 创建测试任务（pending状态）
- 调用知识星球API获取文章
- 更新任务为completed状态
- 验证数据写入MySQL
- 自动清理测试数据

**配置：** 编辑 `tests/testTask-mysql.js`
```javascript
const TEST_GROUP_ID = '48418518458448';  // 设置要测试的星球ID
```

### 3️⃣ 运行完整流程测试

```bash
# 方法1：直接运行
node tests/testTaskFlow-mysql.js

# 方法2：通过runLocal.js
node scripts/runLocal.js task:flow
```

**测试流程：**
1. **Monitor阶段** - 检测星球更新，创建任务
2. **LoopTask阶段** - 拉取文章内容，更新任务
3. **Verify阶段** - 验证数据完整性
4. 自动清理测试数据

**配置：** 编辑 `tests/testTaskFlow-mysql.js`
```javascript
const TEST_GROUP_IDS = [
  '48418518458448',
  '28885884288111',
];
```

## 📁 新增文件说明

| 文件 | 说明 |
|------|------|
| `verify-mysql-connection.js` | MySQL连接验证工具 |
| `tests/testTask-mysql.js` | Task单元测试（MySQL版） |
| `tests/testTaskFlow-mysql.js` | Task完整流程测试（MySQL版） |
| `tests/README-MySQL-Test.md` | 详细测试文档 |

## 🔧 修改文件说明

| 文件 | 修改内容 |
|------|---------|
| `scripts/runLocal.js` | 添加 `task:mysql` 和 `task:flow` 命令 |

## 💡 核心特性

### ✅ 直连MySQL
- 不依赖CloudBase SDK
- 直接使用mysql2连接池
- 支持完整的CRUD操作

### ✅ 自动清理
- 测试完成后自动删除测试数据
- 避免污染生产数据库

### ✅ 详细日志
- 每个步骤都有清晰的输出
- 错误提示友好，便于排查问题

### ✅ 灵活配置
- 支持单个星球测试
- 支持批量星球测试
- 可从环境变量或配置文件读取

## 🗄️ 数据库配置

MySQL连接配置在测试脚本中硬编码：

```javascript
const dbConfig = {
  host: 'sh-cynosdbmysql-grp-5aqhxbwa.sql.tencentcdb.com',
  port: 22871,
  user: 'zsxq_scan_dbuser',
  password: 'zsxq@123',
  database: 'temu-tools-prod-3g8yeywsda972fae',
};
```

如需修改，请编辑对应的测试文件。

## 📊 数据库表结构

### tasks 表

```sql
CREATE TABLE `tasks` (
  `id` VARCHAR(50) PRIMARY KEY,
  `planetId` VARCHAR(50) NOT NULL,
  `planetName` VARCHAR(200),
  `planetUrl` VARCHAR(500),
  `status` VARCHAR(20) DEFAULT 'pending',
  `topicCreateTime` DATETIME,
  `topicId` VARCHAR(50),
  `article` TEXT,
  `articleTitle` VARCHAR(500),
  `articleLength` INT,
  `createdAt` DATETIME DEFAULT NOW(),
  `updatedAt` DATETIME DEFAULT NOW()
);
```

## 🎯 使用场景

### 场景1：开发调试
```bash
# 快速验证单个星球的文章获取
node tests/testTask-mysql.js
```

### 场景2：集成测试
```bash
# 测试完整的监控+拉取流程
node tests/testTaskFlow-mysql.js
```

### 场景3：数据库验证
```bash
# 检查数据库连接和数据
node verify-mysql-connection.js
```

## ⚠️ 注意事项

1. **Cookie必需**：获取文章内容需要有效的ZSXQ_COOKIE
   ```bash
   # 在 .env 中配置
   ZSXQ_COOKIE=你的Cookie字符串
   ```

2. **网络要求**：需要能访问腾讯云MySQL数据库
   - 确保防火墙允许访问
   - 确认数据库白名单包含你的IP

3. **测试数据清理**：脚本会自动清理测试数据，但建议定期检查数据库

4. **并发限制**：避免同时运行多个测试脚本，可能导致数据冲突

## 🔍 故障排查

### 连接失败
```bash
# 先运行验证脚本
node verify-mysql-connection.js
```

常见错误：
- `ECONNREFUSED` - 网络或地址错误
- `ER_ACCESS_DENIED_ERROR` - 用户名密码错误
- `ER_BAD_DB_ERROR` - 数据库不存在

### Cookie过期
```bash
# 重新获取Cookie
node scripts/runLocal.js login
```

### 表不存在
联系数据库管理员创建必要的表结构

## 📖 相关文档

- [tests/README-MySQL-Test.md](tests/README-MySQL-Test.md) - 详细测试文档
- [database.md](database.md) - 数据库设计文档
- [README.md](README.md) - 项目总览

## 🎉 完成

现在你可以直接使用MySQL数据库进行Task接口的单元测试了！

**推荐测试顺序：**
1. `node verify-mysql-connection.js` - 验证连接
2. `node tests/testTask-mysql.js` - 单元测试
3. `node tests/testTaskFlow-mysql.js` - 完整流程测试
