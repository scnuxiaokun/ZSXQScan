/**
 * 监控星球更新 - 纯 API 版
 *
 * 使用 pub-api.zsxq.com 公开接口检测更新:
 *  - 无需 Cookie、无需签名、无需任何认证
 *  - 付费星球/免费星球均可访问
 *  - 返回精确到毫秒的 topicCreateTime（最新话题时间戳）
 *  - 封号风险: 零（跟你的登录账号完全无关）
 *
 * 架构:
 *   Monitor (pub-api, 无认证) → 检测到新帖(topicCreateTime 变化)
 *     → GetArticle (api.zsxq.com, 带Cookie) → 获取全文
 *
 * 去重逻辑:
 *   通过 topicCreateTime 去重 — 只要任务表中不存在该时间戳的任务就创建，
 *   无论任务状态是 pending/completed/failed
 */

const {
  getGroupPublicInfo,   // 公开接口（无认证）
  resolveGroupId,
  formatRelativeTime,
} = require('../zsxqApi');

// MySQL 数据库连接
const mysql = require('mysql2/promise');

let dbConnection;

/**
 * 初始化 MySQL 数据库连接
 */
async function initDB() {
  if (!dbConnection) {
    const dbConfig = {
      host: process.env.MYSQL_HOST || 'sh-cynosdbmysql-grp-5aqhxbwa.sql.tencentcdb.com',
      port: parseInt(process.env.MYSQL_PORT) || 22871,
      user: process.env.MYSQL_USER || 'zsxq_scan_dbuser',
      password: process.env.MYSQL_PASSWORD || 'zsxq@123',
      database: process.env.MYSQL_DATABASE || 'temu-tools-prod-3g8yeywsda972fae',
    };
    
    console.log('[Monitor] 正在连接 MySQL 数据库...');
    dbConnection = await mysql.createConnection(dbConfig);
    console.log('[Monitor] ✅ MySQL 数据库连接成功');
  }
  return dbConnection;
}

/**
 * 关闭数据库连接
 */
async function closeDB() {
  if (dbConnection) {
    await dbConnection.end();
    console.log('[Monitor] 🔒 MySQL 连接已关闭');
    dbConnection = null;
  }
}

// ==================== 辅助函数 ====================

/**
 * 检查该星球是否已存在相同 topicCreateTime 的任务
 * 
 * 去重逻辑（v2.2）:
 *   - 不只看 pending 状态，而是看 topicCreateTime 是否已存在
 *   - 无论任务是 pending/completed/failed，只要 topicCreateTime 一致
 *     说明星球最新帖子没变 → 不需要创建新任务
 * 
 * @param {string} groupId 星球ID
 * @param {string} topicCreateTime 最新话题的创建时间戳（ISO格式字符串）
 * @returns {Promise<boolean>} true = 已存在该时间的任务，无需创建
 */
async function hasTaskWithSameTopicTime(groupId, topicCreateTime) {
  if (!topicCreateTime) return false;

  try {
    const conn = await initDB();
    const [rows] = await conn.query(
      'SELECT COUNT(*) as count FROM `tasks` WHERE `planetId` = ? AND `topicCreateTime` = ?',
      [groupId, topicCreateTime]
    );

    const exists = rows[0].count > 0;
    if (exists) {
      console.log(`[Monitor] [${groupId}] topicCreateTime=${topicCreateTime} 的任务已存在(共${rows[0].count}条)，跳过`);
    }
    return exists;
  } catch (error) {
    console.error(`[Monitor] 查询历史任务失败 [${groupId}]:`, error.message);
    return false;
  }
}

/**
 * 创建文章拉取任务到数据库
 * 
 * topicCreateTime 使用 API 原始返回值（ISO 8601 字符串），
 * 作为去重键：同一时间戳 = 同一篇最新帖子，不重复创建
 */
async function createTask(taskData) {
  try {
    const conn = await initDB();
    const now = new Date();
    
    // 生成唯一ID
    const taskId = `mo${Date.now().toString(36)}${Math.random().toString(36).substr(2, 9)}`;
    
    await conn.query(
      'INSERT INTO `tasks` (`id`, `planetId`, `planetName`, `planetUrl`, `status`, `lastUpdateTime`, `topicCreateTime`, `article`, `createdAt`, `updatedAt`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        taskId,
        taskData.groupId,
        taskData.planetName || `星球${taskData.groupId}`,
        taskData.planetUrl || '',
        'pending',
        taskData.relativeTime,
        taskData.createTime || null,
        '',
        now,
        now,
      ]
    );
    
    console.log(`[Monitor] 创建任务成功 [${taskData.groupId}] id=${taskId} topicCreateTime=${taskData.createTime}`);
  } catch (error) {
    console.error(`[Monitor] 创建任务失败 [${taskData.groupId}]:`, error.message);
  }
}

/**
 * 从数据库读取监控配置
 */
async function getMonitorConfig() {
  try {
    const conn = await initDB();
    const [rows] = await conn.query(
      'SELECT `value` FROM `config` WHERE `id` = ? LIMIT 1',
      ['monitorUrls']
    );
    
    if (rows.length === 0) {
      return { urls: [] };
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
    
    return { urls: Array.isArray(value) ? value : [] };
  } catch (error) {
    console.error('[Monitor] 获取配置失败，使用默认值:', error.message);
    return { urls: [] };
  }
}

// ==================== 核心：监控单个星球 ====================

/**
 * 监控单个星球 — 使用公开接口，零认证零风险
 * 
 * @param {string} planetUrl 星球URL或ID (如 "https://wx.zsxq.com/group/48418518458448" 或 "48418518458448")
 * @returns {Promise<Object>} 监控结果
 */
async function monitorPlanet(planetUrl) {
  const groupId = resolveGroupId(planetUrl);

  console.log(`[Monitor] 开始监控 [${groupId}] ${planetUrl} 🔓(公开接口)`);

  try {
    // 步骤1：调用公开接口获取星球信息（🔑 核心！无需任何认证）
    const publicInfo = await getGroupPublicInfo(groupId);

    // 步骤2：解析返回数据
    if (!publicInfo.resp_data || !publicInfo.resp_data.group) {
      console.warn(`[Monitor] [${groupId}] 公开接口返回数据异常`);
      return { groupId, url: planetUrl, hasUpdate: false, reason: 'invalid_response' };
    }

    const group = publicInfo.resp_data.group;
    const planetName = group.name;
    const topicCreateTime = group.latest_topic_create_time;

    if (!topicCreateTime) {
      console.warn(`[Monitor] [${groupId}] 未返回 topicCreateTime`);
      return { groupId, url: planetUrl, hasUpdate: false, reason: 'no_time_data' };
    }

    // 步骤3：去重检查 — 查找该 topicCreateTime 是否已有任务
    // 无论任务状态是 pending/completed/failed，只要时间戳一致就说明是同一篇帖子
    const alreadyHasTask = await hasTaskWithSameTopicTime(groupId, topicCreateTime);
    if (alreadyHasTask) {
      return { 
        groupId, url: planetUrl, hasUpdate: false, skipped: true, 
        reason: 'same_topic_time_exists',
        topicCreateTime,
      };
    }

    // 步骤4：记录日志并创建拉取任务
    const relativeTime = formatRelativeTime(topicCreateTime);

    console.log(
      `[Monitor] [${groupId}] ${planetName} | ` +
      `最新更新: ${relativeTime} (${topicCreateTime}) | ` +
      `新帖 ✅`
    );

    console.log(`[Monitor] ✅ [${groupId}] ${planetName} 发现新帖！创建拉取任务...`);

    createTask({
      groupId,
      planetName,
      planetUrl,
      relativeTime,
      createTime: topicCreateTime,
    });

    return {
      groupId,
      url: planetUrl,
      planetName,
      hasUpdate: true,
      relativeTime,
      createTime: topicCreateTime,
      // 额外信息（公开接口免费送的）
      memberCount: group.statistics?.members?.count,
      topicCount: group.statistics?.topics?.topics_count,
      groupType: group.type,
    };

  } catch (error) {
    // 公开接口出错时的处理
    console.error(`[Monitor] [${groupId}] 监控出错:`, error.message);

    // 区分不同类型的错误
    if (error.message.includes('401') || error.message.includes('403')) {
      return {
        groupId, url: planetUrl, hasUpdate: false,
        error: 'auth_required', errorMsg: '公开接口需要认证（不应该发生）',
      };
    }

    if (error.message.includes('404') || error.message.includes('not found')) {
      return {
        groupId, url: planetUrl, hasUpdate: false,
        error: 'group_not_found', errorMsg: '星球不存在或ID错误',
      };
    }

    if (error.message.includes('timeout') || error.message.includes('network')) {
      return {
        groupId, url: planetUrl, hasUpdate: false,
        error: 'network', errorMsg: error.message,
      };
    }

    return {
      groupId, url: planetUrl, hasUpdate: false,
      error: 'unknown', errorMsg: error.message,
    };
  }
}

// ==================== 云函数入口 ====================

exports.main = async (event, context) => {
  const startTime = Date.now();
  console.log('[Monitor] ===== 开始一轮监控 =====');
  console.log('[Monitor] Event:', JSON.stringify(event));

  try {
    // 初始化数据库连接
    await initDB();

    // 获取监控列表
    let monitorUrls;

    if (event && event.planetUrl) {
      // 单个星球手动触发
      monitorUrls = [event.planetUrl];
    } else {
      // 定时触发：从数据库读配置
      const config = await getMonitorConfig();
      monitorUrls = config.urls;

      if (monitorUrls.length === 0) {
        console.warn('[Monitor] ⚠️ 没有配置监控URL');
        return { code: 0, message: '没有需要监控的星球', data: [], mode: 'pub-api' };
      }
    }

    console.log(`[Monitor] 📋 监控 ${monitorUrls.length} 个星球 (pub-api · 无认证 · 零风险)`);

    // 逐个监控（串行执行，避免并发过高）
    const results = [];
    for (let i = 0; i < monitorUrls.length; i++) {
      const url = monitorUrls[i];
      const result = await monitorPlanet(url);
      results.push(result);

      // 星球间加个小延迟，避免请求过于密集（虽然公开接口不需要，但保持礼貌）
      if (i < monitorUrls.length - 1) {
        await sleep(200 + Math.random() * 300);
      }
    }

    // 最终统计
    const updateCount = results.filter(r => r.hasUpdate).length;
    const skipCount = results.filter(r => r.skipped).length;
    const errorCount = results.filter(r => r.error).length;
    const elapsed = Date.now() - startTime;

    console.log(
      `[Monitor] ===== 本轮完成 (${elapsed}ms): ` +
      `✅${updateCount}更新 | ⏭️${skipCount}跳过 | ❌${errorCount}错误 =====`
    );

    return {
      code: 0,
      message: '监控完成',
      mode: 'pub-api',           // 使用公开接口
      authRequired: false,       // 不需要任何认证
      elapsedMs: elapsed,
      data: results,
    };

  } catch (error) {
    console.error('[Monitor] 执行出错:', error);
    return { code: -1, message: error.message };
  } finally {
    // 关闭数据库连接
    await closeDB();
  }
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
