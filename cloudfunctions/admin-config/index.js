/**
 * 公开配置读写
 * - getPublic：仅白名单字段
 * - getAdmin / update：写操作逐次管理员鉴权
 * 严禁返回密钥或非公开字段
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const PUBLIC_KEYS = [
  'sizesVersion',
  'enablePrintLayout',
  'enableAiWatermark',
  'gradientStart',
  'gradientRange',
  'version'
];

function whitelist(doc) {
  const out = {};
  PUBLIC_KEYS.forEach((k) => {
    if (doc && doc[k] != null) out[k] = doc[k];
  });
  if (out.sizesVersion == null) out.sizesVersion = 0;
  if (out.gradientStart == null) out.gradientStart = 0.7;
  if (out.gradientRange == null) out.gradientRange = 0.15;
  if (out.enablePrintLayout == null) out.enablePrintLayout = false;
  if (out.enableAiWatermark == null) out.enableAiWatermark = false;
  if (out.version == null) out.version = 0;
  return out;
}

async function requireAdmin() {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false };
  try {
    const res = await db.collection('admin_users').limit(5).get();
    for (const doc of res.data || []) {
      const list = doc.openids || (doc.openid ? [doc.openid] : []);
      if (list.indexOf(OPENID) !== -1) return { ok: true, openid: OPENID };
    }
    return { ok: false, openid: OPENID };
  } catch (e) {
    return { ok: false, serviceError: true };
  }
}

async function readPublicDoc() {
  try {
    const res = await db.collection('configs').doc('public').get();
    return whitelist(res.data || {});
  } catch (e) {
    return whitelist({});
  }
}

exports.main = async (event) => {
  const action = (event && event.action) || 'getPublic';

  if (action === 'getPublic') {
    const config = await readPublicDoc();
    return { ok: true, config };
  }

  const auth = await requireAdmin();
  if (!auth.ok) {
    return {
      ok: false,
      code: auth.serviceError ? 'AUTH_SERVICE_FAIL' : 'FORBIDDEN',
      message: '无管理员权限'
    };
  }

  if (action === 'getAdmin') {
    const config = await readPublicDoc();
    return { ok: true, config };
  }

  if (action === 'update') {
    const incoming = event.config || {};
    const expected = event.expectedVersion != null
      ? Number(event.expectedVersion)
      : Number(incoming.version);

    let current = {};
    try {
      current = (await db.collection('configs').doc('public').get()).data || {};
    } catch (e) {
      current = {};
    }
    if (current.version != null && expected != null && Number(current.version) !== Number(expected)) {
      return { ok: false, code: 'VERSION_CONFLICT', message: '版本冲突，请刷新' };
    }

    // 仅允许白名单字段写入；忽略任何密钥类字段
    const patch = {
      sizesVersion: Number(incoming.sizesVersion) || 0,
      enablePrintLayout: !!incoming.enablePrintLayout,
      enableAiWatermark: !!incoming.enableAiWatermark,
      gradientStart: Number(incoming.gradientStart),
      gradientRange: Number(incoming.gradientRange),
      version: _.inc(1),
      updatedAt: Date.now(),
      updatedBy: auth.openid
    };
    if (!(patch.gradientStart >= 0 && patch.gradientStart <= 1)) {
      return { ok: false, code: 'INVALID', message: '渐变起点无效' };
    }
    if (!(patch.gradientRange >= 0 && patch.gradientRange <= 1)) {
      return { ok: false, code: 'INVALID', message: '渐变过渡无效' };
    }

    // 管理员配置不得关闭高清导出广告校验 —— 不提供此类字段
    try {
      await db.collection('configs').doc('public').update({ data: patch });
    } catch (e) {
      await db.collection('configs').doc('public').set({
        data: Object.assign({
          sizesVersion: patch.sizesVersion,
          enablePrintLayout: patch.enablePrintLayout,
          enableAiWatermark: patch.enableAiWatermark,
          gradientStart: patch.gradientStart,
          gradientRange: patch.gradientRange,
          version: 1,
          updatedAt: patch.updatedAt,
          updatedBy: auth.openid
        })
      });
    }

    try {
      await db.collection('admin_audit_logs').add({
        data: {
          operator: auth.openid,
          action: 'config.update',
          summary: JSON.stringify(whitelist(patch)),
          createdAt: Date.now()
        }
      });
    } catch (e) { /* ignore */ }

    return { ok: true, config: await readPublicDoc() };
  }

  return { ok: false, code: 'INVALID', message: '未知操作' };
};
