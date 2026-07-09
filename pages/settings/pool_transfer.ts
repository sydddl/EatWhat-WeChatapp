import { requireGroup } from '../../utils/group';

Page({
  data: {
    groupId: '',
    exportText: '',
    importText: '',
    exporting: false,
    importing: false,
    lastResult: null as any
  },

  async onLoad(options: Record<string, string | undefined>) {
    const groupId = await requireGroup(options);
    this.setData({ groupId });
  },

  onImportTextInput(event: any) {
    this.setData({ importText: event.detail.value });
  },

  async exportPool() {
    this.setData({ exporting: true });
    try {
      const response = await wx.cloud.callFunction({ name: 'exportRestaurantPool', data: { groupId: this.data.groupId } });
      const payload = response.result as any;
      const text = JSON.stringify(payload, null, 2);
      this.setData({ exportText: text });
      await wx.setClipboardData({ data: text });
      wx.showToast({ title: `已导出 ${payload.count || 0} 家`, icon: 'success' });
    } finally {
      this.setData({ exporting: false });
    }
  },

  async pasteFromClipboard() {
    const result = await wx.getClipboardData();
    this.setData({ importText: result.data || '' });
  },

  async importPool() {
    let payload: any;
    try {
      payload = JSON.parse(this.data.importText || '');
    } catch (error) {
      wx.showToast({ title: 'JSON 格式不正确', icon: 'none' });
      return;
    }

    this.setData({ importing: true });
    try {
      const response = await wx.cloud.callFunction({ name: 'importRestaurantPool', data: { groupId: this.data.groupId, payload } });
      const result = response.result as any;
      this.setData({
        lastResult: {
          ...result,
          skippedNamesText: (result.skippedNames || []).join('、')
        }
      });
      wx.showToast({ title: `导入 ${result.imported || 0} 家`, icon: 'success' });
    } finally {
      this.setData({ importing: false });
    }
  }
});