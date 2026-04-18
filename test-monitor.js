/**
 * Monitor 接口测试 - 使用 https 模块替代 fetch
 */

process.env.DB_HOST = 'sh-cynosdbmysql-grp-5aqhxbwa.sql.tencentcdb.com';
process.env.DB_PORT = '22871';
process.env.DB_USER = 'zsxq_scan_dbuser';
process.env.DB_PASSWORD = 'zsxq@123';
process.env.DB_NAME = 'temu-tools-prod-3g8yeywsda972fae';

const https = require('https');
const { init } = require('./db-mysql');
const db = init();
const config = db.collection('config');
const tasks = db.collection('tasks');

/**
 * 用 https 模块发 GET 请求（替代不可用的 fetch）
 */
function httpGet(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; ZSXQScan/1.0)',
        'Accept': 'application/json'
      },
      timeout: timeoutMs
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function testMonitor() {
  console.log('=== Monitor 接口测试 (https模块版) ===\n');
  
  // 1. 读 monitorUrls
  const urlsDoc = await config.doc('monitorUrls').get();
  let urls = urlsDoc.data?.value || [];
  if (typeof urls === 'string') { try { urls = JSON.parse(urls); } catch(e){} }
  if (!Array.isArray(urls)) urls = [];
  console.log(`监控列表: ${urls.length} 个星球\n`);

  // 2. 遍历每个星球
  for (const url of urls) {
    const match = url.match(/\/group\/(\d+)/);
    const groupId = match ? match[1] : '';
    console.log(`--- 星球 ${groupId} ---`);
    console.log(`URL: ${url}`);

    try {
      // 调 ZSXQ 公开 API
      const apiUrl = `https://api.zsxq.com/v2/groups/${groupId}/topics?count=1`;
      console.log(`API: ${apiUrl}`);
      
      const resp = await httpGet(apiUrl, 12000);
      console.log(`HTTP ${resp.status}, 响应长度: ${resp.body.length}`);
      console.log(`响应: ${resp.body.substring(0, 500)}\n`);

      if (resp.status === 200 && resp.body.startsWith('{')) {
        const data = JSON.parse(resp.body);
        const topic = data?.data?.[0];
        
        if (topic) {
          console.log(`✅ 最新帖子:`);
          console.log(`   标题:   ${topic.name || '(无)'}`);
          console.log(`   时间:   ${topic.createTime} (${topic.createTimeDesc || ''})`);
          console.log(`   作者:   ${topic.owner?.name || '(无)'}`);
          console.log(`   群名:   ${topic.group?.name || '(无)'}`);
          console.log(`   成员数: ${topic.group?.memberCount || 0}\n`);

          // 写入 tasks 表
          const addResult = await tasks.add({
            data: {
              planetId: groupId,
              planetName: topic.group?.name,
              planetUrl: url,
              status: 'pending',
              topicCreateTime: String(topic.createTime),
              article: '',
              createdAt: new Date(),
              updatedAt: new Date()
            }
          });
          console.log(`   ✅ tasks 写入成功 id=${addResult.id}`);

          // 去重验证
          const found = await tasks.where({ planetId: groupId }).get();
          console.log(`   📋 该星球任务总数: ${found.data?.length || 0} 条\n`);
          
        } else {
          console.log(`⚠️ API 返回空数组\n`);
        }
      } else if (resp.status === 401) {
        console.log(`⚠️ 401 未授权 - 可能需要 Cookie 或签名认证\n`);
      } else {
        console.log(`⚠️ 非预期状态码: ${resp.status}\n`);
      }

    } catch(e) {
      console.log(`❌ 错误: ${e.message.substring(0, 200)}\n`);
    }

    console.log('-'.repeat(50));
  }

  // 最终汇总
  console.log('\n' + '='.repeat(55));
  console.log('  tasks 表当前全部记录:');
  console.log('='.repeat(55));
  const allTasks = await tasks.limit(10).get();
  for (const t of (allTasks.data||[])) {
    console.log(`  [${t.status}] ${String(t.planetId).padEnd(20)} name=${(t.planetName||'-').padEnd(12)} time=${(t.topicCreateTime||'-').substring(0,19)}`);
  }
  console.log(`\n共 ${(allTasks.data||[]).length} 条记录`);
}

testMonitor().catch(console.error);
