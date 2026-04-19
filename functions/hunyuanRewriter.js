/**
 * 腾讯云混元大模型 - 文章洗稿服务
 * 
 * 使用混元大模型对文章内容进行改写，保持原意但改变表达方式
 */

const https = require('https');

// 混元API配置
const HUNYUAN_API_KEY = process.env.HUNYUAN_API_KEY || '';
const HUNYUAN_BASE_URL = 'https://api.hunyuan.cloud.tencent.com/v1';
const HUNYUAN_MODEL = 'hunyuan-lite'; // 使用免费模型

/**
 * 调用混元大模型进行洗稿
 * @param {string} originalText - 原始文本内容
 * @returns {Promise<string>} 洗稿后的文本
 */
async function rewriteArticle(originalText) {
  if (!HUNYUAN_API_KEY) {
    console.warn('[Hunyuan] API Key未配置，跳过洗稿');
    return originalText;
  }

  if (!originalText || originalText.trim().length === 0) {
    return originalText;
  }

  // 构建洗稿提示词
  const systemPrompt = `你是一个专业的内容改写专家。请对以下文章进行改写，要求：
1. 保持原文的核心观点和信息不变
2. 使用不同的表达方式和句式结构
3. 保持语言流畅自然，符合中文表达习惯
4. 不要添加原文中没有的信息
5. 不要遗漏原文中的重要信息
6. 适当调整段落结构，使文章更易读

请直接输出改写后的内容，不要添加任何解释或说明。`;

  const userPrompt = `请改写以下文章：

${originalText}`;

  try {
    const result = await callHunyuanAPI(systemPrompt, userPrompt);
    
    if (result && result.choices && result.choices[0] && result.choices[0].message) {
      const rewrittenText = result.choices[0].message.content.trim();
      console.log(`[Hunyuan] 洗稿完成，原文长度: ${originalText.length}, 改写后长度: ${rewrittenText.length}`);
      return rewrittenText;
    } else {
      console.error('[Hunyuan] 返回结果格式异常:', JSON.stringify(result));
      return originalText;
    }
  } catch (error) {
    console.error('[Hunyuan] 洗稿失败:', error.message);
    // 失败时返回原文
    return originalText;
  }
}

/**
 * 调用混元API
 * @param {string} systemPrompt - 系统提示词
 * @param {string} userPrompt - 用户提示词
 * @returns {Promise<Object>} API响应
 */
function callHunyuanAPI(systemPrompt, userPrompt) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      model: HUNYUAN_MODEL,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: userPrompt
        }
      ],
      temperature: 0.7, // 控制创造性，0.7比较适中
      max_tokens: 4000 // 最大token数
    });

    const url = new URL(`${HUNYUAN_BASE_URL}/chat/completions`);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${HUNYUAN_API_KEY}`,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          
          // 检查是否有错误
          if (result.error) {
            reject(new Error(`混元API错误: ${result.error.message || JSON.stringify(result.error)}`));
            return;
          }
          
          resolve(result);
        } catch (e) {
          reject(new Error(`解析响应失败: ${e.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('请求超时'));
    });

    req.write(postData);
    req.end();
  });
}

module.exports = {
  rewriteArticle
};
