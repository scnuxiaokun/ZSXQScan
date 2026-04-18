/**
 * 登录模块 - Cookie 管理工具 (v2.2)
 * 
 * 职责: Cookie 的获取、存储、验证与分发
 * 
 * v2.2 变更: 移除 Puppeteer autoLogin 流程（v1遗留，已废弃）
 * 仅保留手动设置 Cookie 的方式——简单、稳定、零依赖
 * 
 * 使用方式:
 *   1. 从浏览器复制 Cookie（F12 → Network → 复制 Cookie 头）
 *   2. 调用 { action: "setCookie", cookie: "zsxq_access_token=xxx; ..." }
 *   3. GetArticle / LoopTask 模块自动读取并使用
 */

const { saveCookie, getValidCookie, checkCookieStatus } = require('../cookieManager');
const { validateCookie } = require('../zsxqApi');

// ==================== 手动设置 Cookie（唯一方式） ====================

/**
 * 手动设置 Cookie 到云数据库
 * 
 * 如何获取 Cookie:
 *   1. 浏览器打开 https://wx.zsxq.com/ 并登录
 *   2. F12 → Network 面板 → 刷新页面
 *   3. 找到任意 api.zsxq.com 请求 → 复制 Request Headers 中的 Cookie
 *   4. 调用本接口保存
 * 
 * @param {string} cookie 完整的 Cookie 字符串（含 zsxq_access_token）
 */
async function setCookie(cookie) {
  if (!cookie || typeof cookie !== 'string' || cookie.length < 10) {
    throw new Error('无效的 Cookie 值');
  }

  const valid = await validateCookie(cookie);
  if (!valid) {
    throw new Error(
      'Cookie 验证失败！请检查:\n' +
      '1. 是否复制了完整的 Cookie（包含 zsxq_access_token）\n' +
      '2. Cookie 是否已过期\n' +
      '3. 是否正确登录了知识星球'
    );
  }

  await saveCookie(cookie, { source: 'manual' });

  return {
    success: true,
    message: '✅ Cookie 已保存并验证通过',
    hint: 'Cookie 有效期通常为 1-3 个月，过期后需重新获取',
  };
}

// ==================== 读取与检测 ====================

/** 获取当前有效的 Cookie（供其他模块调用） */
async function getCookie() {
  return getValidCookie(true);
}

/** 检查当前 Cookie 状态 */
async function checkStatus() {
  return checkCookieStatus();
}

// ==================== 云函数主入口 ====================

exports.main = async (event, context) => {
  console.log('[Login] Action:', event?.action || 'getCookie');

  switch (event?.action) {

    case 'setCookie':
      if (!event.cookie) {
        return { code: -1, message: '缺少 cookie 参数' };
      }
      try {
        const result = await setCookie(event.cookie);
        return { code: 0, ...result };
      } catch (e) {
        return { code: -1, message: e.message };
      }

    case 'checkStatus':
      try {
        const status = await checkStatus();
        return { code: 0, data: status };
      } catch (e) {
        return { code: -1, message: e.message };
      }

    case 'getCookie':
    default:
      try {
        const cookie = await getCookie();
        return {
          code: 0,
          message: 'Cookie 有效',
          preview: cookie.substring(0, 30) + '...',
        };
      } catch (e) {
        return { code: -1, message: e.message, needRelogin: true };
      }
  }
};

module.exports = { setCookie, getCookie, checkStatus };
