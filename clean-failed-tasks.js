const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function cleanTasks() {
  const dbConfig = {
    host: process.env.MYSQL_HOST || 'sh-cynosdbmysql-grp-5aqhxbwa.sql.tencentcdb.com',
    port: parseInt(process.env.MYSQL_PORT) || 22871,
    user: process.env.MYSQL_USER || 'zsxq_scan_dbuser',
    password: process.env.MYSQL_PASSWORD || 'zsxq@123',
    database: process.env.MYSQL_DATABASE || 'temu-tools-prod-3g8yeywsda972fae',
  };
  
  const conn = await mysql.createConnection(dbConfig);
  
  // 删除所有 failed 状态的任务
  const [result] = await conn.query('DELETE FROM tasks WHERE status = ?', ['failed']);
  console.log('删除了', result.affectedRows, '条 failed 任务');
  
  // 查看剩余任务
  const [tasks] = await conn.query('SELECT id, planetId, status, topicCreateTime FROM tasks');
  console.log('剩余任务数:', tasks.length);
  tasks.forEach(t => {
    console.log('  -', t.id, t.planetId, t.status, t.topicCreateTime);
  });
  
  await conn.end();
}

cleanTasks().catch(console.error);
