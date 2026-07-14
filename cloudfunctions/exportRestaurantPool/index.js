const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

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

exports.main = async (event) => {
  const groupId = String(event.groupId || '').trim();
  if (!groupId) throw new Error('groupId is required');

  const [groupResult, result] = await Promise.all([
    db.collection('groups').doc(groupId).get(),
    db.collection('restaurants')
    .where({ groupId })
    .orderBy('updatedAt', 'desc')
    .limit(1000)
    .get()
  ]);
  if (!groupResult.data) throw new Error('group not found');

  const restaurants = result.data.map((item) => ({
    name: item.name || '',
    address: item.address || '',
    priceRange: item.priceRange || '',
    tags: Array.isArray(item.tags) ? item.tags : [],
    baseWeight: Number(item.baseWeight) || 1,
    sourceUrl: item.sourceUrl || '',
    note: item.note || '',
    disabled: Boolean(item.disabled),
    location: normalizeLocation(item.location)
  }));

  return {
    version: 2,
    type: 'EatWhatRestaurantPool',
    exportedAt: new Date().toISOString(),
    sourceGroupId: groupId,
    sourceGroup: {
      name: groupResult.data.name || '',
      defaultOrigin: normalizeLocation(groupResult.data.defaultOrigin)
    },
    count: restaurants.length,
    restaurants
  };
};
