/**
 * 知识星球监控抓取系统 - 统一入口
 * 
 * 本文件提供系统初始化和浏览器管理功能。
 * 在实际部署时，浏览器实例通常由独立的容器/进程管理，
 * 云函数通过 CDP (Chrome DevTools Protocol) 连接使用。
 */

const puppeteer = require('puppeteer-core');

// 浏览器单例管理
let browserInstance = null;
let loginPage = null;

/**
 * 获取或创建浏览器实例
 * 
 * @param {Object} options 配置选项
 * @param {boolean} options.headless 是否无头模式
 * @param {string} options.executablePath Chrome可执行路径
 * @returns {Promise<import('puppeteer-core').Browser>}
 */
async function getBrowser(options = {}) {
  if (browserInstance && browserInstance.connected) {
    return browserInstance;
  }
  
  const {
    headless = true,
    executablePath = process.env.CHROME_PATH || '/usr/bin/google-chrome',
    endpoint = process.env.BROWSER_ENDPOINT || process.env.CDP_ENDPOINT,
  } = options;
  
  // 如果有远程端点，连接到已有浏览器
  if (endpoint) {
    console.log('[Browser] 连接到远程浏览器:', endpoint);
    browserInstance = await puppeteer.connect({
      browserWSEndpoint: endpoint,
      defaultViewport: { width: 375, height: 812 },
    });
    return browserInstance;
  }
  
  // 否则启动新的浏览器实例
  console.log('[Browser] 启动新浏览器实例');
  browserInstance = await puppeteer.launch({
    executablePath,
    headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=375,812',  // 移动端尺寸（知识星球是移动端页面）
    ],
    defaultViewport: { width: 375, height: 812 },
  });
  
  // 处理断开事件
  browserInstance.on('disconnected', () => {
    console.log('[Browser] 浏览器连接断开');
    browserInstance = null;
  });
  
  return browserInstance;
}

/**
 * 获取已登录的浏览器上下文
 * 如果尚未登录，会自动执行登录流程
 */
async function getLoggedInBrowser() {
  const browser = await getBrowser();
  
  // 检查是否已登录（简单判断：访问知识星球首页看是否跳转到登录页）
  const page = await browser.newPage();
  try {
    await page.goto('https://wx.zsxq.com/', { waitUntil: 'networkidle2', timeout: 15000 });
    const currentUrl = page.url();
    
    if (currentUrl.includes('login')) {
      console.log('[Browser] 未登录，开始执行登录...');
      await page.close();
      
      // 导入登录模块
      const { login } = require('./functions/login');
      return login(browser);
    }
    
    console.log('[Browser] 已登录状态有效');
    return page;
  } catch (e) {
    await page.close().catch(() => {});
    throw e;
  }
}

/**
 * 关闭浏览器实例（清理资源）
 */
async function closeBrowser() {
  if (browserInstance && browserInstance.connected) {
    await browserInstance.close();
    browserInstance = null;
  }
}

module.exports = {
  getBrowser,
  getLoggedInBrowser,
  closeBrowser,
};
