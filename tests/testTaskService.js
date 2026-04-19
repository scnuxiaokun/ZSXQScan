/**
 * 测试 Task 服务模块
 */

const mysql = require('mysql2/promise');
const taskService = require('../functions/taskService');

// 数据库配置
const dbConfig = {
  host: process.env.DB_HOST || 'sh-cynosdbmysql-grp-5aqhxbwa.sql.tencentcdb.com',
  port: parseInt(process.env.DB_PORT) || 22871,
  user: process.env.DB_USER || 'zsxq_scan_dbuser',
  password: process.env.DB_PASSWORD || 'zsxq@123',
  database: process.env.DB_NAME || 'temu-tools-prod-3g8yeywsda972fae',
};

async function initDatabase() {
  console.log('[Test] 初始化 MySQL 连接...');
  const pool = mysql.createPool(dbConfig);
  
  // 从数据库加载Cookie
  try {
    const [rows] = await pool.execute('SELECT value FROM config WHERE id = ?', ['zsxq_cookie']);
    if (rows.length > 0 && rows[0].value) {
      process.env.ZSXQ_COOKIE = rows[0].value;
      console.log('[Test] ✅ Cookie已从数据库加载');
    } else {
      console.warn('[Test] ⚠️  数据库中未找到Cookie配置');
    }
  } catch(e) {
    console.error('[Test] ❌ 加载Cookie失败:', e.message);
  }
  
  // 模拟 tasksCollection
  const tasksCollection = {
    where: (conditions) => ({
      orderBy: () => ({ 
        limit: (count) => ({
          get: async () => {
            if (conditions.status === 'pending') {
              // 查询待处理任务
              const [rows] = await pool.execute(
                'SELECT * FROM tasks WHERE planetId = ? AND status = ? ORDER BY createdAt DESC LIMIT ?',
                [conditions.planetId, conditions.status, count]
              );
              return { data: rows };
            } else {
              // 查询所有待处理任务的planetUrl
              const [rows] = await pool.execute(
                'SELECT DISTINCT planetUrl FROM tasks WHERE status = ? LIMIT 10',
                ['pending']
              );
              return { data: rows };
            }
          }
        })
      }),
      field: (fields) => ({
        get: async () => {
          const [rows] = await pool.execute(
            'SELECT DISTINCT planetUrl FROM tasks WHERE status = ? LIMIT 10',
            ['pending']
          );
          return { data: rows };
        }
      }),
      limit: (count) => ({
        get: async () => {
          const [rows] = await pool.execute(
            'SELECT * FROM tasks WHERE planetId = ? AND status = ? LIMIT ?',
            [conditions.planetId, conditions.status, count]
          );
          return { data: rows };
        }
      }),
    }),
    doc: (id) => ({
      update: async ({ data }) => {
        const sets = Object.keys(data).map(key => `${key} = ?`).join(', ');
        const values = [...Object.values(data), id];
        await pool.execute(`UPDATE tasks SET ${sets} WHERE id = ?`, values);
        console.log('[Test] ✅ 任务更新成功');
      },
    }),
  };

  // 注入集合
  taskService.initCollections(tasksCollection);
  console.log('[Test] ✅ 集合注入成功\n');
}

async function testHtmlToPlainText() {
  console.log('═══════════════════════════════════════');
  console.log('测试1: HTML转纯文本');
  console.log('═══════════════════════════════════════\n');

  const testCases = [
    { input: '<p>Hello World</p>', expected: 'Hello World' },
    { input: '<div><p>Line 1</p><p>Line 2</p></div>', expected: 'Line 1\n\nLine 2' },
    { input: 'Plain text without html', expected: 'Plain text without html' },
    { input: '<p>&nbsp;&amp;&lt;&gt;</p>', expected: ' &<>' },
  ];

  let passed = 0;
  testCases.forEach((test, i) => {
    const result = taskService.htmlToPlainText(test.input);
    const success = result === test.expected;
    if (success) passed++;
    
    console.log(`${i + 1}. ${success ? '✅' : '❌'} "${test.input.substring(0, 40)}..."`);
    if (!success) {
      console.log(`   期望: "${test.expected}"`);
      console.log(`   实际: "${result}"`);
    }
  });

  console.log(`\n结果: ${passed}/${testCases.length} 通过\n`);
}

async function testFetchArticle(planetUrl) {
  console.log('═══════════════════════════════════════');
  console.log('测试2: 获取文章内容');
  console.log('═══════════════════════════════════════\n');
  console.log(`星球URL: ${planetUrl}\n`);

  try {
    const article = await taskService.fetchArticle(planetUrl);
    
    console.log('文章信息:');
    console.log(`  - topicId: ${article.topicId}`);
    console.log(`  - title: ${article.title ? article.title.substring(0, 50) : 'N/A'}`);
    console.log(`  - type: ${article.type}`);
    console.log(`  - contentLength: ${article.content.length} 字符`);
    console.log(`  - createTime: ${article.createTime}`);
    
    if (article.author) {
      console.log(`  - author: ${article.author.name}`);
    }
    
    if (article.stats) {
      console.log(`  - likes: ${article.stats.likeCount}, comments: ${article.stats.commentCount}`);
    }
    
    console.log('\n内容预览:');
    console.log('─'.repeat(50));
    console.log(article.content.substring(0, 200) + '...');
    console.log('─'.repeat(50));
    console.log('\n✅ 获取成功！\n');
    
    return article;
  } catch (error) {
    console.error(`❌ 失败: ${error.message}\n`);
    throw error;
  }
}

async function testExtractPlanetId() {
  console.log('═══════════════════════════════════════');
  console.log('测试3: 提取星球ID');
  console.log('═══════════════════════════════════════\n');

  const testCases = [
    { input: 'https://wx.zsxq.com/group/48418518458448', expected: '48418518458448' },
    { input: 'https://wx.zsxq.com/group/28885884288111/', expected: '28885884288111' },
    { input: '48418518458448', expected: '48418518458448' },
  ];

  let passed = 0;
  testCases.forEach((test, i) => {
    const result = taskService.extractPlanetId(test.input);
    const success = result === test.expected;
    if (success) passed++;
    
    console.log(`${i + 1}. ${success ? '✅' : '❌'} "${test.input}"`);
    if (!success) {
      console.log(`   期望: "${test.expected}"`);
      console.log(`   实际: "${result}"`);
    }
  });

  console.log(`\n结果: ${passed}/${testCases.length} 通过\n`);
}

async function testProcessTask(planetUrl) {
  console.log('═══════════════════════════════════════');
  console.log('测试4: 处理任务');
  console.log('═══════════════════════════════════════\n');
  console.log(`星球URL: ${planetUrl}\n`);

  try {
    const result = await taskService.processTask(planetUrl);
    
    console.log('处理结果:');
    console.log(`  - planetId: ${result.planetId}`);
    console.log(`  - status: ${result.status}`);
    
    if (result.status === 'success') {
      console.log(`  - taskId: ${result.taskId}`);
      console.log(`  - articleTitle: ${result.articleTitle ? result.articleTitle.substring(0, 50) : 'N/A'}`);
      console.log(`  - contentLength: ${result.contentLength}`);
      console.log('\n✅ 任务处理成功！');
    } else if (result.status === 'skipped') {
      console.log(`  - reason: ${result.reason}`);
      console.log('\n⏭️ 跳过（无待处理任务）');
    } else if (result.status === 'failed') {
      console.log(`  - error: ${result.error}`);
      console.log('\n❌ 任务处理失败');
    }
    console.log('');
    
    return result;
  } catch (error) {
    console.error(`❌ 异常: ${error.message}\n`);
    throw error;
  }
}

async function testGetPendingTaskUrls() {
  console.log('═══════════════════════════════════════');
  console.log('测试5: 获取待处理任务URL列表');
  console.log('═══════════════════════════════════════\n');

  try {
    const urls = await taskService.getPendingTaskUrls();
    
    console.log(`获取到 ${urls.length} 个待处理任务的URL:`);
    urls.forEach((url, i) => console.log(`  ${i + 1}. ${url}`));
    console.log('');
    
    return urls;
  } catch (error) {
    console.error(`❌ 失败: ${error.message}\n`);
    throw error;
  }
}

async function main() {
  console.log('\n╔═══════════════════════════════════════╗');
  console.log('║     Task 服务模块测试                 ║');
  console.log('╚═══════════════════════════════════════╝\n');

  try {
    // 初始化数据库
    await initDatabase();

    // 测试1: HTML转纯文本
    await testHtmlToPlainText();

    // 测试2: 提取星球ID
    await testExtractPlanetId();

    // 等待1秒避免频率限制
    console.log('等待1秒...\n');
    await new Promise(r => setTimeout(r, 1000));

    // 测试3: 获取文章内容（使用星球1）
    const planetUrl = 'https://wx.zsxq.com/group/48418518458448';
    await testFetchArticle(planetUrl);

    // 等待2秒避免频率限制
    console.log('等待2秒...\n');
    await new Promise(r => setTimeout(r, 2000));

    // 测试4: 获取待处理任务URL
    await testGetPendingTaskUrls();

    // 测试5: 处理任务（如果有待处理任务）
    const pendingUrls = await taskService.getPendingTaskUrls();
    if (pendingUrls.length > 0) {
      await testProcessTask(pendingUrls[0]);
    } else {
      console.log('ℹ️ 没有待处理的任务，跳过测试5\n');
    }

    console.log('═══════════════════════════════════════');
    console.log('✅ 所有测试完成！');
    console.log('═══════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    process.exit(1);
  }
}

main().catch(e => {
  console.error('❌ 测试异常:', e);
  process.exit(1);
});
