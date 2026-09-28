Component({
  properties: {
    paperId: { type: String, value: 'A4' },
    layoutMode: { type: String, value: 'preset' },
    count: { type: Number, value: 8 },
    dpi: { type: Number, value: 300 },
    marginMm: { type: Number, value: 5 },
    gapMm: { type: Number, value: 3 },
    maxCount: { type: Number, value: 0 }
  },
  methods: {
    onPaper(e) {
      this.triggerEvent('change', { paperId: e.currentTarget.dataset.id });
    },
    onMode(e) {
      this.triggerEvent('change', { layoutMode: e.currentTarget.dataset.mode });
    },
    onCount(e) {
      this.triggerEvent('change', { count: e.detail.value });
    }
  }
});
