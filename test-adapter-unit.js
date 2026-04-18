// 测试 db-mysql.js 适配器层每个方法
process.env.DB_HOST = 'sh-cynosdbmysql-grp-5aqhxbwa.sql.tencentcdb.com';
process.env.DB_PORT = '22871';
process.env.DB_USER = 'zsxq_scan_dbuser';
process.env.DB_PASSWORD = 'zsxq@123';
process.env.DB_NAME = 'temu-tools-prod-3g8yeywsda972fae';

const { init } = require('./db-mysql');
const app = init();
const config = app.collection('config');
const tasks = app.collection('tasks');

(async () => {
  console.log('--- Test A: config.get() (无条件) ---');
  try {
    const r = await config.get();
    console.log('✅ 成功:', r.data?.length, '行');
  } catch(e) { console.log('❌', e.message); }

  console.log('\n--- Test B: config.limit(1).get() ---');
  try {
    const coll = app.collection('config'); // 新实例避免污染
    const r2 = await coll.limit(1).get();
    console.log('✅ 成功:', r2.data?.length, '行');
  } catch(e) { console.log('❌', e.message); }

  console.log('\n--- Test C: tasks.add() ---');
  try {
    const t = app.collection('tasks'); // 新实例
    const r3 = await t.add({
      data: { planetId: '_adapter_test', planetName: '适配器测试', status: 'pending', createdAt: new Date(), updatedAt: new Date() }
    });
    console.log('✅ add 成功:', JSON.stringify(r3));

    // 回查
    const found = await tasks.where({ planetId: '_adapter_test' }).get();
    console.log('回查:', found.data?.length > 0 ? '✅ 找到了' : '❌ 空');

    // 清理
    require('mysql2/promise').createPool({ host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME })
      .then(p => p.query("DELETE FROM tasks WHERE planetId='_adapter_test'").then(() => p.end()));
    console.log('清理完成');
    
  } catch(e) { console.log('❌', e.message, '\n', e.stack?.substring(0,200)); }
  
  console.log('\n✅ 测试结束');
})().catch(e => console.error('致命:', e.message));
