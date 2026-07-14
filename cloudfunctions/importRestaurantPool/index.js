const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.map((tag) => String(tag).trim()).filter(Boolean);
  if (typeof tags === 'string') return tags.split(/[,，、\s]+/).map((tag) => tag.trim()).filter(Boolean);
  return [];
}

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

function normalizeRestaurant(item) {
  const name = String(item.name || '').trim();
  if (!name) return null;
  return {
    name,
    address: String(item.address || '').trim(),
    priceRange: String(item.priceRange || '').trim(),
    tags: normalizeTags(item.tags),
    baseWeight: Math.max(0, Number(item.baseWeight) || 1),
    sourceUrl: String(item.sourceUrl || '').trim(),
    note: String(item.note || '').trim(),
    disabled: Boolean(item.disabled),
    location: normalizeLocation(item.location)
  };
}

function dedupeKey(item) {
  return `${String(item.name || '').trim().toLowerCase()}@@${String(item.address || '').trim().toLowerCase()}`;
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const groupId = String(event.groupId || '').trim();
  if (!groupId) throw new Error('groupId is required');

  const payload = event.payload || {};
  const rawRestaurants = Array.isArray(payload) ? payload : payload.restaurants;
  if (!Array.isArray(rawRestaurants)) throw new Error('payload.restaurants is required');

  const incoming = rawRestaurants.map(normalizeRestaurant).filter(Boolean).slice(0, 500);
  const existingResult = await db.collection('restaurants')
    .where({ groupId })
    .limit(1000)
    .get();
  const existingKeys = new Set(existingResult.data.map(dedupeKey));

  const now = db.serverDate();
  let imported = 0;
  let skipped = 0;
  const skippedNames = [];

  for (const restaurant of incoming) {
    const key = dedupeKey(restaurant);
    if (existingKeys.has(key)) {
      skipped += 1;
      skippedNames.push(restaurant.name);
      continue;
    }
    const data = {
        groupId,
        ...restaurant,
        createdByOpenid: OPENID,
        importedByOpenid: OPENID,
        importedAt: now,
        createdAt: now,
        updatedAt: now
      };
    if (!data.location) delete data.location;
    await db.collection('restaurants').add({ data });
    existingKeys.add(key);
    imported += 1;
  }

  return {
    imported,
    skipped,
    total: incoming.length,
    skippedNames: skippedNames.slice(0, 20)
  };
};
