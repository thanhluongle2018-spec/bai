/**
 * 证件照工具常量与一期尺寸数据
 *
 * SegmentPortraitPic 限制来源：腾讯云官方文档
 * https://cloud.tencent.com/document/product/1208/42970
 * 免费额度等账号级信息须在控制台核实，见 docs/tencent-cloud-segment-portrait-verification.md
 */

/** 前端：超过该体积则压缩至最长边 FRONTEND_COMPRESS_MAX_EDGE */
const FRONTEND_COMPRESS_THRESHOLD_BYTES = Math.floor(3.5 * 1024 * 1024);
const FRONTEND_COMPRESS_MAX_EDGE = 1920;

/**
 * API：Base64 编码后 ≤ 5MB；分辨率须小于 2000×2000
 * （来自官方 API 文档，非控制台）
 */
const API_MAX_BASE64_BYTES = 5 * 1024 * 1024;
/** 宽高均须 < 2000，故最长边上限取 1999 */
const API_MAX_EDGE = 1999;
const API_ALLOWED_EXT = ['png', 'jpg', 'jpeg', 'bmp'];
const API_ALLOWED_MIME = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/bmp',
  'image/x-ms-bmp'
];

/**
 * 官方购买指南写明：开通后每种服务每月 1000 次免费额度。
 * 此值仅作提示，实际额度以腾讯云控制台「资源包管理」为准，不得当作已保证事实。
 */
const FREE_QUOTA_HINT_PER_MONTH = 1000;

/** 文档记载的默认请求频率提示（次/秒）；账号实际限流以控制台为准 */
const API_QPS_HINT = 300;

/** 自定义尺寸校验 */
const CUSTOM_SIZE = {
  MIN_PX: 50,
  MAX_PX: 4000,
  MAX_TOTAL_PIXELS: 1600 * 10000, // 1600 万
  MIN_MM: 5,
  MAX_MM: 500
};

/** 干部蓝白渐变：一期固定 70% 起点、15% 过渡（后续可配置） */
const GRADIENT = {
  startRatio: 0.7,
  transitionRange: 0.15,
  topColor: '#002FA7',
  bottomColor: '#FFFFFF'
};

/** 背景色预设 */
const BG_COLORS = [
  { id: 'white', name: '白色', type: 'solid', color: '#FFFFFF' },
  { id: 'blue', name: '蓝色', type: 'solid', color: '#438EDB' },
  { id: 'red', name: '红色', type: 'solid', color: '#D81E06' },
  { id: 'light-blue', name: '浅蓝', type: 'solid', color: '#8EB4E3' },
  { id: 'gray', name: '灰色', type: 'solid', color: '#C0C0C0' },
  {
    id: 'cadre-blue-white',
    name: '干部蓝白渐变',
    type: 'gradient',
    ...GRADIENT
  }
];

/** 缓存默认有效期（天） */
const CUTOUT_CACHE_TTL_DAYS = 7;

/** 云函数配置期望值（部署时在控制台核对） */
const CLOUD_FUNCTION = {
  segmentPortrait: {
    name: 'segment-portrait',
    memory: 512,
    timeout: 60,
    envKeys: ['CUTOUT_SECRET_ID', 'CUTOUT_SECRET_KEY', 'CUTOUT_REGION']
  }
};

/**
 * 一期尺寸数据
 * 字段结构兼容三期云端 sizes 集合：
 * name, category, aliases, keywords, mmWidth, mmHeight, pxWidth, pxHeight, dpi, type, sort, enabled, note
 */
const PHOTO_SIZES = [
  // —— 国内证件 ——
  {
    id: 'cn-1inch',
    name: '1寸',
    category: '国内证件',
    aliases: ['一寸', '1 寸'],
    keywords: ['证件照', '简历'],
    mmWidth: 25,
    mmHeight: 35,
    pxWidth: 295,
    pxHeight: 413,
    dpi: 300,
    type: 'preset',
    sort: 10,
    enabled: true,
    note: ''
  },
  {
    id: 'cn-small-1inch',
    name: '小1寸',
    category: '国内证件',
    aliases: ['小一寸'],
    keywords: ['证件照'],
    mmWidth: 22,
    mmHeight: 32,
    pxWidth: 260,
    pxHeight: 378,
    dpi: 300,
    type: 'preset',
    sort: 20,
    enabled: true,
    note: ''
  },
  {
    id: 'cn-large-1inch',
    name: '大一寸',
    category: '国内证件',
    aliases: ['大1寸'],
    keywords: ['证件照'],
    mmWidth: 33,
    mmHeight: 48,
    pxWidth: 390,
    pxHeight: 567,
    dpi: 300,
    type: 'preset',
    sort: 30,
    enabled: true,
    note: ''
  },
  {
    id: 'cn-2inch',
    name: '2寸',
    category: '国内证件',
    aliases: ['二寸', '2 寸'],
    keywords: ['证件照'],
    mmWidth: 35,
    mmHeight: 49,
    pxWidth: 413,
    pxHeight: 579,
    dpi: 300,
    type: 'preset',
    sort: 40,
    enabled: true,
    note: ''
  },
  {
    id: 'cn-small-2inch',
    name: '小2寸',
    category: '国内证件',
    aliases: ['小二寸'],
    keywords: ['证件照'],
    mmWidth: 35,
    mmHeight: 45,
    pxWidth: 413,
    pxHeight: 531,
    dpi: 300,
    type: 'preset',
    sort: 50,
    enabled: true,
    note: ''
  },
  {
    id: 'cn-large-2inch',
    name: '大二寸',
    category: '国内证件',
    aliases: ['大2寸'],
    keywords: ['证件照'],
    mmWidth: 35,
    mmHeight: 53,
    pxWidth: 413,
    pxHeight: 626,
    dpi: 300,
    type: 'preset',
    sort: 60,
    enabled: true,
    note: ''
  },
  {
    id: 'cn-idcard',
    name: '身份证',
    category: '国内证件',
    aliases: ['居民身份证'],
    keywords: ['电子上传', '身份证人像'],
    mmWidth: 26,
    mmHeight: 32,
    pxWidth: 358,
    pxHeight: 441,
    dpi: 300,
    type: 'preset',
    sort: 70,
    enabled: true,
    note: '电子上传'
  },
  {
    id: 'cn-driver',
    name: '驾驶证',
    category: '国内证件',
    aliases: ['驾照'],
    keywords: ['机动车驾驶证'],
    mmWidth: 32,
    mmHeight: 22,
    pxWidth: 260,
    pxHeight: 378,
    dpi: 300,
    type: 'preset',
    sort: 80,
    enabled: true,
    note: ''
  },
  // —— 考试报名 ——
  {
    id: 'exam-guokao',
    name: '国考',
    category: '考试报名',
    aliases: ['国家公务员考试'],
    keywords: ['公务员', '考试'],
    mmWidth: 0,
    mmHeight: 0,
    pxWidth: 295,
    pxHeight: 413,
    dpi: 300,
    type: 'preset',
    sort: 110,
    enabled: true,
    note: ''
  },
  {
    id: 'exam-teacher-150',
    name: '教资 150×200',
    category: '考试报名',
    aliases: ['教师资格证'],
    keywords: ['教资', '考试'],
    mmWidth: 0,
    mmHeight: 0,
    pxWidth: 150,
    pxHeight: 200,
    dpi: 300,
    type: 'preset',
    sort: 120,
    enabled: true,
    note: ''
  },
  {
    id: 'exam-teacher-295',
    name: '教资 295×413',
    category: '考试报名',
    aliases: ['教师资格证'],
    keywords: ['教资', '考试'],
    mmWidth: 0,
    mmHeight: 0,
    pxWidth: 295,
    pxHeight: 413,
    dpi: 300,
    type: 'preset',
    sort: 130,
    enabled: true,
    note: ''
  },
  {
    id: 'exam-kaoyan',
    name: '考研',
    category: '考试报名',
    aliases: ['研究生考试'],
    keywords: ['考研', '考试'],
    mmWidth: 0,
    mmHeight: 0,
    pxWidth: 295,
    pxHeight: 413,
    dpi: 300,
    type: 'preset',
    sort: 140,
    enabled: true,
    note: ''
  },
  {
    id: 'exam-cet-144',
    name: '四六级 144×192',
    category: '考试报名',
    aliases: ['CET', '英语四六级'],
    keywords: ['四级', '六级', '考试'],
    mmWidth: 0,
    mmHeight: 0,
    pxWidth: 144,
    pxHeight: 192,
    dpi: 300,
    type: 'preset',
    sort: 150,
    enabled: true,
    note: ''
  },
  {
    id: 'exam-cet-240',
    name: '四六级 240×320',
    category: '考试报名',
    aliases: ['CET'],
    keywords: ['四级', '六级', '考试'],
    mmWidth: 0,
    mmHeight: 0,
    pxWidth: 240,
    pxHeight: 320,
    dpi: 300,
    type: 'preset',
    sort: 160,
    enabled: true,
    note: ''
  },
  {
    id: 'exam-law',
    name: '法考',
    category: '考试报名',
    aliases: ['国家统一法律职业资格考试'],
    keywords: ['司法考试', '考试'],
    mmWidth: 0,
    mmHeight: 0,
    pxWidth: 413,
    pxHeight: 626,
    dpi: 300,
    type: 'preset',
    sort: 170,
    enabled: true,
    note: ''
  },
  {
    id: 'exam-doctor',
    name: '医师',
    category: '考试报名',
    aliases: ['医师资格考试'],
    keywords: ['医考', '考试'],
    mmWidth: 0,
    mmHeight: 0,
    pxWidth: 358,
    pxHeight: 441,
    dpi: 300,
    type: 'preset',
    sort: 180,
    enabled: true,
    note: ''
  },
  // —— 签证 ——
  {
    id: 'visa-usa',
    name: '美签',
    category: '签证',
    aliases: ['美国签证'],
    keywords: ['签证', '护照'],
    mmWidth: 51,
    mmHeight: 51,
    pxWidth: 600,
    pxHeight: 600,
    dpi: 300,
    type: 'preset',
    sort: 210,
    enabled: true,
    note: ''
  },
  {
    id: 'visa-japan',
    name: '日本签证',
    category: '签证',
    aliases: ['日本'],
    keywords: ['签证'],
    mmWidth: 45,
    mmHeight: 45,
    pxWidth: 531,
    pxHeight: 531,
    dpi: 300,
    type: 'preset',
    sort: 220,
    enabled: true,
    note: ''
  },
  {
    id: 'visa-schengen',
    name: '申根签证',
    category: '签证',
    aliases: ['申根'],
    keywords: ['签证', '欧洲'],
    mmWidth: 35,
    mmHeight: 45,
    pxWidth: 413,
    pxHeight: 531,
    dpi: 300,
    type: 'preset',
    sort: 230,
    enabled: true,
    note: ''
  },
  {
    id: 'visa-canada',
    name: '加拿大签证',
    category: '签证',
    aliases: ['加拿大'],
    keywords: ['签证'],
    mmWidth: 50,
    mmHeight: 70,
    pxWidth: 591,
    pxHeight: 827,
    dpi: 300,
    type: 'preset',
    sort: 240,
    enabled: true,
    note: ''
  },
  {
    id: 'visa-malaysia',
    name: '马来西亚签证',
    category: '签证',
    aliases: ['马来西亚'],
    keywords: ['签证'],
    mmWidth: 35,
    mmHeight: 50,
    pxWidth: 413,
    pxHeight: 590,
    dpi: 300,
    type: 'preset',
    sort: 250,
    enabled: true,
    note: ''
  },
  {
    id: 'visa-thai-vn',
    name: '泰国/越南签证',
    category: '签证',
    aliases: ['泰国', '越南'],
    keywords: ['签证'],
    mmWidth: 40,
    mmHeight: 60,
    pxWidth: 472,
    pxHeight: 708,
    dpi: 300,
    type: 'preset',
    sort: 260,
    enabled: true,
    note: ''
  },
  // —— 电子头像 ——
  {
    id: 'avatar-300',
    name: '电子头像 300',
    category: '电子头像',
    aliases: ['头像'],
    keywords: ['社交', '头像'],
    mmWidth: 0,
    mmHeight: 0,
    pxWidth: 300,
    pxHeight: 300,
    dpi: 72,
    type: 'preset',
    sort: 310,
    enabled: true,
    note: ''
  },
  {
    id: 'avatar-400',
    name: '电子头像 400',
    category: '电子头像',
    aliases: ['头像'],
    keywords: ['社交', '头像'],
    mmWidth: 0,
    mmHeight: 0,
    pxWidth: 400,
    pxHeight: 400,
    dpi: 72,
    type: 'preset',
    sort: 320,
    enabled: true,
    note: ''
  },
  // —— 干部履历 ——
  {
    id: 'cadre-600',
    name: '干部履历 600×480',
    category: '干部履历',
    aliases: ['干部'],
    keywords: ['履历表'],
    mmWidth: 0,
    mmHeight: 0,
    pxWidth: 600,
    pxHeight: 480,
    dpi: 300,
    type: 'preset',
    sort: 410,
    enabled: true,
    note: ''
  },
  {
    id: 'cadre-1200',
    name: '干部履历 1200×960',
    category: '干部履历',
    aliases: ['干部'],
    keywords: ['履历表'],
    mmWidth: 0,
    mmHeight: 0,
    pxWidth: 1200,
    pxHeight: 960,
    dpi: 300,
    type: 'preset',
    sort: 420,
    enabled: true,
    note: ''
  }
];

/** 排版纸张预设（二期） */
const LAYOUT_PAPERS = {
  A4: {
    id: 'A4',
    name: 'A4',
    pxWidth: 2480,
    pxHeight: 3508,
    dpi: 300,
    marginMm: 5,
    gapMm: 3
  },
  R4: {
    id: 'R4',
    name: '6寸4R',
    /** 方向固定 1800×1200 */
    pxWidth: 1800,
    pxHeight: 1200,
    dpi: 300,
    marginMm: 5,
    gapMm: 3
  }
};

module.exports = {
  FRONTEND_COMPRESS_THRESHOLD_BYTES,
  FRONTEND_COMPRESS_MAX_EDGE,
  API_MAX_BASE64_BYTES,
  API_MAX_EDGE,
  API_ALLOWED_EXT,
  API_ALLOWED_MIME,
  FREE_QUOTA_HINT_PER_MONTH,
  API_QPS_HINT,
  CUSTOM_SIZE,
  GRADIENT,
  BG_COLORS,
  CUTOUT_CACHE_TTL_DAYS,
  CLOUD_FUNCTION,
  PHOTO_SIZES,
  LAYOUT_PAPERS
};
