const { callAdminCheck, callAdminSizes, callAdminConfig } = require('../../utils/admin');
const { searchSizes } = require('../../utils/db');

Page({
  data: {
    authState: 'loading',
    tab: 'sizes',
    list: [],
    allList: [],
    keyword: '',
    editing: null,
    config: null,
    msg: ''
  },

  onShow() {
    this.auth();
  },

  async auth() {
    this.setData({ authState: 'loading' });
    try {
      const r = await callAdminCheck();
      if (!r || !r.isAdmin) {
        this.setData({ authState: 'denied' });
        return;
      }
      this.setData({ authState: 'ok' });
      await this.loadSizes();
      await this.loadConfig();
    } catch (e) {
      this.setData({ authState: 'denied' });
    }
  },

  switchTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab });
  },

  async loadSizes() {
    const r = await callAdminSizes('listAdmin', {});
    const allList = r.list || [];
    this.setData({ allList, list: allList });
  },

  async loadConfig() {
    const r = await callAdminConfig('getAdmin', {});
    this.setData({ config: r.config || {} });
  },

  onSearch(e) {
    const keyword = e.detail.value || '';
    // 管理端搜索包含停用项
    const list = searchSizes(
      this.data.allList.map((s) => ({ ...s, enabled: true })),
      keyword
    ).map((s) => this.data.allList.find((x) => x._id === s._id) || s);
    this.setData({ keyword, list });
  },

  onCreate() {
    this.setData({
      editing: {
        name: '',
        category: '国内证件',
        aliases: [],
        keywords: [],
        mmWidth: 0,
        mmHeight: 0,
        pxWidth: 295,
        pxHeight: 413,
        dpi: 300,
        sort: 100,
        enabled: true,
        note: '',
        version: 0
      }
    });
  },

  onEdit(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.allList.find((x) => x._id === id);
    if (item) this.setData({ editing: item });
  },

  closeEdit() {
    this.setData({ editing: null });
  },

  async onSaveSize(e) {
    const { payload, done } = e.detail;
    try {
      const action = payload._id ? 'update' : 'create';
      await callAdminSizes(action, { size: payload, expectedVersion: payload.version });
      done();
      this.setData({ msg: '保存成功', editing: null });
      await this.loadSizes();
      setTimeout(() => this.setData({ msg: '' }), 1500);
    } catch (err) {
      if (err.code === 'VERSION_CONFLICT') {
        done(new Error('版本冲突，请刷新后重试'));
      } else if (err.code === 'FORBIDDEN') {
        done(new Error('无权限'));
        this.setData({ authState: 'denied' });
      } else {
        done(err);
      }
    }
  },

  async onSaveConfig(e) {
    const { payload, done } = e.detail;
    try {
      await callAdminConfig('update', { config: payload, expectedVersion: payload.version });
      done();
      this.setData({ msg: '配置已保存' });
      await this.loadConfig();
      setTimeout(() => this.setData({ msg: '' }), 1500);
    } catch (err) {
      if (err.code === 'VERSION_CONFLICT') done(new Error('版本冲突，请刷新'));
      else done(err);
    }
  }
});
