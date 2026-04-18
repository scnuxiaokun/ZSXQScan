#!/usr/bin/env node
/**
 * 运行Task MySQL单元测试的包装脚本
 */

const { exec } = require('child_process');
const path = require('path');

console.log('🚀 开始运行 Task MySQL 单元测试...\n');

const testScript = path.join(__dirname, 'tests', 'testTask-mysql.js');

const child = exec(`node "${testScript}"`, {
  cwd: __dirname,
  maxBuffer: 1024 * 1024 * 10 // 10MB buffer
});

child.stdout.on('data', (data) => {
  process.stdout.write(data);
});

child.stderr.on('data', (data) => {
  process.stderr.write(data);
});

child.on('close', (code) => {
  console.log('\n' + '='.repeat(50));
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
