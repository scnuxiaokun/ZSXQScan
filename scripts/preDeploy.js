#!/usr/bin/env node
/**
 * 部署前准备脚本
 *
 * CloudBase 部署时，每个函数目录是独立上传的，
 * 不会包含 functions/ 根目录的共享模块。
 * 此脚本在部署前将共享模块复制到每个需要它的函数目录中。
 *
 * 使用方式：
 *   node scripts/preDeploy.js          # 复制模块
 *   node scripts/preDeploy.js --clean   # 清理复制的模块
 */

const fs = require('fs');
const path = require('path');

const FUNCTIONS_DIR = path.resolve(__dirname, '..', 'functions');

// 共享模块（functions/ 根目录下的 .js 文件）
const SHARED_MODULES = ['zsxqApi.js', 'cookieManager.js', 'jsonDb.js'];

// 每个函数依赖的共享模块
const FN_DEPS = {
  'updatedMonitor':        { shared: ['zsxqApi.js', 'jsonDb.js'] },
  'loopLastUpdateArticleTask': {
    shared: ['zsxqApi.js', 'jsonDb.js'],
    // 跨函数目录依赖：{ "本地目录名": "源路径" }
    dirs: { 'getLastUpdatedArticle': 'getLastUpdatedArticle' },
  },
  'login':                 { shared: ['zsxqApi.js', 'cookieManager.js', 'jsonDb.js'] },
  'getLastUpdatedArticle':  { shared: ['zsxqApi.js'] },
};

function copyDir(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function removeDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) removeDir(p); else fs.unlinkSync(p);
  }
  fs.rmdirSync(dir);
}

function run(clean = false) {
  console.log(`📦 ${clean ? '🧹 清理' : '📋 复制'} 共享模块到各函数目录\n`);
  let count = 0;

  for (const [fnDir, deps] of Object.entries(FN_DEPS)) {
    const fnPath = path.join(FUNCTIONS_DIR, fnDir);

    // 复制/清理共享 .js 模块
    for (const mod of (deps.shared || [])) {
      const src = path.join(FUNCTIONS_DIR, mod);
      const dest = path.join(fnPath, mod);

      if (clean) {
        if (fs.existsSync(dest)) { fs.unlinkSync(dest); count++; console.log(`  🗑️  ${fnDir}/${mod}`); }
      } else {
        if (!fs.existsSync(src)) { console.error(`❌ ${mod} 不存在`); process.exit(1); }
        fs.copyFileSync(src, dest);
        count++;
        console.log(`  ✅ ${fnDir}/${mod}`);
      }
    }

    // 复制/清理跨函数目录
    for (const [dirName, srcName] of Object.entries(deps.dirs || {})) {
      const src = path.join(FUNCTIONS_DIR, srcName);
      const dest = path.join(fnPath, dirName);

      if (clean) {
        removeDir(dest);
        count++;
        console.log(`  🗑️  ${fnDir}/${dirName}/`);
      } else {
        copyDir(src, dest);
        count++;
        console.log(`  ✅ ${fnDir}/${dirName}/`);
      }
    }
  }

  console.log(`\n${clean ? `🧹 已清理 ${count} 项` : `✅ 已准备 ${count} 项`}，可以执行部署`);
}

run(process.argv.includes('--clean'));
