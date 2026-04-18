/**
 * JSON 文件数据库 — 替代腾讯云 CloudBase 数据库
 *
 * 使用场景:
 *   本地运行时无需 TCB_ENV，数据存储在 data/ 目录下的 JSON 文件
 *   API 签名与 @cloudbase/node-sdk 兼容，业务代码无需改动调用方式
 *
 * 支持的集合:
 *   - tasks:  文章拉取任务（去重键: planetId + topicCreateTime）
 *   - config: 系统配置（monitorUrls, zsxq_cookie 等）
 *
 * 文件位置:
 *   data/tasks.json
 *   data/config.json
 */

const fs = require('fs');
const path = require('path');

// 数据目录：项目根目录下的 data/
const DATA_DIR = path.resolve(__dirname, '..', 'data');

// ==================== 工具函数 ====================

/** 确保 data/ 目录存在 */
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/** 读取 JSON 文件，不存在则返回空数组 */
function readCollection(name) {
  const filePath = path.join(DATA_DIR, `${name}.json`);
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn(`[JsonDB] 读取 ${name}.json 失败: ${e.message}`);
  }
  return [];
}

/** 写入 JSON 文件（原子写入） */
function writeCollection(name, data) {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, `${name}.json`);
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath); // 原性替换
}

/** 生成唯一 ID */
function generateId() {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

// ==================== Collection 类 ====================

class JsonCollection {
  constructor(name) {
    this.name = name;
  }

  get _data() {
    return readCollection(this.name);
  }

  set _data(val) {
    writeCollection(this.name, val);
  }

  /** 添加文档 */
  async add({ data }) {
    const docs = this._data;
    const doc = {
      _id: generateId(),
      ...data,
    };
    docs.push(doc);
    this._data = docs;
    console.log(`[JsonDB] ${this.name}.add() → _id: ${doc._id}`);
    return { id: doc._id };
  }

  /** 条件查询 */
  where(conditions) {
    const self = this;

    /** 过滤匹配条件的文档 */
    function filterDocs(conditions) {
      let results = self._data;
      if (conditions) {
        for (const [key, value] of Object.entries(conditions)) {
          results = results.filter(doc => doc[key] === value);
        }
      }
      return results;
    }

    return {
      orderBy(field, order) {
        return {
          async limit(count) {
            let results = filterDocs(conditions);
            if (order === 'desc') {
              results.sort((a, b) => new Date(b[field]) - new Date(a[field]));
            }
            return { data: results.slice(0, count), total: results.length };
          },
        };
      },

      field(/* projection */) {
        // 简化实现：field 投影暂不过滤字段（业务代码只用它来取值）
        return {
          async get() {
            const results = filterDocs(conditions);
            return { data: results, total: results.length };
          },
        };
      },

      async count() {
        const results = filterDocs(conditions);
        return { total: results.length };
      },

      async get() {
        const results = filterDocs(conditions);
        return { data: results, total: results.length };
      },
    };
  }

  /** 按 ID 查询 */
  doc(id) {
    const self = this;
    return {
      async get() {
        const docs = self._data;
        const doc = docs.find(d => d._id === id) || null;
        return { data: doc };
      },
      async update({ data }) {
        const docs = self._data;
        const idx = docs.findIndex(d => d._id === id);
        if (idx >= 0) {
          docs[idx] = { ...docs[idx], ...data };
          self._data = docs;
          console.log(`[JsonDB] ${this.name}.update(${id}) 成功`);
        }
      },
      async remove() {
        const docs = self._data;
        const filtered = docs.filter(d => d._id !== id);
        self._data = filtered;
        console.log(`[JsonDB] ${this.name}.remove(${id}) 成功`);
      },
    };
  }
}

// ==================== Database 入口 ====================

/**
 * 创建 JsonDb 实例（兼容 cloud.init().database() 的返回值）
 *
 * 用法:
 *   const db = require('./jsonDb').init();       // 替代 cloud.init()
 *   const tasksCollection = db.collection('tasks'); // 与 cloudbase 相同 API
 */
function init() {
  ensureDataDir();

  const collections = {};

  return {
    collection(name) {
      if (!collections[name]) {
        collections[name] = new JsonCollection(name);
        // 初始化空文件（如果不存在）
        if (!fs.existsSync(path.join(DATA_DIR, `${name}.json`))) {
          writeCollection(name, []);
        }
      }
      return collections[name];
    },
  };
}

module.exports = { init, JsonCollection, DATA_DIR };
