// 最小测试 - 精确定位 NaN 问题
console.log('Step 1: start');

process.env.DB_HOST = 'sh-cynosdbmysql-grp-5aqhxbwa.sql.tencentcdb.com';
process.env.DB_PORT = '22871';
process.env.DB_USER = 'zsxq_scan_dbuser';
process.env.DB_PASSWORD = 'zsxq@123';
process.env.DB_NAME = 'temu-tools-prod-3g8yeywsda972fae';

const mysql = require('mysql2/promise');

(async () => {
  console.log('Step 2: 连接数据库...');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  console.log('Step 3: 连接成功');

  // 原始查询测试
  console.log('Step 4: SELECT * FROM config');
  try {
    const [rows] = await conn.query('SELECT * FROM `config`');
    console.log(`Step 5: 成功! ${rows.length} 行`);
  } catch(e) {
    console.log('Step 5 失败:', e.message);
  }

  // 带 LIMIT 测试
  console.log('\nStep 6: SELECT * FROM tasks LIMIT 1');
  try {
    const [rows] = await conn.query('SELECT * FROM `tasks` LIMIT 1');
    console.log(`Step 7: 成功! ${rows.length} 行`);
  } catch(e) {
    console.log('Step 7 失败:', e.message);
  }

  // INSERT 测试（camelCase 列名）
  console.log('\nStep 8: INSERT INTO tasks...');
  try {
    const testId = 'nan_test_' + Date.now();
    await conn.query(
      'INSERT INTO tasks (`id`, `planetId`, `planetName`, `status`, `createdAt`, `updatedAt`) VALUES (?, ?, ?, ?, NOW(), NOW())',
      [testId, '_nan_test', 'NaN调试', 'pending']
    );
    console.log(`Step 9: 插入成功! id=${testId}`);
    
    // 查回验证
    const [check] = await conn.query('SELECT * FROM tasks WHERE id=?', [testId]);
    console.log('Step 10: 回查:', JSON.stringify(check[0]));
    
    // 清理
    await conn.query('DELETE FROM tasks WHERE id=?', [testId]);
    console.log('Step 11: 清理完成');
  } catch(e) {
    console.log('Step 9-11 失败:', e.message);
    console.log('   stack:', e.stack?.substring(0,300));
  }

  await conn.end();
  console.log('\n✅ 全部完成');
})().catch(e => {
  console.error('致命错误:', e.message);
  process.exit(1);
});
