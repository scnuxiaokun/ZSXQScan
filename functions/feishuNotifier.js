/**
 * 飞书机器人通知模块
 * 
 * 用于在星球监控到更新或任务处理完成时发送飞书通知
 */

const https = require('https');

// 飞书 Webhook URL（从环境变量读取）
const FEISHU_WEBHOOK_URL = process.env.FEISHU_WEBHOOK_URL || 
  'https://open.feishu.cn/open-apis/bot/v2/hook/81d089e6-03cb-4142-804d-12216927b672';

/**
 * 发送飞书通知
 * 
 * @param {Object} options - 通知选项
 * @param {string} options.title - 通知标题
 * @param {string} options.content - 通知内容
 * @param {string} options.color - 颜色标识 (blue, wathet, turquoise, green, yellow, orange, red, purple, gray)
 * @param {Array} options.tags - 标签列表
 * @returns {Promise<Object>} 发送结果
 */
async function sendFeishuNotification({ title, content, color = 'blue', tags = [] }) {
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
              ],
              ...tags.map(tagText => ([
                {
                  tag: 'text',
                  text: tagText
                }
              ]))
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
 * 发送星球更新通知
 * 
 * @param {Object} monitorResult - Monitor返回的结果
 * @returns {Promise<void>}
 */
async function notifyPlanetUpdate(monitorResult) {
  if (!monitorResult.hasUpdate) return;

  const title = `🌍 星球更新提醒`;
  const content = `星球名称：${monitorResult.planetName}\n` +
                  `最新话题：${monitorResult.relativeTime}\n` +
                  `成员数：${monitorResult.memberCount || 'N/A'}\n` +
                  `话题数：${monitorResult.topicCount || 'N/A'}`;

  try {
    await sendFeishuNotification({
      title,
      content,
      color: 'green',
      tags: [`创建时间：${monitorResult.createTime}`]
    });
  } catch (e) {
    console.error('[Feishu] 发送星球更新通知失败:', e.message);
  }
}

/**
 * 发送任务处理结果通知
 * 
 * @param {Object} taskResult - Task返回的结果
 * @returns {Promise<void>}
 */
async function notifyTaskResult(taskResult) {
  const isSuccess = taskResult.status === 'success';
  const title = isSuccess ? `✅ 任务处理成功` : `❌ 任务处理失败`;
  
  let content = `星球ID：${taskResult.planetId}\n`;
  
  if (isSuccess) {
    content += `文章标题：${taskResult.articleTitle || 'N/A'}\n` +
               `内容长度：${taskResult.contentLength || 0} 字符`;
  } else {
    content += `错误信息：${taskResult.error || taskResult.reason || '未知错误'}`;
  }

  try {
    await sendFeishuNotification({
      title,
      content,
      color: isSuccess ? 'green' : 'red'
    });
  } catch (e) {
    console.error('[Feishu] 发送任务结果通知失败:', e.message);
  }
}

module.exports = {
  sendFeishuNotification,
  notifyPlanetUpdate,
  notifyTaskResult,
};
