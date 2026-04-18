#!/usr/bin/env node
/**
 * 云函数 ZIP 打包脚本
 *
 * 将每个云函数目录打包成独立的 zip 文件，
 * 用于通过腾讯云控制台手动上传部署。
 *
 * 使用方式：
 *   node scripts/buildZip.js          # 打包所有函数
 *   node scripts/buildZip.js clean    # 清理生成的 zip 和临时复制文件
 *
 * 输出：dist/ 目录下生成 4 个 zip 文件
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');

const ROOT = path.resolve(__dirname, '..');
const FUNCTIONS_DIR = path.join(ROOT, 'functions');
const DIST_DIR = path.join(ROOT, 'dist');

// 共享模块（functions/ 根目录下的 .js 文件）
const SHARED_MODULES = ['zsxqApi.js', 'cookieManager.js', 'jsonDb.js'];

// 每个函数依赖的文件清单
const FN_DEPS = {
  'updatedMonitor': {
    // 自身文件（必须包含）
    own: ['index.js', 'package.json'],
    // 从 functions/ 根目录复制的共享模块
    shared: ['zsxqApi.js', 'jsonDb.js'],
    // 额外说明（控制台配置用）
    handler: 'index.main',
    timeout: 60,
  },
  'loopLastUpdateArticleTask': {
    own: ['index.js', 'package.json', 'config.json'],
    shared: ['zsxqApi.js', 'jsonDb.js'],
    // 跨函数目录：把 getLastUpdatedArticle/ 整个目录打进去
    extraDirs: ['getLastUpdatedArticle'],
    handler: 'index.main',
    timeout: 60,
  },
  'login': {
    own: ['index.js', 'package.json'],
    shared: ['zsxqApi.js', 'cookieManager.js', 'jsonDb.js'],
    handler: 'index.main',
    timeout: 30,
  },
  'getLastUpdatedArticle': {
    own: ['index.js', 'package.json'],
    shared: ['zsxqApi.js'],
    handler: 'index.main',
    timeout: 30,
  },
};

/**
 * 递归统计文件数量
 */
function countFiles(dir) {
  let count = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += countFiles(p);
    } else {
      count++;
    }
  }
  return count;
}

/**
 * 确保目录存在
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 复制文件或目录到目标位置（用于构建临时打包目录）
 */
function copyToStaging(src, dest) {
  if (fs.statSync(src).isDirectory()) {
    ensureDir(dest);
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        copyToStaging(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  } else {
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
  }
}

/**
 * 用 Node.js 原生方式创建 zip（避免系统 zip 命令兼容性问题）
 */
function createZip(stagingDir, outputPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve());
    archive.on('error', reject);
    archive.pipe(output);

    // 递归添加 stagingDir 下所有文件（保持相对路径）
    const addDir = (dir, baseName) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = baseName ? `${baseName}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          addDir(fullPath, relativePath);
        } else {
          archive.file(fullPath, { name: relativePath });
        }
      }
    };
    addDir(stagingDir, null);

    archive.finalize();
  });
}

/**
 * 打包单个函数
 */
async function buildOne(fnName, deps) {
  const fnDir = path.join(FUNCTIONS_DIR, fnName);
  const stagingDir = path.join(DIST_DIR, `.${fnName}_staging`);
  const zipPath = path.join(DIST_DIR, `${fnName}.zip`);

  // 清理旧的 staging
  if (fs.existsSync(stagingDir)) {
    fs.rmSync(stagingDir, { recursive: true });
  }
  ensureDir(stagingDir);  // 确保staging目录存在

  // 1. 复制自身文件
  console.log(`\n📦 ${fnName}:`);
  for (const file of deps.own) {
    const src = path.join(fnDir, file);
    if (!fs.existsSync(src)) {
      console.error(`  ❌ 缺少 ${file}`);
      process.exit(1);
    }
    fs.copyFileSync(src, path.join(stagingDir, file));
    console.log(`  ✅ ${file} (自身)`);
  }

  // 2. 复制共享模块
  for (const mod of (deps.shared || [])) {
    const src = path.join(FUNCTIONS_DIR, mod);
    if (!fs.existsSync(src)) {
      console.error(`  ❌ 共享模块 ${mod} 不存在`);
      process.exit(1);
    }
    fs.copyFileSync(src, path.join(stagingDir, mod));
    console.log(`  ✅ ${mod} (共享)`);
  }

  // 3. 复制额外目录（如 loopLastUpdateArticleTask 需要 getLastUpdatedArticle/）
  for (const dirName of (deps.extraDirs || [])) {
    const src = path.join(FUNCTIONS_DIR, dirName);
    if (!fs.existsSync(src)) {
      console.error(`  ❌ 额外目录 ${dirName}/ 不存在`);
      process.exit(1);
    }
    copyToStaging(src, path.join(stagingDir, dirName));
    console.log(`  ✅ ${dirName}/ (跨函数)`);
  }

  // 4. 修正 require 路径：../ → ./ （因为云函数解压后所有文件在同一级 /var/user/）
  const jsFilesInStaging = fs.readdirSync(stagingDir).filter(f => f.endsWith('.js'));
  for (const jsFile of jsFilesInStaging) {
    const filePath = path.join(stagingDir, jsFile);
    let content = fs.readFileSync(filePath, 'utf-8');
    
    // 替换 require('../module') → require('./module')
    const origRequire = content;
    content = content.replace(/require\('\.\.\//g, "require('./");
    content = content.replace(/require\("\.\.\//g, 'require("./');
    
    // 替换 __dirname + '/../module' → __dirname + '/module'
    content = content.replace(/__dirname\s*\+\s*['"]\/\.\.\//g, "__dirname + '/");
    
    if (content !== origRequire) {
      fs.writeFileSync(filePath, content, 'utf-8');
      console.log(`  🔧 ${jsFile} (修正 require 路径 ../ → ./)`);
    }
  }

  // 对 extraDirs 里的业务代码 .js 文件修正路径（⚠️ 跳过 node_modules）
  function fixRequirePaths(dir, baseRel) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      // 跳过 node_modules，不破坏第三方包内部路径
      if (entry.isDirectory() && entry.name === 'node_modules') continue;
      
      const relPath = baseRel ? `${baseRel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        fixRequirePaths(fullPath, relPath);
      } else if (entry.name.endsWith('.js')) {
        let content = fs.readFileSync(fullPath, 'utf-8');
        const orig = content;
        content = content.replace(/require\('\.\.\//g, "require('./");
        content = content.replace(/require\("\.\.\//g, 'require("./');
        content = content.replace(/__dirname\s*\+\s*['"]\/\.\.\//g, "__dirname + '/");
        if (content !== orig) {
          fs.writeFileSync(fullPath, content, 'utf-8');
          console.log(`  🔧 ${relPath} (修正 require 路径 ../ → ./)`);
        }
      }
    }
  }
  for (const dirName of (deps.extraDirs || [])) {
    fixRequirePaths(path.join(stagingDir, dirName), dirName);
  }

  // 5. 复制 node_modules（绕过平台 BuildCode bug）
  const nmSrc = path.join(fnDir, 'node_modules');
  if (fs.existsSync(nmSrc)) {
    copyToStaging(nmSrc, path.join(stagingDir, 'node_modules'));
    const nmCount = countFiles(nmSrc);
    console.log(`  ✅ node_modules/ (${nmCount} 文件)`);
  } else {
    console.warn(`  ⚠️  node_modules/ 不存在，请先在 ${fnDir}/ 执行 npm install`);
  }

  // 5. 创建 zip
  await createZip(stagingDir, zipPath);
  const sizeKB = Math.round(fs.statSync(zipPath).size / 1024);
  console.log(`  📄 → ${fnName}.zip (${sizeKB} KB)`);

  // 清理 staging 目录
  fs.rmSync(stagingDir, { recursive: true });

  return { fnName, handler: deps.handler, timeout: deps.timeout, sizeKB };
}

/**
 * 主流程
 */
async function main() {
  const clean = process.argv.includes('clean');

  if (clean) {
    console.log('🧹 清理打包产物...\n');
    let count = 0;
    if (fs.existsSync(DIST_DIR)) {
      for (const f of fs.readdirSync(DIST_DIR)) {
        if (f.endsWith('.zip') || f.endsWith('_staging')) {
          const p = path.join(DIST_DIR, f);
          if (fs.statSync(p).isDirectory()) {
            fs.rmSync(p, { recursive: true });
          } else {
            fs.unlinkSync(p);
          }
          count++;
          console.log(`  🗑️  ${f}`);
        }
      }
    }
    console.log(`\n🧹 已清理 ${count} 项`);
    return;
  }

  console.log('📦 开始打包云函数...\n');
  console.log('目标：腾讯云 SCF 控制台手动上传\n');

  ensureDir(DIST_DIR);

  const results = [];
  for (const [fnName, deps] of Object.entries(FN_DEPS)) {
    const result = await buildOne(fnName, deps);
    results.push(result);
  }

  // 输出汇总 + 控制台上传指南
  console.log('\n' + '='.repeat(55));
  console.log('✅ 全部打包完成！\n');
  console.log('📁 输出目录: dist/\n');
  console.log('┌─────────────────────────┬──────────┬────────┬────────────┐');
  console.log('│ 函数名                   │ Handler  │ 超时(s) │ Zip 大小   │');
  console.log('├─────────────────────────┼──────────┼────────┼────────────┤');
  for (const r of results) {
    console.log(`│ ${r.fnName.padEnd(23)} │ ${r.handler.padEnd(8)} │ ${String(r.timeout).padEnd(6)} │ ${String(r.sizeKB).padEnd(10)} KB │`);
  }
  console.log('└─────────────────────────┴──────────┴────────┴────────────┘\n');

  console.log('🚀 控制台上传步骤:\n');
  console.log('1. 打开 https://console.cloud.tencent.com/scf/list');
  console.log('2. 选择环境: temu-tools-prod-3g8yeywsda972fae');
  console.log('3. 对每个函数，点击"函数代码" → "上传" → "本地上传ZIP包"');
  console.log('4. 上传对应的 zip 文件（见上表）\n');
  console.log('5. 确认配置:');
  console.log('   - 运行时: Node.js 18.x 或 20.x');
  console.log('   - 入口方法: index.main');
  console.log('   - 执行方法: 见上表超时设置\n');
  console.log('5. ⚠️ 关键：在控制台取消勾选 "自动安装依赖"（InstallDependency），因为 node_modules 已打包在内！\n');
}

main().catch(err => {
  console.error('❌ 打包失败:', err.message);
  process.exit(1);
});
