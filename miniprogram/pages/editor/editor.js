const flags = require('../../config/feature-flags');
const { BG_COLORS } = require('../../utils/constants');
const {
  hashFile,
  getTempFileURLWithRetry,
  fillBackground,
  drawAiWatermark
} = require('../../utils/image');

const ERROR_HINT = {
  IMAGE_INVALID: '图片格式或内容无效',
  IMAGE_TOO_LARGE: '图片过大，请压缩后重试',
  IMAGE_RESOLUTION: '图片分辨率不符合要求',
  NO_PORTRAIT: '未检测到有效人像',
  RATE_LIMIT: '调用过于频繁，请稍后再试',
  AUTH_FAILED: '服务鉴权失败，请联系管理员',
  BALANCE: '云服务额度不足',
  TIMEOUT: '服务超时，请重试',
  NETWORK: '网络异常，请重试',
  FORBIDDEN: '无权访问该文件',
  INTERNAL: '服务异常，请稍后重试'
};

Page({
  data: {
    src: '',
    imageWidth: 0,
    imageHeight: 0,
    sizes: [],
    selectedSize: null,
    aspect: 295 / 413,
    background: BG_COLORS[0],
    tab: 'size',
    crop: null,
    statusMsg: '',
    cutoutFileID: '',
    cutoutTempUrl: '',
    cutoutFromCache: false,
    cutoutError: '',
    previewCssW: 180,
    previewCssH: 252,
    exportVisible: false,
    unlockToken: '',
    sourceFileID: '',
    imageHash: ''
  },

  _tempUrls: [],
  _cutoutLocalPath: '',

  onLoad(query) {
    const app = getApp();
    const src = decodeURIComponent(query.src || '');
    const w = Number(query.w) || 0;
    const h = Number(query.h) || 0;
    const sizes = app.getSizes();
    const selectedSize = sizes[0] || {
      id: 'cn-1inch',
      name: '1寸',
      pxWidth: 295,
      pxHeight: 413
    };
    this.setData({
      src,
      imageWidth: w,
      imageHeight: h,
      sizes,
      selectedSize,
      aspect: selectedSize.pxWidth / selectedSize.pxHeight,
      unlockToken: `${Date.now()}`
    });
    this.refreshUnlockToken();
  },

  onUnload() {
    this.cleanupTemps();
  },

  cleanupTemps() {
    this._tempUrls = [];
    this._cutoutLocalPath = '';
  },

  refreshUnlockToken() {
    const { selectedSize, background, src } = this.data;
    const token = [
      src,
      selectedSize && selectedSize.id,
      selectedSize && selectedSize.pxWidth,
      selectedSize && selectedSize.pxHeight,
      background && background.id
    ].join('|');
    this.setData({ unlockToken: token });
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ tab });
    if (tab === 'preview' && this.data.cutoutTempUrl) {
      wx.nextTick(() => this.drawPreview());
    }
  },

  onCropChange(e) {
    this.setData({ crop: e.detail.crop });
  },

  onSizeSelect(e) {
    const size = e.detail.size;
    const ok = size && size.pxWidth && size.pxHeight;
    if (!ok) return;
    // 自定义尺寸校验已在组件内完成；越界禁止预览/导出
    this.setData({
      selectedSize: size,
      aspect: size.pxWidth / size.pxHeight
    });
    this.refreshUnlockToken();
    this.updatePreviewSize();
  },

  onBgSelect(e) {
    this.setData({ background: e.detail.background });
    this.refreshUnlockToken();
    if (this.data.tab === 'preview') this.drawPreview();
  },

  updatePreviewSize() {
    const size = this.data.selectedSize;
    if (!size) return;
    const max = 200;
    const scale = Math.min(max / size.pxWidth, max / size.pxHeight);
    this.setData({
      previewCssW: Math.round(size.pxWidth * scale),
      previewCssH: Math.round(size.pxHeight * scale)
    });
  },

  setStatus(msg) {
    this.setData({ statusMsg: msg || '' });
  },

  async startCutout() {
    const app = getApp();
    if (!app.globalData.privacyAuthorized && !wx.getStorageSync('privacy_agreed')) {
      wx.navigateTo({ url: '/pages/privacy/privacy' });
      return;
    }

    this.setData({ cutoutError: '' });
    try {
      this.setStatus('计算图片指纹…');
      const hash = await hashFile(this.data.src);

      this.setStatus('上传云存储…');
      const cloudPath = `uploads/${Date.now()}_${hash}.jpg`;
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath,
        filePath: this.data.src
      });
      const sourceFileID = uploadRes.fileID;

      this.setStatus('AI 抠图中…');
      const callRes = await wx.cloud.callFunction({
        name: 'segment-portrait',
        data: {
          fileID: sourceFileID,
          hash
        }
      });
      const result = callRes.result || {};
      if (!result.ok) {
        const code = result.code || 'INTERNAL';
        throw Object.assign(new Error(ERROR_HINT[code] || result.message || '抠图失败'), { code });
      }

      this.setStatus(result.cacheHit ? '缓存命中，获取预览…' : '获取抠图结果…');
      const tempUrl = await getTempFileURLWithRetry(result.fileID);
      this._tempUrls.push(tempUrl);

      // 下载到本地便于 Canvas 绘制
      const dl = await new Promise((resolve, reject) => {
        wx.cloud.downloadFile({
          fileID: result.fileID,
          success: resolve,
          fail: reject
        });
      });

      this._cutoutLocalPath = dl.tempFilePath;
      this.setData({
        sourceFileID,
        imageHash: hash,
        cutoutFileID: result.fileID,
        cutoutTempUrl: tempUrl,
        cutoutFromCache: !!result.cacheHit,
        tab: 'preview'
      });
      this.refreshUnlockToken();
      this.updatePreviewSize();
      this.setStatus('');
      wx.nextTick(() => this.drawPreview());
    } catch (e) {
      console.error(e);
      const msg = (e && e.message) || ERROR_HINT[(e && e.code)] || '抠图失败';
      this.setData({ cutoutError: msg });
      this.setStatus('');
      wx.showToast({ title: msg, icon: 'none', duration: 2800 });
    }
  },

  retryCutout() {
    this.startCutout();
  },

  async drawPreview() {
    const size = this.data.selectedSize;
    if (!size || !this._cutoutLocalPath) return;
    try {
      const query = wx.createSelectorQuery();
      const canvas = await new Promise((resolve) => {
        query.select('#previewCanvas')
          .fields({ node: true, size: true })
          .exec((res) => resolve(res[0] && res[0].node));
      });
      if (!canvas) {
        wx.showToast({ title: '画布初始化失败', icon: 'none' });
        return;
      }
      const cssW = this.data.previewCssW;
      const cssH = this.data.previewCssH;
      const dpr = wx.getSystemInfoSync().pixelRatio || 2;
      canvas.width = cssW * dpr;
      canvas.height = cssH * dpr;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      fillBackground(ctx, cssW, cssH, this.data.background);
      const img = canvas.createImage();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = this._cutoutLocalPath;
      });
      // 按裁剪区域映射到目标尺寸
      const crop = this.data.crop;
      if (crop && crop.width && crop.height) {
        // 抠图结果与源图同尺寸时，用 crop；否则铺满
        ctx.drawImage(
          img,
          crop.x, crop.y, crop.width, crop.height,
          0, 0, cssW, cssH
        );
      } else {
        ctx.drawImage(img, 0, 0, cssW, cssH);
      }
      drawAiWatermark(ctx, cssW, cssH, flags.ENABLE_AI_WATERMARK);
    } catch (e) {
      console.error(e);
      wx.showToast({ title: '预览绘制失败', icon: 'none' });
    }
  },

  openExport() {
    if (!this.data.selectedSize || !this.data.selectedSize.pxWidth) {
      wx.showToast({ title: '请选择有效尺寸', icon: 'none' });
      return;
    }
    this.setData({ exportVisible: true });
  },

  closeExport() {
    this.setData({ exportVisible: false });
  },

  /**
   * export-modal 请求生成高清图：通过 e.detail.success(path) 回传
   */
  async onExportSave(e) {
    try {
      const path = await this.composeExportImage();
      e.detail.success(path);
    } catch (err) {
      e.detail.fail(err);
    }
  },

  onExportSuccess() {
    wx.showToast({ title: '已保存到相册', icon: 'success' });
  },

  async composeExportImage() {
    const size = this.data.selectedSize;
    const w = size.pxWidth;
    const h = size.pxHeight;
    if (!this._cutoutLocalPath) {
      throw new Error('缺少抠图结果');
    }

    const query = wx.createSelectorQuery();
    const canvas = await new Promise((resolve) => {
      query.select('#exportCanvas')
        .fields({ node: true, size: true })
        .exec((res) => resolve(res[0] && res[0].node));
    });
    if (!canvas) {
      throw new Error('Canvas 初始化失败，请重试并释放内存');
    }

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    fillBackground(ctx, w, h, this.data.background);

    const img = canvas.createImage();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = this._cutoutLocalPath;
    });

    const crop = this.data.crop;
    if (crop && crop.width && crop.height) {
      ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, w, h);
    } else {
      ctx.drawImage(img, 0, 0, w, h);
    }
    drawAiWatermark(ctx, w, h, flags.ENABLE_AI_WATERMARK);

    const tempPath = await new Promise((resolve, reject) => {
      wx.canvasToTempFilePath({
        canvas,
        fileType: 'png',
        quality: 1,
        success: (r) => resolve(r.tempFilePath),
        fail: reject
      });
    });
    return tempPath;
  }
});
