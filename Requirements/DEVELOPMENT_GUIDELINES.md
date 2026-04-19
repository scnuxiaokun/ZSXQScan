# 开发规范与注意事项

## 代码修改工具使用规范

### ❌ 禁止使用 search_replace 的场景

**当需要修改包含转义字符的代码时，禁止使用 `search_replace` 工具**，特别是以下情况：

1. **正则表达式中包含转义序列**
   - `\n` (换行符)
   - `\t` (制表符)
   - `\s` (空白字符)
   - `\r` (回车符)
   - 其他正则转义字符

2. **字符串中包含特殊转义字符**
   - 任何可能被 JSON 解析器误解析的转义序列

**原因**: `search_replace` 工具使用 JSON 格式传递参数，JSON 解析器会将 `\n`、`\t` 等转义序列转换为实际的控制字符，导致代码结构被破坏。

**错误示例**:
```javascript
// 这段代码在 search_replace 中会被破坏
.replace(/
\s*
/g, '

')
```

### ✅ 推荐的替代方案

1. **使用 run_in_terminal 执行 Node.js 脚本**
   ```bash
   node -e "const fs = require('fs'); let c = fs.readFileSync('file.js', 'utf8'); /* 修改逻辑 */ fs.writeFileSync('file.js', c);"
   ```

2. **使用 heredoc 方式执行多行脚本**
   ```bash
   node << 'EOF'
   const fs = require('fs');
   // 复杂的文件操作逻辑
   EOF
   ```

3. **使用 create_file 覆盖整个文件**（适用于小文件）

4. **手动编辑后告知 AI**（用户自己修改）

## 数据库配置规范

### 强制使用 MySQL 数据库

项目已移除本地 JSON 模式和 CloudBase 文档数据库模式，**强制使用 MySQL 数据库**。

**启动服务时必须配置以下环境变量**:
- `DB_HOST`: 数据库主机地址
- `DB_PORT`: 数据库端口
- `DB_USER`: 数据库用户名
- `DB_PASSWORD`: 数据库密码
- `DB_NAME`: 数据库名称

**未配置时的行为**: 服务启动时会检测 `DB_HOST`，如果未设置则输出错误信息并退出。

## Cookie 管理规范

### Cookie 必须从数据库加载

Task 模块和 API 调用需要从数据库 `config` 表中读取 `zsxq_cookie` 配置，不能依赖环境变量。

**Cookie 字段要求**:
- Cookie 中必须包含 `zsxq_access_token` 字段
- 知识星球 API 通过 Cookie 认证，不使用 Authorization Bearer 头

## 测试规范

### 测试后保留数据

单元测试和集成测试完成后，**不要清理测试数据**，便于后续调试和问题排查。

**实现方式**:
- 注释掉测试脚本中的清理代码
- 或在测试结束时跳过 cleanup 步骤

### Token 验证策略

**不再主动验证 Access Token**，改为延迟验证：
- `validateAccessToken()` 仅检查 token 格式
- 真正的验证在实际业务请求时进行
- 如果业务接口返回 401/403，则判定为 token 失效

**原因**: `/v2/user` 接口已废弃（返回 404），主动验证会导致不必要的错误。

## API 调用规范

### 知识星球 API 认证

1. **公开接口** (`pub-api.zsxq.com`)
   - 无需 Cookie
   - 无需签名
   - 付费/免费星球均可访问
   - 用于 Monitor 监控场景

2. **私有接口** (`api.zsxq.com`)
   - 需要 Cookie 认证
   - 需要 X-Signature 签名
   - 用于获取文章详情等敏感操作
   - **不要添加 Authorization Bearer 头**

### 频率限制

- Monitor 接口：每星球最小间隔 120 秒
- Task 接口：每星球最小间隔 800-2000ms（随机抖动）
- 全局每分钟最大 30 次请求
- 全局每小时最大 200 次请求

## 部署规范

### 禁止自动部署

代码修改后**不要自动执行部署命令**，必须等待用户明确指示后再部署。

### 定时任务配置

优先使用内置的 `node-cron` 定时任务，而非腾讯云平台的触发器：
- Monitor: 默认每 5 分钟执行 (`*/5 * * * *`)
- Task: 默认每 10 分钟执行 (`*/10 * * * *`)
- 可通过环境变量 `MONITOR_CRON` 和 `TASK_CRON` 调整

## 命名规范

所有代码元素（变量、函数、文件）必须使用**描述性命名**，避免模糊名称：
- ✅ `getGroupPublicInfo` - 清晰表达功能
- ❌ `getData` - 过于模糊
- ✅ `updatedMonitor` - 明确是更新监控
- ❌ `monitor` - 不够具体
