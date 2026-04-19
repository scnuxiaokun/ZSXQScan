/**
 * 测试 Monitor 服务模块
 */

const mysql = require('mysql2/promise');
const monitorService = require('../functions/monitorService');

// 数据库配置
const dbConfig = {
  host: process.env.DB_HOST || 'sh-cynosdbmysql-grp-5aqhxbwa.sql.tencentcdb.com',
  port: parseInt(process.env.DB_PORT) || 22871,
  user: process.env.DB_USER || 'zsxq_scan_dbuser',
  password: process.env.DB_PASSWORD || 'zsxq@123',
  database: process.env.DB_NAME || 'temu-tools-prod-3g8yeywsda972fae',
};

async function initDatabase() {
  console.log('[Test] 初始化 MySQL 连接...');
  const pool = mysql.createPool(dbConfig);
  
  // 模拟 tasksCollection 和 configCollection
  const tasksCollection = {
    where: (conditions) => ({
      count: async () => {
        const [rows] = await pool.execute(
          'SELECT COUNT(*) as total FROM tasks WHERE planetId = ? AND topicCreateTime = ?',
          [conditions.planetId, conditions.topicCreateTime]
        );
        return { total: rows[0].total };
      },
      orderBy: () => ({ limit: () => ({ get: async () => ({ data: [] }) }) }),
    }),
    add: async ({ data }) => {
      const keys = Object.keys(data).join(', ');
      const placeholders = Object.keys(data).map(() => '?').join(', ');
      const values = Object.values(data);
      await pool.execute(`INSERT INTO tasks (${keys}) VALUES (${placeholders})`, values);
      console.log('[Test] ✅ 任务创建成功');
    },
  };

  const configCollection = {
    doc: (key) => ({
      get: async () => {
        if (key === 'monitorUrls') {
          return { 
            data: { 
              value: [
                'https://wx.zsxq.com/group/48418518458448',
                'https://wx.zsxq.com/group/28885884288111'
              ] 
            } 
          };
        }
        return { data: null };
      },
    }),
  };

  // 注入集合
  monitorService.initCollections(tasksCollection, configCollection);
  console.log('[Test] ✅ 集合注入成功\n');
}

async function testGetMonitorConfig() {
  console.log('═══════════════════════════════════════');
  console.log('测试1: 获取监控配置');
  console.log('═══════════════════════════════════════\n');

  try {
    const urls = await monitorService.getMonitorConfig();
    console.log(`✅ 获取到 ${urls.length} 个监控URL:`);
    urls.forEach((url, i) => console.log(`   ${i + 1}. ${url}`));
    console.log('');
    return urls;
  } catch (error) {
    console.error(`❌ 失败: ${error.message}\n`);
    throw error;
  }
}

async function testRunMonitor(planetUrl) {
  console.log('═══════════════════════════════════════');
  console.log('测试2: 执行星球监控');
  console.log('═══════════════════════════════════════\n');
  console.log(`监控URL: ${planetUrl}\n`);

  try {
    const result = await monitorService.runMonitor(planetUrl);
    
    console.log('监控结果:');
    console.log(`  - groupId: ${result.groupId}`);
    console.log(`  - hasUpdate: ${result.hasUpdate}`);
    
    if (result.hasUpdate) {
      console.log(`  - planetName: ${result.planetName}`);
      console.log(`  - relativeTime: ${result.relativeTime}`);
      console.log(`  - createTime: ${result.createTime}`);
      console.log(`  - memberCount: ${result.memberCount}`);
      console.log(`  - topicCount: ${result.topicCount}`);
      console.log('\n✅ 发现新帖！');
    } else if (result.skipped) {
      console.log(`  - reason: ${result.reason}`);
      console.log('\n⏭️ 跳过（已存在相同时间戳的任务）');
    } else {
      console.log(`  - reason: ${result.reason || result.error}`);
      console.log('\nℹ️ 无更新或出错');
    }
    console.log('');
    
    return result;
  } catch (error) {
    console.error(`❌ 异常: ${error.message}\n`);
    throw error;
  }
}

async function testBatchMonitor(urls) {
  console.log('═══════════════════════════════════════');
  console.log('测试3: 批量执行监控');
  console.log('═══════════════════════════════════════\n');
  console.log(`监控 ${urls.length} 个星球\n`);

  try {
    const results = await monitorService.runBatchMonitor(urls);
    
    console.log('批量监控结果:');
    results.forEach((result, i) => {
      const status = result.hasUpdate ? '✅ 有更新' : (result.skipped ? '⏭️ 跳过' : 'ℹ️ 无更新');
      console.log(`  ${i + 1}. ${result.groupId}: ${status}`);
    });
    console.log('');
    
    return results;
  } catch (error) {
    console.error(`❌ 异常: ${error.message}\n`);
    throw error;
  }
}

async function main() {
  console.log('\n╔═══════════════════════════════════════╗');
  console.log('║     Monitor 服务模块测试              ║');
  console.log('╚═══════════════════════════════════════╝\n');

  try {
    // 初始化数据库
    await initDatabase();

    // 测试1: 获取监控配置
    const urls = await testGetMonitorConfig();

    // 测试2: 执行单个星球监控
    if (urls.length > 0) {
      await testRunMonitor(urls[0]);
      
      // 等待2秒避免频率限制
      console.log('等待2秒...\n');
      await new Promise(r => setTimeout(r, 2000));
    }

    // 测试3: 批量执行监控
    if (urls.length > 0) {
      await testBatchMonitor(urls.slice(0, 1)); // 只测试第一个，避免触发频率限制
    }

    console.log('═══════════════════════════════════════');
    console.log('✅ 所有测试完成！');
    console.log('═══════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    process.exit(1);
  }
}

main().catch(e => {
  console.error('❌ 测试异常:', e);
  process.exit(1);
});
