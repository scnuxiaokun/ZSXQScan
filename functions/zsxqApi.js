/**
 * 知识星球 API 核心模块 v2.2 — 公开API版
 * 
 * 🆕 v2.2 核心更新:
 * - 新增 getGroupPublicInfo(): 通过 pub-api.zsxq.com 获取星球公开信息
 *   无需 Cookie、无需签名、无需登录态，付费星球也能访问！
 *   返回精确到毫秒的 topicCreateTime（最新话题时间戳）
 * 
 * v2.1 风控安全版:
 * - 支持**无 Cookie 模式**: Monitor 监控公开星球无需登录态
 * - 内置频率限制器: 自动控制请求速率，防止触发反爬
 * - 请求抖动: 随机化请求间隔，避免规律性特征
 * 
 * 基于逆向分析的 api.zsxq.com RESTful 接口 + pub-api.zsxq.com 公开接口
 * 纯 HTTP 调用，无需浏览器/Puppeteer
 * 
 * 参考来源:
 * - https://github.com/yiancode/zsxq-sdk (非官方SDK)
 * - https://developer.aliyun.com/article/1710293 (API逆向分析)
 */

const crypto = require('crypto');

// ==================== 配置常量 ====================

const API_BASE = 'https://api.zsxq.com';

/** 公开 API 基地址（无需 Cookie、无需签名、付费星球也可访问） */
const PUB_API_BASE = 'https://pub-api.zsxq.com';

/** 签名密钥 (从客户端硬编码提取) */
const SIGN_SECRET = 'zsxqapi2020';

/** 默认 app_version */
const APP_VERSION = '3.11.0';

/** 默认平台标识 */
const PLATFORM = 'ios';

/** iPhone Safari User-Agent (模拟移动端) */
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

// ==================== 风控安全配置 ====================

/**
 * 风控策略配置
 * 
 * 设计原则:
 * 1. Monitor（高频）尽量不带 Cookie，降低账号风险
 * 2. 所有请求加入随机抖动，避免机械式规律
 * 3. 全局频率上限保护
 */
const SAFETY_CONFIG = {
  /** 单次请求最小间隔(ms) — 连续请求之间至少等待 */
  minRequestInterval: 2000,
  
  /** 单次请求最大随机延迟(ms) — 在 minInterval 基础上再叠加的随机量 */
  maxRandomJitter: 3000,
  
  /** 同一星球的最小检测间隔(s) — 即使定时器触发了也跳过 */
  perGroupMinInterval: 30,  // 30秒
  
  /** 全局每分钟最大请求数 */
  globalMaxRequestsPerMinute: 30,
  
  /** 全局每小时最大请求数 */
  globalMaxRequestsPerHour: 200,
  
  /** 连续失败多少次后自动进入冷却期 */
  consecutiveFailureCooldown: 5,
  
  /** 冷却持续时间(s) */
  cooldownDuration: 300, // 5分钟
  
  /** 夜间模式已禁用 */
  quietHours: null,
  
  /** 夜间模式下额外乘以的系数（已禁用） */
  quietHourMultiplier: 1.0,
};

// ==================== 频率限制器 ====================

/**
 * 内存中的请求计数器（云函数实例级别）
 * 注意：多实例部署时每个实例独立计数，实际限制会更宽松
 */
const rateLimiter = {
  // 请求时间戳队列（用于计算滑动窗口内的请求数）
  requestTimestamps: [],
  
  // 每个星球上次请求的时间
  lastRequestTimePerGroup: new Map(),
  
  // 连续失败计数
  consecutiveFailures: 0,
  
  // 是否处于冷却期
  isCooledDown: false,
  cooldownUntil: 0,

  /**
   * 检查并记录一次请求
   * @param {string} groupId 星球ID（用于单星球限流）
   * @returns {{ allowed: boolean, reason?: string, waitMs?: number }}
   */
  checkAndRecord(groupId) {
    const now = Date.now();
    
    // 检查冷却期
    if (this.isCooledDown && now < this.cooldownUntil) {
      const remaining = Math.ceil((this.consolidateUntil - now) / 1000);
      return { allowed: false, reason: `冷却中，${remaining}秒后恢复` };
    }
    if (this.isCooledDown && now >= this.cooldownUntil) {
      this.isCooledDown = false;
      this.consecutiveFailures = 0;
    }

    // 清理过期的请求记录（超过1小时的）
    const oneHourAgo = now - 3600000;
    this.requestTimestamps = this.requestTimestamps.filter(t => t > oneHourAgo);

    // 全局频率检查 — 每分钟
    const oneMinuteAgo = now - 60000;
    const requestsLastMinute = this.requestTimestamps.filter(t => t > oneMinuteAgo).length;
    if (requestsLastMinute >= SAFETY_CONFIG.globalMaxRequestsPerMinute) {
      return { allowed: false, reason: '每分钟请求次数已达上限' };
    }

    // 全局频率检查 — 每小时
    if (this.requestTimestamps.length >= SAFETY_CONFIG.globalMaxRequestsPerHour) {
      return { allowed: false, reason: '每小时请求次数已达上限' };
    }

    // 单星球频率检查
    const lastRequestForGroup = this.lastRequestTimePerGroup.get(groupId);
    if (lastRequestForGroup) {
      const elapsed = now - lastRequestForGroup;
      const minInterval = SAFETY_CONFIG.perGroupMinInterval * 1000;
      if (elapsed < minInterval) {
        return { 
          allowed: false, 
          reason: `该星球检测过于频繁`, 
          waitMs: minInterval - elapsed,
        };
      }
    }

    // 夜间模式检查（已禁用）
    const currentHour = new Date().getHours();
    const { start, end } = SAFETY_CONFIG.quietHours || {};
    if (start != null && end != null) {
      const inQuietHours = start < end 
        ? (currentHour >= start && currentHour < end)
        : (currentHour >= start || currentHour < end);
      if (inQuietHours && Math.random() > SAFETY_CONFIG.quietHourMultiplier) {
        return { allowed: false, reason: '夜间模式，跳过本次检测' };
      }
    }

    // 通过所有限制，记录本次请求
    this.requestTimestamps.push(now);
    this.lastRequestTimePerGroup.set(groupId, now);

    return { allowed: true };
  },

  /**
   * 记录一次成功响应
   */
  recordSuccess() {
    this.consecutiveFailures = 0;
  },

  /**
   * 记录一次失败响应
   */
  recordFailure() {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= SAFETY_CONFIG.consecutiveFailureCooldown) {
      this.isCooledDown = true;
      this.cooldownUntil = Date.now() + SAFETY_CONFIG.cooldownDuration * 1000;
      console.warn(
        `[RateLimiter] ⚠️ 连续失败 ${this.consecutiveFailures} 次，` +
        `进入 ${SAFETY_CONFIG.cooldownDuration}s 冷却期`
      );
    }
  },

  /**
   * 获取当前统计信息（用于调试和日志）
   */
  getStats() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const oneHourAgo = now - 3600000;
    return {
      requestsLastMinute: this.requestTimestamps.filter(t => t > oneMinuteAgo).length,
      requestsLastHour: this.requestTimestamps.filter(t > oneHourAgo).length,
      consecutiveFailures: this.consecutiveFailures,
      isCooledDown: this.isCooledDown,
      trackedGroups: this.lastRequestTimePerGroup.size,
    };
  },
};

// ==================== 签名算法 ====================

/**
 * 生成 X-Signature 请求签名
 */
function generateSignature(path, params = {}, timestamp) {
  const allParams = {
    ...params,
    app_version: APP_VERSION,
    platform: PLATFORM,
    timestamp: timestamp || Date.now().toString(),
  };

  const sortedKeys = Object.keys(allParams).sort();
  const paramStr = sortedKeys.map(key => `${key}=${allParams[key]}`).join('&');
  const signString = `${path}&${paramStr}&${SIGN_SECRET}`;

  return crypto.createHash('md5').update(signString, 'utf8').digest('hex');
}

// ==================== Token 有效性检测 ====================

/**
 * Access Token 有效性缓存
 * 避免每次请求都调用验证接口
 */
const tokenValidityCache = {
  /** 缓存的 token 值（用于检测 cookie 是否变化） */
  lastToken: null,
  /** 缓存的有效性结果: true=有效, false=无效, null=未检测 */
  isValid: null,
  /** 缓存时间戳 */
  checkedAt: 0,
  /** 缓存有效时长(ms) — 默认 5 分钟 */
  ttl: 5 * 60 * 1000,

  /**
   * 检查缓存是否仍然有效
   * @param {string} currentToken 当前要检查的 token
   * @returns {boolean|null} true=有效, false=无效, null=需重新检测
   */
  get(currentToken) {
    const now = Date.now();
    // token 变了 或 缓存过期 → 返回 null 让调用方重新检测
    if (this.lastToken !== currentToken || (now - this.checkedAt) > this.ttl) {
      return null;
    }
    return this.isValid;
  },

  /**
   * 更新缓存
   * @param {string} token 当前 token
   * @param {boolean} valid 是否有效
   */
  set(token, valid) {
    this.lastToken = token;
    this.isValid = valid;
    this.checkedAt = Date.now();
  },

  /**
   * 清除缓存（cookie 更新时调用）
   */
  reset() {
    this.lastToken = null;
    this.isValid = null;
    this.checkedAt = 0;
  },
};

/**
 * 检测 Access Token 是否有效（已过期/无效）
 * 
 * 🆕 简化策略: 不再主动验证 token，直接请求业务接口
 * 如果业务接口返回 401/403，则判定为 token 失效
 * 
 * @param {string} accessToken 要检测的 access token
 * @param {string} [cookie] 完整的 cookie 字符串
 * @returns {Promise<{valid: boolean, reason?: string}>}
 */
async function validateAccessToken(accessToken, cookie) {
  // 无 token 直接判无效
  if (!accessToken || accessToken.length < 10) {
    return { valid: false, reason: 'access token 为空或过短' };
  }

  // 先查缓存
  const cached = tokenValidityCache.get(accessToken);
  if (cached !== null) {
    console.log(`[ZSXQ-Token] 使用缓存结果: ${cached ? '✅ 有效' : '❌ 无效'}`);
    return { valid: cached, reason: cached ? '缓存命中' : '缓存显示无效' };
  }

  // 🆕 不再主动调用 /v2/user 验证，直接认为有效
  // 真正的验证会在实际业务请求时进行（如 getTopics、getTopicDetail）
  // 如果那些接口返回 401/403，会更新缓存并提示重新登录
  console.log(`[ZSXQ-Token] ✅ Token 格式有效 (跳过主动验证)`);
  tokenValidityCache.set(accessToken, true);
  return { valid: true, reason: '格式有效，待业务请求验证' };
}

// ==================== 请求封装 ====================

/**
 * 从 Cookie 中提取 zsxq_access_token 的值
 */
function extractAccessToken(cookie) {
  if (!cookie || typeof cookie !== 'string') return '';
  // 匹配 zsxq_access_token= 后面的值（直到分号或字符串结尾）
  const match = cookie.match(/zsxq_access_token=([^;\s]+)/);
  return match ? match[1] : '';
}

/**
 * 创建请求头（支持有/无 Cookie 两种模式）
 * 
 * @param {Object} options
 * @param {string} [options.cookie] Cookie 字符串（不传则无 Cookie 模式）
 * @returns {Object} 请求头
 */
function buildHeaders(options = {}) {
  const { cookie } = options;
  const timestamp = Date.now().toString();
  const accessToken = extractAccessToken(cookie);

  const headers = {
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Content-Type': 'application/json',
    'Referer': 'https://wx.zsxq.com/',
    'User-Agent': IPHONE_UA,
    'X-Timestamp': timestamp,
  };

  // 有 Cookie 时添加认证信息
  if (cookie && cookie.length > 5) {
    headers['Cookie'] = cookie;
    // 注意：知识星球 API 不使用 Authorization Bearer，而是通过 Cookie 中的 zsxq_access_token 认证
    if (accessToken) {
      console.log(`[ZSXQ-API] 🔑 Access Token: ${accessToken.substring(0, 20)}...${accessToken.substring(accessToken.length - 10)}`);
    } else {
      console.warn('[ZSXQ-API] ⚠️ Cookie 中未找到 zsxq_access_token');
    }
  }

  return headers;
}

/**
 * 发送请求到知识星球 API
 * 
 * 🆕 v2.1 改进:
 * - 支持无 Cookie 模式（options.cookie 可以为空字符串）
 * - 自动应用风控策略
 * - 更智能的重试逻辑
 * 
 * @param {string} method HTTP方法
 * @param {string} path API路径
 * @param {Object} options
 * @returns {Promise<Object>} JSON响应数据
 */
async function request(method, path, options = {}) {
  const {
    params = {},
    body = null,
    cookie = process.env.ZSXQ_COOKIE || '',
    retry = 2,
    delay = 0,
    skipRateLimit = false,     // 🆕 是否跳过频率限制
    skipTokenCheck = false,    // 🆕 是否跳过 Token 有效性预检（validateAccessToken 内部调用时需要）
    groupId = null,            // 🆕 星球ID（用于单星球限流）
  } = options;

  // 无 Cookie 模式的特殊处理:
  // 如果明确传入 cookie='' 或 cookie=null，视为无 Cookie 模式
  const effectiveCookie = cookie || '';
  const isAnonymousMode = !effectiveCookie;

  // 🆕 Access Token 有效性预检（仅在非匿名模式且未跳过时执行）
  if (!isAnonymousMode && !skipTokenCheck) {
    const accessToken = extractAccessToken(effectiveCookie);
    if (accessToken && accessToken.length >= 10) {
      const tokenCheck = await validateAccessToken(accessToken, effectiveCookie);
      if (!tokenCheck.valid) {
        console.error(
          `[ZSXQ-API] 🚫 Access Token 已无效！` +
          `原因: ${tokenCheck.reason}` +
          (tokenCheck.statusCode ? ` (${tokenCheck.statusCode})` : '') +
          ` — 请重新获取 Cookie`
        );
        // 返回一个特殊的"认证失效"标记，让调用方优雅处理
        return { _authExpired: true, _authReason: tokenCheck.reason };
      }
    } else if (effectiveCookie.length > 5) {
      // 有 Cookie 但提取不到有效的 access token
      console.warn(`[ZSXQ-API] ⚠️ Cookie 中未找到有效 access token，请求可能失败`);
    }
  }

  // 风控检查（除非显式跳过）
  if (!skipRateLimit && groupId) {
    const rateCheck = rateLimiter.checkAndRecord(groupId);
    if (!rateCheck.allowed) {
      console.log(`[ZSXQ-API] 🔒 频率限制: ${rateCheck.reason}`);
      if (rateCheck.waitMs) {
        await sleep(rateCheck.waitMs);
      }
      // 返回一个"被限流"的特殊结果，而不是抛异常
      // 让调用方可以优雅处理（跳过本轮而非报错）
      return { _rateLimited: true, _rateReason: rateCheck.reason };
    }
  }

  const timestamp = Date.now().toString();
  const signature = generateSignature(path, params, timestamp);
  const url = new URL(API_BASE + path);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });

  const headers = buildHeaders({ cookie: effectiveCookie });
  headers['X-Signature'] = signature;

  // 基础延迟 + 随机抖动
  const totalDelay = delay + Math.random() * (isAnonymousMode ? 500 : SAFETY_CONFIG.maxRandomJitter);
  if (totalDelay > 0) {
    await sleep(totalDelay);
  }

  try {
    console.log(
      `[ZSXQ-API] ${method} ${url.pathname}${url.search}` +
      (isAnonymousMode ? ' [匿名模式]' : '') +
      (groupId ? ` [${groupId}]` : '')
    );
    
    // 打印完整的请求头（脱敏）
    if (!isAnonymousMode) {
      console.log('[ZSXQ-API] Headers:', JSON.stringify({
        'Cookie': headers['Cookie'] ? `(已设置, 长度: ${headers['Cookie'].length})` : '未设置',
        'X-Signature': headers['X-Signature'],
        'X-Timestamp': headers['X-Timestamp'],
        'User-Agent': headers['User-Agent'],
      }, null, 2));
    }

    const response = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    
    console.log(`[ZSXQ-API] Response Status: ${response.status}`);

    // HTTP 状态码处理
    if (response.status === 401 || response.status === 403) {
      if (isAnonymousMode) {
        // 无 Cookie 模式下收到 401/403 → 说明该接口需要登录
        console.log(`[ZSXQ-API] 该接口需要登录态 (${response.status})，匿名模式不可用`);
        return { _needAuth: true, statusCode: response.status };
      }
      throw new Error(`认证失败(${response.status})，Cookie可能已过期`);
    }

    if (response.status === 429) {
      rateLimiter.recordFailure();
      throw new Error('请求过于频繁，已被限流');
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${errText.substring(0, 200)}`);
    }

    const data = await response.json();

    // 业务错误码
    if (data.error_code || (data.code && data.code !== 0)) {
      const errMsg = data.msg || data.message || data.error || JSON.stringify(data).substring(0, 100);
      
      // 打印完整响应以便调试
      console.log('[ZSXQ-API] 业务错误详情:', JSON.stringify({
        error_code: data.error_code,
        code: data.code,
        msg: data.msg,
        message: data.message,
        error: data.error,
      }, null, 2));
      
      // 特殊错误: 需要登录才能访问
      if (errMsg.includes('登录') || errMsg.includes('认证') || errMsg.includes('权限')) {
        if (isAnonymousMode) {
          return { _needAuth: true, businessError: errMsg };
        }
      }
      
      throw new Error(`业务错误: ${errMsg}`);
    }

    // 成功！
    rateLimiter.recordSuccess();
    return data;

  } catch (error) {
    // 网络层重试
    const isNetworkError = error.message.includes('timeout') ||
                           error.message.includes('fetch') ||
                           error.message.includes('network') ||
                           error.name === 'AbortError';
    
    if (retry > 0 && isNetworkError) {
      console.warn(`[ZSXQ-API] 网络错误，剩余重试:${retry}, ${error.message.substring(0, 80)}`);
      await sleep(1000 + Math.random() * 2000);
      return request(method, path, { ...options, retry: retry - 1 });
    }

    rateLimiter.recordFailure();
    throw error;
  }
}

// ==================== API 接口方法 ====================

/**
 * 获取用户加入的星球列表（必须登录）
 */
async function getGroups(options = {}) {
  const { page = 1, count = 20 } = options;
  return request('GET', '/v2/groups', {
    params: { page, count },
    delay: 800,
  });
}

/**
 * 获取星球最新话题列表
 * 
 * 🆕 支持 anonymous 模式: 不带 Cookie 调用
 * 公开星球的最新话题可能不需要登录即可查看
 * 
 * @param {string} groupId 星球ID
 * @param {Object} [options]
 * @param {boolean} [options.anonymous=false] 是否使用匿名模式（无Cookie）
 * @param {number} [options.count=1]
 * @returns {Promise<Object>}
 */
async function getTopics(groupId, options = {}) {
  const { count = 1, scope = 'all', anonymous = false } = options;
  
  return request('GET', `/v2/groups/${groupId}/topics`, {
    params: { count, scope },
    cookie: anonymous ? '' : undefined,  // 匿名模式传空字符串
    delay: anonymous ? 500 : 400,
    groupId,
  });
}

/**
 * 获取话题详情（通常需要登录）
 */
async function getTopicDetail(topicId) {
  return request('GET', `/v2/topics/${topicId}`, {
    delay: 600,
  });
}

/**
 * 获取话题评论列表（需要登录）
 */
async function getComments(topicId, options = {}) {
  const { page = 1, count = 20 } = options;
  return request('GET', `/v2/topics/${topicId}/comments`, {
    params: { page, count },
    delay: 600,
  });
}

/**
 * 获取星球详细信息（需要登录）
 */
async function getGroupDetail(groupId) {
  return request('GET', `/v2/groups/${groupId}`, {
    delay: 500,
    groupId,
  });
}

/**
 * 🆕 v2.2 获取星球公开信息（无需登录！）
 * 
 * 使用 pub-api.zsxq.com 公开接口，特点：
 * - ✅ 无需 Cookie / 无需签名 / 无需任何认证
 * - ✅ 付费星球也能访问
 * - ✅ 返回 topicCreateTime (精确到毫秒，字段名: latest_topic_create_time)
 * - ✅ 返回星球名称、成员数、话题总数等基本信息
 * 
 * 适用场景: Monitor 监控检测更新 — 零封号风险
 * 
 * @param {string} groupId 星球ID (数字ID，如 "48418518458448")
 * @returns {Promise<Object>} 星球公开信息对象
 *   {
 *     succeeded: boolean,
 *     resp_data: {
 *       group: {
 *         group_id: number,
 *         name: string,           // 星球名称
 *         description: string,    // 描述
 *         type: string,           // "pay" | "free"
 *         latest_topic_create_time: string,  // ⭐ topicCreateTime (最新话题时间戳)
 *         alive_time: string,      // 最后活跃时间
 *         statistics: {
 *           topics: { topics_count: number },
 *           members: { count: number }
 *         },
 *         owner: { name, avatar_url },
 *         partners: [{ name, avatar_url }]
 *       }
 *     }
 *   }
 */
async function getGroupPublicInfo(groupId) {
  const url = `${PUB_API_BASE}/v2/groups/${groupId}`;

  console.log(`[ZSXQ-API-PUB] GET /v2/groups/${groupId} [公开接口·无认证]`);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': IPHONE_UA,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`公开接口请求失败 HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data.succeeded) {
      throw new Error(`公开接口业务错误: ${data.error || JSON.stringify(data).substring(0, 200)}`);
    }

    console.log(
      `[ZSXQ-API-PUB] ✅ ${data.resp_data?.group?.name || groupId} | ` +
      `最新更新: ${data.resp_data?.group?.latest_topic_create_time || '未知'}`  // topicCreateTime
    );

    return data;

  } catch (error) {
    console.error(`[ZSXQ-API-PUB] ❌ 获取星球公开信息失败: ${error.message}`);
    throw error;
  }
}

// ==================== 工具函数 ====================

function extractGroupId(url) {
  if (!url) return '';
  const parts = url.replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || url;
}

function resolveGroupId(planetUrl) {
  return extractGroupId(planetUrl);
}

function isJustUpdated(createTime) {
  let ts;
  if (typeof createTime === 'string') {
    ts = new Date(createTime).getTime();
  } else if (typeof createTime === 'number') {
    ts = createTime > 1e12 ? createTime : createTime * 1000;
  } else {
    return false;
  }
  const diffMin = (Date.now() - ts) / 60000;
  return diffMin <= 2;
}

function formatRelativeTime(createTime) {
  let ts;
  if (typeof createTime === 'string') {
    ts = new Date(createTime).getTime();
  } else if (typeof createTime === 'number') {
    ts = createTime > 1e12 ? createTime : createTime * 1000;
  } else {
    return '未知';
  }
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 60) return '刚刚';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}分钟前`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}小时前`;
  if (diffSec < 172800) return '昨天';
  if (diffSec < 259200) return '前天';
  return `${Math.floor(diffSec / 86400)}天前`;
}

/**
 * 验证 Cookie 有效性
 */
async function validateCookie(cookie) {
  try {
    const result = await request('GET', '/v2/user', {
      cookie,
      retry: 0,
      skipRateLimit: true,  // 验证操作不受频率限制
    });
    return !result._needAuth && !result._rateLimited;
  } catch (e) {
    if (e.message.includes('401') || e.message.includes('403') || e.message.includes('过期')) {
      return false;
    }
    return true;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== 导出 ====================

module.exports = {
  // 常量
  API_BASE,
  PUB_API_BASE,        // 🆕 v2.2
  APP_VERSION,
  PLATFORM,
  IPHONE_UA,

  // 风控
  SAFETY_CONFIG,
  rateLimiter,

  // 核心
  generateSignature,
  buildHeaders,
  request,

  // API 方法
  getGroups,
  getTopics,
  getTopicDetail,
  getComments,
  getGroupDetail,
  getGroupPublicInfo,   // 🆕 v2.2 公开接口（无需登录）

  // 工具函数
  extractGroupId,
  resolveGroupId,
  extractAccessToken,        // 🆕 从 Cookie 提取 access token
  isJustUpdated,
  formatRelativeTime,
  validateCookie,
  validateAccessToken,       // 🆕 Access Token 有效性检测
  tokenValidityCache,        // 🆕 Token 缓存（供外部重置）
};
