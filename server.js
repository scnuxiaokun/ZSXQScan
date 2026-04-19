/**
 * ZSXQScan 云托管入口（重构版）
 * 
 * 业务逻辑已抽取到独立模块：
 * - monitorService: 星球监控服务
 * - taskService: 任务处理服务
 * - cookieManager: Cookie管理
 * 
 * 路由映射:
 *   POST /api/monitor    → 监控星球更新
 *   POST /api/task       → 拉取文章
 *   POST /api/login      → Cookie管理
 *   GET  /api/article    → 获取最新文章
 *   GET  /api/health     → 健康检查
 * 
 * 定时任务 (node-cron):
 *   Monitor: 每5分钟执行一次
 *   Task:    每5分钟执行一次
 */

const express = require('express');
const cron = require('node-cron');

// ==================== 初始化数据库 ====================
let tasksCollection, configCollection;

// 强制使用 MySQL 数据库
if (!process.env.DB_HOST) {
  console.error('❌ 错误: 未配置 DB_HOST 环境变量');
  console.error('   请设置以下环境变量:');
  console.error('   - DB_HOST: 数据库主机地址');
  console.error('   - DB_PORT: 数据库端口');
  console.error('   - DB_USER: 数据库用户名');
  console.error('   - DB_PASSWORD: 数据库密码');
  console.error('   - DB_NAME: 数据库名称');
  process.exit(1);
}

const { init } = require('./db-mysql');
const db = init();
tasksCollection = db.collection('tasks');
configCollection = db.collection('config');
console.log(`[Server] 数据库模式: MySQL (${process.env.DB_NAME})`);

// ==================== 加载业务模块 ====================
const { saveCookie, getValidCookie, checkCookieStatus } = require('./functions/cookieManager');
const { validateCookie } = require('./functions/zsxqApi');
const monitorService = require('./functions/monitorService');
const taskService = require('./functions/taskService');

// 注入集合实例到业务模块
monitorService.initCollections(tasksCollection, configCollection);
taskService.initCollections(tasksCollection);

// 注入集合到 CookieManager
try {
  const cm = require('./functions/cookieManager');
  if (cm.injectCollection) {
    cm.injectCollection(configCollection, 'mysql');
    console.log('[Server] 已向 CookieManager 注入集合实例');
  }
} catch(e) {}

// 从数据库加载 Cookie 并设置到环境变量
(async () => {
  try {
    const cookieDoc = await configCollection.doc('zsxq_cookie').get();
    if (cookieDoc.data?.value) {
      process.env.ZSXQ_COOKIE = cookieDoc.data.value;
      console.log('[Server] ✅ Cookie 已从数据库加载到环境变量');
    } else {
      console.warn('[Server] ⚠️  数据库中未找到 Cookie 配置');
    }
  } catch(e) {
    console.error('[Server] ❌ 加载 Cookie 失败:', e.message);
  }
})();

// ==================== Express App ====================

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 80;

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ 
    code: 0, 
    message: 'ok', 
    timestamp: new Date().toISOString(), 
    env: 'mysql', 
    version: 'v3.2-refactored' 
  });
});

// --- Monitor ---
app.post('/api/monitor', async (req, res) => {
  try {
    let urls;
    if (req.body && req.body.planetUrl) {
      urls = [req.body.planetUrl];
    } else {
      urls = await monitorService.getMonitorConfig();
      if (urls.length === 0) {
        return res.json({ code: 0, message: '没有需要监控的星球', data: [] });
      }
    }

    const results = await monitorService.runBatchMonitor(urls);
    res.json({ code: 0, message: '监控完成', data: results });
  } catch (e) {
    res.json({ code: -1, message: e.message });
  }
});

// --- Task ---
app.post('/api/task', async (req, res) => {
  try {
    let urls = [];
    if (req.body && req.body.planetUrl) {
      urls = [req.body.planetUrl];
    } else {
      urls = await taskService.getPendingTaskUrls();
    }

    if (urls.length === 0) {
      return res.json({ code: 0, message: '没有需要处理的任务', data: [] });
    }

    const results = await taskService.processBatchTasks(urls);
    res.json({ code: 0, message: '任务完成', data: results });
  } catch (e) {
    res.json({ code: -1, message: e.message });
  }
});

// --- Login ---
app.post('/api/login', async (req, res) => {
  const action = req.body?.action || 'getCookie';

  switch (action) {
    case 'setCookie':
      if (!req.body.cookie) {
        return res.json({ code: -1, message: '缺少 cookie 参数' });
      }
      try {
        const valid = await validateCookie(req.body.cookie);
        if (!valid) {
          return res.json({ code: -1, message: 'Cookie 验证失败' });
        }
        await saveCookie(req.body.cookie, { source: 'manual' });
        res.json({ code: 0, message: '✅ Cookie 已保存并验证通过' });
      } catch (e) {
        res.json({ code: -1, message: e.message });
      }
      break;

    case 'checkStatus':
      try {
        const status = await checkCookieStatus();
        res.json({ code: 0, data: status });
      } catch (e) {
        res.json({ code: -1, message: e.message });
      }
      break;

    case 'getCookie':
    default:
      try {
        const cookie = await getValidCookie(true);
        res.json({ 
          code: 0, 
          message: 'Cookie 有效', 
          preview: cookie.substring(0, 30) + '...' 
        });
      } catch (e) {
        res.json({ code: -1, message: e.message, needRelogin: true });
      }
  }
});

// --- GetArticle ---
app.get('/api/article', async (req, res) => {
  try {
    const { planetUrl, topicId } = req.query;
    if (!planetUrl) {
      return res.json({ code: -1, message: '缺少 planetUrl 参数' });
    }
    const article = await taskService.fetchArticle(planetUrl, topicId);
    res.json({ code: 0, data: article });
  } catch (e) {
    res.json({ code: -1, message: e.message });
  }
});

// ==================== 定时任务 ====================

const MONITOR_CRON = process.env.MONITOR_CRON || '*/5 * * * *';
const TASK_CRON = process.env.TASK_CRON || '*/5 * * * *';

console.log(`[Server] 定时任务配置: Monitor=${MONITOR_CRON}, Task=${TASK_CRON}`);

if (cron.validate(MONITOR_CRON)) {
  cron.schedule(MONITOR_CRON, async () => {
    console.log(`[Cron] [Monitor] 定时触发 ${new Date().toISOString()}`);
    try {
      const urls = await monitorService.getMonitorConfig();
      for (const url of urls) {
        await monitorService.runMonitor(url);
        await new Promise(r => setTimeout(r, 200));
      }
    } catch (e) {
      console.error('[Cron] [Monitor] 执行出错:', e.message);
    }
  }, { scheduled: false }).start();
  console.log(`[Server] ✅ Monitor 定时任务已启动 (${MONITOR_CRON})`);
}

if (cron.validate(TASK_CRON)) {
  cron.schedule(TASK_CRON, async () => {
    console.log(`[Cron] [Task] 定时触发 ${new Date().toISOString()}`);
    try {
      const urls = await taskService.getPendingTaskUrls();
      for (const url of urls) {
        await taskService.processTask(url);
        await new Promise(r => setTimeout(r, 800));
      }
    } catch (e) {
      console.error('[Cron] [Task] 执行出错:', e.message);
    }
  }, { scheduled: false }).start();
  console.log(`[Server] ✅ Task 定时任务已启动 (${TASK_CRON})`);
}

// ==================== 启动服务 ====================

app.listen(PORT, () => {
  console.log(`\n🚀 ZSXQScan 云托管服务启动`);
  console.log(`   端口: ${PORT}`);
  console.log(`   环境: 本地模式`);
  console.log(`   Monitor: ${MONITOR_CRON}`);
  console.log(`   Task: ${TASK_CRON}`);
  console.log('');
});
