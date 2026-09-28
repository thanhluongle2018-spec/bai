/**
 * 功能开关（一期默认关闭打印排版、AI 水印与激励视频）
 * 二期将 ENABLE_PRINT_LAYOUT 设为 true 即可开放入口
 * 开通流量主后将 ENABLE_REWARD_AD 设为 true，并配置广告位 ID
 */
module.exports = {
  ENABLE_PRINT_LAYOUT: false,
  ENABLE_AI_WATERMARK: false,
  ENABLE_ADMIN_ENTRY: true,
  /** 是否要求激励视频解锁高清导出；初期未开通流量主时为 false */
  ENABLE_REWARD_AD: false
};
