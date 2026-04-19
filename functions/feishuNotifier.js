/**
 * 飞书机器人通知模块
 * 
 * 用于在任务处理完成时发送文章内容到飞书
 */

const https = require('https');
const { rewriteArticle } = require('./hunyuanRewriter');

// 飞书 Webhook URL（从环境变量读取，或使用默认值）
const FEISHU_WEBHOOK_URL = process.env.FEISHU_WEBHOOK_URL || 
  'https://open.feishu.cn/open-apis/bot/v2/hook/81d089e6-03cb-4142-804d-12216927b672';

/**
 * 发送飞书通知
 * 
 * @param {Object} options - 通知选项
 * @param {string} options.title - 通知标题
 * @param {string} options.content - 通知内容
 * @returns {Promise<Object>} 发送结果
 */
async function sendFeishuNotification({ title, content }) {
  return new Promise((resolve, reject) => {
    const message = {
      msg_type: 'post',
      content: {
        post: {
          zh_cn: {
            title: title,
            content: [
              [
                {
                  tag: 'text',
                  text: content
                }
              ]
            ]
          }
        }
      }
    };

    const postData = JSON.stringify(message);

    const url = new URL(FEISHU_WEBHOOK_URL);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
          if (result.code === 0) {
            console.log('[Feishu] ✅ 通知发送成功');
            resolve(result);
          } else {
            console.error('[Feishu] ❌ 通知发送失败:', result.msg);
            reject(new Error(result.msg));
          }
        } catch (e) {
          console.error('[Feishu] ❌ 解析响应失败:', e.message);
          reject(e);
        }
      });
    });

    req.on('error', (e) => {
      console.error('[Feishu] ❌ 请求失败:', e.message);
      reject(e);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * 从文章数据中提取文本内容
 * 
 * @param {Object} articleData - 文章数据
 * @returns {string} 提取的文本内容
 */
function extractTextContent(articleData) {
  if (!articleData || !articleData.raw) return '';
  
  const raw = articleData.raw;
  
  // 尝试从多个位置提取文本内容
  // 1. 优先使用 solution.text（问答类型）
  if (raw.solution?.text) {
    return raw.solution.text;
  }
  
  // 2. 其次使用 talk.text
  if (raw.talk?.text) {
    return raw.talk.text;
  }
  
  // 3. 再使用 text 字段
  if (raw.text) {
    return raw.text;
  }
  
  // 4. 最后使用 text_summary
  if (raw.text_summary) {
    return raw.text_summary;
  }
  
  return '';
}

/**
 * 发送文章完成通知
 * 
 * @param {Object} taskResult - Task处理结果
 * @param {Object} articleData - 文章数据
 * @returns {Promise<void>}
 */
async function notifyArticleCompleted(taskResult, articleData) {
  // 从 raw 数据中提取原始文本内容
  const textContent = extractTextContent(articleData);
  if (!textContent) return;

  // 使用混元大模型进行洗稿
  console.log('[Feishu] 开始洗稿...');
  const rewrittenContent = await rewriteArticle(textContent);
  console.log('[Feishu] 洗稿完成');

  const title = `📝 新文章提醒`;
  
  // 构建通知头部
  const header = `文章标题：${articleData.title || '无标题'}\n────────────────────\n\n`;
  
  // 每条消息的最大长度（预留头部空间）
  const maxContentLength = 500;
  const maxMessageLength = maxContentLength - header.length;
  
  // 如果内容不超过限制，直接发送
  if (rewrittenContent.length <= maxMessageLength) {
    const content = header + rewrittenContent;
    try {
      await sendFeishuNotification({ title, content });
    } catch (e) {
      console.error('[Feishu] 发送文章通知失败:', e.message);
    }
    return;
  }
  
  // 内容过长，切分为多条消息
  const chunks = [];
  let remaining = rewrittenContent;
  let chunkIndex = 1;
  
  while (remaining.length > 0) {
    // 计算当前块的长度
    const currentMaxLength = chunkIndex === 1 ? maxMessageLength : maxContentLength;
    let chunk = remaining.substring(0, currentMaxLength);
    
    // 如果不是最后一块，尝试在合适的位置截断（避免切断单词或句子）
    if (remaining.length > currentMaxLength) {
      // 尝试在换行符处截断
      const lastNewline = chunk.lastIndexOf('\n');
      if (lastNewline > currentMaxLength * 0.7) {
        chunk = chunk.substring(0, lastNewline);
      }
    }
    
    chunks.push(chunk);
    remaining = remaining.substring(chunk.length);
    chunkIndex++;
  }
  
  // 逐条发送
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    let content;
    
    if (i === 0) {
      // 第一条包含头部
      content = header + chunk;
      if (chunks.length > 1) {
        content += '\n\n...（内容较长，分多条发送）';
      }
    } else {
      // 后续条只包含内容
      content = `（续 ${i}/${chunks.length - 1}）\n\n${chunk}`;
    }
    
    try {
      await sendFeishuNotification({ title, content });
      // 每条消息之间稍微延迟，避免触发频率限制
      if (i < chunks.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (e) {
      console.error(`[Feishu] 发送第 ${i + 1} 条通知失败:`, e.message);
    }
  }
}

module.exports = {
  sendFeishuNotification,
  notifyArticleCompleted,
};
