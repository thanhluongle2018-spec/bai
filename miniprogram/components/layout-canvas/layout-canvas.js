Component({
  properties: {
    layout: { type: Object, value: null },
    photoPath: { type: String, value: '' },
    fits: { type: Boolean, value: true },
    maxCount: { type: Number, value: 0 },
    cssW: { type: Number, value: 280 },
    cssH: { type: Number, value: 396 }
  },

  observers: {
    'layout, photoPath'() {
      wx.nextTick(() => this.draw());
    }
  },

  methods: {
    async draw() {
      const layout = this.properties.layout;
      const photoPath = this.properties.photoPath;
      if (!layout || !photoPath) return;
      const query = this.createSelectorQuery();
      const canvas = await new Promise((resolve) => {
        query.select('#layoutPreview').fields({ node: true, size: true }).exec((res) => {
          resolve(res[0] && res[0].node);
        });
      });
      if (!canvas) return;
      const cssW = this.properties.cssW;
      const cssH = this.properties.cssH;
      const dpr = wx.getSystemInfoSync().pixelRatio || 2;
      canvas.width = cssW * dpr;
      canvas.height = cssH * dpr;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cssW, cssH);

      const scaleX = cssW / layout.canvasW;
      const scaleY = cssH / layout.canvasH;
      const img = canvas.createImage();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = photoPath;
      });
      (layout.positions || []).forEach((p) => {
        if (layout.rotated) {
          ctx.save();
          ctx.translate(p.x * scaleX + (p.w * scaleX) / 2, p.y * scaleY + (p.h * scaleY) / 2);
          ctx.rotate(-Math.PI / 2);
          // 旋转后绘制：源图竖图映射到横槽
          ctx.drawImage(
            img,
            -(p.h * scaleY) / 2,
            -(p.w * scaleX) / 2,
            p.h * scaleY,
            p.w * scaleX
          );
          ctx.restore();
        } else {
          ctx.drawImage(
            img,
            p.x * scaleX,
            p.y * scaleY,
            p.w * scaleX,
            p.h * scaleY
          );
        }
      });
    },

    /**
     * 高清导出：与预览同一套坐标，不静默降低分辨率
     */
    async exportFull() {
      const layout = this.properties.layout;
      if (!layout || !layout.fits) {
        throw new Error('布局超出画布，禁止导出');
      }
      const photoPath = this.properties.photoPath;
      // 使用离屏或页面级 canvas；此处创建离屏
      if (!wx.createOffscreenCanvas) {
        throw new Error('当前基础库不支持离屏 Canvas，请真机升级后重试');
      }
      const canvas = wx.createOffscreenCanvas({
        type: '2d',
        width: layout.canvasW,
        height: layout.canvasH
      });
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, layout.canvasW, layout.canvasH);
      const img = canvas.createImage();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = photoPath;
      });
      layout.positions.forEach((p) => {
        if (layout.rotated) {
          ctx.save();
          ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
          ctx.rotate(-Math.PI / 2);
          ctx.drawImage(img, -p.h / 2, -p.w / 2, p.h, p.w);
          ctx.restore();
        } else {
          ctx.drawImage(img, p.x, p.y, p.w, p.h);
        }
      });
      return new Promise((resolve, reject) => {
        wx.canvasToTempFilePath({
          canvas,
          fileType: 'jpg',
          quality: 1,
          success: (r) => resolve(r.tempFilePath),
          fail: (err) => {
            reject(Object.assign(new Error('Canvas 导出失败（可能内存不足），请减少张数后重试'), { cause: err }));
          }
        });
      });
    }
  }
});
