#!/usr/bin/env node
/**
 * ZSXQScan 本地运行入口
 *
 * 一站式本地测试工具，无需部署云函数即可验证各模块
 *
 * 使用方法:
 *   node scripts/runLocal.js [命令]
 *
 * 命令:
 *   pub-api   - 快速测试单个星球的公开接口（最简单，无需任何配置）
 *   monitor   - 完整监控流程（自动使用本地JSON存储，无需TCB_ENV）
 *   login     - Cookie管理（设置/读取/验证，存到 data/config.json）
 *   task      - 文章获取（需要 ZSXQ_COOKIE 环境变量）
 *   task:mysql - Task接口单元测试（直连腾讯云MySQL）
 *   task:flow - Task完整流程测试（直连腾讯云MySQL）
 *   all       - 依次运行所有测试
 *
 * 数据存储:
 *   无需 TCB_ENV 时，数据自动保存到 data/ 目录（JSON文件）
 *   有 TCB_ENV 时，使用腾讯云 CloudBase 数据库
 *
 * 环境准备:
 *   0. (可选) cp .env.example .env
 *   1. (可选) 编辑 .env 填入 TCB_ENV 或 ZSXQ_COOKIE
 *   2. 直接运行即可！
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { getGroupPublicInfo } = require('../functions/zsxqApi');

// ==================== CLI ====================

const command = process.argv[2] || 'help';

const COMMANDS = {
  'pub-api': { desc: '快速测试公开API（只需星球ID）', run: runPubApiTest },
  'monitor': { desc: '完整监控流程测试', run: runMonitorTest },
  'login':   { desc: 'Cookie管理测试', run: runLoginTest },
  'task':    { desc: '文章获取测试（需Cookie）', run: runTaskTest },
  'task:mysql': { desc: 'Task单元测试（MySQL版）', run: runTaskMysqlTest },
  'task:flow': { desc: 'Task完整流程（MySQL版）', run: runTaskFlowMysqlTest },
  'all':     { desc: '运行所有测试', run: runAllTests },
  'help':    { desc: '显示帮助信息', run: showHelp },
};

// ==================== 命令实现 ====================

async function showHelp() {
  console.log(`
╔══════════════════════════════════════════════╗
║     ZSXQScan 本地测试工具                     ║
║     纯 API 版 · 无需 CloudBase                ║
╚══════════════════════════════════════════════╝

用法: node scripts/runLocal.js <命令>

命令列表:
${Object.entries(COMMANDS).map(([k, v]) => `  ${k.padEnd(12)} ${v.desc}`).join('\n')}

快速开始:
  1. 测试公开接口（不需要任何配置）:
     node scripts/runLocal.js pub-api 48418518458448

  2. 完整监控测试（自动使用本地JSON存储）:
     node scripts/runLocal.js monitor

  3. Cookie 管理:
     node scripts/runLocal.js login

数据存储:
  无 TCB_ENV → data/tasks.json + data/config.json（免费）
  有 TCB_ENV → 腾讯云 CloudBase 数据库
  MySQL模式 → 直连腾讯云MySQL数据库

环境变量 (.env):
  TCB_ENV        云开发环境ID（可选，不配则用本地JSON）
  ZSXQ_COOKIE    Cookie字符串（task 获取文章需要）
  DB_HOST        MySQL主机地址（task:mysql 和 task:flow 需要）
  DB_PASSWORD    MySQL密码（task:mysql 和 task:flow 需要）
`);
}

/**
 * 最快的测试方式：只测公开 API，不需要任何配置
 */
async function runPubApiTest() {
  const groupId = process.argv[3];
  if (!groupId) {
    console.error('❌ 请提供星球ID');
    console.error('   用法: node scripts/runLocal.js pub-api <星球数字ID>\n');
    console.error('   示例: node scripts/runLocal.js pub-api 48418518458448\n');
    console.error('   星球ID可从 https://wx.zsxq.com/group/xxxxx 中获取');
    process.exit(1);
  }

  console.log(`\n🔓 公开API测试 — 星球 ${groupId}\n`);
  console.log('─'.repeat(50));

  try {
    const start = Date.now();
    const info = await getGroupPublicInfo(groupId);
    const elapsed = Date.now() - start;
    
    const g = info.resp_data?.group;
    if (!g) {
      throw new Error('返回数据异常: ' + JSON.stringify(info).substring(0, 200));
    }

    console.log(`✅ 请求成功 (${elapsed}ms)\n`);
    console.log(`  名称:   ${g.name}`);
    console.log(`  类型:   ${g.type === 'pay' ? '💰 付费' : '🆓 免费'}`);
    console.log(`  成员:   ${g.statistics?.members?.count || '?'} 人`);
    console.log(`  话题:   ${g.statistics?.topics?.topics_count || '?'} 条`);
    console.log(`  最新更新(topicCreateTime): ${g.latest_topic_create_time}`);
    console.log(`  创建者: ${g.owner?.name || '?'}`);
    
    // 判断是否有最近更新
    const ts = new Date(g.latest_topic_create_time).getTime();
    const diffMin = (Date.now() - ts) / 60000;
    const status = diffMin <= 2 ? '🟢 刚刚更新!' : `⏱️ ${diffMin.toFixed(0)}分钟前`;
    console.log(`\n  状态:   ${status}`);

  } catch (e) {
    console.error(`\n❌ 失败: ${e.message}`);
    process.exit(1);
  }
}

/** 监控模块测试 */
async function runMonitorTest() {
  console.log('\n📡 启动 Monitor 测试...\n');
  await require('../tests/testMonitor');
}

/** Login 模块测试 */
async function runLoginTest() {
  console.log('\n🔐 启动 Login 测试...\n');
  await require('../tests/testLogin');
}

/** 文章获取测试 */
async function runTaskTest() {
  console.log('\n📄 启动 GetArticle 测试...\n');
  await require('../tests/testTask');
}

/** Task MySQL单元测试 */
async function runTaskMysqlTest() {
  console.log('\n📄 启动 Task MySQL单元测试...\n');
  await require('../tests/testTask-mysql');
}

/** Task MySQL完整流程测试 */
async function runTaskFlowMysqlTest() {
  console.log('\n📄 启动 Task MySQL完整流程测试...\n');
  await require('../tests/testTaskFlow-mysql');
}

/** 全部测试 */
async function runAllTests() {
  console.log('\n🚀 运行全部测试...\n');
  
  const tests = [
    ['pub-api', '公开API测试'],
    ['login',   'Cookie管理'],
    ['monitor', '监控流程'],
    ['task',    '文章获取'],
    ['task:mysql', 'Task单元测试(MySQL)'],
  ];

  let passed = 0, failed = 0;

  for (const [cmd, name] of tests) {
    console.log(`\n${'═'.repeat(50)}`);
    console.log(`  [${passed + failed + 1}/${tests.length}] ${name}`);
    console.log(`${'═'.repeat(50)}\n`);
    try {
      await COMMANDS[cmd].run();
      passed++;
      console.log(`\n  ✅ ${name} 通过`);
    } catch (e) {
      failed++;
      console.log(`\n  ⚠️  ${name} 跳过/失败: ${e.message.substring(0, 100)}`);
    }
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  结果: ✅${passed} 通过 · ⚠️${failed} 跳过/失败`);
  console.log(`${'═'.repeat(50)}\n`);
}

// ==================== 执行 ====================

const handler = COMMANDS[command];
if (!handler) {
  console.error(`❌ 未知命令: "${command}"`);
  console.error('   运行 "node scripts/runLocal.js help" 查看可用命令\n');
  process.exit(1);
}

handler.run().catch(e => {
  console.error('❌ 运行出错:', e.message);
  process.exit(1);
});
