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
} = require('./zsxqApi');

// 初始化数据库：有 TCB_ENV 用腾讯云数据库，否则用本地 JSON 文件
let tasksCollection, configCollection;
const hasCloudEnv = process.env.TCB_ENV || process.env.SCF_ENV_NAME;

if (hasCloudEnv) {
  const cloud = require('@cloudbase/node-sdk');
  const app = cloud.init({ env: hasCloudEnv });
  const db = app.database();
  tasksCollection = db.collection('tasks');
  configCollection = db.collection('config');
  console.log(`[Monitor] 数据库模式: CloudBase (${hasCloudEnv})`);
} else {
  const { init } = require(__dirname + '/jsonDb');
  const db = init();
  tasksCollection = db.collection('tasks');
  configCollection = db.collection('config');
  console.log('[Monitor] 数据库模式: 本地JSON (data/)');
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
    const result = await tasksCollection
      .where({
        planetId: groupId,
        topicCreateTime: topicCreateTime,
      })
      .count();

    const exists = result.total > 0;
    if (exists) {
      console.log(`[Monitor] [${groupId}] topicCreateTime=${topicCreateTime} 的任务已存在(共${result.total}条)，跳过`);
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
    const now = new Date();
    await tasksCollection.add({
      data: {
        planetId: taskData.groupId,
        planetName: taskData.planetName || `星球${taskData.groupId}`,
        planetUrl: taskData.planetUrl || '',
        status: 'pending',
        lastUpdateTime: taskData.relativeTime,
        topicCreateTime: taskData.createTime || null,   // 🔑 去重字段：ISO时间戳
        article: '',
        createdAt: now,
        updatedAt: now,
      },
    });
    console.log(`[Monitor] 创建任务成功 [${taskData.groupId}] topicCreateTime=${taskData.createTime}`);
  } catch (error) {
    console.error(`[Monitor] 创建任务失败 [${taskData.groupId}]:`, error.message);
  }
}

/**
 * 从数据库读取监控配置
 */
async function getMonitorConfig() {
  try {
    const urlsDoc = await configCollection.doc('monitorUrls').get();
    const urls = urlsDoc.data?.value || [];
    return { urls };
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
  }
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
