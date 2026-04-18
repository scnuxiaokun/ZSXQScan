/**
 * 执行拉取星球最新文章任务 - 纯 API 版 (v2)
 * 
 * 改造说明:
 * - v1: 连接浏览器 → 调用 GetLastUpdatedArticle(Puppeteer) → DOM解析
 * - v2: 直接调用 zsxqApi 获取话题详情 → 结构化JSON
 * 
 * 优势:
 * - 不需要 browser 参数，纯函数调用
 * - 可利用 Monitor 阶段已记录的 topicId，避免重复查询
 * - 执行速度大幅提升
 */

const { getLatestArticle, fetchLatestArticle } = require('../getLastUpdatedArticle');
const mysql = require('mysql2/promise');

// MySQL 数据库连接
let dbConnection;

async function initDB() {
  if (!dbConnection) {
    const dbConfig = {
      host: process.env.MYSQL_HOST || 'sh-cynosdbmysql-grp-5aqhxbwa.sql.tencentcdb.com',
      port: parseInt(process.env.MYSQL_PORT) || 22871,
      user: process.env.MYSQL_USER || 'zsxq_scan_dbuser',
      password: process.env.MYSQL_PASSWORD || 'zsxq@123',
      database: process.env.MYSQL_DATABASE || 'temu-tools-prod-3g8yeywsda972fae',
    };
    
    console.log('[LoopTask] 正在连接 MySQL 数据库...');
    dbConnection = await mysql.createConnection(dbConfig);
    console.log('[LoopTask] ✅ MySQL 数据库连接成功');
  }
  return dbConnection;
}

async function closeDB() {
  if (dbConnection) {
    await dbConnection.end();
    console.log('[LoopTask] 🔒 MySQL 连接已关闭');
    dbConnection = null;
  }
}

/**
 * 从数据库读取 Cookie 配置
 */
async function getCookieFromDB() {
  try {
    const conn = await initDB();
    const [rows] = await conn.query(
      'SELECT `value` FROM `config` WHERE `id` = ? LIMIT 1',
      ['zsxq_cookie']
    );
    
    if (rows.length === 0) {
      console.warn('[LoopTask] ⚠️ 数据库中未找到 zsxq_cookie 配置');
      return null;
    }
    
    let value = rows[0].value;
    // 尝试解析 JSON
    try {
      value = JSON.parse(value);
      if (typeof value === 'object' && value !== null && value.value !== undefined) {
        value = value.value;
      }
    } catch (e) {
      // 不是 JSON，直接使用
    }
    
    return value;
  } catch (error) {
    console.error('[LoopTask] 读取 Cookie 失败:', error.message);
    return null;
  }
}

/**
 * 从URL中提取星球ID
 */
function extractPlanetId(url) {
  const parts = url.replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || url;
}

/**
 * 查询待处理的任务
 */
async function getPendingTask(planetId) {
  try {
    const conn = await initDB();
    const [rows] = await conn.query(
      'SELECT * FROM `tasks` WHERE `planetId` = ? AND `status` = ? ORDER BY `createdAt` DESC LIMIT 1',
      [planetId, 'pending']
    );

    if (rows.length > 0) {
      return rows[0];
    }
    return null;
  } catch (error) {
    console.error(`[LoopTask] 查询任务失败 [${planetId}]:`, error.message);
    return null;
  }
}

/**
 * 更新任务状态和文章内容
 */
async function updateTask(taskId, updateData) {
  try {
    const conn = await initDB();
    const now = new Date();
    
    const fields = [];
    const values = [];
    
    for (const [key, value] of Object.entries(updateData)) {
      fields.push(`\`${key}\` = ?`);
      values.push(value);
    }
    
    fields.push('`updatedAt` = ?');
    values.push(now);
    values.push(taskId);
    
    await conn.query(
      `UPDATE \`tasks\` SET ${fields.join(', ')} WHERE \`id\` = ?`,
      values
    );
    
    console.log(`[LoopTask] 任务更新成功 [${taskId}]`);
  } catch (error) {
    console.error(`[LoopTask] 任务更新失败 [${taskId}]:`, error.message);
  }
}

/**
 * 处理单个星球的拉取任务（纯API方式）
 * 
 * @param {string} planetUrl 星球URL或ID
 * @returns {Promise<Object>} 处理结果
 */
async function processPlanetTask(planetUrl) {
  const planetId = extractPlanetId(planetUrl);
  console.log(`[LoopTask] 开始处理星球 [${planetId}] ${planetUrl}`);

  try {
    // 步骤1：检查是否有未开始的任务
    const task = await getPendingTask(planetId);

    if (!task) {
      console.log(`[LoopTask] [${planetId}] 没有待处理任务，跳过`);
      return { planetId, status: 'skipped', reason: 'no_pending_task' };
    }

    console.log(
      `[LoopTask] [${planetId}] 发现待处理任务 ` +
      `ID:${task.id}, 创建于:${task.createdAt}` +
      (task.topicId ? `, TopicId:${task.topicId}` : '')
    );

    // 步骤2：获取最新文章
    // 如果任务中已经记录了 topicId（Monitor阶段写入），直接使用以提高效率
    const articleData = task.topicId
      ? await getLatestArticle(planetUrl, task.topicId)
      : await fetchLatestArticle(planetUrl);

    // 步骤3：更新任务数据（存入结构化JSON）
    await updateTask(task.id, {
      status: 'completed',
      article: JSON.stringify(articleData),
      articleTitle: articleData.title,
      articleLength: articleData.content.length,
      topicId: articleData.topicId,
      topicType: articleData.type,
    });

    console.log(
      `[LoopTask] [${planetId}] ✅ 获取文章成功, ` +
      `标题:"${articleData.title}", ` +
      `长度:${articleData.content.length}, 类型:${articleData.type}`
    );

    return {
      planetId,
      status: 'success',
      taskId: task.id,
      articleTitle: articleData.title,
      articleLength: articleData.content.length,
      topicId: articleData.topicId,
      topicType: articleData.type,
    };

  } catch (error) {
    console.error(`[LoopTask] [${planetId}] 处理出错:`, error.message);

    // 标记任务为失败状态
    const task = await getPendingTask(planetId);
    if (task) {
      await updateTask(task.id, {
        status: 'failed',
        errorMsg: error.message,
      });
    }

    return {
      planetId,
      status: 'failed',
      error: error.message,
    };
  }
}

/**
 * 云函数主入口
 * 
 * 入口签名不变，不再需要 browser 参数！
 * 
 * 支持两种调用方式：
 * 1. 定时触发器触发 — 自动处理所有待处理任务
 * 2. 手动调用 — 可传入参数指定某个星球URL
 */
exports.main = async (event, context) => {
  console.log('[LoopTask] ===== 开始执行文章拉取任务 (API模式) =====');
  console.log('[LoopTask] Event:', JSON.stringify(event));

  try {
    // 初始化数据库连接
    await initDB();
    
    // 从数据库读取 Cookie 并设置到环境变量
    const cookie = await getCookieFromDB();
    if (cookie) {
      process.env.ZSXQ_COOKIE = cookie;
      console.log('[LoopTask] ✅ Cookie 已从数据库加载');
    } else {
      console.error('[LoopTask] ❌ 未找到 Cookie，无法获取文章内容');
      return { code: -1, message: '未配置 Cookie', data: [] };
    }

    // 确定要处理的星球URL列表
    let urlsToProcess = [];

    if (event && event.planetUrl) {
      // 手动指定了URL
      urlsToProcess = [event.planetUrl];
    } else {
      // 从数据库中查询所有待处理任务的星球URL
      try {
        const conn = await initDB();
        const [pendingTasks] = await conn.query(
          'SELECT DISTINCT `planetUrl`, `topicId` FROM `tasks` WHERE `status` = ?',
          ['pending']
        );

        // 去重
        const urlSet = new Set();
        for (const task of pendingTasks) {
          if (task.planetUrl) {
            urlSet.add(task.planetUrl);
          }
        }
        urlsToProcess = Array.from(urlSet);
      } catch (e) {
        console.error('[LoopTask] 查询待处理任务失败:', e.message);
      }
    }

    if (urlsToProcess.length === 0) {
      console.log('[LoopTask] 没有需要处理的任务');
      return { code: 0, message: '没有需要处理的任务', data: [] };
    }

    // 逐个处理
    const results = [];
    for (const url of urlsToProcess) {
      const result = await processPlanetTask(url);
      results.push(result);

      // 请求间加随机延迟
      if (urlsToProcess.indexOf(url) < urlsToProcess.length - 1) {
        await sleep(800 + Math.random() * 1200);
      }
    }

    console.log('[LoopTask] ===== 文章拉取任务完成 =====');
    return {
      code: 0,
      message: '任务完成',
      mode: 'api',
      data: results,
    };

  } catch (error) {
    console.error('[LoopTask] 执行出错:', error);
    return { code: -1, message: error.message };
  } finally {
    // 关闭数据库连接
    await closeDB();
  }
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
