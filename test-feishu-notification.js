/**
 * 测试飞书通知功能
 */

const feishuNotifier = require('./functions/feishuNotifier');

async function testFeishuNotification() {
  console.log('\n╔═══════════════════════════════════════╗');
  console.log('║     飞书通知功能测试                  ║');
  console.log('╚═══════════════════════════════════════╝\n');

  // 模拟任务处理结果
  const taskResult = {
    planetId: '48418518458448',
    status: 'success',
    taskId: 'test123',
    articleTitle: '本周复盘'
  };

  // 模拟文章数据
  const articleData = {
    title: '本周复盘\n思格不错 中了一个小奖',
    content: '本周工作复盘：\n\n1. 完成了ZSXQScan项目的重构\n2. 抽取了monitorService和taskService模块\n3. 添加了飞书通知功能\n4. 优化了代码结构，提高了可维护性\n\n下周计划：\n- 继续优化性能\n- 添加更多监控指标\n- 完善错误处理机制',
    createTime: new Date().toISOString(),
    topicId: '82255851211812112',
    type: 'talk'
  };

  try {
    console.log('📤 发送飞书通知...\n');
    console.log('星球ID:', taskResult.planetId);
    console.log('文章标题:', articleData.title);
    console.log('内容长度:', articleData.content.length, '字符\n');

    await feishuNotifier.notifyArticleCompleted(taskResult, articleData);

    console.log('\n✅ 飞书通知发送成功！\n');
  } catch (error) {
    console.error('\n❌ 飞书通知发送失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testFeishuNotification().catch(e => {
  console.error('❌ 测试异常:', e);
  process.exit(1);
});
