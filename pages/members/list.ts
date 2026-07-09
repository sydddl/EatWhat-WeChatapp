import { buildSharePath, requireGroup } from '../../utils/group';

type MemberItem = {
  _id?: string;
  avatarUrl?: string;
  nickname?: string;
  fallbackText: string;
};

function decorateMembers(members: any[]): MemberItem[] {
  return (members || []).map((member: any, index: number) => ({
    _id: member._id,
    avatarUrl: member.avatarUrl || '',
    nickname: member.nickname || '',
    fallbackText: member.nickname ? String(member.nickname).slice(0, 1) : String(index + 1)
  }));
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
    groupId: '',
    groupName: '固定饭搭子小组',
    memberCount: 0,
    members: [] as MemberItem[],
    nickname: '',
    loading: true,
    savingProfile: false
  },

  async onLoad(options: Record<string, string | undefined>) {
    const groupId = await requireGroup(options);
    this.setData({ groupId });
    await this.loadMembers();
  },

  async onShow() {
    if (this.data.groupId) await this.loadMembers();
  },

  async loadMembers() {
    this.setData({ loading: true });
    try {
      const response = await wx.cloud.callFunction({ name: 'joinGroup', data: { groupId: this.data.groupId } });
      const payload = (response.result || {}) as any;
      const group = payload.group || {};
      const resolvedMembers = await resolveCloudAvatarUrls(payload.members || []);
      const members = decorateMembers(resolvedMembers);
      this.setData({
        groupName: group.name || this.data.groupName,
        memberCount: payload.memberCount || group.memberCount || members.length,
        members
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  onNicknameInput(event: any) {
    this.setData({ nickname: event.detail.value });
  },

  async onChooseAvatar(event: any) {
    const tempAvatarUrl = event.detail?.avatarUrl;
    if (!this.data.groupId || !tempAvatarUrl) return;
    this.setData({ savingProfile: true });
    try {
      const suffix = tempAvatarUrl.match(/\.[a-zA-Z0-9]+$/)?.[0] || '.jpg';
      const upload = await wx.cloud.uploadFile({
        cloudPath: `member-avatars/${this.data.groupId}/${Date.now()}-${Math.floor(Math.random() * 100000)}${suffix}`,
        filePath: tempAvatarUrl
      });
      await wx.cloud.callFunction({ name: 'updateMemberProfile', data: { groupId: this.data.groupId, avatarUrl: upload.fileID } });
      await this.loadMembers();
      wx.showToast({ title: '头像已更新', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: '头像保存失败', icon: 'none' });
    } finally {
      this.setData({ savingProfile: false });
    }
  },

  async saveNickname() {
    const nickname = this.data.nickname.trim();
    if (!nickname) { wx.showToast({ title: '请输入昵称', icon: 'none' }); return; }
    this.setData({ savingProfile: true });
    try {
      await wx.cloud.callFunction({ name: 'updateMemberProfile', data: { groupId: this.data.groupId, nickname } });
      this.setData({ nickname: '' });
      await this.loadMembers();
      wx.showToast({ title: '昵称已更新', icon: 'success' });
    } finally {
      this.setData({ savingProfile: false });
    }
  },

  onShareAppMessage() {
    return { title: '看看饭搭子成员', path: buildSharePath(this.data.groupId, 'pages/members/list') };
  }
});
