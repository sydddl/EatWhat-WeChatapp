import { requireGroup } from '../../utils/group';
import { LocationPoint, normalizeLocation, openLocation } from '../../utils/location';

function locationError(error: any) {
  const message = String(error?.errMsg || '');
  if (!message.includes('cancel')) {
    wx.showModal({
      title: '无法打开地图选点',
      content: message.includes('auth deny') || message.includes('authorize')
        ? '请在小程序设置中允许位置信息权限后重试。'
        : '请检查定位服务和网络状态后重试。',
      confirmText: '打开设置',
      success: (result: any) => { if (result.confirm) wx.openSetting(); }
    });
  }
}

function cloudErrorMessage(error: any, functionName: string): string {
  const message = String(error?.errMsg || error?.message || error || '未知错误');
  if (/-501000|function.*not found|not found.*function|FunctionName/i.test(message)) {
    return `云端未找到 ${functionName}。请在微信开发者工具中上传并部署该云函数，选择“云端安装依赖”。`;
  }
  if (/group membership required/i.test(message)) {
    return '当前账号的群组成员记录不完整。请先返回首页重新进入群组，再重试保存。';
  }
  return message.length > 180 ? `${message.slice(0, 180)}...` : message;
}

function showCloudError(title: string, functionName: string, error: any) {
  console.error(title, error);
  wx.showModal({
    title,
    content: cloudErrorMessage(error, functionName),
    showCancel: false,
    confirmText: '知道了'
  });
}

Page({
  data: {
    groupId: '',
    groupName: '',
    origin: null as LocationPoint | null,
    hasOrigin: false,
    loading: true,
    saving: false,
    clearing: false
  },

  async onLoad(options: Record<string, string | undefined>) {
    const groupId = await requireGroup(options);
    this.setData({ groupId });
    await this.loadOrigin();
  },

  async loadOrigin() {
    this.setData({ loading: true });
    try {
      const response = await wx.cloud.callFunction({
        name: 'groupLocation',
        data: { groupId: this.data.groupId, action: 'get' }
      });
      const payload = (response.result || {}) as any;
      const origin = normalizeLocation(payload.defaultOrigin);
      this.setData({ groupName: payload.groupName || '', origin, hasOrigin: Boolean(origin) });
    } catch (error) {
      showCloudError('出发点加载失败', 'groupLocation', error);
    } finally {
      this.setData({ loading: false });
    }
  },

  async chooseOrigin() {
    try {
      const result = await wx.chooseLocation();
      const origin = normalizeLocation(result);
      if (!origin) return;
      this.setData({ origin, hasOrigin: true });
    } catch (error) {
      locationError(error);
    }
  },

  previewOrigin() {
    if (this.data.origin) openLocation(this.data.origin);
  },

  async saveOrigin() {
    if (!this.data.origin || this.data.saving) return;
    this.setData({ saving: true });
    try {
      await wx.cloud.callFunction({
        name: 'groupLocation',
        data: { groupId: this.data.groupId, action: 'save', defaultOrigin: this.data.origin }
      });
      wx.showToast({ title: '出发点已保存', icon: 'success' });
    } catch (error) {
      showCloudError('保存失败', 'groupLocation', error);
    } finally {
      this.setData({ saving: false });
    }
  },

  async clearOrigin() {
    if (!this.data.hasOrigin || this.data.clearing) return;
    const confirmed = await new Promise<boolean>((resolve) => {
      wx.showModal({
        title: '清除默认出发点',
        content: '清除后，餐厅列表不再显示相对距离。',
        confirmText: '清除',
        confirmColor: '#d33030',
        success: (result: any) => resolve(Boolean(result.confirm)),
        fail: () => resolve(false)
      });
    });
    if (!confirmed) return;
    this.setData({ clearing: true });
    try {
      await wx.cloud.callFunction({ name: 'groupLocation', data: { groupId: this.data.groupId, action: 'clear' } });
      this.setData({ origin: null, hasOrigin: false });
      wx.showToast({ title: '已清除', icon: 'none' });
    } catch (error) {
      showCloudError('清除失败', 'groupLocation', error);
    } finally {
      this.setData({ clearing: false });
    }
  }
});
