/**
 * Monitor 最小化测试 - pub-api.zsxq.com + MySQL
 */
process.env.DB_HOST = 'sh-cynosdbmysql-grp-5aqhxbwa.sql.tencentcdb.com';
process.env.DB_PORT = '22871';
process.env.DB_USER = 'zsxq_scan_dbuser';
process.env.DB_PASSWORD = 'zsxq@123';
process.env.DB_NAME = 'temu-tools-prod-3g8yeywsda972fae';

const { init } = require('./db-mysql');
const db = init();
const config = db.collection('config');
const tasks = db.collection('tasks');

(async () => {
  console.log('=== Step 1: 读 config ===');
  const urlsDoc = await config.doc('monitorUrls').get();
  let urls = urlsDoc.data?.value || [];
  if (typeof urls === 'string') { try { urls = JSON.parse(urls); } catch(e) {} }
  console.log(`监控列表: ${JSON.stringify(urls)}`);

  console.log('\n=== Step 2: 调 pub-api + 写 tasks ===\n');
  
  for (const url of urls) {
    const match = url.match(/\/group\/(\d+)/);
    const groupId = match ? match[1] : null;
    if (!groupId) { console.log(`跳过无效URL: ${url}`); continue; }

    const apiUrl = `https://pub-api.zsxq.com/v2/groups/${groupId}`;
    const t0 = Date.now();
    
    try {
      const resp = await fetch(apiUrl, { 
        headers: {'Content-Type': 'application/json'},
        signal: AbortSignal.timeout(8000)
      });
      const data = await resp.json();

      // pub-api 格式: { succeeded, resp_data: { group, latest_topic_create_time, ... } }
      const group = data?.resp_data?.group;
      if (!group) {
        console.log(`${groupId} | ${Date.now()-t0}ms | ❌ 无数据 code=${resp.status}`);
        continue;
      }

      const planetName = group.name || '';
      const memberCount = group.statistics?.members?.count || 0;
      const topicCount = group.statistics?.topics?.topics_count || 0;
      const latestTime = data.resp_data.latest_topic_create_time;

      console.log(`${groupId} | ${Date.now()-t0}ms | ✅ "${planetName}" 成员:${memberCount} 帖子:${topicCount} 最新:${latestTime}`);

      // 去重检查
      const existing = await tasks.where({
        planetId: groupId,
        topicCreateTime: String(latestTime)
      }).limit(1).get();

      if (existing.data && existing.data.length > 0) {
        console.log(`  → 已存在，跳过`);
        continue;
      }

      // 写入 tasks
      const r = await tasks.add({ data: {
        planetId: groupId,
        planetName: planetName,
        planetUrl: url,
        status: 'pending',
        topicCreateTime: String(latestTime),
        article: '',
        createdAt: new Date(),
        updatedAt: new Date()
      }});

      // 回查验证
      const found = await tasks.doc(r.id).get();
      console.log(`  → ✅ 写入成功 id=${r.id} 回查: planetId=${found.data?.planetId}, name=${found.data?.planetName}`);

    } catch(e) {
      console.log(`${groupId} | ${Date.now()-t0}ms | ❌ ${e.message.substring(0,80)}`);
    }
  }

  // 最终汇总
  console.log('\n=== 最终 tasks 表状态 ===');
  const allTasks = await tasks.get();
  console.log(`共 ${allTasks.data?.length || 0} 条记录:`);
  (allTasks.data||[]).forEach(t => {
    console.log(`  id=${t.id} | ${t.planetId} | ${t.planetName} | ${t.status} | ${t.topicCreateTime || '-'}`);
  });

  console.log('\n✅ 全部完成！');
})().catch(e => console.error('FATAL:', e.message));
