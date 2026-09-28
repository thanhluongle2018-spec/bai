const flags = require('../../config/feature-flags');
const { prepareImageForUpload } = require('../../utils/image');
const { callAdminCheck } = require('../../utils/admin');

Page({
  data: {
    enablePrint: flags.ENABLE_PRINT_LAYOUT,
    enableAdmin: flags.ENABLE_ADMIN_ENTRY,
    isAdmin: false,
    syncLabel: ''
  },

  onShow() {
    const app = getApp();
    app.checkSizesVersionOnShow && app.checkSizesVersionOnShow();
    const st = app.globalData.sizesState || {};
    let syncLabel = '';
    if (st.sync === 'offline-cache') syncLabel = '尺寸数据：离线缓存';
    else if (st.sync === 'failed') syncLabel = '尺寸数据：云端失败，已用本地预置';
    else if (st.sync === 'fresh') syncLabel = '尺寸数据：已同步';
    this.setData({ syncLabel });

    if (flags.ENABLE_ADMIN_ENTRY) {
      callAdminCheck().then((r) => {
        this.setData({ isAdmin: !!(r && r.isAdmin) });
        app.globalData.isAdmin = !!(r && r.isAdmin);
      }).catch(() => {
        this.setData({ isAdmin: false });
      });
    }
  },

  ensurePrivacy() {
    return new Promise((resolve) => {
      const app = getApp();
      if (app.globalData.privacyAuthorized) {
        resolve(true);
        return;
      }
      if (wx.requirePrivacyAuthorize) {
        wx.requirePrivacyAuthorize({
          success: () => {
            app.globalData.privacyAuthorized = true;
            resolve(true);
          },
          fail: () => {
            wx.navigateTo({ url: '/pages/privacy/privacy' });
            resolve(false);
          }
        });
      } else if (!wx.getStorageSync('privacy_agreed')) {
        wx.navigateTo({ url: '/pages/privacy/privacy' });
        resolve(false);
      } else {
        app.globalData.privacyAuthorized = true;
        resolve(true);
      }
    });
  },

  async onChoose() {
    const ok = await this.ensurePrivacy();
    if (!ok) return;

    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file) return;
        wx.showLoading({ title: '处理中', mask: true });
        try {
          const prepared = await prepareImageForUpload(file.tempFilePath);
          wx.hideLoading();
          wx.navigateTo({
            url: `/pages/editor/editor?src=${encodeURIComponent(prepared.path)}&w=${prepared.width}&h=${prepared.height}`
          });
        } catch (e) {
          wx.hideLoading();
          wx.showToast({
            title: (e && e.message) || '图片不符合要求',
            icon: 'none',
            duration: 3000
          });
        }
      }
    });
  },

  openSizesHint() {
    wx.showToast({ title: '请先选择照片进入编辑', icon: 'none' });
  },

  goLayout() {
    if (!flags.ENABLE_PRINT_LAYOUT) return;
    wx.navigateTo({ url: '/pages/layout/layout' });
  },

  goAdmin() {
    wx.navigateTo({ url: '/pages/admin/admin' });
  }
});
