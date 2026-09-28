const flags = require('../../config/feature-flags');
const { computeLayout, getPresetGridForPhoto } = require('../../utils/layout');
const { LAYOUT_PAPERS } = require('../../utils/constants');

Page({
  data: {
    enabled: flags.ENABLE_PRINT_LAYOUT,
    paperId: 'A4',
    layoutMode: 'preset',
    count: 8,
    photoPath: '',
    photoSize: null,
    layoutResult: { fits: false, maxCount: 0, dpi: 300 },
    cssW: 280,
    cssH: 396,
    exportVisible: false,
    unlockToken: ''
  },

  onShow() {
    this.setData({ enabled: flags.ENABLE_PRINT_LAYOUT });
  },

  choosePhoto() {
    // 复用一期抠图结果：从相册选透明/合成图，或后续可接编辑页传参
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: (res) => {
        const file = res.tempFiles[0];
        const app = getApp();
        const sizes = app.getSizes();
        const photoSize = sizes[0] || { name: '1寸', pxWidth: 295, pxHeight: 413 };
        this.setData({ photoPath: file.tempFilePath, photoSize });
        this.recompute();
      }
    });
  },

  onSettingsChange(e) {
    const patch = e.detail || {};
    this.setData(patch, () => this.recompute());
  },

  recompute() {
    const { paperId, layoutMode, count, photoSize } = this.data;
    if (!photoSize) return;
    const paper = LAYOUT_PAPERS[paperId];
    let opts = {
      paperId,
      photoW: photoSize.pxWidth,
      photoH: photoSize.pxHeight,
      count,
      layoutMode: layoutMode === 'preset' ? 'grid' : layoutMode
    };
    if (layoutMode === 'preset') {
      const grid = getPresetGridForPhoto(photoSize.name) || { cols: 2, rows: 2 };
      opts.presetGrid = grid;
      opts.count = grid.cols * grid.rows;
    }
    const layoutResult = computeLayout(opts);
    const sys = wx.getSystemInfoSync();
    const cssW = Math.min(sys.windowWidth - 48, 320);
    const cssH = Math.round(cssW * (paper.pxHeight / paper.pxWidth));
    const unlockToken = [
      this.data.photoPath,
      paperId,
      layoutMode,
      layoutResult.count,
      photoSize.pxWidth,
      photoSize.pxHeight
    ].join('|');
    this.setData({ layoutResult, cssW, cssH, unlockToken, count: layoutResult.count });
  },

  openExport() {
    if (!this.data.layoutResult.fits || !this.data.photoPath) return;
    this.setData({ exportVisible: true });
  },

  closeExport() {
    this.setData({ exportVisible: false });
  },

  async onExportSave(e) {
    try {
      const comp = this.selectComponent('#layoutCanvas');
      const path = await comp.exportFull();
      e.detail.success(path);
    } catch (err) {
      e.detail.fail(err);
    }
  }
});
