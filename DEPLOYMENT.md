# 云托管部署指南

## 快速部署（3步完成）

### 1️⃣ 配置环境变量

复制并编辑 `.env` 文件：

```bash
cp .env.example .env
```

必填配置项：
```env
TCB_ENV=temu-tools-prod-3g8yeywsda972fae
MONITOR_CRON=*/1 * * * *
TASK_CRON=*/5 * * * *
DB_HOST=sh-cynosdbmysql-grp-xxx.sql.tencentcdb.com
DB_PORT=22871
DB_USER=zsxq_scan_dbuser
DB_PASSWORD=your_password
DB_NAME=temu-tools-prod-3g8yeywsda972fae
```

### 2️⃣ 登录腾讯云

```bash
tcb login
```

### 3️⃣ 一键部署

```bash
tcb cloudrun deploy -s zsxq-scan --source . --force
```

## 部署流程说明

执行部署命令后，CloudBase CLI 会自动完成以下步骤：

1. **打包代码** → 将当前目录打包为 `zsxq-scan.zip`
2. **上传到 COS** → 上传到腾讯云对象存储
3. **云端构建** → 使用 `Dockerfile` 自动构建镜像
4. **部署服务** → 创建新版本并自动切换流量

整个过程通常需要 **2-5 分钟**。

## 查看部署状态

部署完成后，CLI 会输出类似以下的链接：

```
ℹ 请打开链接查看部署状态: https://tcb.cloud.tencent.com/dev?envId=xxx#/platform-run/service/detail?...
```

点击链接即可查看：
- 📊 实时构建进度
- 📝 构建日志
- 🚀 服务运行状态

## 常用操作

### 修改定时任务频率

编辑 `.env` 文件中的 cron 表达式：

```env
# Monitor：每30秒执行一次
MONITOR_CRON="*/30 * * * * *"

# Task：每10分钟执行一次
TASK_CRON="*/10 * * * *"
```

然后重新部署：

```bash
tcb cloudrun deploy -s zsxq-scan --source . --force
```

### 查看服务日志

访问 [腾讯云托管控制台](https://tcb.cloud.tencent.com/) → 选择环境 → 云托管 → zsxq-scan → 日志管理

### 重新部署最新代码

```bash
# 确保代码已提交到本地
git add .
git commit -m "update"

# 重新部署
tcb cloudrun deploy -s zsxq-scan --source . --force
```

## 常见问题

### Q: 部署失败怎么办？

A: 检查以下几点：
1. 确认已登录：`tcb login`
2. 检查 `.env` 配置是否正确
3. 查看部署链接中的错误日志
4. 确认 Dockerfile 语法正确

### Q: 如何验证部署成功？

A: 访问服务地址测试接口：
```bash
curl https://zsxq-scan-245554-5-1259649027.sh.run.tcloudbase.com/health
```

### Q: 定时任务没有执行？

A: 检查以下内容：
1. 查看服务日志，确认定时任务已启动
2. 检查 `MONITOR_CRON` 和 `TASK_CRON` 环境变量是否正确
3. 确认数据库连接配置正确

## 技术细节

### 云端构建原理

- 使用项目根目录的 `Dockerfile` 进行构建
- 基础镜像：`node:22-alpine`
- 工作目录：`/app`
- 暴露端口：`80`
- 启动命令：`node server.js`

### 环境变量传递

`.env` 文件中的配置会在部署时自动注入到云托管服务的环境变量中，包括：
- 数据库连接配置
- 定时任务 cron 表达式
- 腾讯云凭证信息

### 定时任务实现

项目使用 `node-cron` 库在 `server.js` 中实现定时任务：
- Monitor 任务：监控星球文章更新
- Task 任务：拉取文章完整内容

通过环境变量灵活配置执行频率，无需修改代码。

---

**更多详细信息请参考**: [README.md](./README.md)
