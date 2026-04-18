/**
 * 本地纯数据库单元测试 - 不调用任何外部 API
 */

process.env.DB_HOST = 'sh-cynosdbmysql-grp-5aqhxbwa.sql.tencentcdb.com';
process.env.DB_PORT = '22871';
process.env.DB_USER = 'zsxq_scan_dbuser';
process.env.DB_PASSWORD = 'zsxq@123';
process.env.DB_NAME = 'temu-tools-prod-3g8yeywsda972fae';

const { init } = require('./db-mysql');

async function test() {
  const db = init();
  const config = db.collection('config');
  const tasks = db.collection('tasks');
  let passed = 0, failed = 0;

  function assert(name, condition, detail) {
    if (condition) { console.log(`  ✅ ${name}`); passed++; }
    else { console.log(`  ❌ ${name} — ${detail || '条件不满足'}`); failed++; }
  }

  console.log('\n=== 1. 连接测试 ===\n');
  try {
    // 测试 config 表读取
    const r = await config.get();
    assert('config 表可读', Array.isArray(r.data), JSON.stringify(r).substring(0,100));
    console.log(`     共 ${r.data?.length || 0} 条记录`);
    
    for (const d of (r.data||[])) {
      console.log(`     id=${d.id}, value=${String(d.value||'').substring(0,50)}...`);
    }
  } catch(e) {
    assert('config 表可读', false, e.message);
  }

  console.log('\n=== 2. doc().get() 单条查询 ===\n');
  
  try {
    const monitorDoc = await config.doc('monitorUrls').get();
    assert('monitorUrls 文档存在', !!monitorDoc.data);
    if (monitorDoc.data) {
      console.log(`     value 类型: ${typeof monitorDoc.data.value}`);
      console.log(`     value 内容: ${JSON.stringify(monitorDoc.data.value).substring(0,150)}`);
      
      let urls = monitorDoc.data.value;
      if (typeof urls === 'string') {
        try { urls = JSON.parse(urls); } catch(e) { urls = null; }
      }
      assert('monitorUrls 是数组', Array.isArray(urls), typeof urls);
      if (Array.isArray(urls)) {
        console.log(`     监控列表: ${urls.length} 个 URL`);
        urls.forEach(u => console.log(`       - ${u}`));
      }
    }
  } catch(e) {
    assert('monitorUrls 查询', false, e.message);
  }

  try {
    const cookieDoc = await config.doc('zsxq_cookie').get();
    assert('zsxq_cookie 文档存在', !!cookieDoc.data);
    if (cookieDoc.data) {
      const c = cookieDoc.data.value;
      assert('cookie 是字符串', typeof c === 'string', typeof c);
      if (typeof c === 'string') {
        assert('cookie 长度 > 20', c.length > 20, `长度=${c.length}`);
        assert('cookie 包含 _c_', c.includes('_c_'), '格式不对');
      }
    }
  } catch(e) {
    assert('zsxq_cookie 查询', false, e.message);
  }

  console.log('\n=== 3. tasks.add() 写入测试 ===\n');
  
  const testId = 'test_' + Date.now();
  try {
    const addResult = await tasks.add({
      data: {
        planetId: '_unit_test',
        planetName: '单元测试星球',
        planetUrl: 'https://wx.zsxq.com/group/test',
        status: 'pending',
        topicCreateTime: new Date().toISOString(),
        article: '',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
    assert('tasks.add() 成功', !!addResult.id, JSON.stringify(addResult));
    console.log(`     插入 ID: ${addResult.id}`);

    // 回查
    const found = await tasks.where({ planetId: '_unit_test' }).limit(1).get();
    assert('回查成功', found.data && found.data.length > 0, `${found.data?.length || 0} 条`);
    if (found.data && found.data[0]) {
      const row = found.data[0];
      assert('planetName 正确', row.planetName === '单元测试星球', row.planetName);
      assert('status 正确', row.status === 'pending', row.status);
      assert('planetId 正确', row.planetId === '_unit_test', row.planetId);
      console.log(`     回查数据: ${JSON.stringify(row, Object.keys(row), 2).substring(0,300)}`);
    }

    // 清理测试数据
    await tasks.where({ planetId: '_unit_test' }).limit(1); 
    const mysql = require('./db-mysql');
    const pool = mysql.initPool();
    const conn = await pool.getConnection();
    await conn.query("DELETE FROM tasks WHERE planetId = '_unit_test'");
    conn.release();
    assert('清理完成', true);

  } catch(e) {
    assert('tasks.add()', false, e.message + '\n' + e.stack?.substring(0,300));
  }

  console.log('\n=== 4. where().get() 复合查询 ===\n');
  
  try {
    const allTasks = await tasks.where({ status: 'pending' }).get();
    assert('where(status=pending)', true, `共 ${allTasks.data?.length || 0} 条`);
    
    const all = await tasks.limit(3).get();
    assert('limit(3)', Array.isArray(all.data), `${all.data?.length} 条`);
    
    const count = await tasks.count();
    assert('count()', count.total >= 0, `总数=${count.total}`);
    console.log(`     tasks 表总数: ${count.total}`);
  } catch(e) {
    assert('复合查询', false, e.message);
  }

  console.log('\n=== 5. doc().update() 更新测试 ===\n');
  
  try {
    // 先插入一条用于更新
    const { initPool } = require('./db-mysql');
    const pool = initPool();
    const conn = await pool.getConnection();
    await conn.query(
      "INSERT INTO tasks (id, planetId, status, createdAt, updatedAt) VALUES (?, ?, 'pending', NOW(), NOW())",
      ['update_test_id', 'update_test_planet']
    );
    conn.release();

    const updateResult = await config.collection('tasks').doc('update_test_id').update({
      data: { status: 'completed', articleTitle: '测试更新' }
    });
    assert('update() 成功', updateResult.updated, JSON.stringify(updateResult));

    // 验证更新
    const updated = await tasks.doc('update_test_id').get();
    assert('状态已改为 completed', updated.data?.status === 'completed', updated.data?.status);
    assert('标题已设置', updated.data?.articleTitle === '测试更新', updated.data?.articleTitle);

    // 清理
    const conn2 = await pool.getConnection();
    await conn2.query("DELETE FROM tasks WHERE id = 'update_test_id'");
    conn2.release();
    assert('清理完成', true);

  } catch(e) {
    assert('doc.update()', false, e.message + '\n' + e.stack?.substring(0,200));
  }

  console.log(`\n${'='.repeat(40)}`);
  console.log(`结果: ${passed} 通过, ${failed} 失败, 共 ${passed+failed} 项`);
  console.log(`${'='.repeat(40)}\n`);
}

test().catch(console.error);
