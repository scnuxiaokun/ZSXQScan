const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function checkConfig() {
  const dbConfig = {
    host: process.env.MYSQL_HOST || 'sh-cynosdbmysql-grp-5aqhxbwa.sql.tencentcdb.com',
    port: parseInt(process.env.MYSQL_PORT) || 22871,
    user: process.env.MYSQL_USER || 'zsxq_scan_dbuser',
    password: process.env.MYSQL_PASSWORD || 'zsxq@123',
    database: process.env.MYSQL_DATABASE || 'temu-tools-prod-3g8yeywsda972fae',
  };
  
  console.log('正在连接数据库...');
  const conn = await mysql.createConnection(dbConfig);
  console.log('✅ 连接成功\n');
  
  console.log('=== 查询 config 表中的 monitorUrls ===\n');
  const [rows] = await conn.query('SELECT * FROM config WHERE id = ?', ['monitorUrls']);
  
  if (rows.length > 0) {
    console.log('ID:', rows[0].id);
    console.log('Value:', rows[0].value);
    console.log('\n解析后的JSON:');
    try {
      const parsed = JSON.parse(rows[0].value);
      console.log(JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log('(不是JSON格式)');
    }
  } else {
    console.log('未找到 monitorUrls 配置');
  }
  
  await conn.end();
}

checkConfig().catch(console.error);
