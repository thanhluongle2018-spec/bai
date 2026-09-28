/**
 * 本地尺寸缓存与搜索（字段语义与三期云端 sizes 一致）
 */
const { PHOTO_SIZES } = require('./constants');

const SIZES_CACHE_KEY = 'sizes_cache_v1';
const SIZES_VERSION_KEY = 'sizes_version_v1';
const CONFIG_CACHE_KEY = 'public_config_v1';

function getLocalSizes() {
  try {
    const cached = wx.getStorageSync(SIZES_CACHE_KEY);
    if (cached && Array.isArray(cached.list) && cached.list.length) {
      return {
        list: cached.list,
        version: cached.version || 0,
        from: 'cache',
        cachedAt: cached.cachedAt || 0
      };
    }
  } catch (e) { /* ignore */ }
  return {
    list: PHOTO_SIZES.filter((s) => s.enabled !== false),
    version: 0,
    from: 'hardcoded',
    cachedAt: 0
  };
}

function saveSizesCache(list, version) {
  try {
    wx.setStorageSync(SIZES_CACHE_KEY, {
      list,
      version: version || 0,
      cachedAt: Date.now()
    });
    wx.setStorageSync(SIZES_VERSION_KEY, version || 0);
  } catch (e) { /* ignore */ }
}

function getCachedSizesVersion() {
  try {
    return wx.getStorageSync(SIZES_VERSION_KEY) || 0;
  } catch (e) {
    return 0;
  }
}

function savePublicConfig(config) {
  try {
    wx.setStorageSync(CONFIG_CACHE_KEY, {
      ...config,
      cachedAt: Date.now()
    });
  } catch (e) { /* ignore */ }
}

function getPublicConfig() {
  try {
    return wx.getStorageSync(CONFIG_CACHE_KEY) || null;
  } catch (e) {
    return null;
  }
}

/**
 * 搜索：匹配 name / category / aliases / keywords（与三期云端语义一致）
 */
function searchSizes(list, keyword) {
  const q = String(keyword || '').trim().toLowerCase();
  const source = (list || []).filter((s) => s.enabled !== false);
  if (!q) return source.slice().sort((a, b) => (a.sort || 0) - (b.sort || 0));

  return source
    .filter((s) => {
      const fields = [
        s.name,
        s.category,
        s.note,
        ...(s.aliases || []),
        ...(s.keywords || [])
      ]
        .filter(Boolean)
        .map((x) => String(x).toLowerCase());
      return fields.some((f) => f.indexOf(q) !== -1);
    })
    .sort((a, b) => (a.sort || 0) - (b.sort || 0));
}

function groupByCategory(list) {
  const map = {};
  (list || []).forEach((s) => {
    const cat = s.category || '其他';
    if (!map[cat]) map[cat] = [];
    map[cat].push(s);
  });
  return Object.keys(map).map((category) => ({
    category,
    items: map[category].sort((a, b) => (a.sort || 0) - (b.sort || 0))
  }));
}

function trackUv() {
  return wx.cloud.callFunction({ name: 'uv-track', data: {} }).catch(() => null);
}

module.exports = {
  getLocalSizes,
  saveSizesCache,
  getCachedSizesVersion,
  savePublicConfig,
  getPublicConfig,
  searchSizes,
  groupByCategory,
  trackUv,
  SIZES_CACHE_KEY
};
