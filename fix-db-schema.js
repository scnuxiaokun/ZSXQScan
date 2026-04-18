/**
 * 本地执行 - 修改数据库表结构为 camelCase 列名
 */

process.env.DB_HOST = 'sh-cynosdbmysql-grp-5aqhxbwa.sql.tencentcdb.com';
process.env.DB_PORT = '22871';
process.env.DB_USER = 'zsxq_scan_dbuser';
process.env.DB_PASSWORD = 'zsxq@123';
process.env.DB_NAME = 'temu-tools-prod-3g8yeywsda972fae';

const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  console.log('✅ 已连接数据库\n');

  // ==================== tasks 表 ====================
  console.log('=== 修改 tasks 表 ===\n');

  const taskAlterSqls = [
    `ALTER TABLE tasks CHANGE COLUMN planet_id   planetId     VARCHAR(64)  NOT NULL DEFAULT ''`,
    `ALTER TABLE tasks CHANGE COLUMN planet_name planetName   VARCHAR(255) DEFAULT NULL`,
    `ALTER TABLE tasks CHANGE COLUMN planet_url  planetUrl    VARCHAR(512) DEFAULT NULL`,
    `ALTER TABLE tasks CHANGE COLUMN last_update_time lastUpdateTime VARCHAR(128) DEFAULT NULL`,
    `ALTER TABLE tasks CHANGE COLUMN topic_create_time topicCreateTime VARCHAR(64) DEFAULT NULL`,
    `ALTER TABLE tasks CHANGE COLUMN article_title articleTitle VARCHAR(500) DEFAULT NULL`,
    `ALTER TABLE tasks CHANGE COLUMN article_length articleLength INT DEFAULT 0`,
    `ALTER TABLE tasks CHANGE COLUMN topic_id      topicId      VARCHAR(64) DEFAULT NULL`,
    `ALTER TABLE tasks CHANGE COLUMN topic_type    topicType    VARCHAR(32) DEFAULT NULL`,
    `ALTER TABLE tasks CHANGE COLUMN error_msg     errorMsg     TEXT DEFAULT NULL`,
    `ALTER TABLE tasks CHANGE COLUMN created_at    createdAt    DATETIME DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE tasks CHANGE COLUMN updated_at    updatedAt    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
  ];

  for (const sql of taskAlterSqls) {
    try {
      await conn.query(sql);
      const col = sql.match(/CHANGE COLUMN \w+ (\w+)/)?.[1] || '';
      console.log(`  ✅ ${col}`);
    } catch (e) {
      console.log(`  ⚠️  ${e.message.substring(0, 80)}`);
    }
  }

  // 验证
  console.log('\n--- tasks 表最终结构 ---');
  const [cols] = await conn.query('DESCRIBE tasks');
  for (const c of cols) {
    console.log(`  ${c.Field.padEnd(22)} | ${c.Type || ''} | ${c.Key || ''}`);
  }

  // ==================== config 表 ====================
  console.log('\n=== 修改 config 表 ===\n');

  const configAlterSqls = [
    `ALTER TABLE config CHANGE COLUMN updated_at updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
  ];

  for (const sql of configAlterSqls) {
    try {
      await conn.query(sql);
      console.log('  ✅ config.updated_at → updatedAt');
    } catch (e) {
      console.log(`  ⚠️  ${e.message.substring(0, 80)}`);
    }
  }

  console.log('\n--- config 表最终结构 ---');
  const [configCols] = await conn.query('DESCRIBE config');
  for (const c of configCols) {
    console.log(`  ${c.Field.padEnd(20)} | ${c.Type || ''}`);
  }

  await conn.end();
  console.log('\n🎉 全部完成！');
}

main().catch(e => { console.error('致命错误:', e); process.exit(1); });
