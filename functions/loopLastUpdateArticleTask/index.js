/**
 * 执行拉取星球最新文章任务 - 云函数入口
 * 
 * 功能：
 * 1. 从URL中提取星球ID
 * 2. 检查任务表中是否有该星球ID的"未开始"任务
 * 3. 如果有，则调用获取最新文章功能
 * 4. 将文章内容写入任务表，更新状态为"完成"
 */

const cloud = require('@cloudbase/node-sdk');

// 初始化云开发SDK
const app = cloud.init({
  env: process.env.TCB_ENV || process.env.SCF_ENV_NAME,
});

const db = app.database();
const tasksCollection = db.collection('tasks');

const { fetchLatestArticle } = require('../getLastUpdatedArticle');

/**
 * 从URL中提取星球ID
 */
function extractPlanetId(url) {
  const parts = url.replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || url;
}

/**
 * 查询待处理的任务
 * 
 * @param {string} planetId 星球ID
 * @returns {Promise<Object|null>} 任务记录
 */
async function getPendingTask(planetId) {
  try {
    const result = await tasksCollection
      .where({
        planetId: planetId,
        status: 'pending',
      })
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    
    if (result.data && result.data.length > 0) {
      return result.data[0];
    }
    return null;
  } catch (error) {
    console.error(`[LoopTask] 查询任务失败 [${planetId}]:`, error.message);
    return null;
  }
}

/**
 * 更新任务状态和文章内容
 * 
 * @param {string} taskId 任务ID（_id）
 * @param {Object} updateData 更新数据
 */
async function updateTask(taskId, updateData) {
  try {
    await tasksCollection.doc(taskId).update({
      data: {
        ...updateData,
        updatedAt: new Date(),
      },
    });
    console.log(`[LoopTask] 任务更新成功 [${taskId}]`);
  } catch (error) {
    console.error(`[LoopTask] 任务更新失败 [${taskId}]:`, error.message);
  }
}

/**
 * 处理单个星球的拉取任务
 * 
 * @param {import('puppeteer-core').Browser} browser 已登录的浏览器实例
 * @param {string} planetUrl 星球URL
 * @returns {Promise<Object>} 处理结果
 */
async function processPlanetTask(browser, planetUrl) {
  const planetId = extractPlanetId(planetUrl);
  console.log(`[LoopTask] 开始处理星球 [${planetId}] ${planetUrl}`);
  
  try {
    // 步骤1：检查是否有未开始的任务
    const task = await getPendingTask(planetId);
    
    if (!task) {
      console.log(`[LoopTask] [${planetId}] 没有待处理任务，跳过`);
      return { planetId, status: 'skipped', reason: 'no_pending_task' };
    }
    
    console.log(`[LoopTask] [${planetId}] 发现待处理任务 ID:${task._id}, 创建于:${task.createdAt}`);
    
    // 步骤2：获取最新文章
    const articleData = await fetchLatestArticle(browser, planetUrl);
    
    console.log(`[LoopTask] [${planetId]} 获取文章成功, 标题:"${articleData.title}", 长度:${articleData.content.length}`);
    
    // 步骤3：更新任务数据
    await updateTask(task._id, {
      status: 'completed',
      article: JSON.stringify(articleData), // 存储完整的文章数据
    });
    
    return {
      planetId,
      status: 'success',
      taskId: task._id,
      articleTitle: articleData.title,
      articleLength: articleData.content.length,
    };
    
  } catch (error) {
    console.error(`[LoopTask] [${planetId}] 处理出错:`, error.message);
    
    // 尝试获取当前任务以标记失败状态
    const task = await getPendingTask(planetId);
    if (task) {
      await updateTask(task._id, {
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
 * 支持两种调用方式：
 * 1. 定时触发器触发 - 自动处理所有待处理任务
 * 2. 手动调用 - 可传入参数指定某个星球URL
 */
exports.main = async (event, context) => {
  console.log('[LoopTask] ===== 开始执行文章拉取任务 =====');
  console.log('[LoopTask] Event:', JSON.stringify(event));
  
  let puppeteer;
  try {
    puppeteer = require('puppeteer-core');
  } catch (e) {
    console.error('[LoopTask] puppeteer-core 未安装');
    return { code: -1, message: '缺少依赖' };
  }
  
  const browserEndpoint = process.env.BROWSER_ENDPOINT || process.env.CDP_ENDPOINT;
  if (!browserEndpoint) {
    return { code: -1, message: '未配置浏览器端点' };
  }
  
  let browser;
  try {
    // 连接到已登录的浏览器实例
    browser = await puppeteer.connect({
      browserWSEndpoint: browserEndpoint,
      defaultViewport: { width: 375, height: 812 },
    });
    
    // 确定要处理的星球URL列表
    let urlsToProcess = [];
    
    if (event && event.planetUrl) {
      // 手动指定了URL
      urlsToProcess = [event.planetUrl];
    } else {
      // 从数据库中查询所有待处理任务的星球URL
      try {
        const pendingTasksResult = await tasksCollection
          .where({ status: 'pending' })
          .field({ planetUrl: true })
          .get();
        
        // 去重
        const urlSet = new Set();
        if (pendingTasksResult.data) {
          for (const task of pendingTasksResult.data) {
            if (task.planetUrl) {
              urlSet.add(task.planetUrl);
            }
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
      const result = await processPlanetTask(browser, url);
      results.push(result);
    }
    
    console.log('[LoopTask] ===== 文章拉取任务完成 =====');
    return {
      code: 0,
      message: '任务完成',
      data: results,
    };
    
  } catch (error) {
    console.error('[LoopTask] 执行出错:', error);
    return { code: -1, message: error.message };
  }
};
