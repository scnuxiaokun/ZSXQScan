/**
 * 本地全接口测试 - 直接连接 CloudBase MySQL + 调用 ZSXQ API
 * 不需要启动 Express 服务
 */

process.env.DB_HOST = 'sh-cynosdbmysql-grp-5aqhxbwa.sql.tencentcdb.com';
process.env.DB_PORT = '22871';
process.env.DB_USER = 'zsxq_scan_dbuser';
process.env.DB_PASSWORD = 'zsxq@123';
process.env.DB_NAME = 'temu-tools-prod-3g8yeywsda972fae';
// 模拟云托管环境
process.env.TCB_ENV = 'temu-tools-prod-3g8yeywsda972fae';

const { init: initDb } = require('./db-mysql');

// ==================== 初始化 ====================
const db = initDb();
const configCollection = db.collection('config');
const tasksCollection = db.collection('tasks');

// ==================== 测试工具 ====================
function log(title, obj) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'='.repeat(60)}`);
  if (obj !== undefined) {
    const str = JSON.stringify(obj, null, 2);
    // 截断过长内容
    console.log(str.length > 1000 ? str.substring(0, 1000) + '\n... (截断)' : str);
  }
}

async function runTest(name, fn) {
  try {
    const result = await fn();
    log(`✅ ${name}`, result);
    return result;
  } catch (e) {
    log(`❌ ${name}`, { error: e.message, stack: e.stack?.substring(0, 300) });
    return null;
  }
}

// ==================== 接口测试 ====================

async function testHealth() {
  return { code: 0, message: 'ok', env: process.env.TCB_ENV ? 'mysql' : 'local', timestamp: new Date().toISOString() };
}

async function testDebugDB() {
  const configDoc = await configCollection.get();
  const taskDoc = await tasksCollection.limit(3).get();

  return {
    configCount: configDoc.data?.length || 0,
    configData: configDoc.data?.map(d => ({
      id: d.id,
      keys: Object.keys(d),
      valuePreview: d.value ? String(d.value).substring(0, 80) : null
    })),
    taskCount: taskDoc.data?.length || 0,
    tasks: taskDoc.data?.map(t => ({ id: t.id, planetId: t.planetId, status: t.status }))
  };
}

async function testLoginCheckStatus() {
  // 从 config 表读 cookie
  const cookieDoc = await configCollection.doc('zsxq_cookie').get();
  let cookie = cookieDoc.data?.value || null;

  // 兼容 JSON 字符串
  if (typeof cookie === 'string' && cookie.startsWith('[')) {
    try { const parsed = JSON.parse(cookie); cookie = parsed.value || parsed; } catch(e) {}
  }
  if (typeof cookie === 'object' && cookie) { cookie = cookie.value || null; }

  if (!cookie) {
    return { hasEnvCookie: false, hasStoredCookie: false, valid: false };
  }

  // 验证 cookie 是否有效（检查关键字段）
  const valid = typeof cookie === 'string' && cookie.includes('_c_') && cookie.length > 20;
  
  return {
    hasEnvCookie: !!process.env.ZSXQ_COOKIE,
    hasStoredCookie: true,
    dbMode: 'mysql',
    valid,
    source: 'mysql',
    cookieLength: cookie.length
  };
}

async function testMonitor() {
  // 1. 读 monitorUrls 配置
  const urlsDoc = await configCollection.doc('monitorUrls').get();
  let urls = urlsDoc.data?.value || [];
  
  // 兼容 JSON 字符串
  if (typeof urls === 'string') { 
    try { urls = JSON.parse(urls); } catch(e) {} 
  }
  if (!Array.isArray(urls)) urls = [];

  if (urls.length === 0) {
    return { code: 0, message: '没有需要监控的星球', data: [] };
  }

  console.log(`\n[Monitor] 监控 ${urls.length} 个星球...`);

  // 2. 遍历每个星球调用 ZSXQ API
  const results = [];
  for (const url of urls) {
    try {
      // 从 URL 提取 groupId
      const match = url.match(/\/group\/(\d+)/) || url.match(/\/(\d{10,})/);
      const groupId = match ? match[1] : url.replace(/\D/g, '');

      // 调用 ZSXQ 公开 API（不需要 Cookie）
      const apiUrl = `https://api.zsxq.com/v2/groups/${groupId}/topics?count=1`;
      
      console.log(`[Monitor] 请求: ${apiUrl}`);
      const resp = await fetch(apiUrl, {
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15000)
      });
      const apiData = await resp.json();

      const latestTopic = apiData?.data?.[0];
      if (!latestTopic) {
        results.push({ groupId, planetUrl: url, hasUpdate: false, error: '无数据', apiCode: apiData.code });
        continue;
      }

      const topicCreateTime = latestTopic.createTime;
      const planetName = latestTopic.group?.name || '';

      // 3. 去重：检查 tasks 表是否已有相同记录
      const existing = await tasksCollection.where({
        planetId: groupId,
        topicCreateTime: String(topicCreateTime)
      }).limit(1).get();

      const isDuplicate = existing.data && existing.data.length > 0;
      let taskResult = null;

      if (!isDuplicate && topicCreateTime) {
        // 写入任务
        try {
          const addRes = await tasksCollection.add({
            data: {
              planetId: groupId,
              planetName: planetName,
              planetUrl: url,
              status: 'pending',
              topicCreateTime: String(topicCreateTime),
              article: '',
              createdAt: new Date(),
              updatedAt: new Date()
            }
          });
          taskResult = { taskId: addRes.id, status: 'pending' };
        } catch (addErr) {
          taskResult = { error: addErr.message };
        }
      }

      results.push({
        groupId,
        planetName,
        planetUrl: url,
        hasUpdate: !isDuplicate && !!topicCreateTime,
        relativeTime: latestTopic.createTimeDesc || '',
        memberCount: latestTopic.group?.memberCount || 0,
        topicCount: latestTopic.group?.topicCount || 0,
        topicCreateTime: topicCreateTime,
        skipped: isDuplicate,
        task: taskResult
      });

    } catch (e) {
      results.push({ planetUrl: url, hasUpdate: false, error: e.message });
    }
  }

  return { code: 0, message: '监控完成', data: results };
}

async function testTaskPull() {
  // 查找 pending 任务
  const pendingTasks = await tasksCollection.where({ status: 'pending' }).get();
  
  if (!pendingTasks.data || pendingTasks.data.length === 0) {
    return { code: 0, message: '没有待处理任务', processed: 0, data: [] };
  }

  console.log(`\n[Task] 发现 ${pendingTasks.data.length} 个待处理任务`);

  // 按 planetUrl 去重
  const uniquePlanets = {};
  for (const t of pendingTasks.data) {
    const key = t.planetId || t.planetUrl;
    if (!uniquePlanets[key]) uniquePlanets[key] = t;
  }

  const planetIds = Object.keys(uniquePlanets);
  const results = [];

  // 读 cookie
  const cookieDoc = await configCollection.doc('zsxq_cookie').get();
  let cookie = cookieDoc.data?.value || '';
  if (typeof cookie === 'string' && cookie.startsWith('[')) {
    try { const p = JSON.parse(cookie); cookie = p.value || p; } catch(e) {}
  }

  for (const planetId of planetIds) {
    try {
      const taskInfo = uniquePlanets[planetId];
      
      // 调用 ZSXQ API 获取最新文章详情
      const apiUrl = `https://api.zsxq.com/v2/groups/${planetId}/topics?count=1`;
      console.log(`[Task] 拉取文章: ${planetId}`);
      
      const resp = await fetch(apiUrl, {
        headers: {
          'Content-Type': 'application/json',
          'Cookie': cookie
        },
        signal: AbortSignal.timeout(20000)
      });
      
      const apiData = await resp.json();
      const topic = apiData.data?.[0];

      if (!topic) {
        results.push({ planetId, status: 'failed', error: 'API 无数据或需要登录' });
        continue;
      }

      const articleTitle = topic.name || '(无标题)';
      const articleText = topic.text || '';
      const contentLength = (articleText).length;

      // 更新任务状态
      await tasksCollection.where({ 
        id: taskInfo.id,
        status: 'pending'
      }).limit(1); // 先找到

      // 用 update 更新
      const updateConn = require('./db-mysql').initPool();
      const conn = await updateConn.getConnection();
      try {
        await conn.query(
          `UPDATE tasks SET status='completed', article=?, articleTitle=?, articleLength=?, updatedAt=? WHERE id=?`,
          [JSON.stringify(topic), articleTitle, contentLength, new Date(), taskInfo.id]
        );
      } finally { conn.release(); }

      results.push({
        planetId,
        planetName: taskInfo.planetName,
        status: 'success',
        articleTitle,
        contentLength
      });

    } catch (e) {
      results.push({ planetId, status: 'failed', error: e.message });
    }
  }

  return { code: 0, message: '任务完成', processed: results.length, data: results };
}

// ==================== 主流程 ====================
async function main() {
  console.log('\n🚀 ZSXQScan 本地全接口测试\n');
  console.log(`时间: ${new Date().toLocaleString('zh-CN')}`);
  console.log(`数据库: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}\n`);

  await runTest('1. Health Check', testHealth);
  await runTest('2. Debug DB', testDebugDB);
  await runTest('3. Login - CheckStatus', testLoginCheckStatus);
  await runTest('4. Monitor (扫描星球)', testMonitor);
  await runTest('5. Task Pull (拉取文章)', testTaskPull);

  console.log('\n\n🏁 全部测试完成！');
  console.log('查看 tasks 表写入情况:');
  const final = await tasksCollection.limit(5).get();
  console.log(JSON.stringify(final.data?.map(t => ({
    id: t.id, planetId: t.planetId, planetName: t.planetName,
    status: t.status, topicCreateTime: t.topicCreateTime, title: t.articleTitle?.substring(0,30)
  })), null, 2));
}

main().catch(console.error);
