/**
 * 可在 Node 环境运行的纯逻辑自检（不依赖微信运行时）
 * 运行：node scripts/selfcheck.js
 */
const path = require('path');

// 直接 require 小程序 constants / layout（无 wx 依赖的部分）
const constantsPath = path.join(__dirname, '../miniprogram/utils/constants.js');
const layoutPath = path.join(__dirname, '../miniprogram/utils/layout.js');

const {
  PHOTO_SIZES,
  GRADIENT,
  API_MAX_BASE64_BYTES,
  API_MAX_EDGE,
  FRONTEND_COMPRESS_THRESHOLD_BYTES,
  FRONTEND_COMPRESS_MAX_EDGE,
  CUSTOM_SIZE
} = require(constantsPath);

const { computeLayout, getPresetGridForPhoto } = require(layoutPath);

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('OK:', msg);
  }
}

assert(PHOTO_SIZES.length >= 20, `预置尺寸数量 ${PHOTO_SIZES.length}`);
assert(GRADIENT.startRatio === 0.7, '渐变起点 0.7');
assert(GRADIENT.transitionRange === 0.15, '渐变过渡 0.15');
assert(API_MAX_BASE64_BYTES === 5 * 1024 * 1024, 'API Base64 5MB');
assert(API_MAX_EDGE === 1999, 'API 边长 <2000');
assert(FRONTEND_COMPRESS_THRESHOLD_BYTES === Math.floor(3.5 * 1024 * 1024), '前端 3.5MB 阈值');
assert(FRONTEND_COMPRESS_MAX_EDGE === 1920, '前端最长边 1920');
assert(CUSTOM_SIZE.MIN_PX === 50 && CUSTOM_SIZE.MAX_PX === 4000, '自定义像素范围');
assert(CUSTOM_SIZE.MAX_TOTAL_PIXELS === 16000000, '总像素 1600万');

const inch1 = getPresetGridForPhoto('1寸');
assert(inch1 && inch1.cols === 4 && inch1.rows === 2, '1寸网格 4x2');
const inch2 = getPresetGridForPhoto('2寸');
assert(inch2 && inch2.cols === 2 && inch2.rows === 2, '2寸网格 2x2');

const a4_1 = computeLayout({
  paperId: 'A4',
  photoW: 295,
  photoH: 413,
  presetGrid: { cols: 4, rows: 2 }
});
assert(a4_1.fits && a4_1.count === 8 && a4_1.canvasW === 2480 && a4_1.canvasH === 3508, 'A4 1寸 8 张');

const r4_2 = computeLayout({
  paperId: 'R4',
  photoW: 413,
  photoH: 579,
  presetGrid: { cols: 2, rows: 2 }
});
assert(r4_2.fits && r4_2.count === 4 && r4_2.canvasW === 1800 && r4_2.canvasH === 1200, '6寸 2寸 4 张');

const overflow = computeLayout({
  paperId: 'R4',
  photoW: 413,
  photoH: 579,
  count: 10,
  layoutMode: 'double'
});
assert(!overflow.fits || overflow.maxCount >= 0, '越界检测可运行');

// 搜索语义
function searchSizes(list, keyword) {
  const q = String(keyword || '').trim().toLowerCase();
  return list.filter((s) => {
    const fields = [s.name, s.category, ...(s.aliases || []), ...(s.keywords || [])]
      .map((x) => String(x).toLowerCase());
    return fields.some((f) => f.indexOf(q) !== -1);
  });
}
assert(searchSizes(PHOTO_SIZES, '国考').length >= 1, '搜索 国考');
assert(searchSizes(PHOTO_SIZES, '美签').length >= 1, '搜索 美签');
assert(searchSizes(PHOTO_SIZES, '一寸').length >= 1, '别名 一寸');

// 密钥扫描：前端目录
const fs = require('fs');
function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, files);
    else if (/\.(js|json|wxml|md|ts)$/.test(name)) files.push(p);
  }
  return files;
}
const frontFiles = walk(path.join(__dirname, '../miniprogram'));
const secretPat = /AKI[Dd][0-9A-Za-z]{20,}|CUTOUT_SECRET_KEY\s*[:=]\s*['"][^'"]+['"]/;
let secretHit = false;
frontFiles.forEach((f) => {
  const text = fs.readFileSync(f, 'utf8');
  if (secretPat.test(text)) {
    secretHit = true;
    console.error('SECRET HIT', f);
  }
});
assert(!secretHit, '前端无腾讯云密钥形态字符串');

const flags = require('../miniprogram/config/feature-flags.js');
assert(flags.ENABLE_PRINT_LAYOUT === false, '排版开关默认关闭');
assert(flags.ENABLE_AI_WATERMARK === false, 'AI 水印默认关闭');

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll selfchecks passed');
