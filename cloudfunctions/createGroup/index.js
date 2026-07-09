const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const now = db.serverDate();
  const group = await db.collection('groups').add({ data: { name: event.name || '\u4eca\u5929\u5403\u4ec0\u4e48', createdByOpenid: OPENID, memberCount: 1, restaurantCount: 0, createdAt: now, updatedAt: now } });
  await db.collection('members').add({ data: { groupId: group._id, openid: OPENID, nickname: event.nickname || '', joinedAt: now, updatedAt: now } });
  return { groupId: group._id };
};