/**
 * 本地测试 - 更新监控流程
 *
 * 使用方法：
 *   1. 编辑下方 TEST_GROUP_ID 配置要测试的星球
 *   2. 运行: node tests/testMonitor.js
 *
 * 无需 TCB_ENV、无需 Cookie — 纯 HTTP 调用公开接口 + 本地JSON存储
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

// updatedMonitor 只导出 main（云函数入口），通过它来调用
const monitorModule = require('../functions/updatedMonitor');

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

// ==================== 配置区 ====================
// 填写要测试的星球ID（数字ID）
// 可从 https://wx.zsxq.com/group/xxxxx URL 中提取最后一段
const TEST_GROUP_IDS = [
  // 例如: '48418518458448',
];
// ================================================

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║     知识星球更新监控测试              ║');
  console.log('║     纯API版 · 本地JSON存储            ║');
  console.log('╚══════════════════════════════════════╝\n');

  if (!TEST_GROUP_IDS.length) {
    // 如果没有配置，尝试从环境变量读取
    const envUrls = process.env.MONITOR_URLS;
    if (envUrls) {
      try {
        const urls = JSON.parse(envUrls);
        for (const url of urls) {
          const id = url.split('/').pop();
          if (id) TEST_GROUP_IDS.push(id);
        }
      } catch (e) {}
    }
  }

  if (!TEST_GROUP_IDS.length) {
    console.error('❌ 请先配置监控目标！');
    console.error('   方式1: 编辑 tests/testMonitor.js，在 TEST_GROUP_IDS 中添加星球ID');
    console.error('   方式2: 设置环境变量 MONITOR_URLS=["url1","url2"]\n');
    process.exit(1);
  }

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
  console.log(`  数据已保存到 data/ 目录`);
  console.log(`${'═'.repeat(50)}\n`);

  return { updateCount, skipCount };
}

main().catch(e => {
  console.error('❌ 测试失败:', e);
  process.exit(1);
});
