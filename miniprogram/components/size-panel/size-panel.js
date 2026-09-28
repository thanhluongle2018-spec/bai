const { searchSizes } = require('../../utils/db');
const { validateCustomSize } = require('../../utils/image');

Component({
  properties: {
    sizes: { type: Array, value: [] },
    selectedId: { type: String, value: '' }
  },

  data: {
    keyword: '',
    activeCategory: '',
    categories: [],
    filtered: [],
    custom: { pxWidth: '', pxHeight: '', mmWidth: '', mmHeight: '' },
    customErrors: {},
    customOk: false
  },

  observers: {
    sizes() {
      this.rebuild();
    }
  },

  lifetimes: {
    attached() {
      this.rebuild();
    }
  },

  methods: {
    rebuild() {
      const sizes = this.properties.sizes || [];
      const cats = [];
      sizes.forEach((s) => {
        if (s.category && cats.indexOf(s.category) === -1) cats.push(s.category);
      });
      this.setData({ categories: cats });
      this.applyFilter();
    },

    applyFilter() {
      let list = searchSizes(this.properties.sizes, this.data.keyword);
      if (this.data.activeCategory) {
        list = list.filter((s) => s.category === this.data.activeCategory);
      }
      this.setData({ filtered: list });
    },

    onSearch(e) {
      this.setData({ keyword: e.detail.value || '' }, () => this.applyFilter());
    },

    onCat(e) {
      this.setData({ activeCategory: e.currentTarget.dataset.cat || '' }, () => this.applyFilter());
    },

    onSelect(e) {
      const id = e.currentTarget.dataset.id;
      const item = (this.properties.sizes || []).find((s) => s.id === id);
      if (!item) return;
      this.triggerEvent('select', { size: item, custom: false });
    },

    onCustomInput(e) {
      const key = e.currentTarget.dataset.key;
      const custom = { ...this.data.custom, [key]: e.detail.value };
      const result = validateCustomSize(custom);
      this.setData({
        custom,
        customErrors: result.errors,
        customOk: result.ok && custom.pxWidth && custom.pxHeight
      });
    },

    onApplyCustom() {
      const { custom, customOk } = this.data;
      const result = validateCustomSize(custom);
      if (!result.ok || !customOk) {
        this.setData({ customErrors: result.errors, customOk: false });
        return;
      }
      const size = {
        id: 'custom',
        name: '自定义',
        category: '自定义',
        aliases: [],
        keywords: ['自定义'],
        mmWidth: Number(custom.mmWidth) || 0,
        mmHeight: Number(custom.mmHeight) || 0,
        pxWidth: Number(custom.pxWidth),
        pxHeight: Number(custom.pxHeight),
        dpi: 300,
        type: 'custom',
        sort: 9999,
        enabled: true,
        note: ''
      };
      this.triggerEvent('select', { size, custom: true });
    }
  }
});
