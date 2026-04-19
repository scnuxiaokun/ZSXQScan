/**
 * HTML转纯文本工具函数
 */

/**
 * 将HTML内容转换为纯文本
 * 
 * @param {string} html - HTML字符串
 * @returns {string} 纯文本内容
 */
function htmlToPlainText(html) {
  if (!html || typeof html !== 'string') return '';
  if (!/<\/?[a-z][\s\S]*>/i.test(html)) return html.trim();
  return html
    .replace(/<\/?(p|div|h[1-6]|br|li|tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n\n')
    .trim();
}

module.exports = {
  htmlToPlainText
};
