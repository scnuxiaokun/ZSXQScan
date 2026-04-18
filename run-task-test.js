#!/usr/bin/env node
/**
 * 运行Task MySQL单元测试
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 开始运行 Task MySQL 单元测试...\n');
console.log('=' .repeat(60));
console.log('');

const testScript = path.join(__dirname, 'tests', 'testTask-mysql.js');

const child = spawn('node', [testScript], {
  cwd: __dirname,
  stdio: 'inherit'
});

child.on('close', (code) => {
  console.log('');
  console.log('=' .repeat(60));
  if (code === 0) {
    console.log('✅ 测试完成！');
  } else {
    console.log(`❌ 测试失败，退出码: ${code}`);
  }
  process.exit(code);
});

child.on('error', (err) => {
  console.error('❌ 执行错误:', err.message);
  process.exit(1);
});
