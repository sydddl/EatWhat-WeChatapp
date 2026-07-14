const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.map((tag) => String(tag).trim()).filter(Boolean);
  if (typeof tags === 'string') return tags.split(/[,\uFF0C\u3001\s]+/).map((tag) => tag.trim()).filter(Boolean);
  return undefined;
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
function pickPatch(event) {
  const patch = {};
  if (event.name !== undefined) patch.name = String(event.name).trim();
  if (event.address !== undefined) patch.address = String(event.address || '').trim();
  if (event.priceRange !== undefined) patch.priceRange = String(event.priceRange || '').trim();
  if (event.tags !== undefined) patch.tags = normalizeTags(event.tags);
  if (event.baseWeight !== undefined) patch.baseWeight = Math.max(0, Number(event.baseWeight) || 1);
  if (event.sourceUrl !== undefined) patch.sourceUrl = String(event.sourceUrl || '').trim();
  if (event.note !== undefined) patch.note = String(event.note || '').trim();
  if (event.disabled !== undefined) patch.disabled = Boolean(event.disabled);
  if (event.location !== undefined) patch.location = normalizeLocation(event.location);
  return patch;
}
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const groupId = event.groupId;
  if (!groupId) throw new Error('groupId is required');
  const now = db.serverDate();
  const restaurantId = String(event.restaurantId || '').trim();

  if (event.action === 'setAllDisabled') {
    const disabled = Boolean(event.disabled);
    const result = await db.collection('restaurants').where({ groupId }).update({
      data: { disabled, updatedAt: now }
    });
    return { disabled, updated: result.stats?.updated || 0 };
  }

  if (event.action === 'delete') {
    if (!restaurantId) throw new Error('restaurantId is required');
    const current = await db.collection('restaurants').doc(restaurantId).get();
    if (!current.data || current.data.groupId !== groupId) throw new Error('restaurant not found in group');
    await db.collection('preferenceTokens').where({ groupId, restaurantId }).remove();
    await db.collection('restaurants').doc(restaurantId).remove();
    return { restaurantId, deleted: true };
  }

  const patch = pickPatch(event);
  if (restaurantId) {
    const current = await db.collection('restaurants').doc(restaurantId).get();
    if (!current.data || current.data.groupId !== groupId) throw new Error('restaurant not found in group');
    if (patch.name !== undefined && !patch.name) throw new Error('name is required');
    const updatePatch = { ...patch };
    if (patch.location === null) updatePatch.location = db.command.remove();
    await db.collection('restaurants').doc(restaurantId).update({ data: { ...updatePatch, updatedAt: now } });
    return { restaurantId };
  }
  if (!patch.name) throw new Error('name is required');
  const restaurant = { groupId, name: patch.name, address: patch.address || '', priceRange: patch.priceRange || '', tags: patch.tags || [], baseWeight: patch.baseWeight || 1, sourceUrl: patch.sourceUrl || '', note: patch.note || '', disabled: Boolean(patch.disabled), createdByOpenid: OPENID, createdAt: now, updatedAt: now };
  if (patch.location) restaurant.location = patch.location;
  const added = await db.collection('restaurants').add({ data: restaurant });
  return { restaurantId: added._id };
};
