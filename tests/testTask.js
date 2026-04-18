/**
 * 本地测试 - 文章获取流程
 *
 * 使用方法：
 *   1. 在 .env 中配置 ZSXQ_COOKIE（必须）
 *   2. 编辑下方 TEST_GROUP_ID 配置要测试的星球
 *   3. 运行: node tests/testTask.js
 *
 * 无需 TCB_ENV — 任务数据存储在本地 data/tasks.json
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { getLatestArticle } = require('../functions/getLastUpdatedArticle');

// ==================== 配置区 ====================
// 填写要测试的星球ID（数字ID）
const TEST_GROUP_ID = '';  // 例如: '48418518458448'

// 可选：直接指定话题ID跳过查询步骤
const TEST_TOPIC_ID = '';  // 例如: '1234567890'
// ================================================

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║     文章获取测试                     ║');
  console.log('╚══════════════════════════════════════╝\n');

  if (!TEST_GROUP_ID) {
    console.error('❌ 请先配置 TEST_GROUP_ID！');
    console.error('   打开 tests/testTask.js，填写星球数字ID。\n');
    process.exit(1);
  }

  const cookie = process.env.ZSXQ_COOKIE;
  if (!cookie) {
    console.error('❌ 未配置 ZSXQ_COOKIE！');
    console.error('   获取文章全文需要 Cookie 认证。\n');
    console.error('   在 .env 中设置: ZSXQ_COOKIE=你的Cookie\n');
    process.exit(1);
  }

  const planetUrl = `https://wx.zsxq.com/group/${TEST_GROUP_ID}`;
  console.log(`[Test] 星球ID: ${TEST_GROUP_ID}`);
  console.log(`[Test] 话题ID: ${TEST_TOPIC_ID || '(自动检测)'}`);
  console.log(`[Test] Cookie: ${cookie.substring(0, 30)}...\n`);

  try {
    const startTime = Date.now();

    const article = await getLatestArticle(
      planetUrl,
      TEST_TOPIC_ID || undefined
    );

    const elapsed = Date.now() - startTime;

    // 输出结果
    console.log('========== 文章内容 ==========');
    console.log(`  标题:     ${article.title}`);
    console.log(`  类型:     ${article.type}`);
    console.log(`  话题ID:   ${article.topicId}`);
    console.log(`  链接:     ${article.url || 'N/A'}`);

    if (article.author) {
      console.log(`  作者:     ${article.author.name}`);
    }

    console.log(`  发布时间: ${article.createTime || '未知'}`);
    console.log(`  互动数据: 👍${article.stats.likeCount} 💬${article.stats.commentCount} 👁️${article.stats.viewCount}`);

    if (article.images && article.images.length > 0) {
      console.log(`  图片:     ${article.images.length} 张`);
      article.images.forEach((img, i) => {
        console.log(`    [${i + 1}] ${img.url} (${img.width}x${img.height})`);
      });
    }

    if (article.files && article.files.length > 0) {
      console.log(`  附件:     ${article.files.length} 个`);
      article.files.forEach((f, i) => {
        console.log(`    [${i + 1}] ${f.name} (${formatSize(f.size)})`);
      });
    }

    console.log('\n---------- 正文预览 (前500字) ----------');
    const preview = article.content.length > 500
      ? article.content.substring(0, 500) + '\n...(截断)'
      : article.content;
    console.log(preview);
    console.log('\n===================================');

    console.log(`\n📊 正文总长度: ${article.content.length} 字符`);
    console.log(`⏱️  耗时: ${elapsed}ms`);
    console.log('🔐 使用模式: 私有API + Cookie认证');

    // 保存完整内容到文件
    const fs = require('fs');
    const outFile = `tests/article_${TEST_GROUP_ID}_${Date.now()}.txt`;
    fs.writeFileSync(outFile, JSON.stringify(article, null, 2), 'utf-8');
    console.log(`\n📄 完整JSON已保存: ${outFile}`);

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);

    if (error.message.includes('401') || error.message.includes('403')) {
      console.error('   ⚠️ Cookie 可能已过期，请重新设置！');
      console.error('   运行: node scripts/runLocal.js login');
    }
    if (error.message.includes('未能获取')) {
      console.error('   ⚠️ 该星球可能没有可见的话题');
    }

    process.exit(1);
  }
}

function formatSize(bytes) {
  if (!bytes) return '未知';
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
}

main().catch(e => {
  console.error('❌ 未捕获错误:', e);
  process.exit(1);
});
