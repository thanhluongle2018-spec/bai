const flags = require('./config/feature-flags');
const { trackUv, getLocalSizes, saveSizesCache, getCachedSizesVersion, savePublicConfig } = require('./utils/db');

App({
  globalData: {
    featureFlags: flags,
    cloudReady: false,
    // 替换为你的 CloudBase 环境 ID
    envId: 'kangyang-0gstf7ge8e7fb5c1',
    sizesState: {
      list: [],
      version: 0,
      sync: 'idle',
      from: 'hardcoded'
    },
    isAdmin: false,
    privacyAuthorized: false
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用支持云开发的基础库');
      return;
    }
    const env = this.globalData.envId;
    wx.cloud.init({
      env: env || undefined,
      traceUser: true
    });
    this.globalData.cloudReady = true;

    const local = getLocalSizes();
    this.globalData.sizesState = {
      list: local.list,
      version: local.version,
      sync: local.from === 'cache' ? 'cached' : 'hardcoded',
      from: local.from,
      cachedAt: local.cachedAt
    };

    this.refreshSizesOnLaunch();
    this.checkPrivacy();
    trackUv();
  },

  checkPrivacy() {
    if (wx.getPrivacySetting) {
      wx.getPrivacySetting({
        success: (res) => {
          this.globalData.privacyAuthorized = !res.needAuthorization;
        }
      });
    } else {
      this.globalData.privacyAuthorized = !!wx.getStorageSync('privacy_agreed');
    }
  },

  async refreshSizesOnLaunch() {
    this.globalData.sizesState.sync = 'loading';
    try {
      const res = await wx.cloud.callFunction({
        name: 'admin-sizes',
        data: { action: 'listPublic' }
      });
      const result = res.result || {};
      if (result.ok && Array.isArray(result.list) && result.list.length) {
        const version = result.sizesVersion || result.version || 0;
        saveSizesCache(result.list, version);
        this.globalData.sizesState = {
          list: result.list,
          version,
          sync: 'fresh',
          from: 'cloud',
          cachedAt: Date.now()
        };
      }
      if (result.publicConfig) {
        savePublicConfig(result.publicConfig);
      }
    } catch (e) {
      const local = getLocalSizes();
      this.globalData.sizesState = {
        list: local.list,
        version: local.version,
        sync: local.from === 'cache' ? 'offline-cache' : 'failed',
        from: local.from,
        cachedAt: local.cachedAt
      };
    }
  },

  async checkSizesVersionOnShow() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'admin-config',
        data: { action: 'getPublic' }
      });
      const result = res.result || {};
      if (!result.ok) return;
      const remoteVersion = (result.config && result.config.sizesVersion) || 0;
      const localVersion = getCachedSizesVersion();
      if (remoteVersion && remoteVersion !== localVersion) {
        this.globalData.sizesState.sync = 'updating';
        await this.refreshSizesOnLaunch();
      }
      if (result.config) savePublicConfig(result.config);
    } catch (e) {
      // 保持现有缓存
    }
  },

  getSizes() {
    return this.globalData.sizesState.list || [];
  }
});
