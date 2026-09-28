/**
 * 激励视频广告封装
 * 仅当 onClose(res).isEnded === true 才视为完整观看解锁
 * 跳过、关闭、失败、未加载、onError 一律不解锁
 *
 * 是否走广告由 feature-flags.ENABLE_REWARD_AD 决定（默认 false）。
 * 本模块仅在开关为 true 时被 export-modal 调用；广告加载失败不得作为免广告下载条件。
 *
 * 开通流量主后：将 ENABLE_REWARD_AD 设为 true，并填入广告位 ID。
 * 流量主开通门槛按微信最新官方要求核实，不在此写死。
 */
const REWARD_AD_UNIT_ID = ''; // 开通流量主并启用 ENABLE_REWARD_AD 后填入

let rewardedVideoAd = null;
let loading = false;

function ensureAd() {
  if (!REWARD_AD_UNIT_ID) {
    return null;
  }
  if (rewardedVideoAd) return rewardedVideoAd;
  if (!wx.createRewardedVideoAd) return null;
  rewardedVideoAd = wx.createRewardedVideoAd({ adUnitId: REWARD_AD_UNIT_ID });
  return rewardedVideoAd;
}

/**
 * @returns {Promise<{unlocked: boolean, reason: string}>}
 */
function showRewardedAd() {
  return new Promise((resolve) => {
    if (loading) {
      resolve({ unlocked: false, reason: 'busy' });
      return;
    }
    const ad = ensureAd();
    if (!ad) {
      // 开发期未配置广告位：不解锁，避免绕过
      resolve({ unlocked: false, reason: 'not_loaded' });
      return;
    }

    loading = true;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      loading = false;
      try {
        ad.offClose(onClose);
        ad.offError(onError);
      } catch (e) { /* ignore */ }
      resolve(result);
    };

    const onClose = (res) => {
      if (res && res.isEnded === true) {
        finish({ unlocked: true, reason: 'ended' });
      } else {
        finish({ unlocked: false, reason: 'skipped_or_closed' });
      }
    };
    const onError = () => {
      finish({ unlocked: false, reason: 'error' });
    };

    ad.onClose(onClose);
    ad.onError(onError);

    ad.load()
      .then(() => ad.show())
      .catch(() => {
        // 重试一次加载展示
        return ad.load().then(() => ad.show());
      })
      .catch(() => {
        finish({ unlocked: false, reason: 'not_loaded' });
      });
  });
}

function isAdConfigured() {
  return !!REWARD_AD_UNIT_ID;
}

module.exports = {
  REWARD_AD_UNIT_ID,
  showRewardedAd,
  isAdConfigured
};
