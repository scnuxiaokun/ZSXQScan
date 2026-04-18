/**
 * 测试获取文章接口
 * 直接调用 getLastUpdatedArticle 函数
 */

const mysql = require('mysql2/promise');
const path = require('path');

// 加载 .env 文件
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// 数据库配置
const dbConfig = {
  host: process.env.MYSQL_HOST || 'sh-cynosdbmysql-grp-5aqhxbwa.sql.tencentcdb.com',
  port: parseInt(process.env.MYSQL_PORT) || 22871,
  user: process.env.MYSQL_USER || 'zsxq_scan_dbuser',
  password: process.env.MYSQL_PASSWORD || 'zsxq@123',
  database: process.env.MYSQL_DATABASE || 'temu-tools-prod-3g8yeywsda972fae',
};

let conn;

/**
 * 从数据库读取配置
 */
async function getConfigFromDB(key) {
  try {
    const [rows] = await conn.query(
      'SELECT `value` FROM `config` WHERE `id` = ? LIMIT 1',
      [key]
    );
    
    if (rows.length === 0) {
      return null;
    }
    
    let value = rows[0].value;
    // 尝试解析 JSON
    try {
      value = JSON.parse(value);
      // 如果解析后是对象且有 value 字段，取 value
      if (typeof value === 'object' && value !== null && value.value !== undefined) {
        value = value.value;
      }
    } catch (e) {
      // 不是 JSON，直接返回字符串
    }
    
    return value;
  } catch (error) {
    console.error(`[MySQL] 读取配置失败 [${key}]:`, error.message);
    return null;
  }
}

/**
 * 初始化数据库连接
 */
async function initDB() {
  console.log('[MySQL] 正在连接腾讯云数据库...');
  conn = await mysql.createConnection(dbConfig);
  console.log('[MySQL] ✅ 连接成功\n');
}

/**
 * 关闭数据库连接
 */
async function closeDB() {
  if (conn) {
    await conn.end();
    console.log('\n[MySQL] 🔒 连接已关闭');
  }
}

/**
 * 主测试函数
 */
async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║     获取文章接口测试                  ║');
  console.log('╚══════════════════════════════════════╝\n');

  try {
    // 初始化数据库
    await initDB();

    // 从数据库获取 Cookie
    console.log('🔑 步骤1: 从数据库获取 Cookie...');
    const cookie = await getConfigFromDB('zsxq_cookie');
    
    if (!cookie) {
      console.error('❌ 数据库中未找到 ZSXQ_COOKIE！');
      await closeDB();
      process.exit(1);
    }
    
    console.log('✅ Cookie 已从数据库加载\n');
    
    // 将 Cookie 设置到环境变量中
    process.env.ZSXQ_COOKIE = cookie;
    console.log('💡 Cookie 已设置到环境变量\n');

    // 导入 getLastUpdatedArticle 模块
    console.log('📄 步骤2: 加载获取文章模块...\n');
    const { getLatestArticle } = require('../functions/getLastUpdatedArticle/index.js');

    // 测试参数
    const testCases = [
      {
        name: '测试用例1: 自动检测最新话题',
        planetUrl: 'https://wx.zsxq.com/group/48418518458448',
        topicId: null,
      },
      // 可以添加更多测试用例
      // {
      //   name: '测试用例2: 指定话题ID',
      //   planetUrl: 'https://wx.zsxq.com/group/48418518458448',
      //   topicId: '82255851284881422',
      // },
    ];

    // 执行测试
    for (const testCase of testCases) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🧪 ${testCase.name}`);
      console.log(`${'='.repeat(60)}`);
      console.log(`星球URL: ${testCase.planetUrl}`);
      console.log(`话题ID: ${testCase.topicId || '(自动检测)'}\n`);

      try {
        const startTime = Date.now();
        
        // 调用获取文章接口
        const article = await getLatestArticle(testCase.planetUrl, testCase.topicId);
        
        const elapsed = Date.now() - startTime;

        console.log('\n========== 文章信息 ==========');
        console.log(`  话题ID:   ${article.topicId}`);
        console.log(`  标题:     ${article.title || '(无标题)'}`);
        console.log(`  类型:     ${article.type}`);
        console.log(`  链接:     ${article.url}`);
        console.log(`  发布时间: ${article.createTime || '未知'}`);
        console.log(`  作者:     ${article.author?.name || '未知'}`);
        console.log(`  互动数据: 👍${article.stats.likeCount} 💬${article.stats.commentCount} 👁️${article.stats.viewCount}`);
        console.log(`  图片数:   ${article.images?.length || 0}`);
        console.log(`  附件数:   ${article.files?.length || 0}`);
        console.log(`\n---------- 正文预览 (前500字) ----------`);
        console.log(article.content.substring(0, 500) || '(无正文内容)');
        console.log('\n===================================\n');
        console.log(`📊 正文总长度: ${article.content.length} 字符`);
        
        // 打印原始数据结构（调试用）
        if (article.raw) {
          console.log('\n🔍 原始数据结构（关键字段）:');
          console.log('  text:', article.raw.text ? `(有内容, 长度: ${article.raw.text.length})` : '无');
          console.log('  text_summary:', article.raw.text_summary ? `(有内容, 长度: ${article.raw.text_summary.length})` : '无');
          console.log('  content:', article.raw.content ? `(有内容, 长度: ${typeof article.raw.content === 'string' ? article.raw.content.length : 'object'})` : '无');
          console.log('  所有键名:', Object.keys(article.raw).slice(0, 20).join(', '));
        }
        
        console.log(`⏱️  耗时: ${elapsed}ms`);

        if (article.content.length === 0) {
          console.log('\n⚠️  警告: 文章内容为空，可能是以下原因：');
          console.log('   1. 该话题确实没有正文（如纯图片帖）');
          console.log('   2. API返回的数据结构需要进一步适配');
          console.log('   3. 需要登录才能查看完整内容');
        }

      } catch (error) {
        console.error(`\n❌ 测试失败: ${error.message}`);
        console.error('错误详情:', error);
      }
    }

    console.log('\n🎉 测试完成！\n');

  } catch (error) {
    console.error('\n❌ 测试异常:', error.message);
    console.error(error);
  } finally {
    await closeDB();
  }
}

// 运行测试
main().catch(console.error);
