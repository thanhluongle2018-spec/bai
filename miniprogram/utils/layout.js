/**
 * 排版坐标计算（二期）
 * 边距 5mm、间距 3mm；预览与导出共用同一套坐标
 */
const { LAYOUT_PAPERS } = require('./constants');

function mmToPx(mm, dpi) {
  return Math.round((mm / 25.4) * dpi);
}

/**
 * @param {object} opts
 * @param {string} opts.paperId A4 | R4
 * @param {number} opts.photoW 照片像素宽
 * @param {number} opts.photoH 照片像素高
 * @param {number} opts.count 1–10
 * @param {'single'|'double'|'grid'} opts.layoutMode
 * @param {number} [opts.cols] 可选固定列数
 * @param {number} [opts.rows] 可选固定行数
 */
function measure(canvasW, canvasH, margin, gap, cols, rows, photoW, photoH) {
  const needW = 2 * margin + cols * photoW + Math.max(0, cols - 1) * gap;
  const needH = 2 * margin + rows * photoH + Math.max(0, rows - 1) * gap;
  return {
    needW,
    needH,
    fits: needW <= canvasW && needH <= canvasH
  };
}

function buildPositions(canvasW, canvasH, margin, gap, cols, rows, count, photoW, photoH) {
  const usedW = cols * photoW + Math.max(0, cols - 1) * gap;
  const usedH = rows * photoH + Math.max(0, rows - 1) * gap;
  const offsetX = margin + Math.floor((canvasW - 2 * margin - usedW) / 2);
  const offsetY = margin + Math.floor((canvasH - 2 * margin - usedH) / 2);
  const positions = [];
  for (let i = 0; i < count; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    positions.push({
      index: i,
      x: offsetX + c * (photoW + gap),
      y: offsetY + r * (photoH + gap),
      w: photoW,
      h: photoH
    });
  }
  return positions;
}

function computeLayout(opts) {
  const paper = LAYOUT_PAPERS[opts.paperId] || LAYOUT_PAPERS.A4;
  const dpi = paper.dpi;
  const margin = mmToPx(paper.marginMm, dpi);
  const gap = mmToPx(paper.gapMm, dpi);
  const canvasW = paper.pxWidth;
  const canvasH = paper.pxHeight;
  let photoW = opts.photoW;
  let photoH = opts.photoH;
  let count = Math.max(1, Math.min(10, Number(opts.count) || 1));
  let rotated = false;

  let cols;
  let rows;

  // 预设：1寸 4×2=8；2寸 2×2=4（A4 与 6寸）
  if (opts.presetGrid) {
    cols = opts.presetGrid.cols;
    rows = opts.presetGrid.rows;
    count = cols * rows;
  } else if (opts.layoutMode === 'single') {
    cols = 1;
    rows = count;
  } else if (opts.layoutMode === 'double') {
    cols = 2;
    rows = Math.ceil(count / 2);
  } else {
    cols = opts.cols || Math.max(1, Math.floor((canvasW - 2 * margin + gap) / (photoW + gap)));
    rows = Math.ceil(count / cols);
  }

  let m = measure(canvasW, canvasH, margin, gap, cols, rows, photoW, photoH);
  // 6寸横向画布上竖放 2寸 2×2 会超高：自动尝试将照片横放（交换宽高）以在固定 1800×1200 内排下
  if (!m.fits && opts.allowRotate !== false) {
    const swapped = measure(canvasW, canvasH, margin, gap, cols, rows, photoH, photoW);
    if (swapped.fits) {
      const tmp = photoW;
      photoW = photoH;
      photoH = tmp;
      m = swapped;
      rotated = true;
    }
  }

  const maxCols = Math.max(0, Math.floor((canvasW - 2 * margin + gap) / (photoW + gap)));
  const maxRows = Math.max(0, Math.floor((canvasH - 2 * margin + gap) / (photoH + gap)));
  const maxCount = maxCols * maxRows;

  const positions = m.fits
    ? buildPositions(canvasW, canvasH, margin, gap, cols, rows, count, photoW, photoH)
    : [];

  return {
    paper,
    canvasW,
    canvasH,
    dpi,
    margin,
    gap,
    cols,
    rows,
    count,
    fits: m.fits,
    maxCount,
    maxCols,
    maxRows,
    positions,
    needW: m.needW,
    needH: m.needH,
    photoW,
    photoH,
    rotated
  };
}

/** A4/6寸 1寸与2寸推荐网格 */
function getPresetGridForPhoto(photoSizeName) {
  const n = String(photoSizeName || '');
  if (n.indexOf('1寸') !== -1 || n === '1寸' || n.indexOf('一寸') !== -1) {
    return { cols: 4, rows: 2, count: 8 };
  }
  if (n.indexOf('2寸') !== -1 || n === '2寸' || n.indexOf('二寸') !== -1) {
    return { cols: 2, rows: 2, count: 4 };
  }
  return null;
}

module.exports = {
  mmToPx,
  computeLayout,
  getPresetGridForPhoto,
  LAYOUT_PAPERS
};
