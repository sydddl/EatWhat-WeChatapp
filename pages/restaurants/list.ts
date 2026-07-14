import { buildSharePath, requireGroup } from '../../utils/group';
import { distanceMeters, formatDistance, normalizeLocation, openLocation } from '../../utils/location';

type TokenType = 'plus' | 'minus';

const TOKEN_LIMIT = 2;
const TAG_TONE_COUNT = 10;

function countMine(restaurants: any[], type: TokenType): number {
  return restaurants.filter((item) => item.preference?.myToken === type).length;
}

function buildTokenSlots(type: TokenType, left: number, selectedKey: string) {
  return Array.from({ length: TOKEN_LIMIT }).map((_, index) => {
    const key = `${type}-${index}`;
    const available = index < left;
    return {
      key,
      type,
      mark: type === 'plus' ? '+' : '-',
      available,
      className: `${available ? 'is-ready' : 'is-empty'} ${selectedKey === key ? 'is-selected' : ''}`
    };
  });
}

function buildTokenBadges(restaurant: any) {
  const preference = restaurant.preference || {};
  const myToken = preference.myToken || 'none';
  const plusCount = Number(preference.plusCount || 0);
  const minusCount = Number(preference.minusCount || 0);
  const myBadges: any[] = [];
  const otherBadges: any[] = [];
  let otherPlusCount = plusCount;
  let otherMinusCount = minusCount;
  if (myToken === 'plus') {
    myBadges.push({ key: 'mine-plus', restaurantId: restaurant._id, type: 'plus', mark: '+', removable: true });
    otherPlusCount = Math.max(0, otherPlusCount - 1);
  }
  if (myToken === 'minus') {
    myBadges.push({ key: 'mine-minus', restaurantId: restaurant._id, type: 'minus', mark: '-', removable: true });
    otherMinusCount = Math.max(0, otherMinusCount - 1);
  }
  for (let i = 0; i < otherPlusCount; i += 1) otherBadges.push({ key: `other-plus-${i}`, restaurantId: restaurant._id, type: 'plus', mark: '+', removable: false });
  for (let i = 0; i < otherMinusCount; i += 1) otherBadges.push({ key: `other-minus-${i}`, restaurantId: restaurant._id, type: 'minus', mark: '-', removable: false });
  return { myBadges, otherBadges, allBadges: [...myBadges, ...otherBadges] };
}

function tagTone(tag: string): string {
  let hash = 0;
  for (const char of tag) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return `tag-tone-${hash % TAG_TONE_COUNT}`;
}

function buildTagChips(tags: string[] = []) {
  return (tags || [])
    .filter((tag) => String(tag || '').trim())
    .map((tag, index) => {
      const label = String(tag).trim();
      return { key: `${label}-${index}`, label, className: tagTone(label) };
    });
}

function decorateRestaurants(restaurants: any[], defaultOrigin: any = null) {
  const origin = normalizeLocation(defaultOrigin);
  return (restaurants || []).map((restaurant) => {
    const tokenGroups = buildTokenBadges(restaurant);
    const location = normalizeLocation(restaurant.location);
    return {
      ...restaurant,
      location,
      hasLocation: Boolean(location),
      distanceText: formatDistance(distanceMeters(origin, location)),
      tagChips: buildTagChips(restaurant.tags || []),
      tokenBadges: tokenGroups.allBadges,
      myTokenBadges: tokenGroups.myBadges,
      otherTokenBadges: tokenGroups.otherBadges,
      hasTokenBadges: tokenGroups.allBadges.length > 0
    };
  });
}

async function updateRestaurantsIndividually(groupId: string, restaurants: any[], disabled: boolean) {
  const batchSize = 6;
  for (let index = 0; index < restaurants.length; index += batchSize) {
    const batch = restaurants.slice(index, index + batchSize);
    await Promise.all(batch.map((restaurant: any) => wx.cloud.callFunction({
      name: 'addRestaurant',
      data: { groupId, restaurantId: restaurant._id, disabled }
    })));
  }
}

function bulkErrorMessage(error: any): string {
  const message = String(error?.errMsg || error?.message || error || '未知错误');
  if (/-501000|function.*not found|not found.*function|FunctionName/i.test(message)) {
    return '云端未找到 addRestaurant。请在微信开发者工具中重新部署该云函数。';
  }
  return message.length > 180 ? `${message.slice(0, 180)}...` : message;
}

Page({
  data: {
    groupId: '',
    restaurants: [] as any[],
    plusLeft: TOKEN_LIMIT,
    minusLeft: TOKEN_LIMIT,
    plusTokenSlots: buildTokenSlots('plus', TOKEN_LIMIT, ''),
    minusTokenSlots: buildTokenSlots('minus', TOKEN_LIMIT, ''),
    selectedTokenType: '' as TokenType | '',
    selectedTokenKey: '',
    defaultOrigin: null as any,
    bulkUpdating: false,
    loading: true
  },

  async onLoad(options: Record<string, string | undefined>) {
    const groupId = await requireGroup(options);
    this.setData({ groupId });
    await this.loadRestaurants();
  },

  async onShow() {
    if (this.data.groupId) await this.loadRestaurants();
  },

  syncTokenSlots(plusLeft: number, minusLeft: number, selectedTokenType = this.data.selectedTokenType, selectedTokenKey = this.data.selectedTokenKey) {
    const stillAvailable = selectedTokenType === 'plus' ? plusLeft > 0 : selectedTokenType === 'minus' ? minusLeft > 0 : true;
    const nextType = stillAvailable ? selectedTokenType : '';
    const nextKey = stillAvailable ? selectedTokenKey : '';
    this.setData({
      selectedTokenType: nextType,
      selectedTokenKey: nextKey,
      plusTokenSlots: buildTokenSlots('plus', plusLeft, nextKey),
      minusTokenSlots: buildTokenSlots('minus', minusLeft, nextKey)
    });
  },

  async loadRestaurants() {
    this.setData({ loading: true });
    try {
      const [result, originResult] = await Promise.all([
        wx.cloud.callFunction({ name: 'listRestaurants', data: { groupId: this.data.groupId, includeDisabled: true } }),
        wx.cloud.callFunction({ name: 'groupLocation', data: { groupId: this.data.groupId, action: 'get' } }).catch(() => null)
      ]);
      const defaultOrigin = normalizeLocation((originResult?.result as any)?.defaultOrigin);
      const restaurants = decorateRestaurants((result.result as any)?.restaurants || [], defaultOrigin);
      const plusLeft = Math.max(0, TOKEN_LIMIT - countMine(restaurants, 'plus'));
      const minusLeft = Math.max(0, TOKEN_LIMIT - countMine(restaurants, 'minus'));
      this.setData({ restaurants, plusLeft, minusLeft, defaultOrigin });
      this.syncTokenSlots(plusLeft, minusLeft);
    } finally {
      this.setData({ loading: false });
    }
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/restaurants/form?groupId=' + this.data.groupId });
  },

  goNearby() {
    wx.navigateTo({ url: '/pages/restaurants/nearby?groupId=' + this.data.groupId });
  },

  goPoolTransfer() {
    wx.navigateTo({ url: '/pages/settings/pool_transfer?groupId=' + this.data.groupId });
  },

  goEdit(event: any) {
    const id = event.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/restaurants/form?groupId=' + this.data.groupId + '&id=' + id });
  },

  openRestaurantLocation(event: any) {
    const id = event.currentTarget.dataset.id;
    const restaurant = this.data.restaurants.find((item: any) => item._id === id);
    if (restaurant?.location) openLocation(restaurant.location);
  },

  selectToken(event: any) {
    const type = event.currentTarget.dataset.type as TokenType;
    const key = event.currentTarget.dataset.key;
    const available = event.currentTarget.dataset.available === true || event.currentTarget.dataset.available === 'true';
    if (!available) {
      wx.showToast({ title: type === 'plus' ? '加值代币已用完' : '减值代币已用完', icon: 'none' });
      return;
    }
    const nextType = this.data.selectedTokenKey === key ? '' : type;
    const nextKey = this.data.selectedTokenKey === key ? '' : key;
    this.syncTokenSlots(this.data.plusLeft, this.data.minusLeft, nextType, nextKey);
  },

  async setRestaurantDisabled(restaurantId: string, disabled: boolean) {
    if (!restaurantId) return;
    await wx.cloud.callFunction({ name: 'addRestaurant', data: { groupId: this.data.groupId, restaurantId, disabled } });
    await this.loadRestaurants();
  },

  async setAllRestaurantsDisabled(event: any) {
    if (this.data.bulkUpdating || this.data.restaurants.length === 0) return;
    const rawDisabled = event.currentTarget.dataset.disabled;
    const disabled = rawDisabled === true || rawDisabled === 'true';
    this.setData({ bulkUpdating: true });
    try {
      try {
        await wx.cloud.callFunction({
          name: 'addRestaurant',
          data: { groupId: this.data.groupId, action: 'setAllDisabled', disabled }
        });
        await this.loadRestaurants();
        const applied = this.data.restaurants.every((restaurant: any) => Boolean(restaurant.disabled) === disabled);
        if (!applied) throw new Error('batch update did not apply');
      } catch (batchError) {
        console.warn('Batch restaurant update failed, using compatibility fallback.', batchError);
        await updateRestaurantsIndividually(this.data.groupId, this.data.restaurants, disabled);
        await this.loadRestaurants();
      }
      wx.showToast({ title: disabled ? '已全部停用' : '已全部启用', icon: 'none' });
    } catch (error) {
      console.error('批量更新失败', error);
      wx.showModal({
        title: '批量更新失败',
        content: bulkErrorMessage(error),
        showCancel: false,
        confirmText: '知道了'
      });
    } finally {
      this.setData({ bulkUpdating: false });
    }
  },

  async handleCardTap(event: any) {
    const restaurantId = event.currentTarget.dataset.id;
    const restaurant = this.data.restaurants.find((item: any) => item._id === restaurantId);
    if (!restaurant) return;
    if (this.data.selectedTokenType) {
      if (restaurant.disabled) {
        wx.showToast({ title: '先启用餐厅', icon: 'none' });
        return;
      }
      await this.applyPreferenceToken(restaurantId, this.data.selectedTokenType);
      return;
    }
    if (restaurant.disabled) await this.setRestaurantDisabled(restaurantId, false);
  },

  async toggleEnabled(event: any) {
    const restaurantId = event.currentTarget.dataset.id;
    const restaurant = this.data.restaurants.find((item: any) => item._id === restaurantId);
    if (!restaurant) return;
    await this.setRestaurantDisabled(restaurantId, !Boolean(restaurant.disabled));
  },

  async applyPreferenceToken(restaurantId: string, type: TokenType | 'none') {
    try {
      await wx.cloud.callFunction({ name: 'setPreferenceToken', data: { groupId: this.data.groupId, restaurantId, type } });
      this.setData({ selectedTokenType: '', selectedTokenKey: '' });
      await this.loadRestaurants();
    } catch (error) {
      wx.showToast({ title: type === 'plus' ? '加值代币已用完' : '减值代币已用完', icon: 'none' });
    }
  },

  async removePreferenceToken(event: any) {
    const restaurantId = event.currentTarget.dataset.id;
    if (!restaurantId) return;
    await this.applyPreferenceToken(restaurantId, 'none');
  },

  onShareAppMessage() {
    return { title: '一起维护群餐厅池', path: buildSharePath(this.data.groupId) };
  }
});
