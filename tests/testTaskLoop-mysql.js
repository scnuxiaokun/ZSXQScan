/**
 * Task接口单元测试 - MySQL版
 * 
 * 测试 loopLastUpdateArticleTask 模块
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const taskModule = require('../functions/loopLastUpdateArticleTask');

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║     Task接口单元测试 (MySQL版)       ║');
  console.log('║     处理pending状态的任务             ║');
  console.log('╚══════════════════════════════════════╝\n');

  try {
    // 调用main函数，不传参数会自动处理所有pending任务
    const result = await taskModule.main({});
    
    console.log('\n========== 测试结果 ==========');
    console.log('返回码:', result.code);
    console.log('消息:', result.message);
    console.log('模式:', result.mode);
    
    if (result.data && result.data.length > 0) {
      console.log(`\n处理了 ${result.data.length} 个任务:\n`);
      
      result.data.forEach((item, index) => {
        console.log(`${index + 1}. 星球ID: ${item.planetId}`);
        console.log(`   状态: ${item.status}`);
        
        if (item.status === 'success') {
          console.log(`   任务ID: ${item.taskId}`);
          console.log(`   文章标题: ${item.articleTitle}`);
          console.log(`   文章长度: ${item.articleLength}`);
          console.log(`   话题ID: ${item.topicId}`);
          console.log(`   话题类型: ${item.topicType}`);
        } else if (item.status === 'failed') {
          console.log(`   错误: ${item.error}`);
        } else if (item.status === 'skipped') {
          console.log(`   原因: ${item.reason}`);
        }
        console.log('');
      });
      
      // 统计
      const successCount = result.data.filter(item => item.status === 'success').length;
      const failedCount = result.data.filter(item => item.status === 'failed').length;
      const skippedCount = result.data.filter(item => item.status === 'skipped').length;
      
      console.log('========== 统计 ==========');
      console.log(`✅ 成功: ${successCount}`);
      console.log(`❌ 失败: ${failedCount}`);
      console.log(`⏭️  跳过: ${skippedCount}`);
    } else {
      console.log('\n没有需要处理的任务');
    }
    
    console.log('\n🎉 测试完成！\n');
    
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main().catch(e => {
  console.error('❌ 未捕获错误:', e);
  process.exit(1);
});
