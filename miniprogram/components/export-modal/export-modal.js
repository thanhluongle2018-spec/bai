/**
 * 导出状态机：
 * - ENABLE_REWARD_AD=false：idle → saving → success/error（不创建/加载/展示广告）
 * - ENABLE_REWARD_AD=true：idle → checking-ad → showing-ad → unlocked → saving → success/error
 *   仅 isEnded === true 解锁；跳过、关闭、未加载、onError 均不解锁
 * 是否免广告只由功能开关决定，不得以「广告加载失败」作为免广告条件
 */
const flags = require('../../config/feature-flags');
const { showRewardedAd, isAdConfigured } = require('../../utils/ad');

const STATUS_TEXT_AD = {
  idle: '待解锁',
  'checking-ad': '检查广告…',
  'showing-ad': '播放广告中…',
  unlocked: '已解锁，准备保存',
  saving: '正在保存到相册…',
  success: '已保存',
  error: '出错，可重试'
};

const STATUS_TEXT_FREE = {
  idle: '待保存',
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
    rewardAdEnabled: !!flags.ENABLE_REWARD_AD,
    exportState: 'idle',
    statusText: flags.ENABLE_REWARD_AD ? STATUS_TEXT_AD.idle : STATUS_TEXT_FREE.idle,
    errorMsg: '',
    busy: false,
    actionText: flags.ENABLE_REWARD_AD ? '观看广告并导出' : '保存到相册',
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

    isRewardAdEnabled() {
      return !!flags.ENABLE_REWARD_AD;
    },

    setState(state) {
      const rewardAdEnabled = this.isRewardAdEnabled();
      const busy = ['checking-ad', 'showing-ad', 'saving'].indexOf(state) !== -1;
      const statusMap = rewardAdEnabled ? STATUS_TEXT_AD : STATUS_TEXT_FREE;
      let actionText = rewardAdEnabled ? '观看广告并导出' : '保存到相册';
      if (state === 'unlocked') actionText = '保存到相册';
      if (state === 'error') actionText = '重试';
      if (state === 'success') actionText = '完成';
      // 仅在开启广告开关时，未配置广告位才提示无法解锁（关闭开关时不要求广告位）
      if (rewardAdEnabled && !isAdConfigured() && state === 'idle') {
        actionText = '广告未配置（无法解锁）';
      }
      this.setData({
        rewardAdEnabled,
        exportState: state,
        statusText: statusMap[state] || state,
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
      const rewardAdEnabled = this.isRewardAdEnabled();

      if (state === 'success') {
        this.triggerEvent('close');
        return;
      }

      // —— 免广告：开关关闭时直接保存，不创建/加载/展示激励视频 ——
      if (!rewardAdEnabled) {
        this.setData({ errorMsg: '', _unlockedForToken: token });
        await this.doSave({ viaAd: false });
        return;
      }

      // 已解锁且 token 匹配 → 直接保存
      if (state === 'unlocked' && this.data._unlockedForToken === token) {
        await this.doSave({ viaAd: true });
        return;
      }

      // —— 激励视频流程（保留完整状态机）——
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
      // 广告失败/跳过/未加载 → 不解锁；不得据此免广告下载
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
      await this.doSave({ viaAd: true });
    },

    async doSave(opts) {
      const viaAd = !!(opts && opts.viaAd);
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
          const hint = viaAd
            ? '保存相册权限被拒绝，请在设置中授权。这与广告无关，广告已解锁。'
            : '保存相册权限被拒绝，请在设置中授权。';
          this.setData({
            errorMsg: hint,
            exportState: 'unlocked',
            actionText: '重新保存到相册',
            busy: false,
            statusText: viaAd ? STATUS_TEXT_AD.unlocked : '待重新保存'
          });
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
