/**
 * 本地测试 - Cookie 管理
 *
 * 使用方法：
 *   1. (可选) 在 .env 中配置 ZSXQ_COOKIE
 *   2. 运行: node tests/testLogin.js
 *
 * 无需 TCB_ENV — Cookie 存储在本地 data/config.json
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { setCookie, getCookie, checkStatus } = require('../functions/login');
const { validateCookie } = require('../functions/zsxqApi');

// ==================== 配置区 ====================
// 如需测试 setCookie，在此粘贴你的 Cookie（可选）
const TEST_COOKIE = '';
// ================================================

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║     Cookie 管理测试                   ║');
  console.log('╚══════════════════════════════════════╝\n');

  const env = process.env.TCB_ENV;
  if (env) {
    console.log(`[Test] 云开发环境: ${env}`);
  } else {
    console.log('[Test] 数据库: 本地JSON (data/config.json)');
  }
  console.log(`[Test] 环境变量Cookie: ${process.env.ZSXQ_COOKIE ? '✅ 已设置' : '❌ 未设置'}\n`);

  // ---- 测试1: 检查 Cookie 状态 ----
  console.log('--- 测试1: checkStatus ---\n');
  try {
    const status = await checkStatus();
    console.log('当前 Cookie 状态:');
    console.log(JSON.stringify(status, null, 2));
  } catch (e) {
    console.warn('⚠️ 检查状态失败:', e.message);
  }

  // ---- 测试2: 获取 Cookie ----
  console.log('\n--- 测试2: getCookie ---\n');
  try {
    const cookie = await getCookie();
    if (cookie) {
      console.log('✅ Cookie 存在且有效');
      console.log(`   预览: ${cookie.substring(0, 50)}...`);
      console.log(`   长度: ${cookie.length} 字符`);
    } else {
      console.log('ℹ️  暂无有效 Cookie（需要先设置）');
    }
  } catch (e) {
    console.warn('⚠️ 获取 Cookie 失败:', e.message);
  }

  // ---- 测试3: 设置 Cookie（可选） ----
  if (TEST_COOKIE && TEST_COOKIE.length > 10) {
    console.log('\n--- 测试3: setCookie ---\n');
    try {
      console.log('[Test] 正在验证 Cookie 有效性...');
      const result = await setCookie(TEST_COOKIE);
      console.log(result.message);
      console.log(`   提示: ${result.hint}`);
    } catch (e) {
      console.error('❌ 设置 Cookie 失败:', e.message);
    }
  } else if (!TEST_COOKIE) {
    console.log('\n--- 测试3: setCookie (跳过) ---');
    console.log('ℹ️  TEST_COOKIE 为空，跳过设置测试。');
    console.log('   如需测试，编辑本文件顶部填入 Cookie。\n');
  }

  console.log('\n✅ 所有测试完成');
}

main().catch(e => {
  console.error('❌ 未捕获错误:', e);
  process.exit(1);
});
