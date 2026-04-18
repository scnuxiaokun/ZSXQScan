/**
 * Cookie 管理模块
 *
 * 负责:
 * 1. Cookie 的存储与读取（环境变量 > JSON文件/云数据库）
 * 2. Cookie 有效性的检测
 *
 * Cookie 来源（优先级从高到低）:
 * - 环境变量 ZSXQ_COOKIE（推荐，最简单）
 * - JSON 文件 / 云数据库 config 集合（通过 login 模块 setCookie 写入）
 */

const { validateCookie } = require('./zsxqApi');

// ==================== 常量 ====================

/** Cookie 存储的文档 key */
const COOKIE_CONFIG_KEY = 'zsxq_cookie';

// ==================== 数据库初始化（延迟、双模式） ====================

let _configCollection = null;
let _dbMode = null; // 'cloud' | 'local' | null

function getConfigCollection() {
  if (_configCollection) return _configCollection;

  const hasCloudEnv = process.env.TCB_ENV || process.env.SCF_ENV_NAME;

  if (hasCloudEnv) {
    // 云数据库模式
    const cloud = require('@cloudbase/node-sdk');
    const app = cloud.init({ env: hasCloudEnv });
    _configCollection = app.database().collection('config');
    _dbMode = 'cloud';
  } else {
    // 本地 JSON 模式
    const { init } = require(__dirname + '/jsonDb');
    _configCollection = init().collection('config');
    _dbMode = 'local';
  }

  return _configCollection;
}

// ==================== Cookie 存取 ====================

/**
 * 从存储中读取当前保存的 Cookie
 *
 * @returns {Promise<string|null>} Cookie 字符串，不存在则返回 null
 */
async function getStoredCookie() {
  try {
    const collection = getConfigCollection();
    const doc = await collection.doc(COOKIE_CONFIG_KEY).get();
    if (doc.data && doc.data.value) {
      console.log(`[CookieManager] 从${_dbMode === 'cloud' ? '云数据库' : '本地JSON'}读取到 Cookie`);
      return doc.data.value;
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * 将 Cookie 写入存储
 *
 * @param {string} cookie 完整的 Cookie 字符串
 * @param {Object} [meta] 额外元信息
 * @param {string} [meta.source] 来源 (manual|auto_login|refresh)
 */
async function saveCookie(cookie, meta = {}) {
  const collection = getConfigCollection();

  const now = new Date();
  const data = {
    value: cookie,
    updatedAt: now,
    source: meta.source || 'unknown',
    ...meta,
  };

  try {
    await collection.doc(COOKIE_CONFIG_KEY).update({ data });
    console.log(`[CookieManager] ✅ Cookie 已更新到${_dbMode === 'cloud' ? '云数据库' : '本地JSON'} (来源: ${data.source})`);
  } catch (e) {
    data.createdAt = now;
    await collection.add({ data });
    console.log(`[CookieManager] ✅ Cookie 已写入${_dbMode === 'cloud' ? '云数据库' : '本地JSON'} (来源: ${data.source})`);
  }
}

/**
 * 获取有效的 Cookie（优先级：环境变量 > 存储）
 *
 * @param {boolean} validate 是否验证有效性
 * @returns {Promise<string>} 可用的 Cookie
 */
async function getValidCookie(validate = true) {
  // 1. 环境变量优先级最高
  const envCookie = process.env.ZSXQ_COOKIE;
  if (envCookie) {
    if (!validate) return envCookie;

    const valid = await validateCookie(envCookie);
    if (valid) {
      console.log('[CookieManager] 使用环境变量中的 Cookie（有效）');
      return envCookie;
    }
    console.warn('[CookieManager] 环境变量中的 Cookie 已失效');
  }

  // 2. 回退到存储中的 Cookie
  const dbCookie = await getStoredCookie();
  if (dbCookie) {
    if (!validate) return dbCookie;

    const valid = await validateCookie(dbCookie);
    if (valid) {
      console.log('[CookieManager] 使用存储中的 Cookie（有效）');
      return dbCookie;
    }
    console.warn('[CookieManager] 存储中的 Cookie 已失效');
  }

  throw new Error(
    '[CookieManager] 没有可用的 Cookie！\n' +
    '请执行以下任一操作:\n' +
    '1. 设置环境变量 ZSXQ_COOKIE\n' +
    '2. 运行 node scripts/runLocal.js login 设置 Cookie'
  );
}

// ==================== Cookie 检测 ====================

/**
 * 检查当前 Cookie 状态
 *
 * @returns {Promise<Object>} Cookie状态信息
 */
async function checkCookieStatus() {
  const result = {
    hasEnvCookie: !!process.env.ZSXQ_COOKIE,
    hasStoredCookie: false,
    dbMode: _dbMode || 'uninitialized',
    valid: false,
    source: null,
    lastUpdated: null,
  };

  // 检查存储
  try {
    const collection = getConfigCollection();
    const doc = await collection.doc(COOKIE_CONFIG_KEY).get();
    if (doc.data && doc.data.value) {
      result.hasStoredCookie = true;
      result.lastUpdated = doc.data.updatedAt || doc.data.createdAt;
    }
  } catch (e) {}

  // 验证有效性
  try {
    const cookie = await getValidCookie(true);
    result.valid = true;
    result.source = cookie === process.env.ZSXQ_COOKIE ? 'env' : (_dbMode || 'storage');
  } catch (e) {
    result.error = e.message;
  }

  return result;
}

/**
 * 清除存储中的 Cookie
 */
async function clearCookie() {
  try {
    const collection = getConfigCollection();
    await collection.doc(COOKIE_CONFIG_KEY).remove();
    console.log(`[CookieManager] 存储中的 Cookie 已清除 (${_dbMode})`);
  } catch (e) {}
}

module.exports = {
  getStoredCookie,
  saveCookie,
  getValidCookie,
  checkCookieStatus,
  clearCookie,
  COOKIE_CONFIG_KEY,
};
