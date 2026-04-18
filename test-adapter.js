/**
 * 本地测试 - 通过 db-mysql.js 适配器测试 tasks.add()
 */

process.env.DB_HOST = 'sh-cynosdbmysql-grp-5aqhxbwa.sql.tencentcdb.com';
process.env.DB_PORT = '22871';
process.env.DB_USER = 'zsxq_scan_dbuser';
process.env.DB_PASSWORD = 'zsxq@123';
process.env.DB_NAME = 'temu-tools-prod-3g8yeywsda972fae';

const { init } = require('./db-mysql');

async function test() {
  try {
    const db = init();
    const tasksCollection = db.collection('tasks');

    console.log('=== 测试 1: tasksCollection.add() ===\n');
    
    const result = await tasksCollection.add({
      data: { 
        planetId: '_debug_local_test', 
        planetName: '本地调试', 
        planetUrl: 'https://wx.zsxq.com/group/test',
        status: 'pending',
        topicCreateTime: new Date().toISOString(),
        article: '',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
    
    console.log('✅ add() 返回:', JSON.stringify(result));
    
    // 验证写入
    console.log('\n=== 验证: where().get() ===');
    const found = await tasksCollection.where({ planetId: '_debug_local_test' }).get();
    console.log('查到数据:', JSON.stringify(found.data?.[0], null, 2)?.substring(0, 500));

  } catch (e) {
    console.error('❌ 错误:', e.message);
    console.error('   stack:', e.stack?.substring(0, 400));
  }
}

test();
