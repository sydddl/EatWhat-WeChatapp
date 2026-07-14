const https = require('https');
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const API_ENDPOINT = 'https://apis.map.qq.com/ws/place/v1/search';
const PAGE_SIZE = 20;
const CACHE_TTL_MS = 5 * 60 * 1000;
const responseCache = new Map();

function normalizeLocation(value) {
  if (!value) return null;
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return {
    name: String(value.name || '').trim(),
    address: String(value.address || '').trim(),
    latitude,
    longitude
  };
}

async function requireMembership(groupId, openid, group) {
  if (group && group.createdByOpenid === openid) return;
  const memberships = await db.collection('members').where({ groupId }).limit(100).get();
  const matched = (memberships.data || []).some((member) => member.openid === openid || member._openid === openid);
  if (!matched) throw new Error('group membership required');
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`Tencent Map HTTP ${response.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error('Tencent Map returned invalid JSON'));
        }
      });
    });

    request.setTimeout(8000, () => {
      request.destroy(new Error('Tencent Map request timed out'));
    });
    request.on('error', reject);
  });
}

function sanitizePlace(item) {
  const location = normalizeLocation({
    name: item.title,
    address: item.address,
    latitude: item.location && item.location.lat,
    longitude: item.location && item.location.lng
  });
  if (!location || !location.name) return null;
  return {
    id: String(item.id || `${location.latitude},${location.longitude},${location.name}`),
    title: location.name,
    address: location.address,
    category: String(item.category || '').trim(),
    tel: String(item.tel || '').trim(),
    distance: Math.max(0, Number(item._distance) || 0),
    location
  };
}

function readCache(cacheKey) {
  const cached = responseCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    responseCache.delete(cacheKey);
    return null;
  }
  return { ...cached.value, cached: true };
}

function writeCache(cacheKey, value) {
  responseCache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  if (responseCache.size > 100) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey) responseCache.delete(oldestKey);
  }
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const groupId = String(event.groupId || '').trim();
  if (!groupId) throw new Error('groupId is required');

  const key = String(process.env.TENCENT_MAP_KEY || '').trim();
  if (!key) throw new Error('TENCENT_MAP_KEY_MISSING: 请在云函数环境变量中配置腾讯地图 WebService Key');

  const groupResult = await db.collection('groups').doc(groupId).get();
  if (!groupResult.data) throw new Error('group not found');
  await requireMembership(groupId, OPENID, groupResult.data);

  const origin = normalizeLocation(groupResult.data.defaultOrigin);
  if (!origin) throw new Error('GROUP_ORIGIN_MISSING: 请先在群组设置中设置默认出发点');

  const keyword = String(event.keyword || '餐厅').trim().slice(0, 40) || '餐厅';
  const radius = Math.min(5000, Math.max(300, Number(event.radius) || 1000));
  const pageIndex = Math.min(50, Math.max(1, Math.floor(Number(event.pageIndex) || 1)));
  const cacheKey = [
    groupId,
    origin.latitude.toFixed(6),
    origin.longitude.toFixed(6),
    keyword.toLowerCase(),
    radius,
    pageIndex
  ].join('|');
  const cached = readCache(cacheKey);
  if (cached) return cached;
  const params = new URLSearchParams({
    boundary: `nearby(${origin.latitude},${origin.longitude},${radius})`,
    keyword,
    page_size: String(PAGE_SIZE),
    page_index: String(pageIndex),
    orderby: '_distance',
    output: 'json',
    key
  });

  const payload = await requestJson(`${API_ENDPOINT}?${params.toString()}`);
  if (!payload || Number(payload.status) !== 0) {
    const status = payload && payload.status;
    const message = payload && (payload.message || payload.msg);
    if (Number(status) === 121) {
      throw new Error('TENCENT_MAP_DAILY_QUOTA_EXCEEDED: 腾讯地图 WebService Key 今日调用量已达到上限');
    }
    if (Number(status) === 120) {
      throw new Error('TENCENT_MAP_RATE_LIMITED: 腾讯地图 WebService Key 调用过于频繁');
    }
    throw new Error(`TENCENT_MAP_API_ERROR: ${status || 'unknown'} ${message || '周边地点搜索失败'}`);
  }

  const places = (Array.isArray(payload.data) ? payload.data : [])
    .map(sanitizePlace)
    .filter(Boolean);

  const result = {
    origin,
    count: Math.max(0, Number(payload.count) || places.length),
    pageIndex,
    pageSize: PAGE_SIZE,
    places
  };
  writeCache(cacheKey, result);
  return result;
};
