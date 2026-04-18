#!/usr/bin/env node
/**
 * 快速验证MySQL数据库连接
 * 
 * 用法: node verify-mysql-connection.js
 */

const mysql = require('mysql2/promise');

const dbConfig = {
  host: 'sh-cynosdbmysql-grp-5aqhxbwa.sql.tencentcdb.com',
  port: 22871,
  user: 'zsxq_scan_dbuser',
  password: 'zsxq@123',
  database: 'temu-tools-prod-3g8yeywsda972fae',
};

async function verify() {
  let conn;
  try {
    console.log('🔌 正在连接腾讯云MySQL数据库...\n');
    console.log(`   主机: ${dbConfig.host}`);
    console.log(`   端口: ${dbConfig.port}`);
    console.log(`   用户: ${dbConfig.user}`);
    console.log(`   数据库: ${dbConfig.database}\n`);
    
    conn = await mysql.createConnection(dbConfig);
    console.log('✅ 连接成功！\n');

    // 查询表列表
    console.log('📋 数据库中的表:');
    const [tables] = await conn.query('SHOW TABLES');
    tables.forEach(t => {
      const tableName = Object.values(t)[0];
      console.log(`   - ${tableName}`);
    });
    console.log('');

    // 查询tasks表结构
    if (tables.some(t => Object.values(t)[0] === 'tasks')) {
      console.log('📊 tasks 表结构:');
      const [cols] = await conn.query('DESCRIBE `tasks`');
      cols.forEach(c => {
        console.log(`   ${c.Field.padEnd(25)} ${c.Type.padEnd(20)} ${c.Null === 'YES' ? 'NULL' : 'NOT NULL'}`);
      });
      console.log('');

      // 查询任务统计
      console.log('📈 tasks 表统计:');
      const [totalRows] = await conn.query('SELECT COUNT(*) as total FROM `tasks`');
      const [pendingRows] = await conn.query('SELECT COUNT(*) as total FROM `tasks` WHERE `status` = "pending"');
      const [completedRows] = await conn.query('SELECT COUNT(*) as total FROM `tasks` WHERE `status` = "completed"');
      
      console.log(`   总记录数: ${totalRows[0].total}`);
      console.log(`   待处理: ${pendingRows[0].total}`);
      console.log(`   已完成: ${completedRows[0].total}`);
      console.log('');

      // 查询最新5条记录
      console.log('📝 最新的5条任务:');
      const [recentTasks] = await conn.query(
        'SELECT `id`, `planetId`, `status`, `articleTitle`, `createdAt` FROM `tasks` ORDER BY `createdAt` DESC LIMIT 5'
      );
      
      if (recentTasks.length === 0) {
        console.log('   (空表)');
      } else {
        recentTasks.forEach((task, i) => {
          console.log(`   ${i + 1}. ID: ${task.id}`);
          console.log(`      星球: ${task.planetId}`);
          console.log(`      状态: ${task.status}`);
          console.log(`      标题: ${task.articleTitle || 'N/A'}`);
          console.log(`      时间: ${task.createdAt}`);
          console.log('');
        });
      }
    }

    // 查询config表
    if (tables.some(t => Object.values(t)[0] === 'config')) {
      console.log('⚙️  config 表数据:');
      const [configs] = await conn.query('SELECT `id`, LEFT(`value`, 80) as value_preview FROM `config`');
      
      if (configs.length === 0) {
        console.log('   (空表)');
      } else {
        configs.forEach(c => {
          console.log(`   - ${c.id}: ${c.value_preview}${c.value_preview.length >= 80 ? '...' : ''}`);
        });
      }
      console.log('');
    }

    console.log('✅ 数据库验证完成！可以开始使用MySQL测试脚本了。\n');
    console.log('💡 提示:');
    console.log('   - 单元测试: node tests/testTask-mysql.js');
    console.log('   - 完整流程: node tests/testTaskFlow-mysql.js');
    console.log('   - 或通过: node scripts/runLocal.js task:mysql\n');

  } catch (error) {
    console.error('\n❌ 连接失败:', error.message);
    console.error('');
    
    if (error.code === 'ECONNREFUSED') {
      console.error('可能的原因:');
      console.error('   1. 网络连接问题');
      console.error('   2. 数据库地址或端口错误');
      console.error('   3. 防火墙阻止访问');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('可能的原因:');
      console.error('   1. 用户名错误');
      console.error('   2. 密码错误');
      console.error('   3. 权限不足');
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      console.error('可能的原因:');
      console.error('   1. 数据库名称错误');
      console.error('   2. 数据库不存在');
    }
    
    process.exit(1);
  } finally {
    if (conn) {
      await conn.end();
    }
  }
}

verify().catch(e => {
  console.error('❌ 未捕获错误:', e);
  process.exit(1);
});
