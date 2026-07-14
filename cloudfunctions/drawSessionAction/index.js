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

async function resolveAvatarUrls(members) {
  const fileIDs = Array.from(new Set((members || [])
    .map((member) => member.avatarUrl || '')
    .filter((url) => url.startsWith('cloud://'))));
  if (fileIDs.length === 0) return members;

  const urlMap = new Map();
  try {
    for (let index = 0; index < fileIDs.length; index += 50) {
      const response = await cloud.getTempFileURL({ fileList: fileIDs.slice(index, index + 50) });
      for (const item of response.fileList || []) {
        urlMap.set(item.fileID, item.tempFileURL || '');
      }
    }
  } catch (error) {
    console.error('Failed to resolve voter avatar URLs.', error);
  }

  return members.map((member) => {
    const avatarUrl = member.avatarUrl || '';
    return avatarUrl.startsWith('cloud://') ? { ...member, avatarUrl: urlMap.get(avatarUrl) || '' } : member;
  });
}

function normalize(text) {
  return String(text || '').trim().toLowerCase();
}

function matchesFilters(restaurant, filters) {
  const tag = normalize(filters.tag);
  const selectedTags = Array.isArray(filters.tags) ? filters.tags.map(normalize).filter(Boolean) : [];
  const priceRange = normalize(filters.priceRange);
  const locationText = normalize(filters.locationText);
  if (tag || selectedTags.length > 0) {
    const tags = Array.isArray(restaurant.tags) ? restaurant.tags : [];
    const tagSet = new Set(tags.map(normalize));
    if (tag && !tagSet.has(tag)) return false;
    if (selectedTags.some((item) => !tagSet.has(item))) return false;
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
    .limit(100)
    .get();
  for (const draw of result.data || []) {
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
  if (plusCount > 0) deltas.push({ label: '加值喜好代币', value: plusCount * config.preferencePlusDelta, reason: `${plusCount} 个加值代币` });
  if (minusCount > 0) deltas.push({ label: '减值喜好代币', value: minusCount * config.preferenceMinusDelta, reason: `${minusCount} 个减值代币` });
  if (recentDraw) deltas.push({ label: '最近吃过', value: config.eatenPenaltyDelta, reason: `${config.eatenWithinDays} 天内吃过` });
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

function snapshotRestaurant(restaurant, picked) {
  return {
    _id: restaurant._id,
    name: restaurant.name,
    address: restaurant.address || '',
    priceRange: restaurant.priceRange || '',
    tags: restaurant.tags || [],
    baseWeight: restaurant.baseWeight || 1,
    sourceUrl: restaurant.sourceUrl || '',
    note: restaurant.note || '',
    location: restaurant.location || null,
    probabilityFactors: picked ? { ...picked.probabilityFactors, probability: picked.probability } : undefined
  };
}

function compareResults(a, b) {
  const voteDiff = Number(b.voteCount || 0) - Number(a.voteCount || 0);
  if (voteDiff !== 0) return voteDiff;
  const countDiff = Number(b.count || 0) - Number(a.count || 0);
  if (countDiff !== 0) return countDiff;
  return Number(b.lastDrawAtMs || 0) - Number(a.lastDrawAtMs || 0);
}

async function getSessionForAction(groupId, action, sessionId) {
  if (sessionId) {
    try {
      const session = await db.collection('drawSessions').doc(sessionId).get();
      if (session.data && session.data.groupId === groupId) return session.data;
    } catch (error) {}
  }
  const existing = await db.collection('drawSessions').where({ groupId, status: 'active' }).limit(1).get();
  if (existing.data && existing.data.length > 0) return existing.data[0];
  if (action === 'finalize') {
    const latest = await db.collection('drawSessions').where({ groupId }).orderBy('updatedAtMs', 'desc').limit(1).get();
    if (latest.data && latest.data.length > 0) return latest.data[0];
  }
  const now = Date.now();
  const created = await db.collection('drawSessions').add({
    data: { groupId, status: 'active', results: [], votes: [], filters: {}, createdAt: db.serverDate(), updatedAtMs: now }
  });
  return { _id: created._id, groupId, status: 'active', results: [], votes: [], filters: {}, updatedAtMs: now };
}

async function formatSession(session, openid) {
  const members = await db.collection('members').where({ groupId: session.groupId }).limit(100).get();
  const resolvedMembers = await resolveAvatarUrls(members.data || []);
  const memberMap = new Map(resolvedMembers.map((member) => [member.openid || member._openid, member]));
  const votes = session.votes || [];
  const fallback = '人';
  const abstainVoters = votes.filter((vote) => vote.restaurantId === 'abstain').map((vote) => memberMap.get(vote.openid) || {});
  const results = (session.results || []).map((result) => {
    const voters = votes
      .filter((vote) => vote.restaurantId === result.restaurant._id)
      .map((vote) => {
        const member = memberMap.get(vote.openid) || {};
        return { avatarUrl: member.avatarUrl || '', nickname: member.nickname || '', fallbackText: member.nickname ? String(member.nickname).slice(0, 1) : fallback };
      });
    return { ...result, voters, voteCount: voters.length, hasMultiDraw: Number(result.count || 0) > 1 };
  }).sort(compareResults);
  const myVote = votes.find((vote) => vote.openid === openid);
  return {
    sessionId: session._id,
    status: session.status || 'active',
    finalRestaurantId: session.finalRestaurantId || '',
    results,
    abstainCount: abstainVoters.length,
    abstainVoters: abstainVoters.map((member) => ({ avatarUrl: member.avatarUrl || '', nickname: member.nickname || '', fallbackText: member.nickname ? String(member.nickname).slice(0, 1) : fallback })),
    myVoteRestaurantId: myVote ? myVote.restaurantId : ''
  };
}

async function drawOnce(session, filters) {
  if (session.status !== 'active') throw new Error('session already finalized');
  const groupId = session.groupId;
  const config = await getProbabilityConfig(groupId);
  const result = await db.collection('restaurants').where({ groupId, disabled: false }).limit(100).get();
  const candidates = (result.data || []).filter((restaurant) => matchesFilters(restaurant, filters));
  if (candidates.length === 0) throw new Error('no candidates');

  const ids = candidates.map((item) => item._id);
  const tokenResult = await db.collection('preferenceTokens').where({ groupId, restaurantId: db.command.in(ids) }).limit(1000).get();
  const tokenMap = new Map();
  for (const token of tokenResult.data || []) {
    if (!tokenMap.has(token.restaurantId)) tokenMap.set(token.restaurantId, []);
    tokenMap.get(token.restaurantId).push(token);
  }
  const recentMap = await getRecentlyEatenMap(groupId, ids, config.eatenWithinDays);
  const scored = candidates.map((restaurant) => buildWeightedCandidate(restaurant, tokenMap.get(restaurant._id) || [], recentMap.get(restaurant._id), config));
  const normalized = applySoftmax(scored, config.softmaxTemperature);
  const picked = probabilityPick(normalized);
  const now = Date.now();
  const snapshot = snapshotRestaurant(picked.restaurant, picked);
  const results = session.results || [];
  const existing = results.find((item) => item.restaurant._id === snapshot._id);
  if (existing) {
    existing.count = Number(existing.count || 1) + 1;
    existing.lastProbability = picked.probability;
    existing.lastDrawAtMs = now;
    existing.candidateCount = candidates.length;
    existing.restaurant = snapshot;
  } else {
    results.push({ restaurant: snapshot, count: 1, candidateCount: candidates.length, lastProbability: picked.probability, lastDrawAtMs: now });
  }
  await db.collection('drawSessions').doc(session._id).update({ data: { results, filters, updatedAtMs: now } });
  return { ...session, results, filters };
}

async function vote(session, openid, restaurantId) {
  if (session.status !== 'active') return session;
  const votes = (session.votes || []).filter((item) => item.openid !== openid);
  if (restaurantId) votes.push({ openid, restaurantId, votedAtMs: Date.now() });
  await db.collection('drawSessions').doc(session._id).update({ data: { votes, updatedAtMs: Date.now() } });
  return { ...session, votes };
}

async function finalize(session, openid, restaurantId) {
  if (session.status === 'finalized') return session;
  const result = (session.results || []).find((item) => item.restaurant._id === restaurantId);
  if (!result) return session;
  const filters = session.filters || {};
  await db.collection('draws').add({
    data: {
      groupId: session.groupId,
      restaurantId,
      restaurantSnapshot: result.restaurant,
      filters: { tag: filters.tag || '', tags: Array.isArray(filters.tags) ? filters.tags : [], priceRange: filters.priceRange || '', locationText: filters.locationText || '' },
      candidateCount: result.candidateCount || 0,
      drawnByOpenid: openid,
      drawSessionId: session._id,
      createdAt: db.serverDate()
    }
  });
  await db.collection('drawSessions').doc(session._id).update({ data: { status: 'finalized', finalRestaurantId: restaurantId, finalizedAt: db.serverDate(), updatedAtMs: Date.now() } });
  return { ...session, status: 'finalized', finalRestaurantId: restaurantId };
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const groupId = String(event.groupId || '').trim();
  const action = event.action || 'get';
  if (!groupId) throw new Error('groupId is required');

  let session = await getSessionForAction(groupId, action, String(event.sessionId || ''));
  if (action === 'draw') session = await drawOnce(session, event.filters || {});
  if (action === 'vote') session = await vote(session, OPENID, String(event.restaurantId || ''));
  if (action === 'finalize') session = await finalize(session, OPENID, String(event.restaurantId || ''));
  if (action === 'new') {
    if (session.status === 'active') await db.collection('drawSessions').doc(session._id).update({ data: { status: 'abandoned', updatedAtMs: Date.now() } });
    session = await getSessionForAction(groupId, 'new', '');
  }
  return formatSession(session, OPENID);
};
