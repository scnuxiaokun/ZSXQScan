/**
 * 获取星球最新文章内容
 * 
 * 输入：星球URL
 * 输出：最新文章内容（纯文本）
 */

const { login } = require('../login');

/**
 * 获取指定星球的最新文章
 * 
 * @param {import('puppeteer-core').Browser} browser 已登录的浏览器实例
 * @param {string} planetUrl 星球完整URL
 * @returns {Promise<string>} 最新文章内容
 */
async function getLatestArticle(browser, planetUrl) {
  console.log(`[GetLastUpdatedArticle] 开始获取文章，URL: ${planetUrl}`);
  
  let page;
  try {
    // 使用已登录的上下文打开星球页面
    page = await browser.newPage();
    await page.goto(planetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // 等待页面加载完成
    await sleep(2000);
    
    // 查找最新文章
    // 知识星球的文章通常在特定的DOM结构中
    const articleContent = await extractArticleContent(page);
    
    if (!articleContent) {
      throw new Error('未能获取到文章内容');
    }
    
    console.log(`[GetLastUpdatedArticle] 成功获取文章，长度: ${articleContent.length}`);
    return articleContent;
    
  } catch (error) {
    console.error('[GetLastUpdatedArticle] 获取文章出错:', error.message);
    // 截图用于调试
    if (page) {
      await page.screenshot({ path: '/tmp/article_error.png' }).catch(() => {});
    }
    throw error;
  }
}

/**
 * 从页面中提取最新文章内容
 * 
 * @param {import('puppeteer-core').Page} page 页面实例
 * @returns {Promise<string|null>} 文章内容
 */
async function extractArticleContent(page) {
  // 尝试多种选择器策略来定位文章
  
  // 策略1：知识星球常见的选择器
  const selectors = [
    // 文章列表中的第一条/最新的文章
    '.feed-item:first-child .content',
    '[class*="feed"] [class*="content"]:first-child',
    // 文章详情容器
    '.article-content, .post-content, .rich-text',
    '[class*="article"] [class*="text"]',
    // 通用内容区域
    '.main-content .content-item:first-child',
    // 知识星球移动端可能的selector
    '.timeline-item:first-child .text-content',
  ];
  
  for (const selector of selectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        // 检查是否有"展开全部"按钮
        const expandButton = await page.$(`${selector} .expand-btn, ${selector} [class*="expand"], text=展开全部`);
        
        if (expandButton) {
          console.log('[GetLastUpdatedArticle] 发现"展开全部"按钮，点击展开...');
          await expandButton.click();
          await sleep(1000); // 等待内容加载
        }
        
        // 获取文章文本内容
        const content = await element.evaluate(el => {
          // 移除脚本和样式标签后获取纯文本
          const clone = el.cloneNode(true);
          clone.querySelectorAll('script, style, [class*="ad"]').forEach(node => node.remove());
          return clone.innerText.trim();
        });
        
        if (content && content.length > 10) {
          return content;
        }
      }
    } catch (e) {
      continue;
    }
  }
  
  // 策略2：使用更通用的方式 - 获取页面主要内容区域的文本
  console.log('[GetLastUpdatedArticle] 使用备用策略提取文章内容...');
  try {
    const content = await page.evaluate(() => {
      // 查找所有可能是文章的元素
      const allElements = document.querySelectorAll('[class*="content"], [class*="text"], [class*="article"], [class*="post"]');
      
      for (const el of allElements) {
        const text = el.innerText.trim();
        // 过滤掉太短的内容（可能是标题或元信息）
        if (text.length > 50 && !el.querySelector('input, button, nav, header, footer')) {
          // 找到第一个足够长的内容块就返回
          
          // 检查是否有展开按钮
          const expandBtn = el.parentElement?.querySelector('[class*="expand"]') ||
                           document.evaluate(
                             "ancestor::*[contains(@class, 'expand')]/button | //*[contains(text(), '展开')]",
                             el,
                             null,
                             XPathResult.FIRST_ORDERED_NODE_TYPE,
                             null
                           ).singleNodeValue;
          
          if (expandBtn) {
            // 标记需要展开
            return '__NEED_EXPAND__' + text;
          }
          
          return text;
        }
      }
      return null;
    });
    
    if (content && content.startsWith('__NEED_EXPAND__')) {
      // 需要点击展开
      await page.click('text=展开全部, [class*="expand"]');
      await sleep(1000);
      return extractArticleContent(page); // 重新获取
    }
    
    return content;
  } catch (e) {
    console.error('[GetLastUpdatedArticle] 备用策略也失败:', e.message);
    return null;
  }
}

/**
 * 完整流程：登录并获取文章
 * 供外部调用的一站式方法
 * 
 * @param {import('puppeteer-core').Browser} browser 浏览器实例
 * @param {string} planetUrl 星球URL
 * @returns {Promise<{url: string, title: string, content: string, time: string}>}
 */
async function fetchLatestArticle(browser, planetUrl) {
  // 先确保登录状态（如果浏览器未登录则执行登录）
  // 注意：这里假设传入的browser可能已经登录过，也可能没有
  // 实际使用时应该复用已登录的浏览器实例以节省资源
  
  const articleContent = await getLatestArticle(browser, planetUrl);
  
  // 提取文章标题和时间等元信息（可选）
  const metaInfo = await browser.pages().then(pages => pages[pages.length - 1]).then(async (page) => {
    try {
      return await page.evaluate(() => {
        // 尝试获取文章标题
        const titleEl = document.querySelector('[class*="title"], h1, h2, .feed-title');
        const title = titleEl ? titleEl.innerText.trim() : '';
        
        // 尝试获取发布时间
        const timeEl = document.querySelector('[class*="time"], [class*="date"], .time-text');
        const time = timeEl ? timeEl.innerText.trim() : '';
        
        return { title, time };
      });
    } catch (e) {
      return { title: '', time: '' };
    }
  });
  
  return {
    url: planetUrl,
    title: metaInfo.title,
    content: articleContent,
    time: metaInfo.time,
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { getLatestArticle, fetchLatestArticle };
