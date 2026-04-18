# 运行 Task MySQL 单元测试

## ✅ 配置已完成

我已经为你完成了以下配置：

1. ✅ 在 `tests/testTask-mysql.js` 中配置了测试星球ID: `48418518458448`
2. ✅ 确认 `.env` 中已配置 `ZSXQ_COOKIE`
3. ✅ 在 `package.json` 中添加了新的npm脚本

## 🚀 运行测试

### 方法1: 使用 npm 脚本（推荐）

```bash
npm run test:task:mysql
```

### 方法2: 直接运行Node.js

```bash
node tests/testTask-mysql.js
```

### 方法3: 通过 runLocal.js

```bash
node scripts/runLocal.js task:mysql
```

## 📋 测试流程

测试将按以下步骤执行：

1. **连接MySQL数据库** - 验证与腾讯云MySQL的连接
2. **创建测试任务** - 在tasks表中创建一条pending状态的任务
3. **获取文章** - 调用知识星球API获取最新文章
4. **更新任务** - 将任务状态更新为completed，保存文章数据
5. **验证数据** - 从数据库读取并验证写入的数据
6. **清理数据** - 自动删除测试数据，保持数据库清洁

## 📊 预期输出

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
  [MySQL] ✅ 创建任务: xxxxxxxx

📄 步骤2: 获取最新文章...
⏱️  耗时: XXXXms

========== 文章内容 ==========
  标题:     ...
  类型:     ...
  ...

💾 步骤3: 更新任务到数据库...
  [MySQL] ✅ 更新任务: xxxxxxxx

✅ 步骤4: 验证数据...
  ✅ 数据已成功写入MySQL数据库

🧹 步骤5: 清理测试数据...
  [MySQL] 🧹 清理测试数据: 删除 1 条记录

🎉 测试完成！所有步骤通过
```

## ⚠️ 注意事项

1. **确保网络可达**: 需要能访问腾讯云MySQL数据库
2. **Cookie有效**: ZSXQ_COOKIE 必须在有效期内
3. **依赖已安装**: 确保已运行 `npm install`

## 🔍 如果遇到问题

### 连接失败
```bash
# 先验证数据库连接
npm run test:mysql:verify
# 或
node verify-mysql-connection.js
```

### Cookie过期
```bash
# 重新获取Cookie
node scripts/runLocal.js login
```

### 缺少依赖
```bash
npm install
```

## 📖 更多文档

- [MYSQL_TEST_GUIDE.md](MYSQL_TEST_GUIDE.md) - 快速开始指南
- [tests/README-MySQL-Test.md](tests/README-MySQL-Test.md) - 详细测试文档
- [MYSQL_TEST_INDEX.md](MYSQL_TEST_INDEX.md) - 文档索引

---

**现在请在终端中运行**: `npm run test:task:mysql`
