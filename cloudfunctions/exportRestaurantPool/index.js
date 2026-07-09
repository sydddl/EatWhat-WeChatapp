const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event) => {
  const groupId = String(event.groupId || '').trim();
  if (!groupId) throw new Error('groupId is required');

  const result = await db.collection('restaurants')
    .where({ groupId })
    .orderBy('updatedAt', 'desc')
    .limit(1000)
    .get();

  const restaurants = result.data.map((item) => ({
    name: item.name || '',
    address: item.address || '',
    priceRange: item.priceRange || '',
    tags: Array.isArray(item.tags) ? item.tags : [],
    baseWeight: Number(item.baseWeight) || 1,
    sourceUrl: item.sourceUrl || '',
    note: item.note || '',
    disabled: Boolean(item.disabled)
  }));

  return {
    version: 1,
    type: 'EatWhatRestaurantPool',
    exportedAt: new Date().toISOString(),
    sourceGroupId: groupId,
    count: restaurants.length,
    restaurants
  };
};