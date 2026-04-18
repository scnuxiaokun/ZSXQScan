/**
 * 获取星球最新文章内容 - 纯 API 版 (v2)
 * 
 * 改造说明:
 * - v1: 使用 Puppeteer 打开已登录的星球页面 → 解析DOM → 点击"展开全部" → 提取文本
 * - v2: 直接调用 api.zsxq.com/v2/topics/{topicId} 接口获取结构化数据
 *        文本内容在 topic.text 或 topic.text_summary 字段中，无需"展开"
 * 
 * 优势:
 * - 无需浏览器，纯HTTP调用
 * - 速度从 10-30s 降至 <1s
 * - 直接返回结构化数据（标题、正文、图片、附件、评论数等）
 */

const { getTopicDetail, getTopics, resolveGroupId } = require('../zsxqApi');

/**
 * 获取指定星球的最新文章（通过API）
 * 
 * @param {string} planetUrl 星球完整URL或星球ID
 * @param {string} [topicId] 可选：直接指定话题ID（如果有）
 * @returns {Promise<Object>} 文章数据
 */
async function getLatestArticle(planetUrl, topicId) {
  console.log(`[GetArticle] 开始获取文章, URL: ${planetUrl}, TopicId: ${topicId || '(自动检测)'}`);

  let targetTopicId = topicId;

  try {
    // 步骤1：如果没有传入 topicId，先通过 getTopics 获取最新的话题ID
    if (!targetTopicId) {
      const groupId = resolveGroupId(planetUrl);
      console.log(`[GetArticle] 未提供topicId, 通过API查询 [${groupId}] 最新话题...`);

      const topicsResult = await getTopics(groupId, { count: 1 });
      
      // 打印API返回的原始数据结构（调试用）
      console.log('[GetArticle] API返回数据结构:', JSON.stringify({
        has_topics: !!topicsResult.topics,
        topics_length: topicsResult.topics?.length || 0,
        has_resp_data: !!topicsResult.resp_data,
        has_resp_data_topics: !!(topicsResult.resp_data && topicsResult.resp_data.topics),
        resp_data_topics_length: topicsResult.resp_data?.topics?.length || 0,
        has_data: !!topicsResult.data,
        data_is_array: Array.isArray(topicsResult.data),
        data_length: Array.isArray(topicsResult.data) ? topicsResult.data.length : 0,
        keys: Object.keys(topicsResult).slice(0, 10),
      }, null, 2));
      
      let latestTopic = null;
      // 尝试多种可能的数据结构
      if (topicsResult.topics && topicsResult.topics.length > 0) {
        latestTopic = topicsResult.topics[0];
      } else if (topicsResult.resp_data && topicsResult.resp_data.topics && topicsResult.resp_data.topics.length > 0) {
        latestTopic = topicsResult.resp_data.topics[0];
      } else if (Array.isArray(topicsResult.data)) {
        latestTopic = topicsResult.data[0];
      }

      if (!latestTopic || (!latestTopic.id && !latestTopic.topic_id)) {
        console.error('[GetArticle] 未能找到话题，完整响应:', JSON.stringify(topicsResult, null, 2).substring(0, 500));
        throw new Error('未能获取到最新话题ID');
      }

      // 兼容不同的 ID 字段名
      // 注意：getTopicDetail 可能需要 topic_uid 而不是 topic_id
      targetTopicId = latestTopic.topic_uid || latestTopic.id || latestTopic.topic_id;
      console.log(`[GetArticle] 检测到最新话题 ID=${targetTopicId} (topic_uid=${latestTopic.topic_uid}, topic_id=${latestTopic.topic_id})`);
    }

    // 步骤2：调用话题详情接口获取完整文章内容
    console.log(`[GetArticle] 获取话题详情...`);
    const detail = await getTopicDetail(targetTopicId);

    // 步骤3：解析和标准化文章数据
    const articleData = parseArticleDetail(detail, targetTopicId);

    console.log(
      `[GetArticle] ✅ 成功获取文章, ` +
      `标题:"${articleData.title}", ` +
      `正文长度:${articleData.content.length}, ` +
      `类型:${articleData.type}`
    );

    return articleData;

  } catch (error) {
    error.errorMsg = `[GetArticle] 获取文章出错: ${error.message}`;
    console.error(error.errorMsg);
    throw error;
  }
}

/**
 * 将 API 原始响应解析为标准化的文章格式
 * 
 * API 返回的 topic 结构 (大致):
 * {
 *   id: "话题ID",
 *   type: "talk|question|answer|vote|file",
 *   created_time: 1712000000000,
 *   text: "文章正文(HTML或Markdown)",
 *   text_summary: "摘要文本(纯文本)",
 *   images: [{ url, ... }],
 *   files: [{ name, url, size }],
 *   like_count: 42,
 *   comment_count: 10,
 *   group: { id, name },
 *   owner: { id, name, avatar }
 * }
 * 
 * @param {Object} apiResponse API原始响应
 * @param {string} topicId 话题ID
 * @returns {Object} 标准化文章对象
 */
function parseArticleDetail(apiResponse, topicId) {
  // 兼容不同的响应结构
  // API 返回格式: { succeeded: true, resp_data: { topic: {...} } }
  const respData = apiResponse.resp_data || apiResponse;
  const topic = respData.topic || apiResponse.topic || apiResponse.data || apiResponse;
  
  // 调试日志：打印实际解析到的topic结构
  console.log('[ParseArticle] 解析话题数据:', JSON.stringify({
    has_resp_data: !!apiResponse.resp_data,
    has_topic_in_resp_data: !!(respData && respData.topic),
    topic_keys: Object.keys(topic).slice(0, 15),
  }, null, 2));

  // 提取正文 — 优先级: text > text_summary > solution.text > 纯文本提取
  let content = '';
  if (topic.text) {
    // text 可能是 HTML 或 Markdown，需要清理为纯文本
    content = htmlToPlainText(topic.text);
  } else if (topic.text_summary) {
    content = topic.text_summary;
  } else if (topic.solution && topic.solution.text) {
    // solution 类型的话题，内容在 solution.text 中
    content = htmlToPlainText(topic.solution.text);
  } else if (topic.content) {
    content = typeof topic.content === 'string'
      ? htmlToPlainText(topic.content)
      : JSON.stringify(topic.content);
  }

  // 提取标题 — 知识星球的话题不一定有独立标题
  // 通常取正文前50个字符作为"标题"
  let title = topic.title || topic.subject || '';
  if (!title && content) {
    // 取正文第一行或前50字作为标题
    title = content.split('\n')[0].trim().substring(0, 80);
    // 如果第一行太短，尝试找更有意义的部分
    if (title.length < 5) {
      title = content.substring(0, 80).trim();
    }
  }

  // 提取时间信息
  let createTime = null;
  if (topic.created_time || topic.create_time) {
    createTime = new Date(topic.created_time || topic.create_time).toISOString();
  } else if (topic.createTime) {
    createTime = new Date(topic.createTime).toISOString();
  }

  // 图片列表
  const images = (topic.images || []).map(img => ({
    url: img.url || img.large_url || img,
    width: img.width,
    height: img.height,
  }));

  // 附件列表
  const files = (topic.files || []).map(file => ({
    name: file.name || file.file_name,
    url: file.url || file.download_url,
    size: file.size || file.file_size,
    type: file.type || file.mime_type,
  }));

  // 话题类型
  const type = topic.type || 'talk'; // talk=普通帖 question=问答 vote=投票 file=文件

  return {
    topicId: topicId || topic.id,
    url: topicId ? `https://wx.zsxq.com/topic/${topicId}` : '',
    title,
    content,
    type,
    
    // 元信息
    createTime,
    author: topic.owner || topic.user || (topic.user_specific && topic.user_specific.user) ? {
      id: (topic.owner && topic.owner.id) || (topic.user && topic.user.id) || (topic.user_specific && topic.user_specific.user && topic.user_specific.user.id),
      name: (topic.owner && (topic.owner.name || topic.owner.nick)) || 
            (topic.user && (topic.user.name || topic.user.nick)) || 
            (topic.user_specific && topic.user_specific.user && (topic.user_specific.user.name || topic.user_specific.user.nick)),
      avatar: (topic.owner && (topic.owner.avatar || topic.owner.avatar_url)) || 
              (topic.user && (topic.user.avatar || topic.user.avatar_url)) ||
              (topic.user_specific && topic.user_specific.user && (topic.user_specific.user.avatar || topic.user_specific.user.avatar_url)),
    } : null,

    // 互动数据
    stats: {
      likeCount: topic.like_count || 0,
      commentCount: topic.comment_count || 0,
      viewCount: topic.view_count || 0,
    },

    // 附件
    images,
    files,
    
    // 原始数据（保留用于调试或扩展处理）
    raw: topic,
  };
}

/**
 * 将 HTML/富文本转换为纯文本
 * 
 * @param {string} html HTML字符串
 * @returns {string} 纯文本
 */
function htmlToPlainText(html) {
  if (!html || typeof html !== 'string') return '';

  // 如果已经是纯文本（没有HTML标签），直接返回
  if (!/<\/?[a-z][\s\S]*>/i.test(html)) return html.trim();

  // 简易HTML标签清理（不引入额外依赖如 cheerio）
  let text = html
    // 替换块级元素为换行
    .replace(/<\/?(p|div|h[1-6]|br|li|tr)[^>]*>/gi, '\n')
    // 移除所有其他标签
    .replace(/<[^>]+>/g, '')
    // 清理多余空白
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // 压缩连续空格和换行
    .replace(/[ \t]+/g, ' ')
    .trim();

  return text;
}

/**
 * 完整流程：获取文章一站式方法（对外接口不变）
 * 
 * @param {string} planetUrl 星球URL
 * @returns {Promise<Object>} 标准化文章数据
 */
async function fetchLatestArticle(planetUrl) {
  return getLatestArticle(planetUrl, null);
}

module.exports = {
  getLatestArticle,
  fetchLatestArticle,
  parseArticleDetail,
  htmlToPlainText,
};
