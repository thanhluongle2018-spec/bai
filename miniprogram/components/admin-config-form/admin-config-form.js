Component({
  properties: {
    value: { type: Object, value: null }
  },
  data: {
    form: {
      sizesVersion: '1',
      enablePrintLayout: false,
      enableAiWatermark: false,
      gradientStart: '0.7',
      gradientRange: '0.15',
      version: 0
    },
    error: '',
    submitting: false
  },
  observers: {
    value(v) {
      if (!v) return;
      this.setData({
        form: {
          sizesVersion: String(v.sizesVersion != null ? v.sizesVersion : 1),
          enablePrintLayout: !!v.enablePrintLayout,
          enableAiWatermark: !!v.enableAiWatermark,
          gradientStart: String(v.gradientStart != null ? v.gradientStart : 0.7),
          gradientRange: String(v.gradientRange != null ? v.gradientRange : 0.15),
          version: v.version || 0
        }
      });
    }
  },
  methods: {
    onInput(e) {
      this.setData({ [`form.${e.currentTarget.dataset.k}`]: e.detail.value });
    },
    onSwitch(e) {
      this.setData({ [`form.${e.currentTarget.dataset.k}`]: e.detail.value });
    },
    onSubmit() {
      if (this.data.submitting) return;
      const f = this.data.form;
      const start = Number(f.gradientStart);
      const range = Number(f.gradientRange);
      if (!(start >= 0 && start <= 1) || !(range >= 0 && range <= 1)) {
        this.setData({ error: '渐变参数须在 0–1' });
        return;
      }
      const payload = {
        sizesVersion: Number(f.sizesVersion) || 0,
        enablePrintLayout: !!f.enablePrintLayout,
        enableAiWatermark: !!f.enableAiWatermark,
        gradientStart: start,
        gradientRange: range,
        version: f.version || 0
      };
      this.setData({ submitting: true, error: '' });
      this.triggerEvent('submit', {
        payload,
        done: (err) => {
          this.setData({ submitting: false });
          if (err) this.setData({ error: err.message || '保存失败' });
        }
      });
    }
  }
});
