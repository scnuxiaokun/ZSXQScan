# 更新日志 - MySQL数据库测试支持

## 📅 更新日期
2026-04-18

## ✨ 新增功能

### 1. MySQL直连测试脚本

#### 新增文件

| 文件 | 说明 |
|------|------|
| `verify-mysql-connection.js` | MySQL连接验证工具，快速检查数据库状态 |
| `tests/testTask-mysql.js` | Task接口单元测试（MySQL版） |
| `tests/testTaskFlow-mysql.js` | Task完整流程测试（MySQL版） |
| `tests/README-MySQL-Test.md` | MySQL测试详细文档 |
| `MYSQL_TEST_GUIDE.md` | MySQL测试快速开始指南 |

#### 修改文件

| 文件 | 修改内容 |
|------|---------|
| `scripts/runLocal.js` | 添加 `task:mysql` 和 `task:flow` 命令 |
| `README.md` | 添加MySQL测试使用说明 |

### 2. 核心特性

✅ **直连腾讯云MySQL**
- 不依赖CloudBase SDK
- 直接使用mysql2/promise连接池
- 支持完整的CRUD操作

✅ **自动数据清理**
- 测试完成后自动删除测试数据
- 避免污染生产数据库

✅ **详细的测试日志**
- 每个步骤都有清晰的输出
- 错误提示友好，便于排查问题

✅ **灵活的配置方式**
- 支持单个星球测试
- 支持批量星球测试
- 可从环境变量或配置文件读取

## 🔧 技术实现

### 数据库连接配置

```javascript
const dbConfig = {
  host: 'sh-cynosdbmysql-grp-5aqhxbwa.sql.tencentcdb.com',
  port: 22871,
  user: 'zsxq_scan_dbuser',
  password: 'zsxq@123',
  database: 'temu-tools-prod-3g8yeywsda972fae',
};
```

### 核心API封装

所有测试脚本都实现了以下数据库操作方法：

```javascript
// 查询待处理任务
async function getPendingTask(planetId)

// 创建新任务
async function createTask(planetId, planetUrl, topicCreateTime)

// 更新任务状态
async function updateTask(taskId, updateData)

// 清理测试数据
async function cleanupTestTask(planetId)
```

### 测试流程

#### testTask-mysql.js（单元测试）

1. 连接MySQL数据库
2. 创建测试任务（pending状态）
3. 调用知识星球API获取文章
4. 更新任务为completed状态，保存文章数据
5. 验证数据写入成功
6. 自动清理测试数据

#### testTaskFlow-mysql.js（完整流程）

1. **Monitor阶段**: 检测星球更新，创建任务
2. **LoopTask阶段**: 拉取文章内容，更新任务
3. **Verify阶段**: 验证数据完整性
4. 自动清理测试数据

## 📖 使用文档

### 快速开始

```bash
# 1. 验证数据库连接
node verify-mysql-connection.js

# 2. 运行单元测试
node tests/testTask-mysql.js

# 3. 运行完整流程测试
node tests/testTaskFlow-mysql.js
```

### 通过runLocal.js运行

```bash
# 单元测试
node scripts/runLocal.js task:mysql

# 完整流程测试
node scripts/runLocal.js task:flow
```

### 配置测试星球

编辑对应的测试文件：

```javascript
// testTask-mysql.js
const TEST_GROUP_ID = '48418518458448';

// testTaskFlow-mysql.js
const TEST_GROUP_IDS = [
  '48418518458448',
  '28885884288111',
];
```

## 🎯 解决的问题

### 之前的问题

❌ 本地测试只能使用JSON文件存储
❌ 无法模拟真实的数据库环境
❌ 测试数据与生产环境隔离

### 现在的优势

✅ 直接连接生产环境的MySQL数据库
✅ 完全模拟云函数的数据库操作
✅ 更真实的集成测试体验
✅ 自动清理，不影响生产数据

## 📊 对比表

| 特性 | 本地JSON模式 | MySQL模式 |
|------|-------------|-----------|
| 数据存储 | data/tasks.json | 腾讯云MySQL |
| 需要TCB_ENV | ❌ 否 | ❌ 否 |
| 需要网络 | ❌ 否 | ✅ 是 |
| 并发支持 | ❌ 弱 | ✅ 强 |
| 数据持久化 | ⚠️ 本地文件 | ✅ 云端数据库 |
| 适用场景 | 开发调试 | 生产环境测试 |

## ⚠️ 注意事项

1. **Cookie必需**: 获取文章内容需要有效的ZSXQ_COOKIE
2. **网络要求**: 需要能访问腾讯云MySQL数据库
3. **测试数据清理**: 脚本会自动清理测试数据
4. **并发限制**: 避免同时运行多个测试脚本

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

## 📝 后续优化建议

1. 支持从环境变量读取MySQL配置
2. 添加更多的测试用例（边界情况、异常处理）
3. 支持测试结果导出为报告
4. 添加性能测试（响应时间、并发能力）

## 🎉 总结

本次更新为项目添加了完整的MySQL数据库测试支持，开发者可以：

- ✅ 直接连接腾讯云MySQL进行真实环境测试
- ✅ 通过单元测试快速验证单个功能
- ✅ 通过完整流程测试验证整个业务链路
- ✅ 自动清理测试数据，保证数据安全

这大大提升了测试的真实性和可靠性，为后续的持续集成和自动化测试打下了基础。
