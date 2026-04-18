/**
 * 本地测试用 - 模拟云开发数据库 (v2.2)
 * 
 * 使用内存存储模拟云数据库行为，用于本地测试时无需连接真实云环境
 * 
 * 支持的集合:
 *   - tasks:      文章拉取任务
 *   - config:     系统配置（监控URL列表、监控间隔等）
 */

const { EventEmitter } = require('events');

class MockCollection extends EventEmitter {
  constructor(name) {
    super();
    this.name = name;
    this._data = [];
  }

  async add({ data }) {
    const doc = {
      _id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...data,
    };
    this._data.push(doc);
    console.log(`[MockDB] ${this.name}.add() → _id: ${doc._id}`);
    return { id: doc._id };
  }

  where(conditions) {
    return {
      orderBy: (field, order) => ({
        limit: (count) => ({
          async get() {
            let results = this._filter(conditions);
            if (order === 'desc') results.sort((a, b) => new Date(b[field]) - new Date(a[field]));
            return { data: results.slice(0, count), total: results.length };
          }
        }),
        async get() {
          return { data: this._filter(conditions), total: this._filter(conditions).length };
        },
      }),
      count: async () => ({ total: this._filter(conditions).length }),
      field: () => ({
        async get() {
          return { data: this._filter(conditions), total: this._filter(conditions).length };
        }
      }),
      async get() {
        return { data: this._filter(conditions), total: this._filter(conditions).length };
      },
      _filter: (conditions) => {
        let results = [...mockDb[this.name]._data];
        if (conditions) {
          for (const [key, value] of Object.entries(conditions)) {
            results = results.filter(doc => doc[key] === value);
          }
        }
        return results;
      },
    };
  }

  doc(id) {
    return {
      async get() {
        const doc = mockDb[this.name]._data.find(d => d._id === id);
        return { data: doc || null };
      },
      async update({ data }) {
        const idx = mockDb[this.name]._data.findIndex(d => d._id === id);
        if (idx >= 0) {
          mockDb[this.name]._data[idx] = { ...mockDb[this.name]._data[idx], ...data };
          console.log(`[MockDB] ${this.name}.update(${id}) 成功`);
        }
      },
    };
  }
}

// 全局模拟数据库实例
const mockDb = {
  tasks: new MockCollection('tasks'),
  config: new MockCollection('config'),
};

/**
 * 初始化模拟数据（v2.2）
 */
function initMockData(customConfig) {
  // 清空
  mockDb.tasks._data = [];
  mockDb.config._data = [];

  // 默认配置
  mockDb.config._data.push({
    _id: 'monitorInterval',
    value: 60000,
    updatedAt: new Date(),
  });

  // 监控星球列表（可自定义覆盖）
  mockDb.config._data.push({
    _id: 'monitorUrls',
    value: customConfig?.urls || [
      // TODO: 在这里配置要测试的星球URL
      // 格式: 'https://wx.zsxq.com/group/数字ID'
      // 例如: 'https://wx.zsxq.com/group/48418518458448'
    ],
    updatedAt: new Date(),
  });

  console.log('[MockDB] 初始化完成');
  console.log(`[MockDB] 集合: ${Object.keys(mockDb).join(', ')}`);
  console.log(`[MockDB] 配置项:`, mockDb.config._data.map(c => c._id));
}

module.exports = {
  mockDb,
  initMockData,
};
