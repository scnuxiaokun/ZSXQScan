/**
 * 监控星球更新 - 云函数入口
 * 
 * 功能：
 * 1. 新建无上下文的web容器（浏览器实例）
 * 2. 拉取星球URL对应的页面内容
 * 3. 解析"最近更新时间"
 * 4. 如果是"刚刚"则创建拉取任务
 * 5. 定时循环执行
 */

const cloud = require('@cloudbase/node-sdk');

// 初始化云开发SDK
const app = cloud.init({
  env: process.env.TCB_ENV || process.env.SCF_ENV_NAME,
});

const db = app.database();
const tasksCollection = db.collection('tasks');
const configCollection = db.collection('config');

// 默认监控间隔：1分钟
const DEFAULT_INTERVAL_MS = 60 * 1000;

/**
 * 从URL中提取星球ID
 * @param {string} url 星球URL
 * @returns {string} 星球ID
 */
function extractPlanetId(url) {
  // URL最后一段是星球ID
  const parts = url.replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || url;
}

/**
 * 检查是否存在未完成的任务
 * @param {string} planetId 星球ID
 * @returns {Promise<boolean>} 是否有待处理任务
 */
async function hasPendingTask(planetId) {
  try {
    const result = await tasksCollection
      .where({
        planetId: planetId,
        status: 'pending',
      })
      .count();
    
    return result.total > 0;
  } catch (error) {
    console.error(`[Monitor] 查询待处理任务失败 [${planetId}]:`, error.message);
    return false;
  }
}

/**
 * 解析页面的"最近更新时间"
 * 
 * @param {import('puppeteer-core').Page} page 页面实例
 * @returns {Promise<{timeText: string, planetName: string}>}
 */
async function parseUpdateTime(page) {
  return await page.evaluate(() => {
    // 知识星球页面中"最近更新时间"的选择器
    const timeSelectors = [
      // 常见的时间显示元素
      '[class*="update"] [class*="time"]',
      '[class*="last"] [class*="time"]',
      '.update-time, .last-update-time',
      // 包含"更新"文字附近的元素
      '*',
    ];
    
    let timeText = '';
    
    // 方法1：通过特定选择器查找
    for (const selector of timeSelectors.slice(0, -1)) {
      const el = document.querySelector(selector);
      if (el) {
        timeText = el.innerText.trim();
        break;
      }
    }
    
    // 方法2：通过文本内容匹配（更通用）
    if (!timeText) {
      const allElements = document.querySelectorAll('*');
      for (const el of allElements) {
        const text = el.innerText?.trim() || '';
        // 匹配常见的时间描述格式
        if (/^(刚刚|\d+分钟前|\d+小时前|昨天|前天|\d+天前)$/.test(text)) {
          timeText = text;
          break;
        }
        // 匹配包含"更新"和时间在一起的文本
        if (text.includes('更新') && /(\d+分钟前|\d+小时前|刚刚)/.test(text)) {
          const match = text.match(/(刚刚|\d+分钟前|\d+小时前)/);
          if (match) {
            timeText = match[1];
            break;
          }
        }
      }
    }
    
    // 获取星球名称
    let planetName = '';
    const nameSelectors = ['h1', '[class*="name"]', '[class*="title"]', '.planet-name'];
    for (const selector of nameSelectors) {
      const el = document.querySelector(selector);
      if (el && el.innerText.trim()) {
        planetName = el.innerText.trim();
        break;
      }
    }
    
    return { timeText, planetName };
  });
}

/**
 * 创建文章拉取任务
 * 
 * @param {Object} taskData 任务数据
 */
async function createTask(taskData) {
  try {
    const now = new Date();
    await tasksCollection.add({
      data: {
        planetId: taskData.planetId,
        planetName: taskData.planetName,
        planetUrl: taskData.planetUrl,
        status: 'pending',           // 未开始
        lastUpdateTime: taskData.lastUpdateTime,
        article: '',                 // 拉取完成后填充
        createdAt: now,
        updatedAt: now,
      },
    });
    console.log(`[Monitor] 创建任务成功 [${taskData.planetId}]`);
  } catch (error) {
    console.error(`[Monitor] 创建任务失败 [${taskData.planetId}]:`, error.message);
  }
}

/**
 * 获取监控配置
 * @returns {Promise<{interval: number, urls: string[]}>}
 */
async function getMonitorConfig() {
  try {
    // 获取监控间隔
    const intervalDoc = await configCollection.doc('monitorInterval').get();
    const interval = intervalDoc.data?.value || DEFAULT_INTERVAL_MS;
    
    // 获取监控URL列表
    const urlsDoc = await configCollection.doc('monitorUrls').get();
    const urls = urlsDoc.data?.value || [];
    
    return { interval, urls };
  } catch (error) {
    console.error('[Monitor] 获取配置失败，使用默认值:', error.message);
    return { interval: DEFAULT_INTERVAL_MS, urls: [] };
  }
}

/**
 * 监控单个星球
 * 
 * @param {import('puppeteer-core').Browser} browser 浏览器实例（无登录状态）
 * @param {string} url 星球URL
 * @returns {Promise<boolean>} 是否有更新
 */
async function monitorPlanet(browser, url) {
  const planetId = extractPlanetId(url);
  console.log(`[Monitor] 开始监控星球 [${planetId}] ${url}`);
  
  let page;
  try {
    page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(2000); // 等待动态内容加载
    
    // 检查是否有未完成的任务
    const hasPending = await hasPendingTask(planetId);
    if (hasPending) {
      console.log(`[Monitor] [${planetId}] 存在未完成任务，跳过本轮监控`);
      return false;
    }
    
    // 解析最近更新时间
    const { timeText, planetName } = await parseUpdateTime(page);
    console.log(`[Monitor] [${planetId}] 最近更新时间: "${timeText}", 名称: "${planetName}"`);
    
    if (!timeText) {
      console.warn(`[Monitor] [${planetId}] 未能获取到更新时间`);
      return false;
    }
    
    // 判断是否为"刚刚"
    if (timeText === '刚刚') {
      console.log(`[Monitor] ✅ [${planetId}] 发现更新！创建拉取任务...`);
      
      // 创建拉取任务
      await createTask({
        planetId,
        planetName: planetName || `星球${planetId}`,
        planetUrl: url,
        lastUpdateTime: timeText,
      });
      
      return true; // 有更新
    } else {
      console.log(`[Monitor] [${planetId}] 更新时间为"${timeText}"，无新更新`);
      return false;
    }
    
  } catch (error) {
    console.error(`[Monitor] [${planetId}] 监控出错:`, error.message);
    if (page) {
      await page.screenshot({ path: `/tmp/monitor_${planetId}_error.png` }).catch(() => {});
    }
    return false;
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
  }
}

/**
 * 云函数主入口
 * 
 * 支持两种调用方式：
 * 1. 定时触发器触发 - 自动监控所有配置的星球URL
 * 2. 手动调用 - 可传入参数指定监控某个星球
 */
exports.main = async (event, context) => {
  console.log('[Monitor] ===== 开始一轮监控 =====');
  console.log('[Monitor] Event:', JSON.stringify(event));
  
  // 动态导入puppeteer-core（云函数环境需要）
  let puppeteer;
  try {
    puppeteer = require('puppeteer-core');
  } catch (e) {
    console.error('[Monitor] puppeteer-core 未安装，请先安装依赖');
    return { code: -1, message: '缺少依赖' };
  }
  
  // 获取浏览器连接配置
  const browserEndpoint = process.env.BROWSER_ENDPOINT || process.env.CDP_ENDPOINT;
  if (!browserEndpoint) {
    console.error('[Monitor] 未配置浏览器端点 (BROWSER_ENDPOINT/CDP_ENDPOINT)');
    return { code: -1, message: '未配置浏览器端点' };
  }
  
  let browser;
  try {
    // 连接到已运行的浏览器实例（无登录状态的新容器）
    browser = await puppeteer.connect({
      browserWSEndpoint: browserEndpoint,
      defaultViewport: { width: 375, height: 812 }, // 移动端视口
    });
    
    // 获取要监控的URL列表
    let monitorUrls;
    
    if (event && event.planetUrl) {
      // 手动指定了星球URL
      monitorUrls = [event.planetUrl];
    } else {
      // 从数据库配置中读取
      const config = await getMonitorConfig();
      monitorUrls = config.urls;
      
      if (monitorUrls.length === 0) {
        console.warn('[Monitor] 没有配置监控URL，请在config集合中添加monitorUrls配置');
        return { code: 0, message: '没有需要监控的星球', data: [] };
      }
    }
    
    // 逐个监控
    const results = [];
    for (const url of monitorUrls) {
      const hasUpdate = await monitorPlanet(browser, url);
      results.push({ url, hasUpdate });
    }
    
    console.log('[Monitor] ===== 本轮监控结束 =====');
    return {
      code: 0,
      message: '监控完成',
      data: results,
    };
    
  } catch (error) {
    console.error('[Monitor] 执行出错:', error);
    return { code: -1, message: error.message };
  } finally {
    // 注意：不要断开浏览器连接，因为这是共享实例
    // 如果是独立启动的浏览器才需要关闭
  }
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
