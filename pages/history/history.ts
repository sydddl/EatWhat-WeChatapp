import { buildSharePath, requireGroup } from '../../utils/group';

function currentMonthState() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function buildSelectedDayTitle(year: number, month: number, day: number) {
  return `${year}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}`;
}

function getDrawsForDay(draws: any[], day: number) {
  if (!day) return [];
  return (draws || []).filter((item) => Number(item.day) === Number(day));
}

Page({
  data: {
    groupId: '',
    year: currentMonthState().year,
    month: currentMonthState().month,
    monthLabel: '',
    total: 0,
    draws: [] as any[],
    calendarDays: [] as any[],
    topRestaurants: [] as any[],
    selectedDay: 0,
    selectedDayTitle: '',
    selectedDraws: [] as any[],
    loading: true
  },

  async onLoad(options: Record<string, string | undefined>) {
    const groupId = await requireGroup(options);
    this.setData({ groupId });
    await this.loadDraws();
  },

  async onShow() {
    if (this.data.groupId) await this.loadDraws();
  },

  updateSelectedDay(draws: any[], preferredDay = this.data.selectedDay) {
    const selectedDay = Number(preferredDay || 0);
    const selectedDraws = getDrawsForDay(draws, selectedDay);
    this.setData({
      selectedDay,
      selectedDayTitle: selectedDay ? buildSelectedDayTitle(this.data.year, this.data.month, selectedDay) : '',
      selectedDraws
    });
  },

  async loadDraws() {
    this.setData({ loading: true });
    try {
      const result = await wx.cloud.callFunction({
        name: 'listDraws',
        data: { groupId: this.data.groupId, year: this.data.year, month: this.data.month, limit: 1000 }
      });
      const payload = (result.result || {}) as any;
      const draws = payload.draws || [];
      this.setData({
        monthLabel: payload.monthLabel || `${this.data.year}.${this.data.month}`,
        total: payload.total || 0,
        draws,
        calendarDays: payload.calendarDays || [],
        topRestaurants: payload.topRestaurants || []
      });
      this.updateSelectedDay(draws);
    } finally {
      this.setData({ loading: false });
    }
  },

  selectCalendarDay(event: any) {
    const day = Number(event.currentTarget.dataset.day || 0);
    if (!day) return;
    const nextDay = this.data.selectedDay === day ? 0 : day;
    this.updateSelectedDay(this.data.draws, nextDay);
  },

  async prevMonth() {
    let { year, month } = this.data;
    month -= 1;
    if (month < 1) { month = 12; year -= 1; }
    this.setData({ year, month, selectedDay: 0, selectedDayTitle: '', selectedDraws: [] });
    await this.loadDraws();
  },

  async nextMonth() {
    let { year, month } = this.data;
    month += 1;
    if (month > 12) { month = 1; year += 1; }
    this.setData({ year, month, selectedDay: 0, selectedDayTitle: '', selectedDraws: [] });
    await this.loadDraws();
  },

  onShareAppMessage() {
    return { title: '看看群里这个月吃了什么', path: buildSharePath(this.data.groupId, 'pages/history/history') };
  }
});