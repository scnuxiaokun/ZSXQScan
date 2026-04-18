/**
 * Access Token 有效性测试脚本
 * 从数据库读取 Cookie → 提取 Token → 检测是否过期
 */
process.env.DB_HOST = 'sh-cynosdbmysql-grp-5aqhxbwa.sql.tencentcdb.com';
process.env.DB_PORT = '22871';
process.env.DB_USER = 'zsxq_scan_dbuser';
process.env.DB_PASSWORD = 'zsxq@123';
process.env.DB_NAME = 'temu-tools-prod-3g8yeywsda972fae';

const dbMysql = require('./db-mysql');
const zsxqApi = require('./functions/zsxqApi');

// 从数据库加载 Cookie
async function loadCookie() {
  const pool = dbMysql.initPool();
  const conn = await pool.getConnection();
  const [rows] = await conn.query("SELECT value FROM config WHERE id='zsxq_cookie'");
  conn.release();

  let cookie = rows[0]?.value || '';
  if (typeof cookie === 'string') {
    try { cookie = JSON.parse(cookie); cookie = cookie.value || cookie; } catch (e) {}
  }
  return cookie;
}

// 提取并显示 token 信息
function showTokenInfo(cookie) {
  const accessToken = zsxqApi.extractAccessToken(cookie);
  
  console.log('┌─────────────────────────────────────');
  console.log('│ 📋 Cookie / Token 信息');
  console.log('├─────────────────────────────────────');
  console.log(`│ Cookie 总长度: ${cookie.length} 字符`);
  console.log(`│ Access Token: ${accessToken ? '✅ 已提取' : '❌ 未找到'}`);
  if (accessToken) {
    // 显示前8位和后4位，中间打码
    const masked = accessToken.length > 16
      ? accessToken.substring(0, 8) + '...' + accessToken.substring(accessToken.length - 4)
      : accessToken;
    console.log(`│ Token 预览:   ${masked} (${accessToken.length}字符)`);
    
    // 尝试解析 JWT（如果 token 是 JWT 格式）
    try {
      const parts = accessToken.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
        const exp = payload.exp ? new Date(payload.exp * 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '未知';
        const iat = payload.iat ? new Date(payload.iat * 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '未知';
        console.log('│ ── JWT 解析 (如果是 JWT 格式) ──');
        console.log(`│   签发时间(iat): ${iat}`);
        console.log(`│   过期时间(exp): ${exp}`);
        
        const now = Date.now();
        if (payload.exp && now > payload.exp * 1000) {
          const expiredMs = now - payload.exp * 1000;
          const expiredMin = Math.floor(expiredMs / 60000);
          console.log(`│   ⚠️  状态: 已过期 ${expiredMin} 分钟`);
        } else if (payload.exp) {
          const remainMs = payload.exp * 1000 - now;
          const remainHr = Math.floor(remainMs / 3600000);
          const remainMin = Math.floor((remainMs % 3600000) / 60000);
          console.log(`│   ✅  状态: 仍有效 (剩余约 ${remainHr}h${remainMin}m)`);
        }
      } else {
        console.log('│ ⚠️  Token 不是标准 JWT 格式 (非3段)');
      }
    } catch (e) {
      console.log('│ ℹ️  Token 非 JWT 或无法解析 base64url payload');
    }
  }
  console.log('└─────────────────────────────────────\n');
}

(async () => {
  console.log('🔍 Access Token 有效性检测\n');

  // 1. 加载 Cookie
  console.log('Step 1: 从数据库加载 Cookie...');
  const cookie = await loadCookie();
  if (!cookie || cookie.length < 10) {
    console.error('❌ 数据库中未找到有效 Cookie！');
    process.exit(1);
  }
  console.log(`✅ Cookie 加载成功 (${cookie.length} 字符)\n`);

  // 2. 显示 Token 信息
  showTokenInfo(cookie);

  // 3. 调用 validateAccessToken
  console.log('Step 2: 调用 /v2/user 接口验证 Token...\n');

  const startTime = Date.now();
  const result = await zsxqApi.validateAccessToken(
    zsxqApi.extractAccessToken(cookie),
    cookie
  );
  const elapsed = Date.now() - startTime;

  // 4. 输出结果
  console.log('┌─────────────────────────────────────');
  console.log('│ 🎯 检测结果');
  console.log('├─────────────────────────────────────');
  console.log(`│ 耗时: ${elapsed}ms`);
  console.log(`│ 状态: ${result.valid ? '✅ 有效' : '❌ 无效/已过期'}`);
  if (result.reason) {
    console.log(`│ 原因: ${result.reason}`);
  }
  if (result.statusCode) {
    console.log(`│ HTTP: ${result.statusCode}`);
  }
  console.log('└─────────────────────────────────────');

  // 5. 再测一次（验证缓存命中）
  console.log('\nStep 3: 再次调用 (应命中缓存)...');
  const start2 = Date.now();
  const cachedResult = await zsxqApi.validateAccessToken(
    zsxqApi.extractAccessToken(cookie),
    cookie
  );
  const elapsed2 = Date.now() - start2;
  console.log(`缓存结果: ${cachedResult.valid ? '✅ 有效' : '❌ 无效'} | 耗时: ${elapsed2}ms (${elapsed2 < 50 ? '🚀 缓存命中' : '⚠️ 未命中缓存'})`);

  // 6. 测试无效 token 的处理
  console.log('\nStep 4: 测试无效 token (应为 ❌)...');
  const fakeResult = await zsxqApi.validateAccessToken('fake_token_12345', '');
  console.log(`假 Token 结果: ${fakeResult.valid ? '✅ 有效(异常!)' : `❌ 无效 - ${fakeResult.reason}`}`);

  console.log('\n🏁 全部测试完成！');
})().catch(e => console.error('FATAL:', e));
