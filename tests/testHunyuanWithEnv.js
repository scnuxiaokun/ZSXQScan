/**
 * 混元大模型洗稿功能测试（使用.env配置）
 */

require('dotenv').config();
const { rewriteArticle } = require('../functions/hunyuanRewriter');

console.log('=== 混元洗稿功能测试（使用.env配置）===\n');
console.log('HUNYUAN_API_KEY:', process.env.HUNYUAN_API_KEY ? '已配置 (' + process.env.HUNYUAN_API_KEY.substring(0, 10) + '...)' : '未配置');
console.log('');

// 测试用例
async function runTests() {
  // 测试1: API Key未配置时的降级处理
  console.log('测试1: API Key配置检查');
  if (!process.env.HUNYUAN_API_KEY) {
    try {
      const originalText = '这是一段测试文本';
      const result = await rewriteArticle(originalText);
      
      if (result === originalText) {
        console.log('✅ 通过：API Key未配置时返回原文\n');
      } else {
        console.log('❌ 失败：应该返回原文\n');
      }
    } catch (error) {
      console.log('❌ 失败:', error.message, '\n');
    }
  } else {
    console.log('ℹ️  已配置API Key，跳过降级测试\n');
  }

  // 测试2: 空文本处理
  console.log('测试2: 空文本处理');
  try {
    const result1 = await rewriteArticle('');
    const result2 = await rewriteArticle(null);
    const result3 = await rewriteArticle(undefined);
    
    if (result1 === '' && result2 === null && result3 === undefined) {
      console.log('✅ 通过：空文本正确处理\n');
    } else {
      console.log('❌ 失败：空文本处理异常\n');
    }
  } catch (error) {
    console.log('❌ 失败:', error.message, '\n');
  }

  // 检查是否配置了API Key
  if (!process.env.HUNYUAN_API_KEY) {
    console.log('⚠️  .env文件中未配置 HUNYUAN_API_KEY');
    console.log('请在 .env 文件中添加：HUNYUAN_API_KEY=your_api_key\n');
    console.log('=== 测试完成（仅运行基础测试）===');
    return;
  }

  // 测试3: 短文本洗稿
  console.log('测试3: 短文本洗稿测试');
  try {
    const shortText = '人工智能正在改变我们的生活方式。它让工作更高效，让生活更便捷。';
    console.log('原文:', shortText);
    console.log('正在调用混元API...\n');
    
    const rewritten = await rewriteArticle(shortText);
    console.log('改写后:', rewritten);
    console.log('');
    
    if (rewritten && rewritten.length > 0 && rewritten !== shortText) {
      console.log('✅ 通过：短文本洗稿成功\n');
    } else if (rewritten === shortText) {
      console.log('⚠️  警告：返回了原文（可能是API限制或错误）\n');
    } else {
      console.log('❌ 失败：洗稿结果为空\n');
    }
  } catch (error) {
    console.log('❌ 失败:', error.message, '\n');
  }

  // 测试4: 长文本洗稿
  console.log('测试4: 长文本洗稿测试');
  try {
    const longText = `知识星球是一个高质量的社群平台，聚集了各行各业的专家和从业者。

在知识星球上，你可以：
1. 学习专业知识，提升个人能力
2. 与行业大咖直接交流互动
3. 获取独家内容和资源
4. 建立有价值的人脉关系

许多创作者通过知识星球实现了知识变现，同时也帮助了成千上万的学员成长。这是一个双赢的平台，既促进了知识的传播，也创造了经济价值。

随着互联网的发展，在线学习和社群运营变得越来越重要。知识星球正是抓住了这个机遇，成为了中国领先的付费社群平台之一。`;

    console.log('原文长度:', longText.length);
    console.log('原文前100字:', longText.substring(0, 100) + '...');
    console.log('正在调用混元API...\n');
    
    const rewritten = await rewriteArticle(longText);
    console.log('改写后长度:', rewritten.length);
    console.log('改写后前100字:', rewritten.substring(0, 100) + '...');
    console.log('');
    
    if (rewritten && rewritten.length > 0) {
      // 检查是否保持了核心内容
      const hasKeywords = rewritten.includes('知识星球') || rewritten.includes('社群');
      if (hasKeywords) {
        console.log('✅ 通过：长文本洗稿成功，保持核心内容\n');
      } else {
        console.log('⚠️  警告：可能丢失了核心关键词\n');
      }
    } else {
      console.log('❌ 失败：洗稿结果为空\n');
    }
  } catch (error) {
    console.log('❌ 失败:', error.message, '\n');
  }

  // 测试5: 特殊字符和格式处理
  console.log('测试5: 特殊字符和格式处理');
  try {
    const specialText = '测试特殊字符：\n换行符、"引号"、\'单引号\'、中文标点，以及英文标点.';
    console.log('原文:', specialText);
    console.log('正在调用混元API...\n');
    
    const rewritten = await rewriteArticle(specialText);
    console.log('改写后:', rewritten);
    console.log('');
    
    if (rewritten && rewritten.length > 0) {
      console.log('✅ 通过：特殊字符处理正常\n');
    } else {
      console.log('❌ 失败：特殊字符处理异常\n');
    }
  } catch (error) {
    console.log('❌ 失败:', error.message, '\n');
  }

  console.log('=== 测试完成 ===');
}

// 运行测试
runTests().catch(console.error);
