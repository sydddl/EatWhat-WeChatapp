export const DEFAULT_GROUP_NAME = '今天吃什么';

type CloudResult<T> = { result?: T };

export function getCurrentGroupId(): string {
  const app = getApp<IAppOption>();
  return app.globalData.groupId || wx.getStorageSync('groupId') || '';
}

export function setCurrentGroupId(groupId: string) {
  const app = getApp<IAppOption>();
  app.globalData.groupId = groupId;
  wx.setStorageSync('groupId', groupId);
}

export function clearCurrentGroupId() {
  const app = getApp<IAppOption>();
  app.globalData.groupId = '';
  wx.removeStorageSync('groupId');
}

export function buildSharePath(groupId: string, page = 'pages/index/index'): string {
  return `/${page}?groupId=${encodeURIComponent(groupId)}`;
}

export async function callCloud<T>(name: string, data: Record<string, unknown> = {}): Promise<T> {
  const response = await wx.cloud.callFunction({ name, data }) as CloudResult<T>;
  return response.result as T;
}

export async function createFixedGroup(name = DEFAULT_GROUP_NAME): Promise<string> {
  const created = await callCloud<{ groupId: string }>('createGroup', { name });
  setCurrentGroupId(created.groupId);
  return created.groupId;
}

export async function joinFixedGroup(groupId: string): Promise<string> {
  const cleanGroupId = decodeURIComponent(groupId || '').trim();
  if (!cleanGroupId) throw new Error('groupId is required');
  await callCloud('joinGroup', { groupId: cleanGroupId });
  setCurrentGroupId(cleanGroupId);
  return cleanGroupId;
}

export async function resolveGroup(options: Record<string, string | undefined> = {}): Promise<string> {
  if (options.groupId) return joinFixedGroup(options.groupId);
  return getCurrentGroupId();
}

export async function requireGroup(options: Record<string, string | undefined> = {}): Promise<string> {
  const groupId = await resolveGroup(options);
  if (!groupId) {
    wx.showToast({ title: '请先创建或加入小组', icon: 'none' });
    setTimeout(() => wx.redirectTo({ url: '/pages/index/index' }), 600);
    throw new Error('groupId is required');
  }
  return groupId;
}