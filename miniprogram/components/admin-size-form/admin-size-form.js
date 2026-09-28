const { validateCustomSize } = require('../../utils/image');

Component({
  properties: {
    value: { type: Object, value: null }
  },
  data: {
    form: {
      name: '',
      category: '',
      aliasesText: '',
      keywordsText: '',
      mmWidth: '',
      mmHeight: '',
      pxWidth: '',
      pxHeight: '',
      dpi: '300',
      sort: '100',
      note: '',
      enabled: true,
      version: 0,
      _id: ''
    },
    error: '',
    submitting: false,
    dirty: false
  },
  observers: {
    value(v) {
      if (!v) return;
      this.setData({
        form: {
          name: v.name || '',
          category: v.category || '',
          aliasesText: (v.aliases || []).join(','),
          keywordsText: (v.keywords || []).join(','),
          mmWidth: v.mmWidth != null ? String(v.mmWidth) : '',
          mmHeight: v.mmHeight != null ? String(v.mmHeight) : '',
          pxWidth: v.pxWidth != null ? String(v.pxWidth) : '',
          pxHeight: v.pxHeight != null ? String(v.pxHeight) : '',
          dpi: String(v.dpi || 300),
          sort: String(v.sort || 100),
          note: v.note || '',
          enabled: v.enabled !== false,
          version: v.version || 0,
          _id: v._id || v.id || ''
        },
        dirty: false,
        error: ''
      });
    }
  },
  methods: {
    onInput(e) {
      const k = e.currentTarget.dataset.k;
      this.setData({
        [`form.${k}`]: e.detail.value,
        dirty: true
      });
    },
    onEnabled(e) {
      this.setData({ 'form.enabled': e.detail.value, dirty: true });
    },
    onSubmit() {
      if (this.data.submitting) return;
      const f = this.data.form;
      if (!f.name || !f.category) {
        this.setData({ error: '名称与分类必填' });
        return;
      }
      const pxCheck = validateCustomSize({
        pxWidth: f.pxWidth,
        pxHeight: f.pxHeight,
        mmWidth: f.mmWidth,
        mmHeight: f.mmHeight
      });
      if (!pxCheck.ok) {
        this.setData({ error: Object.values(pxCheck.errors).join('；') });
        return;
      }
      const dpi = Number(f.dpi);
      if (!Number.isFinite(dpi) || dpi <= 0) {
        this.setData({ error: 'DPI 无效' });
        return;
      }
      const payload = {
        _id: f._id,
        name: f.name.trim(),
        category: f.category.trim(),
        aliases: f.aliasesText.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
        keywords: f.keywordsText.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
        mmWidth: Number(f.mmWidth) || 0,
        mmHeight: Number(f.mmHeight) || 0,
        pxWidth: Number(f.pxWidth),
        pxHeight: Number(f.pxHeight),
        dpi,
        sort: Number(f.sort) || 0,
        note: f.note || '',
        enabled: !!f.enabled,
        version: f.version || 0,
        type: 'preset'
      };
      this.setData({ submitting: true, error: '' });
      this.triggerEvent('submit', {
        payload,
        done: (err) => {
          this.setData({ submitting: false });
          if (err) this.setData({ error: err.message || '保存失败' });
          else this.setData({ dirty: false });
        }
      });
    }
  }
});
