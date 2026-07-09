const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const TOKEN_LIMIT = 2;

async function getExisting(groupId, openid, restaurantId) {
  const result = await db.collection('preferenceTokens')
    .where({ groupId, openid, restaurantId })
    .limit(1)
    .get();
  return result.data[0] || null;
}

async function countTokens(groupId, openid, type, excludeRestaurantId) {
  const where = { groupId, openid, type };
  if (excludeRestaurantId) where.restaurantId = _.neq(excludeRestaurantId);
  const result = await db.collection('preferenceTokens').where(where).count();
  return result.total || 0;
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const groupId = String(event.groupId || '').trim();
  const restaurantId = String(event.restaurantId || '').trim();
  const type = event.type === 'plus' || event.type === 'minus' ? event.type : 'none';
  if (!groupId) throw new Error('groupId is required');
  if (!restaurantId) throw new Error('restaurantId is required');

  const existing = await getExisting(groupId, OPENID, restaurantId);
  const now = db.serverDate();

  if (type === 'none') {
    if (existing) await db.collection('preferenceTokens').doc(existing._id).remove();
    return { restaurantId, type: 'none' };
  }

  if (existing && existing.type !== type) {
    const used = await countTokens(groupId, OPENID, type, restaurantId);
    if (used >= TOKEN_LIMIT) throw new Error(`${type} token limit reached`);
    await db.collection('preferenceTokens').doc(existing._id).update({ data: { type, updatedAt: now } });
    return { restaurantId, type };
  }

  if (existing && existing.type === type) {
    await db.collection('preferenceTokens').doc(existing._id).remove();
    return { restaurantId, type: 'none' };
  }

  const used = await countTokens(groupId, OPENID, type, null);
  if (used >= TOKEN_LIMIT) throw new Error(`${type} token limit reached`);
  await db.collection('preferenceTokens').add({
    data: {
      groupId,
      restaurantId,
      openid: OPENID,
      type,
      createdAt: now,
      updatedAt: now
    }
  });
  return { restaurantId, type };
};