/**
 * Monitor 服务模块
 * 
 * 负责星球监控、任务创建等核心逻辑
 */

const { getGroupPublicInfo, resolveGroupId, formatRelativeTime } = require('./zsxqApi');

let tasksCollection = null;
let configCollection = null;

/**
 * 初始化集合实例
 */
function initCollections(tasks, config) {
  tasksCollection = tasks;
  configCollection = config;
}

/**
 * 检查是否已存在相同topicCreateTime的任务
 */
async function hasTaskWithSameTopicTime(groupId, topicCreateTime) {
  if (!topicCreateTime) return false;
  try {
    const result = await tasksCollection.where({ planetId: groupId, topicCreateTime }).count();
    return result.total > 0;
  } catch (error) {
    console.error(`[Monitor] 查询历史任务失败 [${groupId}]:`, error.message);
    return false;
  }
}

/**
 * 创建监控任务
 */
async function createTask(taskData) {
  try {
    await tasksCollection.add({
      data: {
        planetId: taskData.groupId,
        planetName: taskData.planetName || `星球${taskData.groupId}`,
        planetUrl: taskData.planetUrl || '',
        status: 'pending',
        lastUpdateTime: taskData.relativeTime,
        topicCreateTime: taskData.createTime || null,
        article: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    console.log(`[Monitor] 创建任务成功 [${taskData.groupId}]`);
  } catch (error) {
    console.error(`[Monitor] 创建任务失败 [${taskData.groupId}]:`, error.message);
  }
}

/**
 * 获取监控配置（星球URL列表）
 */
async function getMonitorConfig() {
  try {
    const urlsDoc = await configCollection.doc('monitorUrls').get();
    let val = urlsDoc.data?.value || [];
    // 兼容：如果 value 是 JSON 字符串则解析
    if (typeof val === 'string') { try { val = JSON.parse(val); } catch(e) {} }
    return Array.isArray(val) ? val : [];
  } catch (error) {
    console.error('[Monitor] 获取配置失败:', error.message);
    return [];
  }
}

/**
 * 执行单个星球的监控
 */
async function runMonitor(planetUrl) {
  const groupId = resolveGroupId(planetUrl);
  console.log(`[Monitor] 开始监控 [${groupId}] ${planetUrl}`);

  try {
    const publicInfo = await getGroupPublicInfo(groupId);
    if (!publicInfo.resp_data || !publicInfo.resp_data.group) {
      return { groupId, hasUpdate: false, reason: 'invalid_response' };
    }

    const group = publicInfo.resp_data.group;
    const topicCreateTime = group.latest_topic_create_time;
    if (!topicCreateTime) {
      return { groupId, hasUpdate: false, reason: 'no_time_data' };
    }

    const alreadyHasTask = await hasTaskWithSameTopicTime(groupId, topicCreateTime);
    if (alreadyHasTask) {
      return { groupId, hasUpdate: false, skipped: true, reason: 'same_topic_time_exists', topicCreateTime };
    }

    const relativeTime = formatRelativeTime(topicCreateTime);
    console.log(`[Monitor] ✅ [${groupId}] ${group.name} 发现新帖！`);

    // 异步创建任务，不阻塞返回
    createTask({ groupId, planetName: group.name, planetUrl: planetUrl, relativeTime, createTime: topicCreateTime });

    return {
      groupId, hasUpdate: true, planetName: group.name, relativeTime, createTime: topicCreateTime,
      memberCount: group.statistics?.members?.count, topicCount: group.statistics?.topics?.topics_count,
    };
  } catch (error) {
    console.error(`[Monitor] [${groupId}] 监控出错:`, error.message);
    return { groupId, hasUpdate: false, error: error.message };
  }
}

/**
 * 批量执行监控
 */
async function runBatchMonitor(urls) {
  const results = [];
  for (let i = 0; i < urls.length; i++) {
    const result = await runMonitor(urls[i]);
    results.push(result);
    // 请求间隔，避免触发频率限制
    if (i < urls.length - 1) {
      await new Promise(r => setTimeout(r, 200 + Math.random() * 300));
    }
  }
  return results;
}

module.exports = {
  initCollections,
  hasTaskWithSameTopicTime,
  createTask,
  getMonitorConfig,
  runMonitor,
  runBatchMonitor,
};
