const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

function publicMember(member) {
  return {
    _id: member._id,
    avatarUrl: member.avatarUrl || '',
    nickname: member.nickname || '',
    joinedAt: member.joinedAt
  };
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const groupId = String(event.groupId || '').trim();
  if (!groupId) throw new Error('groupId is required');

  const group = await db.collection('groups').doc(groupId).get();
  if (!group.data) throw new Error('group not found');

  const existing = await db.collection('members').where({ groupId, openid: OPENID }).limit(1).get();
  const now = db.serverDate();
  if (existing.data.length === 0) {
    await db.collection('members').add({
      data: {
        groupId,
        openid: OPENID,
        nickname: event.nickname || '',
        avatarUrl: event.avatarUrl || '',
        joinedAt: now,
        updatedAt: now
      }
    });
  } else if (event.nickname || event.avatarUrl) {
    const updateData = { updatedAt: now };
    if (event.nickname) updateData.nickname = event.nickname;
    if (event.avatarUrl) updateData.avatarUrl = event.avatarUrl;
    await db.collection('members').doc(existing.data[0]._id).update({ data: updateData });
  }

  const countResult = await db.collection('members').where({ groupId }).count();
  const memberCount = countResult.total || 0;
  await db.collection('groups').doc(groupId).update({ data: { memberCount, updatedAt: now } });

  const members = await db.collection('members')
    .where({ groupId })
    .limit(20)
    .get();
  const freshGroup = await db.collection('groups').doc(groupId).get();

  return {
    groupId,
    joined: true,
    memberCount,
    group: { ...freshGroup.data, memberCount },
    members: members.data.map(publicMember)
  };
};