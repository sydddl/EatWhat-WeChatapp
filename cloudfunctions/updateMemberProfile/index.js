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
  const memberResult = await db.collection('members').where({ groupId }).limit(100).get();
  const existing = (memberResult.data || []).find((member) => member.openid === OPENID || member._openid === OPENID);
  const data = { openid: OPENID, updatedAt: now };
  if (avatarUrl) data.avatarUrl = avatarUrl;
  if (nickname) data.nickname = nickname;

  if (existing) {
    await db.collection('members').doc(existing._id).update({ data });
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

  return { updated: true, memberId: existing ? existing._id : '' };
};
