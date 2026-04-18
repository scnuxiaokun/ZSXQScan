# 📚 MySQL测试文档索引

## 🚀 快速开始

### 方式1: 使用快速启动脚本（推荐）

**Mac/Linux**:
```bash
chmod +x quick-start-mysql-test.sh
./quick-start-mysql-test.sh
```

**Windows**:
```bash
quick-start-mysql-test.bat
```

---

### 方式2: 手动运行

```bash
# 第1步：验证数据库连接
node verify-mysql-connection.js

# 第2步：配置测试星球（编辑对应文件）
# tests/testTask-mysql.js 或 tests/testTaskFlow-mysql.js

# 第3步：运行测试
node tests/testTask-mysql.js        # 单元测试
# 或
node tests/testTaskFlow-mysql.js    # 完整流程测试
```

---

### 方式3: 通过runLocal.js

```bash
node scripts/runLocal.js task:mysql   # 单元测试
node scripts/runLocal.js task:flow    # 完整流程测试
```

---

## 📖 文档导航

### 📘 入门文档

| 文档 | 适合人群 | 内容 |
|------|---------|------|
| [MYSQL_TEST_GUIDE.md](MYSQL_TEST_GUIDE.md) | 新手 | 快速开始指南，5分钟上手 |
| [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) | 所有人 | 完整实现总结，全面了解功能 |

---

### 📗 详细文档

| 文档 | 适合人群 | 内容 |
|------|---------|------|
| [tests/README-MySQL-Test.md](tests/README-MySQL-Test.md) | 开发者 | 详细的API说明和使用示例 |
| [CHANGELOG-MySQL-Test.md](CHANGELOG-MySQL-Test.md) | 维护者 | 更新日志和技术细节 |

---

### 📙 项目文档

| 文档 | 内容 |
|------|------|
| [README.md](README.md) | 项目总览（已添加MySQL测试章节） |
| [database.md](database.md) | 数据库设计文档 |

---

## 🧪 测试脚本说明

### 核心测试脚本

| 脚本 | 用途 | 难度 |
|------|------|------|
| `verify-mysql-connection.js` | 验证数据库连接 | ⭐ 简单 |
| `tests/testTask-mysql.js` | Task单元测试 | ⭐⭐ 中等 |
| `tests/testTaskFlow-mysql.js` | 完整流程测试 | ⭐⭐⭐ 进阶 |

### 辅助脚本

| 脚本 | 用途 |
|------|------|
| `quick-start-mysql-test.sh` | Mac/Linux快速启动 |
| `quick-start-mysql-test.bat` | Windows快速启动 |
| `scripts/runLocal.js` | 统一测试入口 |

---

## 🎯 选择适合的测试

### 场景1: 我只想知道数据库能不能连上

```bash
node verify-mysql-connection.js
```

**预期输出**: 
- ✅ 连接成功
- 📋 表列表
- 📊 统计数据

---

### 场景2: 我想测试单个星球的文章获取

```bash
# 1. 编辑 tests/testTask-mysql.js
const TEST_GROUP_ID = '48418518458448';

# 2. 运行测试
node tests/testTask-mysql.js
```

**测试内容**:
- 创建任务
- 获取文章
- 更新任务
- 验证数据
- 清理数据

---

### 场景3: 我想测试完整的监控+拉取流程

```bash
# 1. 编辑 tests/testTaskFlow-mysql.js
const TEST_GROUP_IDS = ['48418518458448'];

# 2. 运行测试
node tests/testTaskFlow-mysql.js
```

**测试流程**:
- Monitor阶段（检测更新）
- LoopTask阶段（拉取文章）
- Verify阶段（验证数据）
- 自动清理

---

### 场景4: 我想批量测试多个星球

```bash
# 编辑 tests/testTaskFlow-mysql.js
const TEST_GROUP_IDS = [
  '48418518458448',
  '28885884288111',
  '12345678901234',
];

# 运行测试
node tests/testTaskFlow-mysql.js
```

---

## ❓ 常见问题

### Q1: 需要配置TCB_ENV吗？

**A**: 不需要！MySQL测试直接连接数据库，无需CloudBase SDK。

---

### Q2: Cookie从哪里获取？

**A**: 
```bash
# 方法1：从浏览器获取
# 1. 打开知识星球网页版
# 2. F12 → Network → 复制Cookie

# 方法2：使用login函数
node scripts/runLocal.js login
```

---

### Q3: 测试会污染生产数据吗？

**A**: 不会！所有测试脚本都会自动清理测试数据。

---

### Q4: 可以同时运行多个测试吗？

**A**: 不建议。可能产生数据冲突，建议串行执行。

---

### Q5: 如何修改数据库配置？

**A**: 编辑对应的测试文件，修改`dbConfig`对象：
```javascript
const dbConfig = {
  host: '你的数据库地址',
  port: 端口,
  user: '用户名',
  password: '密码',
  database: '数据库名',
};
```

---

## 🔧 故障排查速查

| 错误代码 | 原因 | 解决方案 |
|---------|------|---------|
| `ECONNREFUSED` | 网络问题 | 检查网络和防火墙 |
| `ER_ACCESS_DENIED_ERROR` | 认证失败 | 检查用户名密码 |
| `ER_BAD_DB_ERROR` | 数据库不存在 | 检查数据库名 |
| `401/403` | Cookie过期 | 重新获取Cookie |
| `Table doesn't exist` | 表不存在 | 联系DBA创建表 |

---

## 📞 获取帮助

1. **查看文档**: 阅读上述文档
2. **运行验证**: `node verify-mysql-connection.js`
3. **查看日志**: 测试脚本会输出详细日志
4. **检查配置**: 确认.env和测试文件配置正确

---

## 🎉 开始测试吧！

选择上面的任意一种方式，开始你的MySQL测试之旅！

**推荐顺序**:
1. ✅ `verify-mysql-connection.js` - 验证连接
2. ✅ `testTask-mysql.js` - 单元测试  
3. ✅ `testTaskFlow-mysql.js` - 完整流程

祝你测试顺利！🚀
