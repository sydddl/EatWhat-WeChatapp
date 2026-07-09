const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const DEFAULT_CONFIG = {
  preferencePlusDelta: 0.5,
  preferenceMinusDelta: -0.5,
  eatenPenaltyDelta: -2,
  eatenWithinDays: 2,
  softmaxTemperature: 1
};

exports.main = async (event) => {
  const groupId = String(event.groupId || '').trim();
  if (!groupId) throw new Error('groupId is required');
  const group = await db.collection('groups').doc(groupId).get();
  return {
    config: {
      ...DEFAULT_CONFIG,
      ...(group.data && group.data.probabilityConfig ? group.data.probabilityConfig : {})
    }
  };
};