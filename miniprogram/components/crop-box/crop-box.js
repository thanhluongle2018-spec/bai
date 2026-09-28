Component({
  properties: {
    src: { type: String, value: '' },
    /** 裁剪框宽高比 = pxWidth / pxHeight */
    aspect: { type: Number, value: 295 / 413 },
    imageWidth: { type: Number, value: 0 },
    imageHeight: { type: Number, value: 0 }
  },

  data: {
    stageW: 300,
    stageH: 400,
    imgDisplayW: 0,
    imgDisplayH: 0,
    imgOffsetX: 0,
    imgOffsetY: 0,
    box: { x: 40, y: 40, w: 200, h: 280 },
    _drag: null
  },

  observers: {
    'src, aspect, imageWidth, imageHeight': function () {
      this.initLayout();
    }
  },

  lifetimes: {
    attached() {
      const sys = wx.getSystemInfoSync();
      const stageW = Math.floor(sys.windowWidth - 48);
      const stageH = Math.floor(sys.windowHeight * 0.42);
      this.setData({ stageW, stageH }, () => this.initLayout());
    }
  },

  methods: {
    noop() {},

    initLayout() {
      const { stageW, stageH } = this.data;
      const iw = this.properties.imageWidth || 1;
      const ih = this.properties.imageHeight || 1;
      const scale = Math.min(stageW / iw, stageH / ih);
      const imgDisplayW = Math.floor(iw * scale);
      const imgDisplayH = Math.floor(ih * scale);
      const imgOffsetX = Math.floor((stageW - imgDisplayW) / 2);
      const imgOffsetY = Math.floor((stageH - imgDisplayH) / 2);

      const aspect = this.properties.aspect || 1;
      let boxW = imgDisplayW * 0.78;
      let boxH = boxW / aspect;
      if (boxH > imgDisplayH * 0.9) {
        boxH = imgDisplayH * 0.9;
        boxW = boxH * aspect;
      }
      const box = {
        x: imgOffsetX + (imgDisplayW - boxW) / 2,
        y: imgOffsetY + (imgDisplayH - boxH) / 2,
        w: boxW,
        h: boxH
      };
      this.setData({ imgDisplayW, imgDisplayH, imgOffsetX, imgOffsetY, box });
      this.emitCrop();
    },

    clampBox(box) {
      const { imgOffsetX, imgOffsetY, imgDisplayW, imgDisplayH } = this.data;
      const minX = imgOffsetX;
      const minY = imgOffsetY;
      const maxX = imgOffsetX + imgDisplayW;
      const maxY = imgOffsetY + imgDisplayH;
      let { x, y, w, h } = box;
      w = Math.max(40, w);
      h = Math.max(40, h);
      if (x < minX) x = minX;
      if (y < minY) y = minY;
      if (x + w > maxX) x = maxX - w;
      if (y + h > maxY) y = maxY - h;
      if (w > imgDisplayW) {
        w = imgDisplayW;
        x = minX;
      }
      if (h > imgDisplayH) {
        h = imgDisplayH;
        y = minY;
      }
      return { x, y, w, h };
    },

    onBoxStart(e) {
      const t = e.touches[0];
      this.setData({
        _drag: {
          mode: 'move',
          startX: t.clientX,
          startY: t.clientY,
          origin: { ...this.data.box }
        }
      });
    },

    onBoxMove(e) {
      const drag = this.data._drag;
      if (!drag || drag.mode !== 'move') return;
      const t = e.touches[0];
      const dx = t.clientX - drag.startX;
      const dy = t.clientY - drag.startY;
      const box = this.clampBox({
        x: drag.origin.x + dx,
        y: drag.origin.y + dy,
        w: drag.origin.w,
        h: drag.origin.h
      });
      this.setData({ box });
    },

    onHandleStart(e) {
      const t = e.touches[0];
      const corner = e.currentTarget.dataset.corner;
      this.setData({
        _drag: {
          mode: 'resize',
          corner,
          startX: t.clientX,
          startY: t.clientY,
          origin: { ...this.data.box }
        }
      });
    },

    onHandleMove(e) {
      const drag = this.data._drag;
      if (!drag || drag.mode !== 'resize') return;
      const t = e.touches[0];
      const dx = t.clientX - drag.startX;
      const dy = t.clientY - drag.startY;
      const aspect = this.properties.aspect || 1;
      const o = drag.origin;
      let x = o.x;
      let y = o.y;
      let w = o.w;
      let h = o.h;
      const corner = drag.corner;

      // 以水平位移主导，保持比例
      if (corner === 'br') {
        w = o.w + dx;
        h = w / aspect;
      } else if (corner === 'bl') {
        w = o.w - dx;
        h = w / aspect;
        x = o.x + o.w - w;
      } else if (corner === 'tr') {
        w = o.w + dx;
        h = w / aspect;
        y = o.y + o.h - h;
      } else if (corner === 'tl') {
        w = o.w - dx;
        h = w / aspect;
        x = o.x + o.w - w;
        y = o.y + o.h - h;
      }
      const box = this.clampBox({ x, y, w, h });
      // 再次按比例修正高度
      box.h = box.w / aspect;
      const fixed = this.clampBox(box);
      this.setData({ box: fixed });
    },

    onBoxEnd() {
      this.setData({ _drag: null });
      this.emitCrop();
    },

    /**
     * 输出相对原图像素的裁剪矩形
     */
    emitCrop() {
      const { box, imgOffsetX, imgOffsetY, imgDisplayW, imgDisplayH } = this.data;
      const iw = this.properties.imageWidth || 1;
      const ih = this.properties.imageHeight || 1;
      const sx = (box.x - imgOffsetX) / imgDisplayW * iw;
      const sy = (box.y - imgOffsetY) / imgDisplayH * ih;
      const sw = box.w / imgDisplayW * iw;
      const sh = box.h / imgDisplayH * ih;
      const crop = {
        x: Math.max(0, Math.round(sx)),
        y: Math.max(0, Math.round(sy)),
        width: Math.max(1, Math.round(sw)),
        height: Math.max(1, Math.round(sh))
      };
      this.triggerEvent('change', { crop, box });
    },

    getCrop() {
      const { box, imgOffsetX, imgOffsetY, imgDisplayW, imgDisplayH } = this.data;
      const iw = this.properties.imageWidth || 1;
      const ih = this.properties.imageHeight || 1;
      return {
        x: Math.max(0, Math.round((box.x - imgOffsetX) / imgDisplayW * iw)),
        y: Math.max(0, Math.round((box.y - imgOffsetY) / imgDisplayH * ih)),
        width: Math.max(1, Math.round(box.w / imgDisplayW * iw)),
        height: Math.max(1, Math.round(box.h / imgDisplayH * ih))
      };
    }
  }
});
