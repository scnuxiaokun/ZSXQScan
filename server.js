/**
 * ZSXQScan 云托管入口
 * 
 * 将4个云函数合并为1个 Express Web 服务
 * 
 * 路由映射:
 *   POST /api/monitor    → updatedMonitor (监控星球更新)
 *   POST /api/task       → loopLastUpdateArticleTask (拉取文章)
 *   POST /api/login      → login (Cookie管理)
 *   GET  /api/article    → getLastUpdatedArticle (获取最新文章)
 *   GET  /api/health     → 健康检查
 * 
 * 定时任务 (node-cron):
 *   Monitor: 每5分钟执行一次（可通过环境变量 MONITOR_CRON 调整）
 *   Task:    每10分钟执行一次（可通过环境变量 TASK_CRON 调整）
 */

const express = require('express');
const cron = require('node-cron');

// ==================== 初始化数据库 ====================
let tasksCollection, configCollection;
const hasMySQL = !!process.env.DB_HOST;
const hasCloudEnv = process.env.TCB_ENV || process.env.SCF_ENV_NAME;

if (hasMySQL) {
  // CloudBase MySQL 模式
  const { init } = require('./db-mysql');
  const db = init();
  tasksCollection = db.collection('tasks');
  configCollection = db.collection('config');
} else if (hasCloudEnv) {
  // CloudBase 文档数据库模式（兼容旧部署）
  const cloud = require('@cloudbase/node-sdk');
  cloud.init({ env: hasCloudEnv, secretId: process.env.TENCENTCLOUD_SECRET_ID, secretKey: process.env.TENCENTCLOUD_SECRET_KEY });
  const db = cloud.init({ env: hasCloudEnv }).database();
  tasksCollection = db.collection('tasks');
  configCollection = db.collection('config');
  console.log(`[Server] 数据库模式: CloudBase 文档库 (${hasCloudEnv})`);
} else {
  // 本地 JSON 模式
  const { init } = require('./functions/jsonDb');
  const db = init();
  tasksCollection = db.collection('tasks');
  configCollection = db.collection('config');
  console.log('[Server] 数据库模式: 本地JSON (data/) ');
}

// ==================== 加载业务模块 ====================
const { getGroupPublicInfo, resolveGroupId, formatRelativeTime } = require('./functions/zsxqApi');
const { getTopicDetail, getTopics } = require('./functions/zsxqApi');
const { saveCookie, getValidCookie, checkCookieStatus } = require('./functions/cookieManager');
const { validateCookie } = require('./functions/zsxqApi');

// 注入已初始化的集合到 CookieManager，避免重复初始化连接
try {
  const cm = require('./functions/cookieManager');
  // 如果支持注入则注入
  if (cm.injectCollection) {
    cm.injectCollection(configCollection, 'mysql');
    console.log(`[Server] 已向 CookieManager 注入集合实例`);
  }

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
})();} catch(e) {}

// ==================== Monitor 核心逻辑 ====================

async function hasTaskWithSameTopicTime(groupId, topicCreateTime) {
  if (!topicCreateTime) return false;
  try {
    const result = await tasksCollection.where({ planetId: groupId, topicCreateTime }).count();
    return result.total > 0;
  } catch (error) {
    console.error(`[Monitor] 查询历史任务失败 [${groupId}]:`, error.message);
    return false;
  }
}

async function createTask(taskData) {
  try {
    await tasksCollection.add({
      data: {
        // 使用数据库已有的列名（snake_case，db-mysql 会自动处理 camelCase）
        planetId: taskData.groupId,
        planetName: taskData.planetName || `星球${taskData.groupId}`,
        planetUrl: taskData.planetUrl || '',
        status: 'pending',
        lastUpdateTime: taskData.relativeTime,
        topicCreateTime: taskData.createTime || null,
        article: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    console.log(`[Monitor] 创建任务成功 [${taskData.groupId}]`);
  } catch (error) {
    console.error(`[Monitor] 创建任务失败 [${taskData.groupId}]:`, error.message);
  }
}

async function getMonitorConfig() {
  try {
    const urlsDoc = await configCollection.doc('monitorUrls').get();
    let val = urlsDoc.data?.value || [];
    // 兼容：如果 value 是 JSON 字符串则解析
    if (typeof val === 'string') { try { val = JSON.parse(val); } catch(e) {} }
    return Array.isArray(val) ? val : [];
  } catch (error) {
    console.error('[Monitor] 获取配置失败:', error.message);
    return [];
  }
}

async function runMonitor(planetUrl) {
  const groupId = resolveGroupId(planetUrl);
  console.log(`[Monitor] 开始监控 [${groupId}] ${planetUrl}`);

  try {
    const publicInfo = await getGroupPublicInfo(groupId);
    if (!publicInfo.resp_data || !publicInfo.resp_data.group) {
      return { groupId, hasUpdate: false, reason: 'invalid_response' };
    }

    const group = publicInfo.resp_data.group;
    const topicCreateTime = group.latest_topic_create_time;
    if (!topicCreateTime) {
      return { groupId, hasUpdate: false, reason: 'no_time_data' };
    }

    const alreadyHasTask = await hasTaskWithSameTopicTime(groupId, topicCreateTime);
    if (alreadyHasTask) {
      return { groupId, hasUpdate: false, skipped: true, reason: 'same_topic_time_exists', topicCreateTime };
    }

    const relativeTime = formatRelativeTime(topicCreateTime);
    console.log(`[Monitor] ✅ [${groupId}] ${group.name} 发现新帖！`);

    createTask({ groupId, planetName: group.name, planetUrl: planetUrl, relativeTime, createTime: topicCreateTime });

    return {
      groupId, hasUpdate: true, planetName: group.name, relativeTime, createTime: topicCreateTime,
      memberCount: group.statistics?.members?.count, topicCount: group.statistics?.topics?.topics_count,
    };
  } catch (error) {
    console.error(`[Monitor] [${groupId}] 监控出错:`, error.message);
    return { groupId, hasUpdate: false, error: error.message };
  }
}

// ==================== GetArticle 核心逻辑 ====================

function htmlToPlainText(html) {
  if (!html || typeof html !== 'string') return '';
  if (!/<\/?[a-z][\s\S]*>/i.test(html)) return html.trim();
  return html
    .replace(/<\/?(p|div|h[1-6]|br|li|tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*/g, '\n\n')
    .trim();
}

function parseArticleDetail(apiResponse, topicId) {
  const topic = apiResponse.resp_data?.topic || apiResponse.topic || apiResponse.data || apiResponse;
  let content = topic.text ? htmlToPlainText(topic.text) : (topic.talk?.text || topic.text_summary || '');
  let title = topic.title || topic.subject || '';
  if (!title && content) title = content.split('\n')[0].trim().substring(0, 80);

  return {
    topicId: topicId || topic.id,
    url: topicId ? `https://wx.zsxq.com/topic/${topicId}` : '',
    title, content,
    type: topic.type || 'talk',
    createTime: topic.created_time ? new Date(topic.created_time).toISOString() : null,
    author: topic.owner ? { id: topic.owner.id, name: topic.owner.name, avatar: topic.owner.avatar } : null,
    stats: { likeCount: topic.like_count || 0, commentCount: topic.comment_count || 0 },
    images: (topic.images || []).map(img => ({ url: img.url || img })),
    files: (topic.files || []).map(file => ({ name: file.name, url: file.url, size: file.size })),
    raw: topic,
  };
}

async function fetchArticle(planetUrl, topicId) {
  let targetTopicId = topicId;
  if (!targetTopicId) {
    const groupId = resolveGroupId(planetUrl);
    const topicsResult = await getTopics(groupId, { count: 1 });
    // 处理不同的响应结构
    const topics = topicsResult.resp_data?.topics || topicsResult.topics || topicsResult.data;
    const latest = Array.isArray(topics) ? topics[0] : null;
    // topic_uid 是字符串ID，topic_id 是数字ID
    const topicId = latest?.topic_uid || latest?.id || latest?.topic_id;
    if (!topicId) throw new Error('未能获取到最新话题ID');
    targetTopicId = topicId;  }

  const detail = await getTopicDetail(targetTopicId);
  return parseArticleDetail(detail, targetTopicId);
}

// ==================== LoopTask 核心逻辑 ====================

function extractPlanetId(url) {
  return url.replace(/\/+$/, '').split('/').pop() || url;
}

async function processTask(planetUrl) {
  const planetId = extractPlanetId(planetUrl);

  try {
    const pendingResult = await tasksCollection
      .where({ planetId, status: 'pending' }).orderBy('createdAt', 'desc').limit(1).get();

    if (!pendingResult.data?.length) {
      return { planetId, status: 'skipped', reason: 'no_pending_task' };
    }

    const task = pendingResult.data[0];
    // MySQL 模式下主键是 id，CloudBase 模式下是 _id
    const taskId = task.id || task._id;    const articleData = task.topicId ? await fetchArticle(planetUrl, task.topicId) : await fetchArticle(planetUrl);

    await tasksCollection.doc(taskId).update({
      data: { status: 'completed', article: JSON.stringify(articleData), articleTitle: articleData.title,
              articleLength: articleData.content.length, topicId: articleData.topicId, topicType: articleData.type,
              updatedAt: new Date() },
    });

    return { planetId, status: 'success', taskId: task._id, articleTitle: articleData.title, contentLength: articleData.content.length };

  } catch (error) {
    // 尝试标记失败
    try {
      const pendingResult = await tasksCollection.where({ planetId, status: 'pending' }).limit(1).get();
      if (pendingResult.data?.length) {
        await tasksCollection.doc(pendingResult.data[0]._id).update({ data: { status: 'failed', errorMsg: error.message, updatedAt: new Date() } });
      }
    } catch (e) { /* ignore */ }
    return { planetId, status: 'failed', error: error.message };
  }
}

// ==================== Express App ====================

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 80;

// 健康检查
app.get('/api/health', (req, res) => {
  const dbMode = hasMySQL ? 'mysql' : (hasCloudEnv ? 'cloud' : 'local');
  res.json({ code: 0, message: 'ok', timestamp: new Date().toISOString(), env: dbMode, version: 'v3.1-snake-fix' });
});

// 调试：查看数据库内容（生产环境可删除）
app.get('/api/debug/db', async (req, res) => {
  try {
    const results = {};
    
    for (const [name, coll] of [['config', configCollection], ['tasks', tasksCollection]]) {
      try {
        const r = await coll.limit(3).get();
        const item = { 
          status: 'EXISTS', 
          count: r.data?.length || 0,
          data: r.data?.map(d => ({ 
            id: d.id, _id: d._id, 
            keys: Object.keys(d), 
            valueType: typeof d.value,
            valuePreview: typeof d.value === 'string' ? d.value.substring(0, 120) : JSON.stringify(d.value)?.substring(0,120)
          }))
        };
        
        // 单独测试 doc 查询
        if (name === 'config') {
          for (const docId of ['monitorUrls', 'zsxq_cookie']) {
            try {
              const d = await coll.doc(docId).get();
              const dd = d.data;
              item[`doc_${docId}`] = { 
                found: !!dd, 
                id: dd?.id, 
                _id: dd?._id,
                value: dd ? (typeof dd.value === 'string' ? dd.value.substring(0,80) : JSON.stringify(dd.value)) : null
              };
            } catch(e2) { item[`doc_${docId}`] = { error: e2.message }; }
          }
        }
        results[name] = item;
      } catch (e) {
        results[name] = { status: 'ERROR', msg: e.message.substring(0, 120) };
      }
    }

    // 查看 tasks 表结构
    if (hasMySQL) {
      try {
        const mysql = require('mysql2/promise');
        const conn = await mysql.createConnection({
          host: process.env.DB_HOST,
          user: process.env.DB_USER || 'root',
          password: process.env.DB_PASSWORD,
          database: process.env.DB_NAME || process.env.TCB_ENV,
          port: parseInt(process.env.DB_PORT || '3306', 10),
        });
        const [cols] = await conn.query('DESCRIBE `tasks`');
        results['tasks_schema'] = cols.map(c => ({ Field: c.Field, Type: c.Type }));
        
        const [rows] = await conn.query('SELECT * FROM `tasks` LIMIT 3');
        results['tasks_rows'] = rows.length > 0 ? rows : '(空表)';
        
        await conn.end();
      } catch (e2) {
        results['tasks_schema'] = { error: e2.message.substring(0, 100) };
      }
    }

    // 直接测试 tasks.add() 写入
    try {
      console.log('[DEBUG] 开始测试 tasks.add()...');
      const addResult = await tasksCollection.add({
        data: { 
          planetId: '_debug_test_write', 
          planetName: 'debug-write-test', 
          planetUrl: '', 
          status: 'pending', 
          article: '', 
          createdAt: new Date(), 
          updatedAt: new Date() 
        }
      });
      results['add_test'] = { ok: true, result: addResult };
      console.log('[DEBUG] add 成功:', JSON.stringify(addResult));
    } catch (e) {
      results['add_test'] = { ok: false, error: e.message, stack: e.stack?.substring(0, 500) };
      console.error('[DEBUG] add 失败:', e.message);
    }

    res.json(results);
  } catch (e) { res.json({ code: -1, error: e.message }); }
});

// --- Monitor ---
app.post('/api/monitor', async (req, res) => {
  try {
    let urls;
    if (req.body && req.body.planetUrl) {
      urls = [req.body.planetUrl];
    } else {
      urls = await getMonitorConfig();
      if (urls.length === 0) return res.json({ code: 0, message: '没有需要监控的星球', data: [] });
    }

    const results = [];
    for (let i = 0; i < urls.length; i++) {
      results.push(await runMonitor(urls[i]));
      if (i < urls.length - 1) await new Promise(r => setTimeout(r, 200 + Math.random() * 300));
    }

    res.json({ code: 0, message: '监控完成', data: results });
  } catch (e) {
    res.json({ code: -1, message: e.message });
  }
});

// --- Task (LoopTask) ---
app.post('/api/task', async (req, res) => {
  try {
    let urls = [];
    if (req.body && req.body.planetUrl) {
      urls = [req.body.planetUrl];
    } else {
      const pendingResult = await tasksCollection.where({ status: 'pending' }).field({ planetUrl: true }).get();
      const urlSet = new Set();
      if (pendingResult.data) pendingResult.data.forEach(t => t.planetUrl && urlSet.add(t.planetUrl));
      urls = Array.from(urlSet);
    }

    if (urls.length === 0) return res.json({ code: 0, message: '没有需要处理的任务', data: [] });

    const results = [];
    for (const url of urls) {
      results.push(await processTask(url));
      await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));
    }

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
      if (!req.body.cookie) return res.json({ code: -1, message: '缺少 cookie 参数' });
      try {
        const valid = await validateCookie(req.body.cookie);
        if (!valid) return res.json({ code: -1, message: 'Cookie 验证失败' });
        await saveCookie(req.body.cookie, { source: 'manual' });
        res.json({ code: 0, message: '✅ Cookie 已保存并验证通过' });
      } catch (e) { res.json({ code: -1, message: e.message }); }
      break;

    case 'checkStatus':
      try {
        const status = await checkCookieStatus();
        res.json({ code: 0, data: status });
      } catch (e) { res.json({ code: -1, message: e.message }); }
      break;

    case 'getCookie':
    default:
      try {
        const cookie = await getValidCookie(true);
        res.json({ code: 0, message: 'Cookie 有效', preview: cookie.substring(0, 30) + '...' });
      } catch (e) { res.json({ code: -1, message: e.message, needRelogin: true }); }
  }
});

// --- GetArticle ---
app.get('/api/article', async (req, res) => {
  try {
    const { planetUrl, topicId } = req.query;
    if (!planetUrl) return res.json({ code: -1, message: '缺少 planetUrl 参数' });
    const article = await fetchArticle(planetUrl, topicId);
    res.json({ code: 0, data: article });
  } catch (e) {
    res.json({ code: -1, message: e.message });
  }
});

// ==================== 定时任务 ====================

const MONITOR_CRON = process.env.MONITOR_CRON || '*/5 * * * *';  // 默认每5分钟
const TASK_CRON = process.env.TASK_CRON || '*/5 * * * *';       // 默认每10分钟

console.log(`[Server] 定时任务配置: Monitor=${MONITOR_CRON}, Task=${TASK_CRON}`);

if (cron.validate(MONITOR_CRON)) {
  cron.schedule(MONITOR_CRON, async () => {
    console.log(`[Cron] [Monitor] 定时触发 ${new Date().toISOString()}`);
    try {
      const urls = await getMonitorConfig();
      for (const url of urls) {
        await runMonitor(url);
        await new Promise(r => setTimeout(r, 200));
      }
    } catch (e) { console.error('[Cron] [Monitor] 执行出错:', e.message); }
  }, { scheduled: false }).start();
  console.log(`[Server] ✅ Monitor 定时任务已启动 (${MONITOR_CRON})`);
}

if (cron.validate(TASK_CRON)) {
  cron.schedule(TASK_CRON, async () => {
    console.log(`[Cron] [Task] 定时触发 ${new Date().toISOString()}`);
    try {
      const pendingResult = await tasksCollection.where({ status: 'pending' }).field({ planetUrl: true }).get();
      const urlSet = new Set();
      if (pendingResult.data) pendingResult.data.forEach(t => t.planetUrl && urlSet.add(t.planetUrl));
      for (const url of urlSet) {
        await processTask(url);
        await new Promise(r => setTimeout(r, 800));
      }
    } catch (e) { console.error('[Cron] [Task] 执行出错:', e.message); }
  }, { scheduled: false }).start();
  console.log(`[Server] ✅ Task 定时任务已启动 (${TASK_CRON})`);
}

// ==================== 启动服务 ====================

app.listen(PORT, () => {
  console.log(`\n🚀 ZSXQScan 云托管服务启动`);
  console.log(`   端口: ${PORT}`);
  console.log(`   环境: ${hasCloudEnv ? 'CloudBase (' + hasCloudEnv + ')' : '本地模式'}`);
  console.log(`   Monitor: ${MONITOR_CRON}`);
  console.log(`   Task: ${TASK_CRON}`);
  console.log('');
});
