/**
 * 管理员相关前端辅助（真正鉴权在云函数）
 */
function callAdminCheck() {
  return wx.cloud.callFunction({ name: 'admin-check', data: {} })
    .then((res) => (res.result || {}));
}

function callAdminSizes(action, payload) {
  return wx.cloud.callFunction({
    name: 'admin-sizes',
    data: Object.assign({ action }, payload || {})
  }).then((res) => {
    const r = res.result || {};
    if (r.ok === false) {
      const err = new Error(r.message || 'ADMIN_SIZES_FAILED');
      err.code = r.code;
      err.result = r;
      throw err;
    }
    return r;
  });
}

function callAdminConfig(action, payload) {
  return wx.cloud.callFunction({
    name: 'admin-config',
    data: Object.assign({ action }, payload || {})
  }).then((res) => {
    const r = res.result || {};
    if (r.ok === false) {
      const err = new Error(r.message || 'ADMIN_CONFIG_FAILED');
      err.code = r.code;
      err.result = r;
      throw err;
    }
    return r;
  });
}

module.exports = {
  callAdminCheck,
  callAdminSizes,
  callAdminConfig
};
