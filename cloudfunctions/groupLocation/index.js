const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

function normalizeLocation(value) {
  if (!value) return null;
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return {
    name: String(value.name || '').trim(),
    address: String(value.address || '').trim(),
    latitude,
    longitude
  };
}

async function requireMembership(groupId, openid, group) {
  if (group && group.createdByOpenid === openid) return;
  const memberships = await db.collection('members').where({ groupId }).limit(100).get();
  const matched = (memberships.data || []).some((member) => member.openid === openid || member._openid === openid);
  if (!matched) throw new Error('group membership required');
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const groupId = String(event.groupId || '').trim();
  const action = String(event.action || 'get');
  if (!groupId) throw new Error('groupId is required');

  const groupResult = await db.collection('groups').doc(groupId).get();
  if (!groupResult.data) throw new Error('group not found');
  await requireMembership(groupId, OPENID, groupResult.data);

  if (action === 'get') {
    return {
      groupId,
      groupName: groupResult.data.name || '',
      defaultOrigin: normalizeLocation(groupResult.data.defaultOrigin)
    };
  }

  if (action === 'clear') {
    await db.collection('groups').doc(groupId).update({
      data: {
        defaultOrigin: db.command.remove(),
        defaultOriginUpdatedAt: db.serverDate(),
        defaultOriginUpdatedByOpenid: OPENID,
        updatedAt: db.serverDate()
      }
    });
    return { groupId, defaultOrigin: null };
  }

  if (action !== 'save') throw new Error('unsupported action');
  const defaultOrigin = normalizeLocation(event.defaultOrigin);
  if (!defaultOrigin) throw new Error('valid defaultOrigin is required');
  await db.collection('groups').doc(groupId).update({
    data: {
      defaultOrigin,
      defaultOriginUpdatedAt: db.serverDate(),
      defaultOriginUpdatedByOpenid: OPENID,
      updatedAt: db.serverDate()
    }
  });
  return { groupId, defaultOrigin };
};
