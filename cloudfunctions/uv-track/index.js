/**
 * UV 按 openid + 日期去重写入 uv_logs
 * openid 必须来自云开发上下文，绝不信任客户端传值
 * 依赖集合唯一索引：openid_date
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function todayKey(date) {
  const d = date || new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { ok: false, code: 'FORBIDDEN', message: '无法识别用户' };
  }
  const date = todayKey();
  const openidDate = `${OPENID}_${date}`;
  const now = Date.now();

  try {
    await db.collection('uv_logs').add({
      data: {
        openid: OPENID,
        date,
        openidDate,
        firstVisitAt: now
      }
    });
    return { ok: true, created: true, date };
  } catch (e) {
    // 唯一索引冲突 → 已统计过
    const msg = String((e && e.message) || e || '');
    if (/duplicate|E11000|already exists|UNIQUE|610001|duplicate key/i.test(msg)) {
      return { ok: true, created: false, date };
    }
    // 兜底：查询是否已存在
    try {
      const exist = await db.collection('uv_logs').where({ openidDate }).limit(1).get();
      if (exist.data && exist.data.length) {
        return { ok: true, created: false, date };
      }
    } catch (e2) { /* ignore */ }
    console.log(JSON.stringify({ stage: 'uv_error', err: msg.slice(0, 120) }));
    return { ok: false, code: 'INTERNAL', message: 'UV 记录失败' };
  }
};
