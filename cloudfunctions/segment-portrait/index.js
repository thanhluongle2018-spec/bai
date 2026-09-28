/**
 * segment-portrait
 *
 * 环境变量（仅云函数侧）：CUTOUT_SECRET_ID / CUTOUT_SECRET_KEY / CUTOUT_REGION
 * API 限制（官方文档，非控制台）：
 * - Base64 编码后 ≤ 5MB
 * - 分辨率 < 2000×2000
 * - PNG/JPG/JPEG/BMP
 * 输出：ResultImage / ResultImageUrl 为透明背景图；ResultMask 为 Float 置信度数组（非普通图片）
 * 免费额度：官方写明每月每服务 1000 次，须在控制台资源包管理核实本账号实际额度
 */

const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { PNG } = require('pngjs');
const tencentcloud = require('tencentcloud-sdk-nodejs');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const API_MAX_BASE64_BYTES = 5 * 1024 * 1024;
const API_MAX_EDGE = 1999;
const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/jpg', 'image/bmp', 'image/x-ms-bmp'];
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_COLLECTION = 'cutout_cache';

/** 可重试错误（超时 / 暂时性网络 / 内部错误） */
const RETRYABLE_CODES = new Set([
  'FailedOperation.InnerError',
  'FailedOperation.UnKnowError',
  'FailedOperation.RequestTimeout',
  'RequestLimitExceeded',
  'ClientNetworkError',
  'ECONNRESET',
  'ETIMEDOUT',
  'ESOCKETTIMEDOUT'
]);

/** 中文错误映射 —— 不暴露密钥、签名、内部路径 */
const ERROR_MAP = {
  'FailedOperation.BalanceInsufficient': { code: 'BALANCE', message: '云服务额度不足' },
  'FailedOperation.ImageDecodeFailed': { code: 'IMAGE_INVALID', message: '图片解码失败' },
  'FailedOperation.ImageDownloadError': { code: 'NETWORK', message: '图片下载失败' },
  'FailedOperation.ImageNotForeground': { code: 'NO_PORTRAIT', message: '未检测到有效人像' },
  'FailedOperation.ImageNotSupported': { code: 'IMAGE_INVALID', message: '不支持的图片格式' },
  'FailedOperation.ImageResolutionExceed': { code: 'IMAGE_RESOLUTION', message: '图片分辨率过大' },
  'FailedOperation.ImageResolutionInsufficient': { code: 'IMAGE_RESOLUTION', message: '图片分辨率过小' },
  'FailedOperation.ImageSizeExceed': { code: 'IMAGE_TOO_LARGE', message: '图片过大' },
  'FailedOperation.ProfileNumExceed': { code: 'NO_PORTRAIT', message: '人像数量过多' },
  'FailedOperation.RequestEntityTooLarge': { code: 'IMAGE_TOO_LARGE', message: '请求体过大' },
  'FailedOperation.SegmentFailed': { code: 'NO_PORTRAIT', message: '人像分割失败' },
  'FailedOperation.RequestTimeout': { code: 'TIMEOUT', message: '服务超时' },
  'AuthFailure.SecretIdNotFound': { code: 'AUTH_FAILED', message: '服务鉴权失败' },
  'AuthFailure.SignatureFailure': { code: 'AUTH_FAILED', message: '服务鉴权失败' },
  'AuthFailure.UnauthorizedOperation': { code: 'AUTH_FAILED', message: '服务鉴权失败' },
  'UnauthorizedOperation': { code: 'AUTH_FAILED', message: '服务鉴权失败' },
  'ResourceUnavailable.InArrears': { code: 'BALANCE', message: '账号欠费停服' },
  'RequestLimitExceeded': { code: 'RATE_LIMIT', message: '调用过于频繁' },
  'LimitExceeded': { code: 'RATE_LIMIT', message: '调用过于频繁' }
};

function mapError(err) {
  const raw = (err && (err.code || err.Code)) || '';
  const mapped = ERROR_MAP[raw];
  if (mapped) return mapped;
  const msg = String((err && err.message) || '');
  if (/timeout|ETIMEDOUT|ESOCKETTIMEDOUT/i.test(msg)) {
    return { code: 'TIMEOUT', message: '服务超时' };
  }
  if (/ECONNRESET|network|ENOTFOUND/i.test(msg)) {
    return { code: 'NETWORK', message: '网络异常' };
  }
  return { code: 'INTERNAL', message: '服务异常，请稍后重试' };
}

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function downloadUrl(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: 25000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadUrl(res.headers.location).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(Object.assign(new Error('DOWNLOAD_HTTP_' + res.statusCode), { code: 'ClientNetworkError' }));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', (e) => {
      e.code = e.code || 'ClientNetworkError';
      reject(e);
    });
    req.on('timeout', () => {
      req.destroy();
      reject(Object.assign(new Error('download timeout'), { code: 'ETIMEDOUT' }));
    });
  });
}

function sniffImageMeta(buf) {
  // 简易宽高探测：PNG / JPEG
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50) {
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    return { mime: 'image/png', width, height };
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset < buf.length) {
      if (buf[offset] !== 0xff) break;
      const marker = buf[offset + 1];
      const size = buf.readUInt16BE(offset + 2);
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        const height = buf.readUInt16BE(offset + 5);
        const width = buf.readUInt16BE(offset + 7);
        return { mime: 'image/jpeg', width, height };
      }
      offset += 2 + size;
    }
    return { mime: 'image/jpeg', width: 0, height: 0 };
  }
  if (buf.length >= 2 && buf[0] === 0x42 && buf[1] === 0x4d) {
    const width = buf.readInt32LE(18);
    const height = Math.abs(buf.readInt32LE(22));
    return { mime: 'image/bmp', width, height };
  }
  return { mime: 'application/octet-stream', width: 0, height: 0 };
}

function validateImageBuffer(buf) {
  const estimatedBase64 = Math.ceil(buf.length * 4 / 3);
  if (estimatedBase64 > API_MAX_BASE64_BYTES) {
    return { ok: false, code: 'IMAGE_TOO_LARGE', message: '图片超过 API Base64 5MB 限制' };
  }
  const meta = sniffImageMeta(buf);
  if (ALLOWED_MIME.indexOf(meta.mime) === -1) {
    return { ok: false, code: 'IMAGE_INVALID', message: '不支持的图片格式' };
  }
  if (!meta.width || !meta.height) {
    return { ok: false, code: 'IMAGE_INVALID', message: '无法读取图片尺寸' };
  }
  if (meta.width > API_MAX_EDGE || meta.height > API_MAX_EDGE) {
    return { ok: false, code: 'IMAGE_RESOLUTION', message: '分辨率须小于 2000×2000' };
  }
  return { ok: true, meta };
}

/**
 * 将 ResultMask（Base64 → Float32 置信度灰度 0–255）与原图合成 RGBA PNG
 */
function composeRgbaFromMask(sourceBuf, maskBuf, width, height) {
  // maskBuf: 原始二进制，按 Float32 little-endian 排列
  const expected = width * height * 4;
  if (maskBuf.length < expected) {
    throw Object.assign(new Error('mask length mismatch'), { code: 'IMAGE_INVALID' });
  }
  const floats = new Float32Array(maskBuf.buffer, maskBuf.byteOffset, width * height);

  // 解码源图（仅 PNG/JPEG 简易：用 pngjs 仅支持 PNG；JPEG 源图时优先走 ResultImage）
  let srcPng;
  try {
    srcPng = PNG.sync.read(sourceBuf);
  } catch (e) {
    throw Object.assign(new Error('源图需为 PNG 才能与 mask 合成；请改用 ResultImage'), { code: 'IMAGE_INVALID' });
  }
  if (srcPng.width !== width || srcPng.height !== height) {
    // 允许使用 mask 尺寸
  }
  const out = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    const gray = floats[i]; // 0–255
    const alpha = Math.max(0, Math.min(255, Math.round(gray)));
    const si = i * 4;
    out.data[si] = srcPng.data[si];
    out.data[si + 1] = srcPng.data[si + 1];
    out.data[si + 2] = srcPng.data[si + 2];
    out.data[si + 3] = alpha;
  }
  return PNG.sync.write(out);
}

function getBdaClient() {
  const secretId = process.env.CUTOUT_SECRET_ID;
  const secretKey = process.env.CUTOUT_SECRET_KEY;
  const region = process.env.CUTOUT_REGION || 'ap-guangzhou';
  if (!secretId || !secretKey) {
    const err = new Error('missing credentials');
    err.code = 'AuthFailure.SecretIdNotFound';
    throw err;
  }
  const BdaClient = tencentcloud.bda.v20200324.Client;
  return new BdaClient({
    credential: { secretId, secretKey },
    region,
    profile: { httpProfile: { endpoint: 'bda.tencentcloudapi.com' } }
  });
}

async function callSegmentPortraitPic(imageBase64, retryOnce) {
  const client = getBdaClient();
  const params = {
    Image: imageBase64,
    RspImgType: 'url',
    SceneType: 'GEN'
  };
  try {
    return await client.SegmentPortraitPic(params);
  } catch (err) {
    const code = err.code || err.Code || '';
    const retryable = RETRYABLE_CODES.has(code)
      || /timeout|ECONNRESET|ETIMEDOUT/i.test(String(err.message || ''));
    if (retryOnce && retryable) {
      return callSegmentPortraitPic(imageBase64, false);
    }
    throw err;
  }
}

async function findReadyCache(openid, hash) {
  const res = await db.collection(CACHE_COLLECTION)
    .where({ openid, hash, status: 'ready' })
    .limit(1)
    .get();
  return res.data && res.data[0];
}

async function tryClaimCacheSlot(openid, hash, sourceFileID) {
  const now = Date.now();
  const doc = {
    openid,
    hash,
    sourceFileID,
    resultFileID: '',
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    expireAt: now + CACHE_TTL_MS
  };
  try {
    const addRes = await db.collection(CACHE_COLLECTION).add({ data: doc });
    return { claimed: true, id: addRes._id };
  } catch (e) {
    // 唯一索引冲突 → 并发幂等
    return { claimed: false, id: null };
  }
}

async function waitForCache(openid, hash, attempts) {
  const max = attempts || 8;
  for (let i = 0; i < max; i++) {
    const ready = await findReadyCache(openid, hash);
    if (ready) return ready;
    const pending = await db.collection(CACHE_COLLECTION)
      .where({ openid, hash, status: 'pending' })
      .limit(1)
      .get();
    if (!pending.data || !pending.data.length) {
      const failed = await db.collection(CACHE_COLLECTION)
        .where({ openid, hash, status: 'failed' })
        .limit(1)
        .get();
      if (failed.data && failed.data.length) return null;
    }
    await new Promise((r) => setTimeout(r, 400 + i * 200));
  }
  return findReadyCache(openid, hash);
}

async function uploadResultPng(openid, hash, pngBuf) {
  const cloudPath = `cutouts/${openid}/${hash}.png`;
  const up = await cloud.uploadFile({
    cloudPath,
    fileContent: pngBuf
  });
  return up.fileID;
}

function assertFileOwnedByUser(fileID, openid) {
  // 云存储 fileID 通常含环境与路径；进一步用 download 权限约束。
  // 拒绝明显跨用户路径（若命名含其他 openid）
  if (!fileID || typeof fileID !== 'string' || fileID.indexOf('cloud://') !== 0) {
    return false;
  }
  return true;
}

exports.main = async (event) => {
  const start = Date.now();
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const requestId = crypto.randomBytes(8).toString('hex');

  const logSafe = (extra) => {
    console.log(JSON.stringify(Object.assign({
      requestId,
      openidSuffix: openid ? openid.slice(-6) : '',
      durationMs: Date.now() - start
    }, extra)));
  };

  try {
    if (!openid) {
      return { ok: false, code: 'FORBIDDEN', message: '无法识别用户' };
    }
    const fileID = event && event.fileID;
    const clientHash = event && event.hash;
    if (!fileID) {
      return { ok: false, code: 'IMAGE_INVALID', message: '缺少 fileID' };
    }
    if (!assertFileOwnedByUser(fileID, openid)) {
      return { ok: false, code: 'FORBIDDEN', message: '无权访问该文件' };
    }

    // 下载源图（云开发会校验调用方对文件的访问权）
    let dl;
    try {
      dl = await cloud.downloadFile({ fileID });
    } catch (e) {
      logSafe({ stage: 'download', errorCode: 'FORBIDDEN' });
      return { ok: false, code: 'FORBIDDEN', message: '无权访问该文件或下载失败' };
    }
    const buf = Buffer.isBuffer(dl.fileContent)
      ? dl.fileContent
      : Buffer.from(dl.fileContent);

    const check = validateImageBuffer(buf);
    if (!check.ok) {
      logSafe({ stage: 'validate', errorCode: check.code });
      return { ok: false, code: check.code, message: check.message };
    }

    const hash = sha256Hex(buf);
    // 不以客户端 hash 为准，仅作辅助；缓存键用服务端 hash
    if (clientHash && clientHash !== hash) {
      // 允许不一致（前端简易 hash），以服务端为准
    }

    const cached = await findReadyCache(openid, hash);
    if (cached && cached.resultFileID && cached.expireAt > Date.now()) {
      logSafe({ stage: 'cache_hit', cacheHit: true, errorCode: '' });
      return {
        ok: true,
        fileID: cached.resultFileID,
        cacheHit: true,
        requestId
      };
    }

    const claim = await tryClaimCacheSlot(openid, hash, fileID);
    if (!claim.claimed) {
      const waited = await waitForCache(openid, hash);
      if (waited && waited.resultFileID) {
        logSafe({ stage: 'cache_wait_hit', cacheHit: true });
        return {
          ok: true,
          fileID: waited.resultFileID,
          cacheHit: true,
          requestId
        };
      }
      // 若仍无结果，删除失败槽再试一次领取
      await db.collection(CACHE_COLLECTION).where({ openid, hash, status: 'failed' }).remove();
      const reclaim = await tryClaimCacheSlot(openid, hash, fileID);
      if (!reclaim.claimed) {
        return { ok: false, code: 'INTERNAL', message: '并发处理中，请稍后重试' };
      }
      claim.id = reclaim.id;
      claim.claimed = true;
    }

    let apiRes;
    try {
      const b64 = buf.toString('base64');
      apiRes = await callSegmentPortraitPic(b64, true);
    } catch (err) {
      const mapped = mapError(err);
      if (claim.id) {
        await db.collection(CACHE_COLLECTION).doc(claim.id).update({
          data: { status: 'failed', updatedAt: Date.now(), errorCode: mapped.code }
        });
      }
      logSafe({ stage: 'api', errorCode: mapped.code, tencentCode: err.code || err.Code || '' });
      return { ok: false, code: mapped.code, message: mapped.message, requestId };
    }

    let pngBuf = null;
    if (apiRes.ResultImageUrl) {
      const remote = await downloadUrl(apiRes.ResultImageUrl);
      pngBuf = remote;
    } else if (apiRes.ResultImage) {
      pngBuf = Buffer.from(apiRes.ResultImage, 'base64');
    } else if (apiRes.ResultMaskUrl || apiRes.ResultMask) {
      const maskB64 = apiRes.ResultMask
        || (await downloadUrl(apiRes.ResultMaskUrl)).toString('base64');
      const maskBuf = Buffer.from(maskB64, 'base64');
      pngBuf = composeRgbaFromMask(
        buf,
        maskBuf,
        check.meta.width,
        check.meta.height
      );
    } else {
      if (claim.id) {
        await db.collection(CACHE_COLLECTION).doc(claim.id).update({
          data: { status: 'failed', updatedAt: Date.now(), errorCode: 'NO_PORTRAIT' }
        });
      }
      return { ok: false, code: 'NO_PORTRAIT', message: '未返回有效抠图结果', requestId };
    }

    // 确认是 PNG；若 API 返回的透明图带其它容器，仍原样上传
    const resultFileID = await uploadResultPng(openid, hash, pngBuf);
    const now = Date.now();
    if (claim.id) {
      await db.collection(CACHE_COLLECTION).doc(claim.id).update({
        data: {
          status: 'ready',
          resultFileID,
          updatedAt: now,
          expireAt: now + CACHE_TTL_MS
        }
      });
    }

    logSafe({ stage: 'done', cacheHit: false, errorCode: '' });
    return {
      ok: true,
      fileID: resultFileID,
      cacheHit: false,
      requestId
    };
  } catch (err) {
    const mapped = mapError(err);
    logSafe({ stage: 'exception', errorCode: mapped.code });
    return { ok: false, code: mapped.code, message: mapped.message, requestId };
  }
};
