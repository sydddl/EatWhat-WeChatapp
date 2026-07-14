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

function memberIdentity(member) {
  return member.openid || member._openid || member._id;
}

function dedupeMembers(members) {
  const unique = new Map();
  for (const member of members || []) {
    const key = memberIdentity(member);
    const current = unique.get(key);
    if (!current) {
      unique.set(key, member);
      continue;
    }
    unique.set(key, {
      ...current,
      ...member,
      avatarUrl: member.avatarUrl || current.avatarUrl || '',
      nickname: member.nickname || current.nickname || ''
    });
  }
  return Array.from(unique.values());
}

async function resolveAvatarUrls(members) {
  const fileIDs = Array.from(new Set((members || [])
    .map((member) => member.avatarUrl || '')
    .filter((url) => url.startsWith('cloud://'))));
  if (fileIDs.length === 0) return members;

  const urlMap = new Map();
  try {
    for (let index = 0; index < fileIDs.length; index += 50) {
      const response = await cloud.getTempFileURL({ fileList: fileIDs.slice(index, index + 50) });
      for (const item of response.fileList || []) {
        urlMap.set(item.fileID, item.tempFileURL || '');
      }
    }
  } catch (error) {
    console.error('Failed to resolve member avatar URLs.', error);
  }

  return members.map((member) => {
    const avatarUrl = member.avatarUrl || '';
    return avatarUrl.startsWith('cloud://') ? { ...member, avatarUrl: urlMap.get(avatarUrl) || '' } : member;
  });
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const groupId = String(event.groupId || '').trim();
  if (!groupId) throw new Error('groupId is required');

  const group = await db.collection('groups').doc(groupId).get();
  if (!group.data) throw new Error('group not found');

  const beforeResult = await db.collection('members').where({ groupId }).limit(100).get();
  const existing = (beforeResult.data || []).find((member) => member.openid === OPENID || member._openid === OPENID);
  const now = db.serverDate();
  if (!existing) {
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
  } else if (event.nickname || event.avatarUrl || !existing.openid) {
    const updateData = { openid: OPENID, updatedAt: now };
    if (event.nickname) updateData.nickname = event.nickname;
    if (event.avatarUrl) updateData.avatarUrl = event.avatarUrl;
    await db.collection('members').doc(existing._id).update({ data: updateData });
  }

  const membersResult = await db.collection('members').where({ groupId }).limit(100).get();
  const members = dedupeMembers(membersResult.data || []);
  const memberCount = members.length;
  await db.collection('groups').doc(groupId).update({ data: { memberCount, updatedAt: now } });

  const resolvedMembers = await resolveAvatarUrls(members);
  const freshGroup = await db.collection('groups').doc(groupId).get();

  return {
    groupId,
    joined: true,
    memberCount,
    group: { ...freshGroup.data, memberCount },
    members: resolvedMembers.map(publicMember)
  };
};
