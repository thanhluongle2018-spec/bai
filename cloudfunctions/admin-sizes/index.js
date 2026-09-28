/**
 * sizes 管理：
 * - listPublic：所有人可读已启用尺寸
 * - listAdmin / create / update / setEnabled / reorder：写操作逐次校验管理员
 * 不信任客户端 openid
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const CUSTOM = {
  MIN_PX: 50,
  MAX_PX: 4000,
  MAX_TOTAL: 16000000,
  MIN_MM: 0,
  MAX_MM: 500
};

async function requireAdmin() {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { ok: false, openid: null };
  }
  try {
    const res = await db.collection('admin_users').limit(5).get();
    const docs = res.data || [];
    for (const doc of docs) {
      const list = doc.openids || (doc.openid ? [doc.openid] : []);
      if (list.indexOf(OPENID) !== -1) {
        return { ok: true, openid: OPENID };
      }
    }
    return { ok: false, openid: OPENID };
  } catch (e) {
    return { ok: false, openid: OPENID, serviceError: true };
  }
}

function validateSize(size) {
  if (!size || !size.name || !size.category) {
    return '名称与分类必填';
  }
  const pw = Number(size.pxWidth);
  const ph = Number(size.pxHeight);
  if (!Number.isFinite(pw) || pw < CUSTOM.MIN_PX || pw > CUSTOM.MAX_PX) {
    return '像素宽越界';
  }
  if (!Number.isFinite(ph) || ph < CUSTOM.MIN_PX || ph > CUSTOM.MAX_PX) {
    return '像素高越界';
  }
  if (pw * ph > CUSTOM.MAX_TOTAL) return '总像素超过 1600 万';
  const dpi = Number(size.dpi);
  if (!Number.isFinite(dpi) || dpi <= 0) return 'DPI 无效';
  if (size.mmWidth != null && size.mmWidth !== '') {
    const mw = Number(size.mmWidth);
    if (!Number.isFinite(mw) || mw < 0 || mw > CUSTOM.MAX_MM) return '毫米宽越界';
  }
  if (size.mmHeight != null && size.mmHeight !== '') {
    const mh = Number(size.mmHeight);
    if (!Number.isFinite(mh) || mh < 0 || mh > CUSTOM.MAX_MM) return '毫米高越界';
  }
  return null;
}

async function getPublicConfig() {
  try {
    const res = await db.collection('configs').doc('public').get();
    const c = res.data || {};
    return whitelistConfig(c);
  } catch (e) {
    return {
      sizesVersion: 0,
      enablePrintLayout: false,
      enableAiWatermark: false,
      gradientStart: 0.7,
      gradientRange: 0.15
    };
  }
}

function whitelistConfig(c) {
  return {
    sizesVersion: c.sizesVersion || 0,
    enablePrintLayout: !!c.enablePrintLayout,
    enableAiWatermark: !!c.enableAiWatermark,
    gradientStart: c.gradientStart != null ? c.gradientStart : 0.7,
    gradientRange: c.gradientRange != null ? c.gradientRange : 0.15,
    version: c.version || 0
  };
}

async function bumpSizesVersion(operator) {
  const now = Date.now();
  try {
    await db.collection('configs').doc('public').update({
      data: {
        sizesVersion: _.inc(1),
        updatedAt: now,
        updatedBy: operator
      }
    });
  } catch (e) {
    await db.collection('configs').doc('public').set({
      data: {
        sizesVersion: 1,
        enablePrintLayout: false,
        enableAiWatermark: false,
        gradientStart: 0.7,
        gradientRange: 0.15,
        version: 1,
        updatedAt: now,
        updatedBy: operator
      }
    });
  }
}

async function writeAudit(operator, action, summary) {
  try {
    await db.collection('admin_audit_logs').add({
      data: {
        operator,
        action,
        summary: String(summary || '').slice(0, 500),
        createdAt: Date.now()
      }
    });
  } catch (e) { /* 审计失败不影响主流程 */ }
}

exports.main = async (event) => {
  const action = (event && event.action) || 'listPublic';

  if (action === 'listPublic') {
    try {
      const res = await db.collection('sizes')
        .where({ enabled: true })
        .orderBy('sort', 'asc')
        .limit(200)
        .get();
      const list = (res.data || []).filter((s) => s && s.pxWidth && s.pxHeight);
      const publicConfig = await getPublicConfig();
      return {
        ok: true,
        list,
        sizesVersion: publicConfig.sizesVersion,
        publicConfig
      };
    } catch (e) {
      return { ok: false, code: 'INTERNAL', message: '读取尺寸失败' };
    }
  }

  // —— 以下写操作与管理读取均需管理员 ——
  const auth = await requireAdmin();
  if (!auth.ok) {
    return {
      ok: false,
      code: auth.serviceError ? 'AUTH_SERVICE_FAIL' : 'FORBIDDEN',
      message: '无管理员权限'
    };
  }

  if (action === 'listAdmin') {
    const res = await db.collection('sizes').orderBy('sort', 'asc').limit(500).get();
    return { ok: true, list: res.data || [] };
  }

  if (action === 'create') {
    const size = event.size || {};
    const err = validateSize(size);
    if (err) return { ok: false, code: 'INVALID', message: err };

    // 拒绝重复：同名+同分类+同像素
    const dup = await db.collection('sizes').where({
      name: size.name,
      category: size.category,
      pxWidth: Number(size.pxWidth),
      pxHeight: Number(size.pxHeight)
    }).limit(1).get();
    if (dup.data && dup.data.length) {
      return { ok: false, code: 'DUPLICATE', message: '尺寸已存在' };
    }

    const now = Date.now();
    const doc = {
      name: size.name,
      category: size.category,
      aliases: size.aliases || [],
      keywords: size.keywords || [],
      mmWidth: Number(size.mmWidth) || 0,
      mmHeight: Number(size.mmHeight) || 0,
      pxWidth: Number(size.pxWidth),
      pxHeight: Number(size.pxHeight),
      dpi: Number(size.dpi) || 300,
      type: size.type || 'preset',
      sort: Number(size.sort) || 0,
      enabled: size.enabled !== false,
      note: size.note || '',
      version: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: auth.openid,
      updatedBy: auth.openid
    };
    const addRes = await db.collection('sizes').add({ data: doc });
    await bumpSizesVersion(auth.openid);
    await writeAudit(auth.openid, 'size.create', `${doc.name} ${doc.pxWidth}x${doc.pxHeight}`);
    return { ok: true, id: addRes._id };
  }

  if (action === 'update') {
    const size = event.size || {};
    const id = size._id;
    if (!id) return { ok: false, code: 'INVALID', message: '缺少 ID' };
    const err = validateSize(size);
    if (err) return { ok: false, code: 'INVALID', message: err };

    let current;
    try {
      current = (await db.collection('sizes').doc(id).get()).data;
    } catch (e) {
      return { ok: false, code: 'INVALID', message: '记录不存在' };
    }
    const expected = event.expectedVersion != null ? Number(event.expectedVersion) : Number(size.version);
    if (current.version != null && expected != null && Number(current.version) !== expected) {
      return { ok: false, code: 'VERSION_CONFLICT', message: '版本冲突，请刷新后重试' };
    }

    const now = Date.now();
    await db.collection('sizes').doc(id).update({
      data: {
        name: size.name,
        category: size.category,
        aliases: size.aliases || [],
        keywords: size.keywords || [],
        mmWidth: Number(size.mmWidth) || 0,
        mmHeight: Number(size.mmHeight) || 0,
        pxWidth: Number(size.pxWidth),
        pxHeight: Number(size.pxHeight),
        dpi: Number(size.dpi) || 300,
        sort: Number(size.sort) || 0,
        enabled: size.enabled !== false,
        note: size.note || '',
        version: _.inc(1),
        updatedAt: now,
        updatedBy: auth.openid
      }
    });
    await bumpSizesVersion(auth.openid);
    await writeAudit(auth.openid, 'size.update', `${size.name}#${id}`);
    return { ok: true };
  }

  if (action === 'setEnabled') {
    const id = event.id;
    if (!id) return { ok: false, code: 'INVALID', message: '缺少 ID' };
    await db.collection('sizes').doc(id).update({
      data: {
        enabled: !!event.enabled,
        version: _.inc(1),
        updatedAt: Date.now(),
        updatedBy: auth.openid
      }
    });
    await bumpSizesVersion(auth.openid);
    await writeAudit(auth.openid, 'size.setEnabled', `${id}:${!!event.enabled}`);
    return { ok: true };
  }

  if (action === 'reorder') {
    const items = event.items || [];
    for (const it of items) {
      if (!it._id) continue;
      await db.collection('sizes').doc(it._id).update({
        data: {
          sort: Number(it.sort) || 0,
          version: _.inc(1),
          updatedAt: Date.now(),
          updatedBy: auth.openid
        }
      });
    }
    await bumpSizesVersion(auth.openid);
    await writeAudit(auth.openid, 'size.reorder', `count=${items.length}`);
    return { ok: true };
  }

  return { ok: false, code: 'INVALID', message: '未知操作' };
};
