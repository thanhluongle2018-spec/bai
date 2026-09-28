Page({
  onAgree() {
    const app = getApp();
    app.globalData.privacyAuthorized = true;
    try {
      wx.setStorageSync('privacy_agreed', 1);
    } catch (e) { /* ignore */ }
    wx.showToast({ title: '已授权', icon: 'success' });
    setTimeout(() => wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/index/index' }) }), 400);
  },

  onDeny() {
    wx.showModal({
      title: '需要授权',
      content: '未同意隐私政策将无法上传图片或调用 AI 抠图服务。',
      showCancel: false
    });
  }
});
