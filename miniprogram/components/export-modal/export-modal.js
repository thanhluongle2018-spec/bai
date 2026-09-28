/**
 * 导出状态机：
 * idle → checking-ad → showing-ad → unlocked → saving → success/error
 * 仅 isEnded === true 解锁；广告未完整观看或状态变化后不可复用解锁
 */
const { showRewardedAd, isAdConfigured } = require('../../utils/ad');

const STATUS_TEXT = {
  idle: '待解锁',
  'checking-ad': '检查广告…',
  'showing-ad': '播放广告中…',
  unlocked: '已解锁，准备保存',
  saving: '正在保存到相册…',
  success: '已保存',
  error: '出错，可重试'
};

Component({
  properties: {
    visible: { type: Boolean, value: false },
    /** 外部可强制重置解锁（换图/改尺寸等） */
    unlockToken: { type: String, value: '' }
  },

  data: {
    exportState: 'idle',
    statusText: STATUS_TEXT.idle,
    errorMsg: '',
    busy: false,
    actionText: '观看广告并导出',
    _unlockedForToken: ''
  },

  observers: {
    unlockToken(token) {
      // 换图或参数变化：旧解锁失效
      if (token !== this.data._unlockedForToken) {
        this.setState('idle');
        this.setData({ _unlockedForToken: '', errorMsg: '' });
      }
    },
    visible(v) {
      if (!v) {
        // 关闭时若不在 success，回到 idle（解锁不跨次复用，除非同 token 且仍 unlocked）
        if (this.data.exportState !== 'unlocked' && this.data.exportState !== 'success') {
          this.setState('idle');
        }
      }
    }
  },

  methods: {
    noop() {},

    setState(state) {
      const busy = ['checking-ad', 'showing-ad', 'saving'].indexOf(state) !== -1;
      let actionText = '观看广告并导出';
      if (state === 'unlocked') actionText = '保存到相册';
      if (state === 'error') actionText = '重试';
      if (state === 'success') actionText = '完成';
      if (!isAdConfigured() && state === 'idle') actionText = '广告未配置（无法解锁）';
      this.setData({
        exportState: state,
        statusText: STATUS_TEXT[state] || state,
        busy,
        actionText
      });
    },

    go(e) {
      const url = e.currentTarget.dataset.url;
      if (url) wx.navigateTo({ url });
    },

    onClose() {
      this.triggerEvent('close');
    },

    async onExport() {
      if (this.data.busy) return;
      const token = this.properties.unlockToken || '';
      const state = this.data.exportState;

      if (state === 'success') {
        this.triggerEvent('close');
        return;
      }

      // 已解锁且 token 匹配 → 直接保存
      if (state === 'unlocked' && this.data._unlockedForToken === token) {
        await this.doSave();
        return;
      }

      // 重新走广告
      this.setData({ errorMsg: '' });
      this.setState('checking-ad');

      if (!isAdConfigured()) {
        this.setState('error');
        this.setData({
          errorMsg: '尚未配置激励视频广告位，无法解锁高清导出（不可绕过）'
        });
        return;
      }

      this.setState('showing-ad');
      const result = await showRewardedAd();
      if (!(result && result.unlocked === true && result.reason === 'ended')) {
        this.setState('error');
        const map = {
          skipped_or_closed: '未完整观看广告，未解锁',
          not_loaded: '广告未加载，请重试',
          error: '广告播放失败，请重试',
          busy: '请勿重复点击'
        };
        this.setData({ errorMsg: map[result.reason] || '未解锁' });
        return;
      }

      this.setData({ _unlockedForToken: token });
      this.setState('unlocked');
      await this.doSave();
    },

    async doSave() {
      this.setState('saving');
      try {
        // 由父页面生成临时文件路径后回调
        const path = await new Promise((resolve, reject) => {
          this.triggerEvent('save', {
            success: resolve,
            fail: reject
          });
          // 父组件应调用 event.detail.success(tempPath)
        });
        await this.saveToAlbum(path);
        this.setState('success');
        this.triggerEvent('success');
      } catch (e) {
        const msg = (e && e.errMsg) || (e && e.message) || '保存失败';
        // 区分相册权限与广告
        if (/auth deny|authorize|权限/i.test(msg)) {
          this.setState('error');
          this.setData({
            errorMsg: '保存相册权限被拒绝，请在设置中授权。这与广告无关，广告已解锁。'
          });
          // 保持解锁，允许重试保存
          this.setData({ exportState: 'unlocked', actionText: '重新保存到相册', busy: false });
          return;
        }
        this.setState('error');
        this.setData({ errorMsg: msg });
      }
    },

    saveToAlbum(filePath) {
      return new Promise((resolve, reject) => {
        wx.saveImageToPhotosAlbum({
          filePath,
          success: resolve,
          fail: (err) => {
            // 尝试引导授权
            if (err && /auth deny|authorize/i.test(err.errMsg || '')) {
              wx.showModal({
                title: '需要相册权限',
                content: '请允许保存图片到相册',
                success: (r) => {
                  if (r.confirm) {
                    wx.openSetting({});
                  }
                  reject(err);
                }
              });
            } else {
              reject(err);
            }
          }
        });
      });
    }
  }
});
