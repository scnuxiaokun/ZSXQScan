/**
 * 本地测试 - Task接口单元测试（直连腾讯云MySQL）
 * 
 * 使用方法：
 *   1. 在 .env 中配置 ZSXQ_COOKIE（必须）
 *   2. 编辑下方 TEST_GROUP_ID 配置要测试的星球
 *   3. 运行: node tests/testTask-mysql.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mysql = require('mysql2/promise');
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
const TEST_GROUP_ID = '48418518458448';  // 例如: '48418518458448'
const TEST_TOPIC_ID = '';  // 可选，直接指定话题ID跳过查询步骤
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
 * 查询待处理任务
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
  const now = new Date().toISOString();
  
  await conn.query(
    `INSERT INTO \`tasks\` (\`id\`, \`planetId\`, \`planetName\`, \`planetUrl\`, \`status\`, \`topicCreateTime\`, \`createdAt\`, \`updatedAt\`) 
     VALUES (?, ?, ?, ?, 'pending', ?, NOW(), NOW())`,
    [id, planetId, `测试星球-${planetId}`, planetUrl, topicCreateTime || null]
  );
  
  console.log(`[MySQL] ✅ 创建任务: ${id}`);
  return { id, planetId, status: 'pending', createdAt: now };
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
  
  console.log(`[MySQL] ✅ 更新任务: ${taskId}`);
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
  console.log('║     Task接口单元测试 (MySQL版)       ║');
  console.log('╚══════════════════════════════════════╝\n');

  if (!TEST_GROUP_ID) {
    console.error('❌ 请先配置 TEST_GROUP_ID！');
    console.error('   打开 tests/testTask-mysql.js，填写星球数字ID。\n');
    process.exit(1);
  }

  // 初始化数据库
  await initDB();

  // 从数据库获取 Cookie
  console.log('🔑 步骤0: 从数据库获取 Cookie...');
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
  
  // 将 Cookie 设置到环境变量中，供 zsxqApi 使用
  process.env.ZSXQ_COOKIE = cookie;
  console.log('💡 Cookie 已设置到环境变量\n');

  try {
    const planetUrl = `https://wx.zsxq.com/group/${TEST_GROUP_ID}`;

    // 步骤1：创建测试任务
    console.log('📝 步骤1: 创建测试任务...');
    const task = await createTask(TEST_GROUP_ID, planetUrl, null);
    console.log('');

    // 步骤2：获取最新文章
    console.log('📄 步骤2: 获取最新文章...');
    const startTime = Date.now();
    
    const articleData = TEST_TOPIC_ID
      ? await getLatestArticle(planetUrl, TEST_TOPIC_ID)
      : await getLatestArticle(planetUrl);
    
    const elapsed = Date.now() - startTime;
    console.log(`⏱️  耗时: ${elapsed}ms\n`);

    // 输出文章信息
    console.log('========== 文章内容 ==========');
    console.log(`  标题:     ${articleData.title}`);
    console.log(`  类型:     ${articleData.type}`);
    console.log(`  话题ID:   ${articleData.topicId}`);
    console.log(`  链接:     ${articleData.url || 'N/A'}`);

    if (articleData.author) {
      console.log(`  作者:     ${articleData.author.name}`);
    }

    console.log(`  发布时间: ${articleData.createTime || '未知'}`);
    console.log(`  互动数据: 👍${articleData.stats.likeCount} 💬${articleData.stats.commentCount} 👁️${articleData.stats.viewCount}`);

    if (articleData.images && articleData.images.length > 0) {
      console.log(`  图片:     ${articleData.images.length} 张`);
    }

    if (articleData.files && articleData.files.length > 0) {
      console.log(`  附件:     ${articleData.files.length} 个`);
    }

    console.log('\n---------- 正文预览 (前300字) ----------');
    const preview = articleData.content.length > 300
      ? articleData.content.substring(0, 300) + '\n...(截断)'
      : articleData.content;
    console.log(preview);
    console.log('\n===================================');

    console.log(`\n📊 正文总长度: ${articleData.content.length} 字符`);
    console.log('🔐 使用模式: 私有API + Cookie认证\n');

    // 步骤3：更新任务状态
    console.log('💾 步骤3: 更新任务到数据库...');
    await updateTask(task.id, {
      status: 'completed',
      article: JSON.stringify(articleData),
      articleTitle: articleData.title,
      articleLength: articleData.content.length,
      topicId: articleData.topicId,
      topicType: articleData.type,
    });
    console.log('');

    // 步骤4：验证数据已写入
    console.log('✅ 步骤4: 验证数据...');
    const [verifyRows] = await conn.query(
      'SELECT `id`, `status`, `articleTitle`, `articleLength`, `topicId` FROM `tasks` WHERE `id` = ?',
      [task.id]
    );
    
    if (verifyRows.length > 0) {
      const verify = verifyRows[0];
      console.log(`  任务ID: ${verify.id}`);
      console.log(`  状态: ${verify.status}`);
      console.log(`  文章标题: ${verify.articleTitle}`);
      console.log(`  文章长度: ${verify.articleLength}`);
      console.log(`  话题ID: ${verify.topicId}`);
      console.log('  ✅ 数据已成功写入MySQL数据库\n');
    } else {
      console.log('  ❌ 未能查询到更新后的数据\n');
    }

    console.log('🎉 测试完成！所有步骤通过\n');

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);

    if (error.message.includes('401') || error.message.includes('403')) {
      console.error('   ⚠️ Cookie 可能已过期，请重新设置！');
      console.error('   运行: node scripts/runLocal.js login');
    }
    if (error.message.includes('ECONNREFUSED')) {
      console.error('   ⚠️ 无法连接到数据库，请检查网络和配置');
    }
    if (error.message.includes('ER_ACCESS_DENIED_ERROR')) {
      console.error('   ⚠️ 数据库用户名或密码错误');
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
