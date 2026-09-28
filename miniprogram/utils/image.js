/**
 * 图片压缩、校验、hash、临时 URL
 * 密钥绝不出现在本文件或任何前端代码中
 */
const {
  FRONTEND_COMPRESS_THRESHOLD_BYTES,
  FRONTEND_COMPRESS_MAX_EDGE,
  API_MAX_BASE64_BYTES,
  API_MAX_EDGE,
  API_ALLOWED_EXT,
  CUSTOM_SIZE
} = require('./constants');

function getExt(path) {
  const m = /\.([a-zA-Z0-9]+)(\?|$)/.exec(path || '');
  return (m ? m[1] : '').toLowerCase();
}

function isAllowedImagePath(path) {
  const ext = getExt(path);
  return API_ALLOWED_EXT.indexOf(ext) !== -1;
}

/**
 * 读取本地文件大小（字节）
 */
function getFileSize(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().getFileInfo({
      filePath,
      success: (res) => resolve(res.size || 0),
      fail: reject
    });
  });
}

function getImageInfo(src) {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({
      src,
      success: resolve,
      fail: reject
    });
  });
}

/**
 * 将图片压缩至最长边 maxEdge，返回临时路径
 */
function compressToMaxEdge(src, maxEdge, quality) {
  const q = quality == null ? 80 : quality;
  return getImageInfo(src).then((info) => {
    const w = info.width;
    const h = info.height;
    const longEdge = Math.max(w, h);
    if (longEdge <= maxEdge) {
      return wx.compressImage
        ? new Promise((resolve, reject) => {
            wx.compressImage({
              src,
              quality: q,
              success: (r) => resolve(r.tempFilePath),
              fail: () => resolve(src)
            });
          })
        : Promise.resolve(src);
    }
    const scale = maxEdge / longEdge;
    const destW = Math.max(1, Math.floor(w * scale));
    const destH = Math.max(1, Math.floor(h * scale));
    return canvasResize(src, destW, destH, q);
  });
}

function canvasResize(src, destW, destH, quality) {
  return new Promise((resolve, reject) => {
    const query = wx.createSelectorQuery();
    // 离屏 canvas 2d
    try {
      const canvas = wx.createOffscreenCanvas
        ? wx.createOffscreenCanvas({ type: '2d', width: destW, height: destH })
        : null;
      if (!canvas) {
        // 降级：compressImage
        wx.compressImage({
          src,
          compressedWidth: destW,
          compressedHeight: destH,
          quality: quality || 80,
          success: (r) => resolve(r.tempFilePath),
          fail: reject
        });
        return;
      }
      const ctx = canvas.getContext('2d');
      const img = canvas.createImage();
      img.onload = () => {
        ctx.clearRect(0, 0, destW, destH);
        ctx.drawImage(img, 0, 0, destW, destH);
        wx.canvasToTempFilePath({
          canvas,
          fileType: 'jpg',
          quality: (quality || 80) / 100,
          success: (r) => resolve(r.tempFilePath),
          fail: reject
        });
      };
      img.onerror = reject;
      img.src = src;
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * 前端压缩规则：
 * 1) 超过 3.5MB → 最长边 1920
 * 2) 仍须满足 API：最长边 < 2000，且体积需尽量低于 Base64 5MB 限制
 */
async function prepareImageForUpload(filePath) {
  if (!isAllowedImagePath(filePath) && !filePath.startsWith('wxfile://') && !filePath.startsWith('http')) {
    // 相册临时路径可能无扩展名，用 getImageInfo 再判
  }
  let size = await getFileSize(filePath);
  let info = await getImageInfo(filePath);
  let path = filePath;

  if (size > FRONTEND_COMPRESS_THRESHOLD_BYTES || Math.max(info.width, info.height) > FRONTEND_COMPRESS_MAX_EDGE) {
    path = await compressToMaxEdge(path, FRONTEND_COMPRESS_MAX_EDGE, 80);
    size = await getFileSize(path);
    info = await getImageInfo(path);
  }

  // 仍超过 API 边长限制
  if (Math.max(info.width, info.height) > API_MAX_EDGE) {
    path = await compressToMaxEdge(path, API_MAX_EDGE, 75);
    size = await getFileSize(path);
    info = await getImageInfo(path);
  }

  // Base64 膨胀约 4/3，预估编码后体积
  const estimatedBase64 = Math.ceil(size * 4 / 3);
  if (estimatedBase64 > API_MAX_BASE64_BYTES) {
    path = await compressToMaxEdge(path, Math.min(API_MAX_EDGE, 1600), 60);
    size = await getFileSize(path);
    info = await getImageInfo(path);
  }

  const stillTooLarge = Math.ceil(size * 4 / 3) > API_MAX_BASE64_BYTES
    || info.width > API_MAX_EDGE
    || info.height > API_MAX_EDGE;

  if (stillTooLarge) {
    const err = new Error('IMAGE_STILL_TOO_LARGE');
    err.code = 'IMAGE_STILL_TOO_LARGE';
    err.message = '压缩后仍超出腾讯云人像分割限制（Base64≤5MB 且分辨率小于2000×2000），请更换图片';
    throw err;
  }

  return {
    path,
    width: info.width,
    height: info.height,
    size
  };
}

/**
 * 简易文件 hash（SHA-256 of file bytes）用于缓存键
 */
function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const fs = wx.getFileSystemManager();
    fs.readFile({
      filePath,
      success: (res) => {
        // 小程序端无 crypto.subtle 时用简易 hash；云函数会再算服务端 hash
        const buffer = res.data;
        resolve(simpleHash(buffer));
      },
      fail: reject
    });
  });
}

function simpleHash(buffer) {
  // FNV-1a 64-ish → hex；云函数以服务端 SHA-256 为准，此值用于请求透传初筛
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5;
  const view = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer);
  for (let i = 0; i < view.length; i++) {
    h1 ^= view[i];
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= view[i] ^ (i & 0xff);
    h2 = Math.imul(h2, 0x01000193);
  }
  return ('00000000' + (h1 >>> 0).toString(16)).slice(-8)
    + ('00000000' + (h2 >>> 0).toString(16)).slice(-8)
    + ('00000000' + (view.length >>> 0).toString(16)).slice(-8);
}

function getTempFileURL(fileID) {
  return wx.cloud.getTempFileURL({ fileList: [fileID] }).then((res) => {
    const item = (res.fileList && res.fileList[0]) || {};
    if (item.status !== 0 || !item.tempFileURL) {
      const err = new Error('TEMP_URL_FAILED');
      err.code = 'TEMP_URL_FAILED';
      throw err;
    }
    return item.tempFileURL;
  });
}

async function getTempFileURLWithRetry(fileID) {
  try {
    return await getTempFileURL(fileID);
  } catch (e) {
    return getTempFileURL(fileID);
  }
}

function validateCustomSize({ pxWidth, pxHeight, mmWidth, mmHeight }) {
  const errors = {};
  const pw = Number(pxWidth);
  const ph = Number(pxHeight);
  if (!Number.isFinite(pw) || pw < CUSTOM_SIZE.MIN_PX || pw > CUSTOM_SIZE.MAX_PX) {
    errors.pxWidth = `像素宽须在 ${CUSTOM_SIZE.MIN_PX}–${CUSTOM_SIZE.MAX_PX}`;
  }
  if (!Number.isFinite(ph) || ph < CUSTOM_SIZE.MIN_PX || ph > CUSTOM_SIZE.MAX_PX) {
    errors.pxHeight = `像素高须在 ${CUSTOM_SIZE.MIN_PX}–${CUSTOM_SIZE.MAX_PX}`;
  }
  if (Number.isFinite(pw) && Number.isFinite(ph) && pw * ph > CUSTOM_SIZE.MAX_TOTAL_PIXELS) {
    errors.total = '总像素不得超过 1600 万';
  }
  if (mmWidth != null && mmWidth !== '') {
    const mw = Number(mmWidth);
    if (!Number.isFinite(mw) || mw <= 0 || mw < CUSTOM_SIZE.MIN_MM || mw > CUSTOM_SIZE.MAX_MM) {
      errors.mmWidth = `毫米宽须大于 0 且在 ${CUSTOM_SIZE.MIN_MM}–${CUSTOM_SIZE.MAX_MM}`;
    }
  }
  if (mmHeight != null && mmHeight !== '') {
    const mh = Number(mmHeight);
    if (!Number.isFinite(mh) || mh <= 0 || mh < CUSTOM_SIZE.MIN_MM || mh > CUSTOM_SIZE.MAX_MM) {
      errors.mmHeight = `毫米高须大于 0 且在 ${CUSTOM_SIZE.MIN_MM}–${CUSTOM_SIZE.MAX_MM}`;
    }
  }
  return {
    ok: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * 在 canvas 上填充背景（纯色或干部蓝白渐变）
 */
function fillBackground(ctx, width, height, bg) {
  if (!bg || bg.type === 'solid') {
    ctx.fillStyle = (bg && bg.color) || '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    return;
  }
  if (bg.type === 'gradient') {
    const start = bg.startRatio != null ? bg.startRatio : 0.7;
    const range = bg.transitionRange != null ? bg.transitionRange : 0.15;
    const y0 = height * start;
    const y1 = height * Math.min(1, start + range);
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    const top = bg.topColor || '#002FA7';
    const bottom = bg.bottomColor || '#FFFFFF';
    grad.addColorStop(0, top);
    grad.addColorStop(Math.max(0, Math.min(1, y0 / height)), top);
    grad.addColorStop(Math.max(0, Math.min(1, y1 / height)), bottom);
    grad.addColorStop(1, bottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }
}

/**
 * 可选 AI 水印：右下角半透明「AI生成」小字
 */
function drawAiWatermark(ctx, width, height, enabled) {
  if (!enabled) return;
  const text = 'AI生成';
  const fontSize = Math.max(12, Math.floor(Math.min(width, height) * 0.035));
  ctx.save();
  ctx.font = `${fontSize}px sans-serif`;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(text, width - fontSize * 0.5, height - fontSize * 0.4);
  ctx.restore();
}

module.exports = {
  isAllowedImagePath,
  getFileSize,
  getImageInfo,
  prepareImageForUpload,
  hashFile,
  getTempFileURL,
  getTempFileURLWithRetry,
  validateCustomSize,
  fillBackground,
  drawAiWatermark,
  compressToMaxEdge
};
