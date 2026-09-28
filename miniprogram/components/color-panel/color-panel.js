const { BG_COLORS, GRADIENT } = require('../../utils/constants');

Component({
  properties: {
    selectedId: { type: String, value: 'white' }
  },

  data: {
    colors: BG_COLORS,
    gradientNote: {
      start: Math.round(GRADIENT.startRatio * 100),
      range: Math.round(GRADIENT.transitionRange * 100)
    }
  },

  methods: {
    onSelect(e) {
      const id = e.currentTarget.dataset.id;
      const bg = BG_COLORS.find((c) => c.id === id);
      if (!bg) return;
      this.triggerEvent('select', { background: bg });
    }
  }
});
