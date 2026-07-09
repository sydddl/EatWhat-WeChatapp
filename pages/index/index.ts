import { buildSharePath, callCloud, clearCurrentGroupId, createFixedGroup, joinFixedGroup, resolveGroup } from '../../utils/group';

type MemberItem = {
  avatarUrl?: string;
  nickname?: string;
  fallbackText?: string;
};

const COPY = {
  defaultGroupName: '\u4eca\u5929\u5403\u4ec0\u4e48',
  loadFailed: '\u7fa4\u7ec4\u52a0\u8f7d\u5931\u8d25',
  groupCreated: '\u7fa4\u7ec4\u5df2\u521b\u5efa',
  inputGroupId: '\u8bf7\u8f93\u5165 groupId',
  joinedGroup: '\u5df2\u52a0\u5165\u7fa4\u7ec4',
  avatarUpdated: '\u5934\u50cf\u5df2\u66f4\u65b0',
  avatarFailed: '\u5934\u50cf\u4fdd\u5b58\u5931\u8d25',
  shareTitle: '\u6765\u7fa4\u91cc\u62bd\u7b7e\u51b3\u5b9a\u5403\u4ec0\u4e48',
  setupTitleA: '\u56fa\u5b9a\u996d\u642d\u5b50',
  setupTitleB: '\u9910\u5385\u6c60',
  setupSubtitle: '\u521b\u5efa\u4e00\u4e2a\u957f\u671f\u5171\u7528\u7684\u9910\u5385\u6c60\uff0c\u6216\u8f93\u5165\u670b\u53cb\u53d1\u6765\u7684 groupId \u52a0\u5165\u540c\u4e00\u4e2a\u7fa4\u7ec4\u3002',
  groupNameLabel: '\u7fa4\u7ec4\u540d',
  createGroup: '\u521b\u5efa\u56fa\u5b9a\u7fa4\u7ec4',
  or: '\u6216',
  existingGroupId: '\u5df2\u6709 groupId',
  groupIdPlaceholder: '\u7c98\u8d34\u670b\u53cb\u590d\u5236\u7ed9\u4f60\u7684 groupId',
  joinGroup: '\u52a0\u5165\u7fa4\u7ec4',
  recentGroups: '\u52a0\u5165\u8fc7\u7684\u7fa4\u7ec4',
  enter: '\u8fdb\u5165',
  defaultCurrentGroup: '\u56fa\u5b9a\u996d\u642d\u5b50\u7fa4\u7ec4',
  enabledRestaurants: '\u542f\u7528\u9910\u5385',
  members: '\u7ec4\u6210\u5458',
  memberPool: '\u4eba\u5171\u7528\u8fd9\u4e2a\u9910\u5385\u6c60',
  memberSettings: '\u6210\u5458\u8bbe\u7f6e',
  copyGroupId: '\u590d\u5236 groupId',
  switchGroup: '\u5207\u6362\u7fa4\u7ec4',
  leaveGroup: '\u9000\u51fa\u7fa4\u7ec4',
  startDraw: '\u5f00\u59cb\u62bd\u7b7e',
  manageRestaurants: '\u7ba1\u7406\u9910\u5385',
  viewHistory: '\u67e5\u770b\u5386\u53f2',
  probability: '\u5929\u610f\u64cd\u7eb5',
  docs: '\u529f\u80fd\u8bf4\u660e',
  loading: '\u6b63\u5728\u52a0\u8f7d...',
  person: '\u4eba',
  restaurantUnit: '\u5bb6\u9910\u5385',
  leaveTitle: '\u786e\u8ba4\u9000\u51fa\u7fa4\u7ec4',
  leaveContent: '\u9000\u51fa\u540e\u4f60\u5c06\u4e0d\u518d\u770b\u5230\u8fd9\u4e2a\u7fa4\u7ec4\u3002\u5982\u679c\u4f60\u662f\u6700\u540e\u4e00\u4e2a\u6210\u5458\uff0c\u8be5\u7fa4\u7ec4\u4f1a\u81ea\u52a8\u89e3\u6563\uff0c\u9910\u5385\u6c60\u548c\u5386\u53f2\u4e5f\u4f1a\u88ab\u6e05\u7406\u3002',
  leaveConfirm: '\u786e\u8ba4\u9000\u51fa',
  groupDissolved: '\u7fa4\u7ec4\u5df2\u89e3\u6563',
  leftGroup: '\u5df2\u9000\u51fa\u7fa4\u7ec4',
  leaveFailed: '\u9000\u51fa\u5931\u8d25'
};

function buildDisplayMembers(members: any[], memberCount: number): MemberItem[] {
  const display = (members || []).slice(0, 4).map((member: any, index: number) => ({
    avatarUrl: member.avatarUrl || '',
    nickname: member.nickname || '',
    fallbackText: member.nickname ? String(member.nickname).slice(0, 1) : String(index + 1)
  }));
  const target = Math.min(Math.max(memberCount || display.length || 1, 1), 4);
  while (display.length < target) display.push({ fallbackText: String(display.length + 1) });
  return display;
}

async function resolveCloudAvatarUrls<T extends { avatarUrl?: string }>(members: T[]): Promise<T[]> {
  const cloudIds = Array.from(new Set((members || [])
    .map((member) => member.avatarUrl || '')
    .filter((url) => url.startsWith('cloud://'))));
  if (cloudIds.length === 0) return members;
  try {
    const response = await wx.cloud.getTempFileURL({ fileList: cloudIds });
    const urlMap = new Map((response.fileList || []).map((item: any) => [item.fileID, item.tempFileURL || '']));
    return members.map((member) => {
      const avatarUrl = member.avatarUrl || '';
      return avatarUrl.startsWith('cloud://') ? { ...member, avatarUrl: urlMap.get(avatarUrl) || '' } : member;
    });
  } catch (error) {
    return members.map((member) => {
      const avatarUrl = member.avatarUrl || '';
      return avatarUrl.startsWith('cloud://') ? { ...member, avatarUrl: '' } : member;
    });
  }
}

Page({
  data: {
    copy: COPY,
    groupId: '',
    groupName: COPY.defaultGroupName,
    joinGroupId: '',
    restaurantCount: 0,
    memberCount: 0,
    members: [] as MemberItem[],
    recentGroups: [] as any[],
    dotItems: [0, 1, 2, 3, 4, 5, 6, 7],
    loading: true,
    creating: false,
    joining: false,
    uploadingAvatar: false,
    leaving: false
  },

  async onLoad(options: Record<string, string | undefined>) { await this.bootstrap(options); },

  async onShow() {
    if (this.data.groupId) await this.loadGroupSummary(this.data.groupId);
    else await this.loadMyGroups();
  },

  async bootstrap(options: Record<string, string | undefined>) {
    this.setData({ loading: true });
    try {
      const groupId = await resolveGroup(options);
      this.setData({ groupId });
      if (groupId) await this.loadGroupSummary(groupId);
      else await this.loadMyGroups();
    } catch (error) {
      wx.showToast({ title: COPY.loadFailed, icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  async loadGroupSummary(groupId: string) {
    const [restaurantsResult, groupResult] = await Promise.all([
      wx.cloud.callFunction({ name: 'listRestaurants', data: { groupId, includeDisabled: false } }),
      wx.cloud.callFunction({ name: 'joinGroup', data: { groupId } })
    ]);
    const restaurants = (restaurantsResult.result as any)?.restaurants || [];
    const groupPayload = (groupResult.result as any) || {};
    const groupInfo = groupPayload.group || {};
    const rawMembers = groupPayload.members || [];
    const displayMembers = await resolveCloudAvatarUrls(rawMembers);
    const memberCount = groupPayload.memberCount || groupInfo.memberCount || rawMembers.length || 1;
    this.setData({
      restaurantCount: restaurants.length,
      memberCount,
      members: buildDisplayMembers(displayMembers, memberCount),
      groupName: groupInfo.name || this.data.groupName
    });
  },

  async loadMyGroups() {
    try {
      const response = await wx.cloud.callFunction({ name: 'listMyGroups' });
      this.setData({ recentGroups: ((response.result as any)?.groups || []) });
    } catch (error) {
      this.setData({ recentGroups: [] });
    }
  },

  onGroupNameInput(event: any) { this.setData({ groupName: event.detail.value }); },
  onJoinGroupIdInput(event: any) { this.setData({ joinGroupId: event.detail.value }); },

  async createGroup() {
    this.setData({ creating: true });
    try {
      const groupId = await createFixedGroup(this.data.groupName || COPY.defaultGroupName);
      this.setData({ groupId, restaurantCount: 0, memberCount: 1, members: buildDisplayMembers([], 1) });
      wx.showToast({ title: COPY.groupCreated, icon: 'success' });
      await this.loadGroupSummary(groupId);
      await this.loadMyGroups();
    } finally {
      this.setData({ creating: false });
    }
  },

  async joinGroup() {
    if (!this.data.joinGroupId.trim()) { wx.showToast({ title: COPY.inputGroupId, icon: 'none' }); return; }
    this.setData({ joining: true });
    try {
      const groupId = await joinFixedGroup(this.data.joinGroupId);
      this.setData({ groupId });
      await this.loadGroupSummary(groupId);
      await this.loadMyGroups();
      wx.showToast({ title: COPY.joinedGroup, icon: 'success' });
    } finally {
      this.setData({ joining: false });
    }
  },

  async selectRecentGroup(event: any) {
    const groupId = event.currentTarget.dataset.id;
    if (!groupId) return;
    this.setData({ groupId, joining: true });
    try {
      await joinFixedGroup(groupId);
      await this.loadGroupSummary(groupId);
    } finally {
      this.setData({ joining: false });
    }
  },

  async onChooseAvatar(event: any) {
    const tempAvatarUrl = event.detail?.avatarUrl;
    if (!this.data.groupId || !tempAvatarUrl) return;
    this.setData({ uploadingAvatar: true });
    try {
      const suffix = tempAvatarUrl.match(/\.[a-zA-Z0-9]+$/)?.[0] || '.jpg';
      const upload = await wx.cloud.uploadFile({
        cloudPath: `member-avatars/${this.data.groupId}/${Date.now()}-${Math.floor(Math.random() * 100000)}${suffix}`,
        filePath: tempAvatarUrl
      });
      await wx.cloud.callFunction({ name: 'updateMemberProfile', data: { groupId: this.data.groupId, avatarUrl: upload.fileID } });
      await this.loadGroupSummary(this.data.groupId);
      wx.showToast({ title: COPY.avatarUpdated, icon: 'success' });
    } catch (error) {
      wx.showToast({ title: COPY.avatarFailed, icon: 'none' });
    } finally {
      this.setData({ uploadingAvatar: false });
    }
  },

  copyGroupId() { wx.setClipboardData({ data: this.data.groupId }); },

  async switchGroup() {
    clearCurrentGroupId();
    this.setData({ groupId: '', restaurantCount: 0, memberCount: 0, members: [], joinGroupId: '' });
    await this.loadMyGroups();
  },

  async confirmLeaveGroup(groupId: string) {
    if (!groupId || this.data.leaving) return;
    wx.showModal({
      title: COPY.leaveTitle,
      content: COPY.leaveContent,
      confirmText: COPY.leaveConfirm,
      confirmColor: '#d33030',
      success: async (res: any) => {
        if (!res.confirm) return;
        this.setData({ leaving: true });
        try {
          const result = await callCloud<{ dissolved?: boolean }>('leaveGroup', { groupId });
          if (this.data.groupId === groupId) {
            clearCurrentGroupId();
            this.setData({ groupId: '', restaurantCount: 0, memberCount: 0, members: [], joinGroupId: '' });
          }
          await this.loadMyGroups();
          wx.showToast({ title: result?.dissolved ? COPY.groupDissolved : COPY.leftGroup, icon: 'none' });
        } catch (error) {
          wx.showToast({ title: COPY.leaveFailed, icon: 'none' });
        } finally {
          this.setData({ leaving: false });
        }
      }
    });
  },

  leaveRecentGroup(event: any) {
    const groupId = event.currentTarget.dataset.id;
    this.confirmLeaveGroup(groupId);
  },

  goDraw() { wx.navigateTo({ url: `/pages/draw/draw?groupId=${this.data.groupId}` }); },
  goRestaurants() { wx.navigateTo({ url: `/pages/restaurants/list?groupId=${this.data.groupId}` }); },
  goMembers() { wx.navigateTo({ url: `/pages/members/list?groupId=${this.data.groupId}` }); },
  goHistory() { wx.navigateTo({ url: `/pages/history/history?groupId=${this.data.groupId}` }); },
  goProbability() { wx.navigateTo({ url: `/pages/settings/probability?groupId=${this.data.groupId}` }); },
  goDocs() { wx.navigateTo({ url: '/pages/docs/readme' }); },

  onShareAppMessage() { return { title: COPY.shareTitle, path: buildSharePath(this.data.groupId) }; }
});
