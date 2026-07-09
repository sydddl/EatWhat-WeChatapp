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

function numberInRange(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

exports.main = async (event) => {
  const groupId = String(event.groupId || '').trim();
  if (!groupId) throw new Error('groupId is required');
  const input = event.config || {};
  const config = {
    preferencePlusDelta: numberInRange(input.preferencePlusDelta, DEFAULT_CONFIG.preferencePlusDelta, -5, 5),
    preferenceMinusDelta: numberInRange(input.preferenceMinusDelta, DEFAULT_CONFIG.preferenceMinusDelta, -5, 5),
    eatenPenaltyDelta: numberInRange(input.eatenPenaltyDelta, DEFAULT_CONFIG.eatenPenaltyDelta, -5, 5),
    eatenWithinDays: Math.round(numberInRange(input.eatenWithinDays, DEFAULT_CONFIG.eatenWithinDays, 0, 60)),
    softmaxTemperature: numberInRange(input.softmaxTemperature, DEFAULT_CONFIG.softmaxTemperature, 0.1, 10)
  };
  await db.collection('groups').doc(groupId).update({
    data: {
      probabilityConfig: config,
      updatedAt: db.serverDate()
    }
  });
  return { config };
};