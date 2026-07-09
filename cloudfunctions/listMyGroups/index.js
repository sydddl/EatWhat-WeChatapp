const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  const memberships = await db.collection('members').where({ openid: OPENID }).limit(100).get();
  const groupIds = Array.from(new Set((memberships.data || []).map((item) => item.groupId).filter(Boolean)));
  if (groupIds.length === 0) return { groups: [] };

  const groupsResult = await db.collection('groups').where({ _id: _.in(groupIds) }).limit(100).get();
  const joinedAtMap = new Map(memberships.data.map((item) => [item.groupId, item.joinedAt]));
  const groups = (groupsResult.data || []).map((group) => ({
    groupId: group._id,
    name: group.name || '今天吃什么',
    memberCount: group.memberCount || 1,
    restaurantCount: group.restaurantCount || 0,
    joinedAt: joinedAtMap.get(group._id) || group.createdAt
  }));
  return { groups };
};