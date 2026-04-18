/**
 * CloudBase MySQL 数据库适配器
 * 
 * 模拟 MongoDB 风格的 API（collection/doc/where/add/get/update）
 * 列名直接使用 camelCase（与代码一致）
 */

const mysql = require('mysql2/promise');

let pool = null;

/**
 * 初始化 MySQL 连接池
 */
function initPool() {
  if (pool) return pool;

  const host = process.env.DB_HOST;
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME || 'temu-tools-prod-3g8yeywsda972fae';
  const port = parseInt(process.env.DB_PORT || '3306', 10);

  if (!host || !password) {
    throw new Error(
      '缺少 MySQL 连接参数！\n' +
      '请在环境变量中配置:\n' +
      '  DB_HOST     - 数据库内网地址\n' +
      '  DB_PASSWORD - 数据库密码\n'
    );
  }

  pool = mysql.createPool({
    host,
    user,
    password,
    database,
    port,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  console.log(`[MySQL] 连接池已初始化 → ${host}:${port}/${database}`);
  return pool;
}

/**
 * 安全转义标识符（表名/列名）- 只允许 camelCase / 字母数字下划线
 */
function esc(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`无效的标识符: ${name}`);
  }
  return '`' + name + '`';
}

/**
 * 模拟 MongoDB Collection API
 */
class MySqlCollection {
  constructor(tableName) {
    this.tableName = tableName;
    this._t = esc(tableName);
  }

  doc(docId) {
    const t = this._t;
    return {
      get: async () => {
        const conn = await initPool().getConnection();
        try {
          let [rows] = await conn.query(
            'SELECT * FROM ' + t + ' WHERE `id` = ? LIMIT 1',
            [docId]
          );
          return { data: rows[0] || null };
        } finally { conn.release(); }
      },

      update: async ({ data }) => {
        const conn = await initPool().getConnection();
        try {
          // 直接用 data 的 key 作为列名（已经是 camelCase）
          const fields = [];
          const values = [];
          for (const [k, v] of Object.entries(data)) {
            fields.push(esc(k) + ' = ?');
            values.push(v);
          }
          values.push(docId);

          const [result] = await conn.query(
            'UPDATE ' + t + ' SET ' + fields.join(', ') + ' WHERE `id` = ?',
            values
          );
          return { updated: result.affectedRows > 0 };
        } finally { conn.release(); }
      },

      remove: async () => {
        const conn = await initPool().getConnection();
        try {
          await conn.query('DELETE FROM ' + t + ' WHERE `id` = ?', [docId]);
          return { deleted: true };
        } finally { conn.release(); }
      },
    };
  }

  where(conditions) {
    this._whereConditions = conditions || {};
    this._fieldSelect = null;
    this._orderBy = null;
    this._limitCount = null;
    return this;
  }

  field(fields) {
    this._fieldSelect = Array.isArray(fields) ? fields : Object.keys(fields);
    return this;
  }

  orderBy(field, direction) {
    this._orderBy = { field, direction };
    return this;
  }

  limit(count) {
    this._limitCount = count;
    return this;
  }

  async get() {
    const conn = await initPool().getConnection();
    try {
      let sql = 'SELECT ';

      if (this._fieldSelect && this._fieldSelect.length > 0) {
        sql += this._fieldSelect.map(f => esc(f)).join(', ');
      } else {
        sql += '*';
      }

      sql += ' FROM ' + this._t;

      const params = [];
      if (this._whereConditions && Object.keys(this._whereConditions).length > 0) {
        const conditions = [];
        for (const [key, value] of Object.entries(this._whereConditions)) {
          conditions.push(esc(key) + ' = ?');
          params.push(value);
        }
        sql += ' WHERE ' + conditions.join(' AND ');
      }

      if (this._orderBy) {
        sql += ' ORDER BY ' + esc(this._orderBy.field) + ' ' + this._orderBy.direction.toUpperCase();
      }

      if (this._limitCount != null && !isNaN(Number(this._limitCount))) {
        sql += ' LIMIT ' + parseInt(this._limitCount, 10);
      }

      const [rows] = await conn.query(sql, params);
      return { data: rows };
    } finally { conn.release(); }
  }

  async count() {
    const conn = await initPool().getConnection();
    try {
      let sql = 'SELECT COUNT(*) as total FROM ' + this._t;
      const params = [];

      if (this._whereConditions && Object.keys(this._whereConditions).length > 0) {
        const conditions = [];
        for (const [key, value] of Object.entries(this._whereConditions)) {
          conditions.push(esc(key) + ' = ?');
          params.push(value);
        }
        sql += ' WHERE ' + conditions.join(' AND ');
      }

      const [rows] = await conn.query(sql, params);
      return { total: rows[0]?.total || 0 };
    } finally { conn.release(); }
  }

  async add({ data }) {
    const conn = await initPool().getConnection();
    try {
      // 直接用 data 的 key 作为列名（已经是 camelCase，无需转换）
      let fields = Object.keys(data);
      let values = Object.values(data);

      // 如果没有 _id 字段，自动生成 id
      if (!data.id && !data._id) {
        fields.unshift('id');
        values.unshift(Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
      }

      const colNames = fields.map(f => esc(f)).join(', ');
      const placeholders = fields.map(() => '?').join(', ');

      await conn.query(
        'INSERT INTO ' + this._t + ' (' + colNames + ') VALUES (' + placeholders + ')',
        values
      );

      return { id: values[0], insertedId: values[0] };
    } finally { conn.release(); }
  }
}

function init() {
  initPool();
  console.log('[MySQL] 数据库模式: MySQL (' + (process.env.DB_NAME || process.env.TCB_ENV) + ')');

  return {
    collection(name) {
      return new MySqlCollection(name);
    },
    database() {
      return {
        collection(name) {
          return new MySqlCollection(name);
        }
      };
    }
  };
}

module.exports = { init, initPool };
