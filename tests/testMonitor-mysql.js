/**
 * 监控接口单元测试 - MySQL版
 * 
 * 直接连接腾讯云MySQL数据库进行测试
 */

const path = require('path');
const mysql = require('mysql2/promise');

// 加载 .env 文件
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// updatedMonitor 只导出 main（云函数入口），通过它来调用
const monitorModule = require('../functions/updatedMonitor');

/**
 * 从 MySQL 数据库读取监控配置
 */
async function getMonitorUrlsFromDB() {
  let conn;
  try {
    const dbConfig = {
      host: process.env.MYSQL_HOST || 'sh-cynosdbmysql-grp-5aqhxbwa.sql.tencentcdb.com',
      port: parseInt(process.env.MYSQL_PORT) || 22871,
      user: process.env.MYSQL_USER || 'zsxq_scan_dbuser',
      password: process.env.MYSQL_PASSWORD || 'zsxq@123',
      database: process.env.MYSQL_DATABASE || 'temu-tools-prod-3g8yeywsda972fae',
    };
    
    console.log('[MySQL] 正在连接腾讯云数据库...');
    conn = await mysql.createConnection(dbConfig);
    console.log('[MySQL] ✅ 连接成功\n');
    
    // 读取 monitorUrls 配置
    const [rows] = await conn.query(
      'SELECT `value` FROM `config` WHERE `id` = ? LIMIT 1',
      ['monitorUrls']
    );
    
    if (rows.length === 0) {
      console.warn('[MySQL] ⚠️ 数据库中未找到 monitorUrls 配置');
      return [];
    }
    
    let value = rows[0].value;
    // 尝试解析 JSON
    try {
      value = JSON.parse(value);
      // 如果解析后是对象且有 value 字段，取 value
      if (typeof value === 'object' && value !== null && value.value !== undefined) {
        value = value.value;
      }
    } catch (e) {
      // 不是 JSON，直接返回字符串数组
      value = [value];
    }
    
    // 确保返回的是数组
    const urls = Array.isArray(value) ? value : [];
    console.log(`[MySQL] 📋 从数据库读取到 ${urls.length} 个监控星球\n`);
    
    return urls;
  } catch (error) {
    console.error('[MySQL] ❌ 读取配置失败:', error.message);
    throw error;
  } finally {
    if (conn) {
      await conn.end();
    }
  }
}

/**
 * 调用 monitor.main() 并提取单个星球的结果
 * @param {string} groupId - 星球数字ID
 * @returns {Promise<Object>} 监控结果
 */
async function monitorPlanet(groupId) {
  const result = await monitorModule.main({ planetUrl: groupId });
  // result = { code, mode, data: [...] }
  if (result.code === 0 && result.data && result.data.length > 0) {
    return result.data[0];  // 返回第一个星球的结果
  }
  return { error: 'no_data', errorMsg: result.message || '无返回数据' };
}

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║     知识星球更新监控测试 (MySQL版)    ║');
  console.log('║     纯API版 · MySQL存储              ║');
  console.log('╚══════════════════════════════════════╝\n');

  // 从数据库读取监控配置
  const monitorUrls = await getMonitorUrlsFromDB();
  
  if (!monitorUrls.length) {
    console.error('❌ 数据库中未配置监控星球！');
    console.error('   请在数据库 config 表中设置 monitorUrls 配置\n');
    process.exit(1);
  }
  
  // 提取星球ID（从URL中或直接使用ID）
  const TEST_GROUP_IDS = monitorUrls.map(url => {
    // 如果是完整URL，提取最后的数字ID
    if (url.includes('/group/')) {
      return url.split('/').pop();
    }
    // 否则直接使用（假设是数字ID）
    return url;
  });

  console.log(`[Test] 监控 ${TEST_GROUP_IDS.length} 个星球\n`);

  let updateCount = 0;
  let skipCount = 0;

  for (let i = 0; i < TEST_GROUP_IDS.length; i++) {
    const groupId = TEST_GROUP_IDS[i];
    console.log(`${'─'.repeat(50)}`);
    console.log(`  [${i + 1}/${TEST_GROUP_IDS.length}] 星球: ${groupId}`);
    console.log(`${'─'.repeat(50)}`);

    try {
      const result = await monitorPlanet(groupId);

      if (result.hasUpdate) {
        updateCount++;
        console.log(`\n  ✅ 发现新帖！`);
        console.log(`     星球: ${result.planetName || groupId}`);
        console.log(`     时间: ${result.relativeTime}`);
        console.log(`     topicCreateTime: ${result.createTime}`);
      } else if (result.skipped) {
        skipCount++;
        console.log(`\n  ⏭️  跳过（该时间戳任务已存在）`);
        console.log(`     topicCreateTime: ${result.topicCreateTime}`);
      } else if (result.error) {
        console.log(`\n  ❌ 错误: [${result.error}] ${result.errorMsg || ''}`);
      } else {
        console.log(`\n  ℹ️  无新帖 (${result.relativeTime || 'unknown'})`);
      }
    } catch (e) {
      console.error(`\n  ❌ 异常: ${e.message}`);
    }

    console.log('');
  }

  console.log(`${'═'.repeat(50)}`);
  console.log(`  结果: ✅${updateCount} 新帖 | ⏭️${skipCount} 跳过`);
  console.log(`  数据已保存到 MySQL 数据库`);
  console.log(`${'═'.repeat(50)}\n`);

  return { updateCount, skipCount };
}

main().catch(e => {
  console.error('❌ 测试失败:', e);
  process.exit(1);
});
