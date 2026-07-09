const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const GROUP_COLLECTIONS = [
  'members',
  'restaurants',
  'draws',
  'preferenceTokens',
  'drawSessions'
];

async function removeByGroupId(collectionName, groupId) {
  try {
    await db.collection(collectionName).where({ groupId }).remove();
  } catch (error) {
    // Optional MVP collections may not exist yet.
  }
}

async function getGroup(groupId) {
  try {
    const group = await db.collection('groups').doc(groupId).get();
    return group.data || null;
  } catch (error) {
    return null;
  }
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const groupId = String(event.groupId || '').trim();
  if (!groupId) throw new Error('groupId is required');

  const group = await getGroup(groupId);
  if (!group) return { groupId, left: false, dissolved: true, memberCount: 0 };

  const membership = await db.collection('members').where({ groupId, openid: OPENID }).limit(20).get();
  for (const member of membership.data || []) {
    await db.collection('members').doc(member._id).remove();
  }

  const countResult = await db.collection('members').where({ groupId }).count();
  const memberCount = countResult.total || 0;

  if (memberCount <= 0) {
    for (const collectionName of GROUP_COLLECTIONS) {
      await removeByGroupId(collectionName, groupId);
    }
    try { await db.collection('groups').doc(groupId).remove(); } catch (error) {}
    return { groupId, left: membership.data.length > 0, dissolved: true, memberCount: 0 };
  }

  await db.collection('groups').doc(groupId).update({ data: { memberCount, updatedAt: db.serverDate() } });
  return { groupId, left: membership.data.length > 0, dissolved: false, memberCount };
};