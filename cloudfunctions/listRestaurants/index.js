const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

function summarizeTokens(tokens, openid) {
  const summary = {
    plusCount: 0,
    minusCount: 0,
    myToken: 'none'
  };
  for (const token of tokens) {
    if (token.type === 'plus') summary.plusCount += 1;
    if (token.type === 'minus') summary.minusCount += 1;
    if (token.openid === openid) summary.myToken = token.type;
  }
  return summary;
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const groupId = event.groupId;
  if (!groupId) throw new Error('groupId is required');

  const where = { groupId };
  if (!event.includeDisabled) where.disabled = false;

  const result = await db.collection('restaurants')
    .where(where)
    .orderBy('updatedAt', 'desc')
    .limit(100)
    .get();

  const ids = result.data.map((item) => item._id);
  let tokens = [];
  if (ids.length > 0) {
    const tokenResult = await db.collection('preferenceTokens')
      .where({ groupId, restaurantId: db.command.in(ids) })
      .limit(1000)
      .get();
    tokens = tokenResult.data;
  }

  const byRestaurant = new Map();
  for (const token of tokens) {
    if (!byRestaurant.has(token.restaurantId)) byRestaurant.set(token.restaurantId, []);
    byRestaurant.get(token.restaurantId).push(token);
  }

  return {
    restaurants: result.data.map((restaurant) => ({
      ...restaurant,
      preference: summarizeTokens(byRestaurant.get(restaurant._id) || [], OPENID)
    }))
  };
};