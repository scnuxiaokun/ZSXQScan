/**
 * 本地测试 - 直连 CloudBase MySQL
 * 
 * 用法: node test-db-local.js
 */

const mysql = require('mysql2/promise');

const config = {
  host: 'sh-cynosdbmysql-grp-5aqhxbwa.sql.tencentcdb.com',
  port: 22871,
  user: 'zsxq_scan_dbuser',
  password: 'zsxq@123',
  database: 'temu-tools-prod-3g8yeywsda972fae',
  multipleStatements: true,
};

async function test() {
  let conn;
  try {
    console.log('=== 连接 MySQL ===');
    conn = await mysql.createConnection(config);
    console.log('✅ 连接成功!\n');

    // 1. 查看当前表
    console.log('--- 当前数据库中的表 ---');
    const [tables] = await conn.query('SHOW TABLES');
    console.log(tables);
    console.log('');

    // 2. 查看 tasks 表结构（如果存在）
    console.log('--- tasks 表结构 ---');
    try {
      const [cols] = await conn.query('DESCRIBE `tasks`');
      cols.forEach(c => console.log(`  ${c.Field} | ${c.Type} | ${c.Null} | ${c.Key} | ${c.Default}`));
    } catch (e) {
      console.log(`  ❌ 表不存在或查询失败: ${e.message}`);
    }
    console.log('');

    // 3. 查看 tasks 表数据
    console.log('--- tasks 表数据 ---');
    try {
      const [rows] = await conn.query('SELECT * FROM `tasks` LIMIT 5');
      if (rows.length === 0) {
        console.log('  (空表)');
      } else {
        rows.forEach(r => console.log(`  id=${r.id}, planetId=${r.planetId}, status=${r.status}, topicCreateTime=${r.topicCreateTime || '(null)'}`));
      }
    } catch (e) {
      console.log(`  ❌ ${e.message}`);
    }
    console.log('');

    // 4. 测试 INSERT
    console.log('--- 测试 INSERT 写入 ---');
    try {
      const now = new Date().toISOString();
      const [result] = await conn.query(
        `INSERT INTO \`tasks\` (\`planetId\`, \`planetName\`, \`planetUrl\`, \`status\`, \`topicCreateTime\`, \`createdAt\`, \`updatedAt\`) VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
        ['test_local_001', '本地测试星球', 'https://wx.zsxq.com/group/test', 'pending', now]
      );
      console.log(`  ✅ INSERT 成功! insertId=${result.insertId}, affectedRows=${result.affectedRows}`);
      
      // 验证写入
      const [verify] = await conn.query('SELECT * FROM `tasks` WHERE `id` = ?', [result.insertId]);
      console.log(`  📄 写入的数据:`, JSON.stringify(verify[0]).substring(0, 200));

      // 清理测试数据
      await conn.query('DELETE FROM `tasks` WHERE `planetId` = "test_local_001"');
      console.log('  🧹 已清理测试数据');
    } catch (e) {
      console.log(`  ❌ INSERT 失败: ${e.message}`);
      console.log(`     错误码: ${e.code}`);
      console.log(`     错误号: ${e.errno}`);
    }
    console.log('');

    // 5. 查看 config 表数据
    console.log('--- config 表结构 ---');
    try {
      const [cols] = await conn.query('DESCRIBE `config`');
      cols.forEach(c => console.log(`  ${c.Field} | ${c.Type}`));
    } catch (e) {
      console.log(`  ❌ ${e.message}`);
    }
    console.log('');

    console.log('--- config 表数据 ---');
    try {
      const [rows] = await conn.query('SELECT `id`, LEFT(`value`, 100) as value_preview FROM `config`');
      rows.forEach(r => console.log(`  id=${r.id} | value=${r.value_preview}`));
    } catch (e) {
      console.log(`  ❌ ${e.message}`);
    }

  } catch (e) {
    console.error('❌ 连接错误:', e.message);
    if (e.code === 'ECONNREFUSED') console.log('   → 检查 host/port 是否正确');
    if (e.code === 'ER_ACCESS_DENIED_ERROR') console.log('   → 检查用户名/密码');
    if (e.code === 'ER_BAD_DB_ERROR') console.log('   → 数据库名不存在');
  } finally {
    if (conn) await conn.end().catch(() => {});
    console.log('\n=== 完成 ===');
  }
}

test();
