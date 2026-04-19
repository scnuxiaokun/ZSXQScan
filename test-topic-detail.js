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
  
  console.log('=== 测试话题详情 API ===\n');
  const detail = await getTopicDetail('55522284422281444');
  
  console.log('API返回的keys:', Object.keys(detail));
  console.log('has resp_data:', !!detail.resp_data);
  console.log('has topic:', !!detail.topic);
  
  if (detail.resp_data?.topic) {
    const topic = detail.resp_data.topic;
    console.log('\nTopic keys:', Object.keys(topic));
    console.log('title:', topic.title);
    console.log('has text:', !!topic.text);
    console.log('has text_summary:', !!topic.text_summary);
    console.log('text长度:', topic.text ? topic.text.length : 0);
    console.log('text_summary前100字:', topic.text_summary?.substring(0, 100));
  } else if (detail.topic) {
    const topic = detail.topic;
    console.log('\nTopic keys:', Object.keys(topic));
    console.log('title:', topic.title);
    console.log('has text:', !!topic.text);
    console.log('has text_summary:', !!topic.text_summary);
  }
})();
