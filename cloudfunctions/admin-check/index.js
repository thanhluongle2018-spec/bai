/**
 * 校验当前用户是否为管理员
 * openid 仅从云开发上下文获取
 * admin_users 集合仅云函数可读写，结构：{ openids: string[] }
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

async function isAdminOpenid(openid) {
  if (!openid) return false;
  try {
    const res = await db.collection('admin_users').limit(5).get();
    const docs = res.data || [];
    for (const doc of docs) {
      const list = doc.openids || (doc.openid ? [doc.openid] : []);
      if (list.indexOf(openid) !== -1) return true;
    }
    return false;
  } catch (e) {
    // 鉴权服务失败 → 默认拒绝
    console.log(JSON.stringify({ stage: 'admin_check_fail' }));
    return false;
  }
}

exports.isAdminOpenid = isAdminOpenid;

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { ok: true, isAdmin: false };
  }
  const ok = await isAdminOpenid(OPENID);
  return { ok: true, isAdmin: ok };
};
