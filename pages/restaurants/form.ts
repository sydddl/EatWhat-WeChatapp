import { buildSharePath, requireGroup } from '../../utils/group';
import { parseDianpingShareText } from '../../utils/dianping';
import { LocationPoint, normalizeLocation, openLocation as openMapLocation } from '../../utils/location';

const emptyForm = { name: '', address: '', priceRange: '', tags: [] as string[], baseWeight: 1, sourceUrl: '', note: '', disabled: false, location: null as LocationPoint | null };

function safeBack(groupId: string) {
  const pages = getCurrentPages();
  if (pages.length > 1) {
    wx.navigateBack({ fail: () => wx.redirectTo({ url: '/pages/restaurants/list?groupId=' + groupId }) });
    return;
  }
  wx.redirectTo({ url: '/pages/restaurants/list?groupId=' + groupId });
}

Page({
  data: { groupId: '', restaurantId: '', shareText: '', tagsText: '', form: { ...emptyForm }, saving: false, deleting: false },
  async onLoad(options: Record<string, string | undefined>) {
    const groupId = await requireGroup(options);
    this.setData({ groupId, restaurantId: options.id || '' });
    if (options.id) await this.loadRestaurant(options.id);
  },
  async loadRestaurant(id: string) {
    const result = await wx.cloud.database().collection('restaurants').doc(id).get();
    const data = result.data || {};
    const form = { ...emptyForm, ...data, baseWeight: data.baseWeight || 1, location: normalizeLocation(data.location) };
    this.setData({ form, tagsText: (form.tags || []).join(', ') });
  },
  onShareTextInput(event: any) { this.setData({ shareText: event.detail.value }); },
  parseShareText() {
    const parsed = parseDianpingShareText(this.data.shareText);
    this.setData({ form: { ...this.data.form, name: parsed.name || this.data.form.name, address: parsed.address || this.data.form.address, sourceUrl: parsed.sourceUrl || this.data.form.sourceUrl } });
    wx.showToast({ title: parsed.name ? '已解析' : '未识别店名', icon: 'none' });
  },
  onInput(event: any) {
    const field = event.currentTarget.dataset.field;
    const value = field === 'form.baseWeight' ? Number(event.detail.value || 1) : event.detail.value;
    this.setData({ [field]: value });
  },
  onTagsInput(event: any) {
    const tagsText = event.detail.value;
    const tags = tagsText.split(/[,，、\s]+/).map((tag: string) => tag.trim()).filter(Boolean);
    this.setData({ tagsText, 'form.tags': tags });
  },
  onEnabledChange(event: any) { this.setData({ 'form.disabled': !event.detail.value }); },
  async chooseRestaurantLocation() {
    try {
      const result = await wx.chooseLocation();
      const location = normalizeLocation(result);
      if (!location) return;
      const patch: Record<string, unknown> = { 'form.location': location };
      if (!this.data.form.address) patch['form.address'] = location.address || location.name;
      this.setData(patch);
    } catch (error) {
      const message = String((error as any)?.errMsg || '');
      if (message.includes('cancel')) return;
      wx.showModal({
        title: '无法打开地图选点',
        content: message.includes('auth deny') || message.includes('authorize')
          ? '请在小程序设置中允许位置信息权限后重试。'
          : '请检查定位服务和网络状态后重试。',
        confirmText: '打开设置',
        success: (result: any) => { if (result.confirm) wx.openSetting(); }
      });
    }
  },
  previewRestaurantLocation() {
    if (this.data.form.location) openMapLocation(this.data.form.location);
  },
  clearRestaurantLocation() { this.setData({ 'form.location': null }); },
  async save() {
    if (this.data.saving) return;
    if (!this.data.form.name.trim()) { wx.showToast({ title: '请填写店名', icon: 'none' }); return; }
    this.setData({ saving: true });
    try {
      await wx.cloud.callFunction({ name: 'addRestaurant', data: { groupId: this.data.groupId, restaurantId: this.data.restaurantId, ...this.data.form } });
      wx.showToast({ title: '已保存', icon: 'success' });
      safeBack(this.data.groupId);
    } finally { this.setData({ saving: false }); }
  },
  async deleteRestaurant() {
    if (!this.data.restaurantId || this.data.deleting) return;
    const confirmed = await new Promise<boolean>((resolve) => {
      wx.showModal({
        title: '删除餐厅',
        content: '确定删除「' + (this.data.form.name || '这家餐厅') + '」吗？删除后不会再出现在餐厅池里。',
        confirmText: '删除',
        confirmColor: '#d33030',
        cancelText: '取消',
        success: (res) => resolve(res.confirm),
        fail: () => resolve(false)
      });
    });
    if (!confirmed) return;
    this.setData({ deleting: true });
    try {
      await wx.cloud.callFunction({ name: 'addRestaurant', data: { groupId: this.data.groupId, restaurantId: this.data.restaurantId, action: 'delete' } });
      wx.showToast({ title: '已删除', icon: 'success' });
      safeBack(this.data.groupId);
    } catch (error) {
      wx.showToast({ title: '删除失败', icon: 'none' });
    } finally {
      this.setData({ deleting: false });
    }
  },
  onShareAppMessage() { return { title: '一起添加群餐厅', path: buildSharePath(this.data.groupId) }; }
});
