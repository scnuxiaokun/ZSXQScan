/**
 * 登录模块 - 手机号验证码登录知识星球
 * 
 * 使用 Puppeteer 实现浏览器自动化登录
 */

const LOGIN_URL = 'https://wx.zsxq.com/login';
const PHONE_NUMBER = '18948788411';

// 验证码获取相关配置（通过双卡助手转发）
const SMS_CONFIG = {
  // 双卡助手转发的验证码获取接口地址
  // 具体地址需要根据实际双卡助手的配置来填写
  endpoint: process.env.SMS_ENDPOINT || '',
};

/**
 * 执行登录流程
 * @param {import('puppeteer-core').Browser} browser Puppeteer 浏览器实例
 * @returns {Promise<import('puppeteer-core').Page>} 登录后的页面实例
 */
async function login(browser) {
  const page = await browser.newPage();
  
  try {
    console.log('[Login] 开始登录流程，打开登录页面...');
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // 点击"切换至手机号登录"
    console.log('[Login] 切换至手机号登录...');
    await page.waitForSelector('text=切换至手机号登录', { timeout: 10000 });
    await page.click('text=切换至手机号登录');
    await sleep(1000);
    
    // 输入手机号
    console.log('[Login] 输入手机号:', PHONE_NUMBER);
    const phoneInput = await page.waitForSelector('input[placeholder*="手机号"]', { timeout: 5000 });
    if (phoneInput) {
      await phoneInput.click({ clickCount: 3 });
      await phoneInput.type(PHONE_NUMBER, { delay: 50 });
    } else {
      // 备选：查找所有input
      const inputs = await page.$$('input');
      for (const input of inputs) {
        const placeholder = await input.evaluate(el => el.placeholder);
        if (placeholder && (placeholder.includes('手机') || placeholder.includes('phone'))) {
          await input.click({ clickCount: 3 });
          await input.type(PHONE_NUMBER, { delay: 50 });
          break;
        }
      }
    }
    await sleep(500);
    
    // 点击"获取验证码"
    console.log('[Login] 点击获取验证码...');
    const smsButton = await page.waitForSelector('text=获取验证码', { timeout: 5000 });
    
    // 监听网络请求以捕获验证码API调用
    let codePromise;
    if (SMS_CONFIG.endpoint) {
      // 如果配置了验证码接口，等待验证码
      codePromise = fetchVerificationCode();
    }
    
    await smsButton.click();
    
    // 获取验证码
    let verificationCode;
    if (SMS_CONFIG.endpoint && codePromise) {
      console.log('[Login] 等待验证码接口返回...');
      verificationCode = await Promise.race([
        codePromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('获取验证码超时')), 60000))
      ]);
    } else {
      // 无接口配置时，尝试从网络请求中拦截
      verificationCode = await interceptSmsCode(page);
    }
    
    console.log('[Login] 获取到验证码:', verificationCode);
    
    // 输入验证码
    const codeInput = await page.waitForSelector('input[placeholder*="验证码"]', { timeout: 5000 }) ||
                      await page.waitForSelector('input[type="tel"]', { timeout: 3000 });
    if (codeInput) {
      await codeInput.click({ clickCount: 3 });
      await codeInput.type(verificationCode, { delay: 50 });
    }
    await sleep(500);
    
    // 勾选"我已阅读并同意"
    console.log('[Login] 勾选用户协议...');
    try {
      const checkbox = await page.waitForSelector('.agree-checkbox, [class*="check"], [type="checkbox"]', { timeout: 3000 });
      if (checkbox) {
        const isChecked = await checkbox.evaluate(el => el.checked);
        if (!isChecked) {
          await checkbox.click();
        }
      }
    } catch (e) {
      console.log('[Login] 未找到复选框或已默认勾选，继续');
    }
    
    // 点击登录按钮
    console.log('[Login] 点击登录按钮...');
    const loginButton = await page.waitForSelector('button[type="submit"], text=登录, .login-btn', { timeout: 5000 });
    await loginButton.click();
    
    // 等待登录成功（页面跳转或出现首页元素）
    console.log('[Login] 等待登录完成...');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
    await sleep(2000);
    
    // 验证登录是否成功
    const currentUrl = page.url();
    if (currentUrl.includes('login')) {
      throw new Error('登录失败，仍在登录页面');
    }
    
    console.log('[Login] 登录成功！当前URL:', currentUrl);
    return page;
    
  } catch (error) {
    console.error('[Login] 登录过程出错:', error.message);
    await page.screenshot({ path: '/tmp/login_error.png' }).catch(() => {});
    throw error;
  }
}

/**
 * 从双卡助手接口获取验证码
 */
async function fetchVerificationCode() {
  // 这里需要根据实际的验证码获取方式来实现
  // 可能是通过轮询某个API，或者监听某个webhook
  
  // 示例：轮询方式获取最新验证码
  const maxAttempts = 60; // 最多等60秒
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(SMS_CONFIG.endpoint);
      if (response.ok) {
        const data = await response.json();
        if (data.code) {
          return data.code;
        }
      }
    } catch (e) {
      // 忽略错误，继续重试
    }
    await sleep(1000);
  }
  throw new Error('无法获取验证码');
}

/**
 * 通过拦截网络请求获取验证码（备用方案）
 * 从页面发出的请求中提取验证码相关信息
 */
async function interceptSmsCode(page) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('拦截验证码超时')), 60000);
    
    // 监听响应，寻找包含验证码的请求
    page.on('response', async (response) => {
      const url = response.url();
      // 知识星球验证码相关的API通常会包含特定关键字
      if (url.includes('sms') || url.includes('code') || url.includes('verify')) {
        try {
          const json = await response.json().catch(() => null);
          if (json && json.code) {
            clearTimeout(timeout);
            resolve(json.code.toString());
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    });
  });
}

/**
 * 工具函数：延迟指定毫秒
 * @param {number} ms 延迟时间（毫秒）
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { login, PHONE_NUMBER };
