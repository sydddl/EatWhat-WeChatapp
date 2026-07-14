import { requireGroup } from '../../utils/group';
import {
  distanceMeters,
  formatDistance,
  LocationPoint,
  normalizeLocation
} from '../../utils/location';

type NearbyPlace = {
  id: string;
  title: string;
  address: string;
  category: string;
  tel: string;
  distance: number;
  distanceText: string;
  location: LocationPoint;
  fromMap?: boolean;
  selected?: boolean;
};

const RADIUS_OPTIONS = [
  { min: 0, value: 500, label: '500m内', scale: 16 },
  { min: 500, value: 1000, label: '0.5-1km', scale: 15 },
  { min: 1000, value: 2000, label: '1-2km', scale: 14 },
  { min: 2000, value: 5000, label: '2-5km', scale: 13 }
];
const DISTANCE_BAND_SCAN_LIMIT = 5;

function isDailyQuotaExceeded(error: any): boolean {
  const raw = String(error?.message || error?.errMsg || error || '');
  return raw.includes('TENCENT_MAP_DAILY_QUOTA_EXCEEDED')
    || raw.includes('此key每日调用量已达到上限')
    || /(?:^|\D)121(?:\D|$)/.test(raw);
}

function extractErrorMessage(error: any): string {
  const raw = String(error?.message || error?.errMsg || error || '请求失败');
  if (raw.includes('TENCENT_MAP_KEY_MISSING')) return '云函数尚未配置腾讯地图 TENCENT_MAP_KEY';
  if (raw.includes('GROUP_ORIGIN_MISSING')) return '请先在群组设置中设置默认出发点';
  if (isDailyQuotaExceeded(error)) {
    return '当前使用个人开发者腾讯位置服务，地点搜索每日调用量有限；今日额度已用完，请明日再试。';
  }
  if (raw.includes('TENCENT_MAP_RATE_LIMITED') || raw.includes('调用过于频繁')) {
    return '腾讯地图请求过于频繁，请稍后再试';
  }
  if (raw.includes('TENCENT_MAP_API_ERROR')) return raw.split('TENCENT_MAP_API_ERROR:').pop()?.trim() || '腾讯地图搜索失败';
  return raw.replace(/^Error:\s*/, '').slice(0, 160);
}

function placeIdentity(place: NearbyPlace): string {
  return place.id || `${place.title}@${place.location.latitude.toFixed(6)},${place.location.longitude.toFixed(6)}`;
}

function decoratePlace(raw: any, origin: LocationPoint | null): NearbyPlace | null {
  const location = normalizeLocation(raw?.location);
  const title = String(raw?.title || location?.name || '').trim();
  if (!location || !title) return null;
  const measuredDistance = Number(raw?.distance);
  const distance = Number.isFinite(measuredDistance) && measuredDistance > 0
    ? measuredDistance
    : (distanceMeters(origin, location) || 0);
  return {
    id: String(raw?.id || `${location.latitude},${location.longitude},${title}`),
    title,
    address: String(raw?.address || location.address || '').trim(),
    category: String(raw?.category || '').trim(),
    tel: String(raw?.tel || '').trim(),
    distance,
    distanceText: formatDistance(distance),
    location: {
      ...location,
      name: title,
      address: String(raw?.address || location.address || '').trim()
    },
    fromMap: Boolean(raw?.fromMap)
  };
}

function withSelection(places: NearbyPlace[], selectedPlaces: NearbyPlace[]): NearbyPlace[] {
  const selectedIds = new Set(selectedPlaces.map(placeIdentity));
  return places.map((place) => ({ ...place, selected: selectedIds.has(placeIdentity(place)) }));
}

function mergePlaces(current: NearbyPlace[], incoming: NearbyPlace[]): NearbyPlace[] {
  const merged = new Map<string, NearbyPlace>();
  current.forEach((place) => merged.set(placeIdentity(place), place));
  incoming.forEach((place) => merged.set(placeIdentity(place), place));
  return Array.from(merged.values()).sort((left, right) => left.distance - right.distance);
}

function filterByDistanceBand(places: NearbyPlace[], radius: number): NearbyPlace[] {
  const option = RADIUS_OPTIONS.find((item) => item.value === radius) || RADIUS_OPTIONS[1];
  return places.filter((place) => place.distance > option.min && place.distance <= option.value);
}

Page({
  data: {
    groupId: '',
    initialized: false,
    originLoading: true,
    origin: null as LocationPoint | null,
    originTitle: '',
    noOrigin: false,
    keyword: '餐厅',
    radius: 1000,
    radiusOptions: RADIUS_OPTIONS,
    mapScale: 15,
    circles: [] as any[],
    places: [] as NearbyPlace[],
    selectedPlaces: [] as NearbyPlace[],
    selectedCount: 0,
    totalCount: 0,
    pageIndex: 0,
    hasMore: false,
    searching: false,
    importing: false,
    quotaExceeded: false,
    searchError: ''
  },

  async onLoad(options: Record<string, string | undefined>) {
    const groupId = await requireGroup(options);
    this.setData({ groupId });
    await this.refreshOrigin(true);
    this.setData({ initialized: true });
  },

  async onShow() {
    if (this.data.initialized && this.data.groupId) await this.refreshOrigin(false);
  },

  async refreshOrigin(searchWhenReady: boolean) {
    try {
      const response = await wx.cloud.callFunction({
        name: 'groupLocation',
        data: { groupId: this.data.groupId, action: 'get' }
      });
      const result = response.result as any;
      const origin = normalizeLocation(result?.defaultOrigin);
      if (!origin) {
        this.setData({
          origin: null,
          originLoading: false,
          originTitle: '',
          noOrigin: true,
          circles: [],
          places: [],
          totalCount: 0,
          hasMore: false
        });
        return;
      }

      const previous = this.data.origin;
      const changed = !previous
        || previous.latitude !== origin.latitude
        || previous.longitude !== origin.longitude;
      this.setData({
        origin,
        originLoading: false,
        originTitle: origin.name || origin.address || '群组默认出发点',
        noOrigin: false,
        circles: this.buildCircles(origin, this.data.radius)
      });
      if (searchWhenReady || changed || this.data.places.length === 0) await this.searchNearby(true);
    } catch (error) {
      const searchError = extractErrorMessage(error);
      this.setData({ originLoading: false, searchError });
      wx.showToast({ title: searchError, icon: 'none', duration: 3000 });
    }
  },

  buildCircles(origin: LocationPoint, radius: number) {
    return [{
      latitude: origin.latitude,
      longitude: origin.longitude,
      radius,
      color: '#7F3AEF99',
      fillColor: '#7F3AEF14',
      strokeWidth: 2
    }];
  },

  onKeywordInput(event: any) {
    this.setData({ keyword: event.detail.value });
  },

  submitSearch() {
    this.searchNearby(true);
  },

  chooseRadius(event: any) {
    const radius = Number(event.currentTarget.dataset.value);
    const option = RADIUS_OPTIONS.find((item) => item.value === radius) || RADIUS_OPTIONS[1];
    const origin = this.data.origin;
    this.setData({
      radius: option.value,
      mapScale: option.scale,
      circles: origin ? this.buildCircles(origin, option.value) : []
    });
    if (origin) this.searchNearby(true);
  },

  async searchNearby(reset: boolean) {
    if (this.data.searching || !this.data.origin) return;
    let pageIndex = reset ? 1 : this.data.pageIndex + 1;
    this.setData({ searching: true, quotaExceeded: false, searchError: '' });
    try {
      let incoming: NearbyPlace[] = [];
      let rangedIncoming: NearbyPlace[] = [];
      let pageSize = 20;
      let apiTotalCount = 0;
      let hasMoreFromApi = false;
      let scannedPages = 0;
      do {
        const response = await wx.cloud.callFunction({
          name: 'searchNearbyRestaurants',
          data: {
            groupId: this.data.groupId,
            keyword: String(this.data.keyword || '').trim() || '餐厅',
            radius: this.data.radius,
            pageIndex
          }
        });
        const result = response.result as any;
        incoming = (Array.isArray(result?.places) ? result.places : [])
          .map((place: any) => decoratePlace(place, this.data.origin))
          .filter(Boolean) as NearbyPlace[];
        rangedIncoming = mergePlaces(rangedIncoming, filterByDistanceBand(incoming, this.data.radius));
        pageSize = Math.max(1, Number(result?.pageSize) || 20);
        apiTotalCount = Math.max(incoming.length, Number(result?.count) || 0);
        hasMoreFromApi = incoming.length > 0 && pageIndex * pageSize < apiTotalCount;
        scannedPages += 1;
        if (rangedIncoming.length > 0 || !hasMoreFromApi || scannedPages >= DISTANCE_BAND_SCAN_LIMIT) break;
        pageIndex += 1;
      } while (true);
      const selectedPlaces = this.data.selectedPlaces;
      const places = withSelection(
        reset ? rangedIncoming : mergePlaces(this.data.places, rangedIncoming),
        selectedPlaces
      );
      const totalCount = places.length;
      this.setData({
        places,
        totalCount,
        pageIndex,
        hasMore: hasMoreFromApi
      });
    } catch (error) {
      const quotaExceeded = isDailyQuotaExceeded(error);
      const searchError = extractErrorMessage(error);
      this.setData({ quotaExceeded, searchError });
      wx.showModal({
        title: quotaExceeded ? '今日搜索额度已用完' : '附近餐厅加载失败',
        content: searchError,
        showCancel: false
      });
    } finally {
      this.setData({ searching: false });
    }
  },

  loadMore() {
    this.searchNearby(false);
  },

  togglePlace(event: any) {
    const id = String(event.currentTarget.dataset.id || '');
    const place = this.data.places.find((item) => placeIdentity(item) === id);
    if (!place) return;
    const selectedPlaces = this.data.selectedPlaces.some((item) => placeIdentity(item) === id)
      ? this.data.selectedPlaces.filter((item) => placeIdentity(item) !== id)
      : [...this.data.selectedPlaces, { ...place, selected: true }];
    this.updateSelection(selectedPlaces);
  },

  selectAllVisible() {
    const selected = new Map(this.data.selectedPlaces.map((place) => [placeIdentity(place), place]));
    this.data.places.forEach((place) => selected.set(placeIdentity(place), { ...place, selected: true }));
    this.updateSelection(Array.from(selected.values()));
  },

  clearSelection() {
    this.updateSelection([]);
  },

  updateSelection(selectedPlaces: NearbyPlace[]) {
    this.setData({
      selectedPlaces,
      selectedCount: selectedPlaces.length,
      places: withSelection(this.data.places, selectedPlaces)
    });
  },

  onPoiTap(event: any) {
    const detail = event.detail || {};
    const poi = detail.poi || detail;
    const location = normalizeLocation({
      name: poi.name,
      address: poi.address,
      latitude: poi.latitude,
      longitude: poi.longitude
    });
    if (!location || !location.name) return;

    const matched = this.data.places.find((place) => {
      const sameTitle = place.title === location.name;
      const sameLatitude = Math.abs(place.location.latitude - location.latitude) < 0.00001;
      const sameLongitude = Math.abs(place.location.longitude - location.longitude) < 0.00001;
      return sameTitle && sameLatitude && sameLongitude;
    });
    if (matched) {
      this.togglePlace({ currentTarget: { dataset: { id: placeIdentity(matched) } } });
      return;
    }

    const place = decoratePlace({
      id: `map-${location.latitude.toFixed(6)}-${location.longitude.toFixed(6)}-${location.name}`,
      title: location.name,
      address: location.address,
      location,
      fromMap: true
    }, this.data.origin);
    if (!place) return;
    const selectedPlaces = [...this.data.selectedPlaces, { ...place, selected: true }];
    const places = withSelection(mergePlaces(this.data.places, [place]), selectedPlaces);
    this.setData({ places, selectedPlaces, selectedCount: selectedPlaces.length });
    wx.showToast({ title: `已选择 ${place.title}`, icon: 'none' });
  },

  goGroupLocation() {
    wx.navigateTo({ url: `/pages/settings/group_location?groupId=${this.data.groupId}` });
  },

  async importSelected() {
    if (this.data.importing || this.data.selectedPlaces.length === 0) return;
    this.setData({ importing: true });
    try {
      const restaurants = this.data.selectedPlaces.map((place) => ({
        name: place.title,
        address: place.address,
        priceRange: '',
        tags: [],
        baseWeight: 1,
        sourceUrl: '',
        note: place.category ? `腾讯地图分类：${place.category}` : '',
        disabled: false,
        location: place.location
      }));
      const response = await wx.cloud.callFunction({
        name: 'importRestaurantPool',
        data: { groupId: this.data.groupId, payload: { restaurants } }
      });
      const result = response.result as any;
      this.updateSelection([]);
      wx.showModal({
        title: '批量添加完成',
        content: `新增 ${Number(result?.imported) || 0} 家，跳过重复 ${Number(result?.skipped) || 0} 家。自定义标签可在餐厅编辑页补充。`,
        showCancel: false
      });
    } catch (error) {
      wx.showModal({ title: '批量添加失败', content: extractErrorMessage(error), showCancel: false });
    } finally {
      this.setData({ importing: false });
    }
  }
});
