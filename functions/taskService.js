q/**
 * Task 服务模块
 * 
 * 负责任务处理、文章获取等核心逻辑
 */

const { getTopics, getTopicDetail, resolveGroupId } = require('./zsxqApi');
const { notifyArticleCompleted } = require('./feishuNotifier');
const { htmlToPlainText } = require('./htmlToPlainText');

let tasksCollection = null;

/**
 * 初始化集合实例
 */
function initCollections(tasks) {
  tasksCollection = tasks;
}


/**
 * 解析文章详情
 */
function parseArticleDetail(apiResponse, topicId) {
  const topic = apiResponse.resp_data?.topic || apiResponse.topic || apiResponse.data || apiResponse;
  let content = topic.text ? htmlToPlainText(topic.text) : (topic.talk?.text || topic.text_summary || '');
  let title = topic.title || topic.subject || '';
  if (!title && content) title = content.split('\n')[0].trim().substring(0, 80);

  return {
    topicId: topicId || topic.id,
    url: topicId ? `https://wx.zsxq.com/topic/${topicId}` : '',
    title, content,
    type: topic.type || 'talk',
    createTime: topic.created_time ? new Date(topic.created_time).toISOString() : null,
    author: topic.owner ? { id: topic.owner.id, name: topic.owner.name, avatar: topic.owner.avatar } : null,
    stats: { likeCount: topic.like_count || 0, commentCount: topic.comment_count || 0 },
    images: (topic.images || []).map(img => ({ url: img.url || img })),
    files: (topic.files || []).map(file => ({ name: file.name, url: file.url, size: file.size })),
    raw: topic,
  };
}

/**
 * 获取文章内容
 */
async function fetchArticle(planetUrl, topicId) {
  let targetTopicId = topicId;
  if (!targetTopicId) {
    const groupId = resolveGroupId(planetUrl);
    const topicsResult = await getTopics(groupId, { count: 1 });
    // 处理不同的响应结构
    const topics = topicsResult.resp_data?.topics || topicsResult.topics || topicsResult.data;
    const latest = Array.isArray(topics) ? topics[0] : null;
    // topic_uid 是字符串ID，topic_id 是数字ID
    const extractedTopicId = latest?.topic_uid || latest?.id || latest?.topic_id;
    if (!extractedTopicId) throw new Error('未能获取到最新话题ID');
    targetTopicId = extractedTopicId;
  }

  const detail = await getTopicDetail(targetTopicId);
  return parseArticleDetail(detail, targetTopicId);
}

/**
 * 从URL提取星球ID
 */
function extractPlanetId(url) {
  return url.replace(/\/+$/, '').split('/').pop() || url;
}

/**
 * 处理单个星球的任务
 */
async function processTask(planetUrl) {
  const planetId = extractPlanetId(planetUrl);

  try {
    // 先查询pending状态的任务
    let pendingResult = await tasksCollection
      .where({ planetId, status: 'pending' }).orderBy('createdAt', 'desc').limit(1).get();
    
    // 如果没有pending任务，则查询failed状态的任务
    if (!pendingResult.data?.length) {
      pendingResult = await tasksCollection
        .where({ planetId, status: 'failed' }).orderBy('createdAt', 'desc').limit(1).get();
    }

    if (!pendingResult.data?.length) {
      return { planetId, status: 'skipped', reason: 'no_pending_task' };
    }

    const task = pendingResult.data[0];
    // MySQL 模式下主键是 id，CloudBase 模式下是 _id
    const taskId = task.id || task._id;
    const articleData = task.topicId ? await fetchArticle(planetUrl, task.topicId) : await fetchArticle(planetUrl);

    await tasksCollection.doc(taskId).update({
      data: { 
        status: 'completed', 
        article: JSON.stringify(articleData), 
        articleTitle: articleData.title,
        articleLength: articleData.content.length, 
        topicId: articleData.topicId, 
        topicType: articleData.type,
        updatedAt: new Date() 
      },
    });

    // 发送飞书通知（异步，不阻塞返回）
    notifyArticleCompleted(
      { planetId, status: 'success', taskId, articleTitle: articleData.title },
      articleData
    ).catch(e => console.error('[Feishu] 通知失败:', e.message));

    return { 
      planetId, 
      status: 'success', 
      taskId: taskId, 
      articleTitle: articleData.title, 
      contentLength: articleData.content.length 
    };

  } catch (error) {
    // 尝试标记失败
    try {
      let taskResult = await tasksCollection.where({ planetId, status: 'pending' }).limit(1).get();
      if (!taskResult.data?.length) {
        taskResult = await tasksCollection.where({ planetId, status: 'failed' }).limit(1).get();
      }
      if (taskResult.data?.length) {
        const taskId = taskResult.data[0].id || taskResult.data[0]._id;
        await tasksCollection.doc(taskId).update({ 
          data: { 
            status: 'failed', 
            errorMsg: error.message, 
            updatedAt: new Date() 
          } 
        });
      }
    } catch (e) { /* ignore */ }
    return { planetId, status: 'failed', error: error.message };
  }
}

/**
 * 批量处理任务
 */
async function processBatchTasks(urls) {
  const results = [];
  for (const url of urls) {
    const result = await processTask(url);
    results.push(result);
    // 请求间隔，避免触发频率限制
    await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));
  }
  return results;
}

/**
 * 获取待处理任务的星球URL列表（包括pending和failed状态）
 */
async function getPendingTaskUrls() {
  // 分别查询pending和failed状态（避免共享collection实例导致条件覆盖）
  const pendingResult = await tasksCollection.where({ status: 'pending' }).field({ planetUrl: true }).get();
  const failedResult = await tasksCollection.where({ status: 'failed' }).field({ planetUrl: true }).get();
  
  const urlSet = new Set();
  if (pendingResult.data) {
    pendingResult.data.forEach(t => t.planetUrl && urlSet.add(t.planetUrl));
  }
  if (failedResult.data) {
    failedResult.data.forEach(t => t.planetUrl && urlSet.add(t.planetUrl));
  }
  return Array.from(urlSet);
}

module.exports = {
  initCollections,
  parseArticleDetail,
  fetchArticle,
  extractPlanetId,
  processTask,
  processBatchTasks,
  getPendingTaskUrls,
};
