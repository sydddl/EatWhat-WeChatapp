const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000;

function pad(num) {
  return String(num).padStart(2, '0');
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value);
  if (value.$date) return new Date(value.$date);
  return new Date(value);
}

function toChinaDate(value) {
  const date = toDate(value);
  if (!date || Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + CHINA_OFFSET_MS);
}

function formatDateTime(value) {
  const date = toChinaDate(value);
  if (!date) return '刚刚';
  return `${date.getUTCMonth() + 1}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

function monthBounds(year, month) {
  const safeYear = Number(year) || new Date(Date.now() + CHINA_OFFSET_MS).getUTCFullYear();
  const safeMonth = Math.min(12, Math.max(1, Number(month) || new Date(Date.now() + CHINA_OFFSET_MS).getUTCMonth() + 1));
  return {
    year: safeYear,
    month: safeMonth,
    start: new Date(Date.UTC(safeYear, safeMonth - 1, 1) - CHINA_OFFSET_MS),
    end: new Date(Date.UTC(safeYear, safeMonth, 1) - CHINA_OFFSET_MS)
  };
}

exports.main = async (event) => {
  const groupId = event.groupId;
  if (!groupId) throw new Error('groupId is required');

  const { year, month, start, end } = monthBounds(event.year, event.month);
  const maxRows = Math.min(Math.max(Number(event.limit) || 500, 100), 1000);
  const pageSize = 100;
  let skip = 0;
  let draws = [];

  while (draws.length < maxRows) {
    const page = await db.collection('draws')
      .where({ groupId, createdAt: _.gte(start).and(_.lt(end)) })
      .orderBy('createdAt', 'desc')
      .skip(skip)
      .limit(Math.min(pageSize, maxRows - draws.length))
      .get();

    draws = draws.concat(page.data || []);
    if (!page.data || page.data.length < pageSize) break;
    skip += pageSize;
  }

  const dayCount = new Map();
  const restaurantCount = new Map();

  const normalizedDraws = draws.map((item) => {
    const date = toChinaDate(item.createdAt);
    const day = date ? date.getUTCDate() : 0;
    const snapshot = item.restaurantSnapshot || {};
    const name = snapshot.name || '未知餐厅';
    if (day) dayCount.set(day, (dayCount.get(day) || 0) + 1);
    restaurantCount.set(name, (restaurantCount.get(name) || 0) + 1);
    return {
      ...item,
      createdAtMs: toDate(item.createdAt)?.getTime() || 0,
      createdText: formatDateTime(item.createdAt),
      day
    };
  });

  const total = normalizedDraws.length;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const calendarDays = [];
  for (let i = 0; i < firstWeekday; i += 1) calendarDays.push({ key: 'blank-' + i, day: '', count: 0, intensity: 0 });
  for (let day = 1; day <= daysInMonth; day += 1) {
    const count = dayCount.get(day) || 0;
    calendarDays.push({ key: 'day-' + day, day, count, intensity: Math.min(4, count) });
  }

  const topRestaurants = Array.from(restaurantCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({
      name,
      count,
      percent: total > 0 ? Math.max(8, Math.round((count / total) * 100)) : 0
    }));

  return {
    year,
    month,
    monthLabel: `${year}.${pad(month)}`,
    total,
    draws: normalizedDraws,
    calendarDays,
    topRestaurants
  };
};