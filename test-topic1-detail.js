const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: 'sh-cynosdbmysql-grp-5aqhxbwa.sql.tencentcdb.com',
    port: 22871,
    user: 'zsxq_scan_dbuser',
    password: 'zsxq@123',
    database: 'temu-tools-prod-3g8yeywsda972fae'
  });
  
  const [rows] = await conn.query("SELECT value FROM config WHERE id='zsxq_cookie'");
  process.env.ZSXQ_COOKIE = rows[0].value;
  await conn.end();
  
  const { getTopicDetail } = require('./functions/zsxqApi');
  
  console.log('=== 测试星球1的话题详情 ===\n');
  const detail = await getTopicDetail('82255851211812112');
  const topic = detail.resp_data?.topic || detail.topic;
  
  console.log('has text:', !!topic.text);
  console.log('has talk:', !!topic.talk);
  console.log('has text_summary:', !!topic.text_summary);
  console.log('type:', topic.type);
  console.log('\n所有keys:', Object.keys(topic).join(', '));
  
  if (topic.talk) {
    console.log('\ntalk keys:', Object.keys(topic.talk));
    console.log('talk.text长度:', topic.talk.text ? topic.talk.text.length : 0);
    console.log('talk.text前100字:', topic.talk.text?.substring(0, 100));
  }
  
  if (topic.text) {
    console.log('\ntext长度:', topic.text.length);
    console.log('text前100字:', topic.text.substring(0, 100));
  }
})();
