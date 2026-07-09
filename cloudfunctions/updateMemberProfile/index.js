const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const groupId = String(event.groupId || '').trim();
  const avatarUrl = String(event.avatarUrl || '').trim();
  const nickname = String(event.nickname || '').trim();
  if (!groupId) throw new Error('groupId is required');
  if (!avatarUrl && !nickname) throw new Error('avatarUrl or nickname is required');

  const now = db.serverDate();
  const existing = await db.collection('members').where({ groupId, openid: OPENID }).limit(1).get();
  const data = { updatedAt: now };
  if (avatarUrl) data.avatarUrl = avatarUrl;
  if (nickname) data.nickname = nickname;

  if (existing.data.length > 0) {
    await db.collection('members').doc(existing.data[0]._id).update({ data });
  } else {
    await db.collection('members').add({
      data: {
        groupId,
        openid: OPENID,
        nickname,
        avatarUrl,
        joinedAt: now,
        updatedAt: now
      }
    });
  }

  return { updated: true };
};