/**
 * 本地测试 - 完整Task流程（直连腾讯云MySQL）
 * 
 * 测试流程：
 * 1. 模拟Monitor阶段：查询星球最新更新时间并创建任务
 * 2. 执行LoopTask：拉取文章并更新任务状态
 * 3. 验证数据完整性
 * 
 * 使用方法：
 *   node tests/testTaskFlow-mysql.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mysql = require('mysql2/promise');
const { getGroupPublicInfo } = require('../functions/zsxqApi');
const { getLatestArticle } = require('../functions/getLastUpdatedArticle');

// ==================== MySQL 配置 ====================
const dbConfig = {
  host: 'sh-cynosdbmysql-grp-5aqhxbwa.sql.tencentcdb.com',
  port: 22871,
  user: 'zsxq_scan_dbuser',
  password: 'zsxq@123',
  database: 'temu-tools-prod-3g8yeywsda972fae',
};

// ==================== 测试配置 ====================
const TEST_GROUP_IDS = [
  // '48418518458448',  // 添加要测试的星球ID
];
// ================================================

let conn;

/**
 * 初始化数据库连接
 */
async function initDB() {
  console.log('[MySQL] 正在连接腾讯云数据库...');
  conn = await mysql.createConnection(dbConfig);
  console.log('[MySQL] ✅ 连接成功\n');
}

/**
 * 关闭数据库连接
 */
async function closeDB() {
  if (conn) {
    await conn.end();
    console.log('[MySQL] 🔒 连接已关闭\n');
  }
}

/**
 * 查询星球的待处理任务
 */
async function getPendingTask(planetId) {
  const [rows] = await conn.query(
    'SELECT * FROM `tasks` WHERE `planetId` = ? AND `status` = "pending" ORDER BY `createdAt` DESC LIMIT 1',
    [planetId]
  );
  return rows[0] || null;
}

/**
 * 创建新任务
 */
async function createTask(planetId, planetUrl, topicCreateTime) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  
  await conn.query(
    `INSERT INTO \`tasks\` (\`id\`, \`planetId\`, \`planetName\`, \`planetUrl\`, \`status\`, \`topicCreateTime\`, \`createdAt\`, \`updatedAt\`) 
     VALUES (?, ?, ?, ?, 'pending', ?, NOW(), NOW())`,
    [id, planetId, `测试星球-${planetId}`, planetUrl, topicCreateTime || null]
  );
  
  console.log(`  [MySQL] ✅ 创建任务: ${id}`);
  return { id, planetId, status: 'pending' };
}

/**
 * 更新任务状态和文章内容
 */
async function updateTask(taskId, updateData) {
  const fields = [];
  const values = [];
  
  for (const [key, value] of Object.entries(updateData)) {
    fields.push(`\`${key}\` = ?`);
    values.push(value);
  }
  
  values.push(taskId);
  
  await conn.query(
    `UPDATE \`tasks\` SET ${fields.join(', ')}, \`updatedAt\` = NOW() WHERE \`id\` = ?`,
    values
  );
  
  console.log(`  [MySQL] ✅ 更新任务: ${taskId}`);
}

/**
 * 清理测试数据
 */
async function cleanupTestTasks(planetIds) {
  const placeholders = planetIds.map(() => '?').join(', ');
  const [result] = await conn.query(
    `DELETE FROM \`tasks\` WHERE \`planetId\` IN (${placeholders})`,
    planetIds
  );
  console.log(`  [MySQL] 🧹 清理测试数据: 删除 ${result.affectedRows} 条记录`);
}

/**
 * 统计当前数据库中的任务
 */
async function getTaskStats() {
  const [totalRows] = await conn.query('SELECT COUNT(*) as total FROM `tasks`');
  const [pendingRows] = await conn.query('SELECT COUNT(*) as total FROM `tasks` WHERE `status` = "pending"');
  const [completedRows] = await conn.query('SELECT COUNT(*) as total FROM `tasks` WHERE `status` = "completed"');
  
  return {
    total: totalRows[0].total,
    pending: pendingRows[0].total,
    completed: completedRows[0].total,
  };
}

/**
 * 阶段1：模拟Monitor - 检测更新并创建任务
 */
async function stage1_Monitor(groupId) {
  console.log(`\n📡 阶段1: Monitor - 检测星球 ${groupId} 的更新`);
  console.log('─'.repeat(50));
  
  try {
    // 获取星球公开信息
    const info = await getGroupPublicInfo(groupId);
    const g = info.resp_data?.group;
    
    if (!g) {
      throw new Error('获取星球信息失败');
    }
    
    const latestTopicTime = g.latest_topic_create_time;
    console.log(`  星球名称: ${g.name}`);
    console.log(`  最新话题时间: ${latestTopicTime}`);
    
    // 检查是否已有该时间的任务
    const existingTask = await getPendingTask(groupId);
    
    if (existingTask && existingTask.topicCreateTime === latestTopicTime) {
      console.log(`  ⏭️  跳过：该时间戳的任务已存在`);
      return null;
    }
    
    // 创建新任务
    const planetUrl = `https://wx.zsxq.com/group/${groupId}`;
    const task = await createTask(groupId, planetUrl, latestTopicTime);
    
    console.log(`  ✅ Monitor完成，任务已创建\n`);
    return task;
    
  } catch (error) {
    console.error(`  ❌ Monitor失败: ${error.message}\n`);
    throw error;
  }
}

/**
 * 阶段2：执行LoopTask - 拉取文章
 */
async function stage2_LoopTask(groupId, task) {
  console.log(`\n📄 阶段2: LoopTask - 拉取星球 ${groupId} 的文章`);
  console.log('─'.repeat(50));
  
  const cookie = process.env.ZSXQ_COOKIE;
  if (!cookie) {
    throw new Error('未配置 ZSXQ_COOKIE，无法获取文章');
  }
  
  try {
    const planetUrl = `https://wx.zsxq.com/group/${groupId}`;
    const startTime = Date.now();
    
    // 获取最新文章（使用Monitor阶段记录的topicId可提高效率）
    const articleData = task?.topicId
      ? await getLatestArticle(planetUrl, task.topicId)
      : await getLatestArticle(planetUrl);
    
    const elapsed = Date.now() - startTime;
    
    console.log(`  标题: ${articleData.title}`);
    console.log(`  类型: ${articleData.type}`);
    console.log(`  长度: ${articleData.content.length} 字符`);
    console.log(`  耗时: ${elapsed}ms`);
    
    // 更新任务状态
    await updateTask(task.id, {
      status: 'completed',
      article: JSON.stringify(articleData),
      articleTitle: articleData.title,
      articleLength: articleData.content.length,
      topicId: articleData.topicId,
      topicType: articleData.type,
    });
    
    console.log(`  ✅ LoopTask完成，文章已保存\n`);
    return articleData;
    
  } catch (error) {
    console.error(`  ❌ LoopTask失败: ${error.message}`);
    
    // 标记任务为失败
    if (task) {
      await updateTask(task.id, {
        status: 'failed',
        errorMsg: error.message,
      });
    }
    
    throw error;
  }
}

/**
 * 阶段3：验证数据完整性
 */
async function stage3_Verify(taskId) {
  console.log(`\n✅ 阶段3: 验证数据完整性`);
  console.log('─'.repeat(50));
  
  const [rows] = await conn.query(
    'SELECT * FROM `tasks` WHERE `id` = ?',
    [taskId]
  );
  
  if (rows.length === 0) {
    throw new Error('未找到任务记录');
  }
  
  const task = rows[0];
  
  console.log(`  任务ID: ${task.id}`);
  console.log(`  星球ID: ${task.planetId}`);
  console.log(`  状态: ${task.status}`);
  console.log(`  文章标题: ${task.articleTitle || 'N/A'}`);
  console.log(`  文章长度: ${task.articleLength || 'N/A'}`);
  console.log(`  话题ID: ${task.topicId || 'N/A'}`);
  console.log(`  创建时间: ${task.createdAt}`);
  console.log(`  更新时间: ${task.updatedAt}`);
  
  // 验证文章数据
  if (task.article) {
    try {
      const article = JSON.parse(task.article);
      console.log(`  ✅ 文章JSON解析成功`);
      console.log(`     - 标题: ${article.title}`);
      console.log(`     - 作者: ${article.author?.name || 'N/A'}`);
      console.log(`     - 点赞: ${article.stats?.likeCount || 0}`);
      console.log(`     - 评论: ${article.stats?.commentCount || 0}`);
    } catch (e) {
      console.error(`  ❌ 文章JSON解析失败: ${e.message}`);
    }
  }
  
  console.log('');
}

/**
 * 从 MySQL 数据库读取配置
 */
async function getConfigFromDB(key) {
  try {
    const [rows] = await conn.query(
      'SELECT `value` FROM `config` WHERE `id` = ? LIMIT 1',
      [key]
    );
    
    if (rows.length === 0) {
      return null;
    }
    
    let value = rows[0].value;
    // 尝试解析 JSON
    try {
      value = JSON.parse(value);
      // 如果解析后是对象且有 value 字段，取 value
      if (typeof value === 'object' && value !== null && value.value !== undefined) {
        value = value.value;
      }
    } catch (e) {
      // 不是 JSON，直接返回字符串
    }
    
    return value;
  } catch (error) {
    console.error(`[MySQL] 读取配置失败 [${key}]:`, error.message);
    return null;
  }
}

/**
 * 主测试流程
 */
async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║  Task完整流程测试 (MySQL版)          ║');
  console.log('║  Monitor → LoopTask → Verify         ║');
  console.log('╚══════════════════════════════════════╝\n');

  // 初始化数据库
  await initDB();

  // 从数据库加载测试星球列表
  if (!TEST_GROUP_IDS.length) {
    console.log('📋 从数据库加载监控星球列表...');
    const monitorUrls = await getConfigFromDB('monitorUrls');
    
    if (monitorUrls && Array.isArray(monitorUrls)) {
      for (const url of monitorUrls) {
        const id = url.split('/').pop();
        if (id) TEST_GROUP_IDS.push(id);
      }
      console.log(`✅ 已加载 ${TEST_GROUP_IDS.length} 个星球\n`);
    }
  }

  if (!TEST_GROUP_IDS.length) {
    console.error('❌ 请先配置测试星球！');
    console.error('   方式1: 编辑 tests/testTaskFlow-mysql.js，在 TEST_GROUP_IDS 中添加星球ID');
    console.error('   方式2: 在数据库 config 表中设置 monitorUrls\n');
    await closeDB();
    process.exit(1);
  }

  // 从数据库获取 Cookie
  console.log('🔑 从数据库获取 Cookie...');
  const cookie = await getConfigFromDB('zsxq_cookie');
  
  if (!cookie) {
    console.error('❌ 数据库中未找到 ZSXQ_COOKIE！');
    console.error('   请先在数据库中设置 Cookie。\n');
    console.error('   可以使用以下方式设置：');
    console.error('   1. 运行: node scripts/runLocal.js login');
    console.error('   2. 或直接在数据库中插入 config 记录\n');
    await closeDB();
    process.exit(1);
  }
  
  console.log('✅ Cookie 已从数据库加载\n');
  console.log(`[Test] 测试星球数: ${TEST_GROUP_IDS.length}\n`);

  try {
    // 显示初始统计
    const initialStats = await getTaskStats();
    console.log(`📊 初始任务统计: 总计=${initialStats.total}, 待处理=${initialStats.pending}, 已完成=${initialStats.completed}\n`);

    let successCount = 0;
    let failCount = 0;
    const completedTasks = [];

    // 逐个星球测试
    for (let i = 0; i < TEST_GROUP_IDS.length; i++) {
      const groupId = TEST_GROUP_IDS[i];
      console.log(`${'═'.repeat(50)}`);
      console.log(`  [${i + 1}/${TEST_GROUP_IDS.length}] 星球: ${groupId}`);
      console.log(`${'═'.repeat(50)}`);

      try {
        // 阶段1：Monitor
        const task = await stage1_Monitor(groupId);
        
        if (!task) {
          console.log('  ⏭️  跳过该星球\n');
          continue;
        }

        // 阶段2：LoopTask
        await stage2_LoopTask(groupId, task);

        // 阶段3：Verify
        await stage3_Verify(task.id);

        completedTasks.push(task.id);
        successCount++;

      } catch (error) {
        console.error(`  ❌ 星球 ${groupId} 测试失败: ${error.message}\n`);
        failCount++;
      }
    }

    // 最终统计
    console.log(`${'═'.repeat(50)}`);
    console.log(`  📊 测试结果`);
    console.log(`${'═'.repeat(50)}`);
    console.log(`  ✅ 成功: ${successCount}`);
    console.log(`  ❌ 失败: ${failCount}`);
    console.log('');

    const finalStats = await getTaskStats();
    console.log(`  📊 最终任务统计: 总计=${finalStats.total}, 待处理=${finalStats.pending}, 已完成=${finalStats.completed}`);
    console.log('');

    // 清理测试数据
    console.log('🧹 清理测试数据...');
    await cleanupTestTasks(TEST_GROUP_IDS);
    console.log('');

    console.log('🎉 所有测试完成！\n');

  } catch (error) {
    console.error('\n❌ 测试异常:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('   → 请检查网络连接和数据库地址');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('   → 用户名或密码错误');
    }

    // 尝试清理
    try {
      await cleanupTestTasks(TEST_GROUP_IDS);
    } catch (e) {
      console.error('清理失败:', e.message);
    }

    process.exit(1);
  } finally {
    await closeDB();
  }
}

main().catch(e => {
  console.error('❌ 未捕获错误:', e);
  process.exit(1);
});
