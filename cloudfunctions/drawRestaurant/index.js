const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const DEFAULT_CONFIG = {
  preferencePlusDelta: 0.5,
  preferenceMinusDelta: -0.5,
  eatenPenaltyDelta: -2,
  eatenWithinDays: 2,
  softmaxTemperature: 1
};

function normalize(text) {
  return String(text || '').trim().toLowerCase();
}

function matchesFilters(restaurant, filters) {
  const tag = normalize(filters.tag);
  const priceRange = normalize(filters.priceRange);
  const locationText = normalize(filters.locationText);
  if (tag) {
    const tags = Array.isArray(restaurant.tags) ? restaurant.tags : [];
    if (!tags.some((item) => normalize(item) === tag)) return false;
  }
  if (priceRange && normalize(restaurant.priceRange) !== priceRange) return false;
  if (locationText) {
    const haystack = normalize(`${restaurant.name} ${restaurant.address} ${restaurant.note}`);
    if (!haystack.includes(locationText)) return false;
  }
  return true;
}

async function getProbabilityConfig(groupId) {
  try {
    const group = await db.collection('groups').doc(groupId).get();
    return { ...DEFAULT_CONFIG, ...(group.data.probabilityConfig || {}) };
  } catch (error) {
    return DEFAULT_CONFIG;
  }
}

function readDateMillis(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') return new Date(value).getTime() || 0;
  if (typeof value === 'object' && value.$date) return new Date(value.$date).getTime() || 0;
  return 0;
}

async function getRecentlyEatenMap(groupId, restaurantIds, withinDays) {
  const map = new Map();
  if (!withinDays || withinDays <= 0 || restaurantIds.length === 0) return map;
  const since = Date.now() - withinDays * 24 * 60 * 60 * 1000;
  const result = await db.collection('draws')
    .where({ groupId, restaurantId: db.command.in(restaurantIds) })
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get();
  for (const draw of result.data) {
    const time = readDateMillis(draw.createdAt);
    if (time >= since && !map.has(draw.restaurantId)) map.set(draw.restaurantId, draw);
  }
  return map;
}

function buildWeightedCandidate(restaurant, tokens, recentDraw, config) {
  const plusCount = tokens.filter((token) => token.type === 'plus').length;
  const minusCount = tokens.filter((token) => token.type === 'minus').length;
  const baseWeight = Math.max(0.0001, Number(restaurant.baseWeight) || 1);
  const baseLogit = Math.log(baseWeight);
  const deltas = [];
  if (plusCount > 0) {
    deltas.push({ label: '\u52a0\u503c\u559c\u597d\u4ee3\u5e01', value: plusCount * config.preferencePlusDelta, reason: `${plusCount} \u4e2a\u52a0\u503c\u4ee3\u5e01` });
  }
  if (minusCount > 0) {
    deltas.push({ label: '\u51cf\u503c\u559c\u597d\u4ee3\u5e01', value: minusCount * config.preferenceMinusDelta, reason: `${minusCount} \u4e2a\u51cf\u503c\u4ee3\u5e01` });
  }
  if (recentDraw) {
    deltas.push({ label: '\u6700\u8fd1\u5403\u8fc7', value: config.eatenPenaltyDelta, reason: `${config.eatenWithinDays} \u5929\u5185\u5403\u8fc7` });
  }
  const score = baseLogit + deltas.reduce((sum, item) => sum + item.value, 0);
  return { restaurant, score, probabilityFactors: { baseWeight, baseLogit, score, plusCount, minusCount, recentlyEaten: Boolean(recentDraw), config, deltas } };
}
function applySoftmax(items, temperature) {
  const t = Math.max(0.1, Number(temperature) || 1);
  const maxScore = Math.max(...items.map((item) => item.score / t));
  const withExp = items.map((item) => ({ ...item, expScore: Math.exp(item.score / t - maxScore) }));
  const total = withExp.reduce((sum, item) => sum + item.expScore, 0);
  return withExp.map((item) => ({ ...item, probability: item.expScore / total }));
}

function probabilityPick(items) {
  let cursor = Math.random();
  for (const item of items) {
    cursor -= item.probability;
    if (cursor <= 0) return item;
  }
  return items[items.length - 1];
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const groupId = event.groupId;
  if (!groupId) throw new Error('groupId is required');

  const filters = event.filters || {};
  const config = await getProbabilityConfig(groupId);
  const result = await db.collection('restaurants')
    .where({ groupId, disabled: false })
    .limit(100)
    .get();

  const candidates = result.data.filter((restaurant) => matchesFilters(restaurant, filters));
  if (candidates.length === 0) throw new Error('no candidates');

  const ids = candidates.map((item) => item._id);
  const tokenResult = await db.collection('preferenceTokens')
    .where({ groupId, restaurantId: db.command.in(ids) })
    .limit(1000)
    .get();
  const tokenMap = new Map();
  for (const token of tokenResult.data) {
    if (!tokenMap.has(token.restaurantId)) tokenMap.set(token.restaurantId, []);
    tokenMap.get(token.restaurantId).push(token);
  }

  const recentMap = await getRecentlyEatenMap(groupId, ids, config.eatenWithinDays);
  const scored = candidates.map((restaurant) => buildWeightedCandidate(restaurant, tokenMap.get(restaurant._id) || [], recentMap.get(restaurant._id), config));
  const normalized = applySoftmax(scored, config.softmaxTemperature);
  const picked = probabilityPick(normalized);
  const restaurant = picked.restaurant;
  const snapshot = {
    _id: restaurant._id,
    name: restaurant.name,
    address: restaurant.address || '',
    priceRange: restaurant.priceRange || '',
    tags: restaurant.tags || [],
    baseWeight: restaurant.baseWeight || 1,
    sourceUrl: restaurant.sourceUrl || '',
    note: restaurant.note || '',
    probabilityFactors: { ...picked.probabilityFactors, probability: picked.probability }
  };

  await db.collection('draws').add({
    data: {
      groupId,
      restaurantId: restaurant._id,
      restaurantSnapshot: snapshot,
      filters: {
        tag: filters.tag || '',
        priceRange: filters.priceRange || '',
        locationText: filters.locationText || ''
      },
      candidateCount: candidates.length,
      drawnByOpenid: OPENID,
      createdAt: db.serverDate()
    }
  });

  return { restaurant: snapshot, candidateCount: candidates.length };
};