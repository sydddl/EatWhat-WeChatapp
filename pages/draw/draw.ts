import { buildSharePath, requireGroup } from '../../utils/group';

let drawAudio: any = null;
let sessionWatcher: any = null;
let pollingTimer: any = null;
let watchedSessionId = '';

function getDrawAudio() {
  if (!drawAudio) {
    drawAudio = wx.createInnerAudioContext();
    drawAudio.src = '/assets/audio/draw.mp3';
    drawAudio.volume = 0.8;
  }
  return drawAudio;
}

function playDrawSound() {
  const audio = getDrawAudio();
  audio.stop();
  audio.seek(0);
  audio.play();
}

type ProbabilityTerm = {
  label: string;
  value: string;
  reason: string;
  type: 'base' | 'boost' | 'penalty' | 'neutral';
};

const TAG_TONE_COUNT = 10;

type TagOption = {
  key: string;
  label: string;
  count: number;
  className: string;
  selected: boolean;
};

function tagTone(tag: string): string {
  let hash = 0;
  for (const char of tag) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return `tag-tone-${hash % TAG_TONE_COUNT}`;
}

function normalizeText(text: unknown): string {
  return String(text || '').trim().toLowerCase();
}

function isPoolTag(tag: string, restaurant: any): boolean {
  const value = normalizeText(tag);
  if (!value) return false;
  if (value === normalizeText(restaurant.priceRange)) return false;
  if (/^weight\s*\d+$/i.test(value) || /^权重\s*\d+/.test(value)) return false;
  if (/^\d+(\.\d+)?$/.test(value)) return false;
  if (/^\d+\s*[-~到]\s*\d+$/.test(value)) return false;
  return true;
}

function decorateTagOptions(options: TagOption[], selectedTags: string[]): TagOption[] {
  const selected = new Set((selectedTags || []).map((tag) => normalizeText(tag)));
  return options.map((option) => ({ ...option, selected: selected.has(normalizeText(option.label)) }));
}

function buildTagOptions(restaurants: any[], selectedTags: string[]): TagOption[] {
  const countMap = new Map<string, { label: string; count: number }>();
  for (const restaurant of restaurants || []) {
    const seen = new Set<string>();
    for (const rawTag of restaurant.tags || []) {
      const label = String(rawTag || '').trim();
      const key = normalizeText(label);
      if (!isPoolTag(label, restaurant) || seen.has(key)) continue;
      seen.add(key);
      const current = countMap.get(key) || { label, count: 0 };
      current.count += 1;
      countMap.set(key, current);
    }
  }
  const options = Array.from(countMap.values())
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-Hans-CN'))
    .map((item) => ({
      key: item.label,
      label: item.label,
      count: item.count,
      className: tagTone(item.label),
      selected: false
    }));
  return decorateTagOptions(options, selectedTags);
}

async function resolveCloudAvatarUrls<T extends { avatarUrl?: string }>(items: T[]): Promise<T[]> {
  const cloudIds = Array.from(new Set((items || [])
    .map((item) => item.avatarUrl || '')
    .filter((url) => url.startsWith('cloud://'))));
  if (cloudIds.length === 0) return items;
  try {
    const response = await wx.cloud.getTempFileURL({ fileList: cloudIds });
    const urlMap = new Map((response.fileList || []).map((item: any) => [item.fileID, item.tempFileURL || '']));
    return items.map((item) => {
      const avatarUrl = item.avatarUrl || '';
      return avatarUrl.startsWith('cloud://') ? { ...item, avatarUrl: urlMap.get(avatarUrl) || '' } : item;
    });
  } catch (error) {
    return items.map((item) => {
      const avatarUrl = item.avatarUrl || '';
      return avatarUrl.startsWith('cloud://') ? { ...item, avatarUrl: '' } : item;
    });
  }
}

async function resolveSessionAvatars(payload: any) {
  const results = await Promise.all((payload.results || []).map(async (result: any) => ({
    ...result,
    voters: await resolveCloudAvatarUrls(result.voters || [])
  })));
  const abstainVoters = await resolveCloudAvatarUrls(payload.abstainVoters || []);
  return { ...payload, results, abstainVoters };
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function signedPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${formatPercent(value)}`;
}

function buildProbabilityExplanation(result: any, candidateCount: number): { total: string; terms: ProbabilityTerm[] } {
  const factors = result?.probabilityFactors || {};
  const probability = Number(factors.probability) || (candidateCount > 0 ? 1 / candidateCount : 0);
  const baseWeight = Math.max(0.0001, Number(factors.baseWeight ?? result?.baseWeight) || 1);
  const baseLogit = Number(factors.baseLogit ?? Math.log(baseWeight));
  const score = Number(factors.score ?? baseLogit);
  const deltas = Array.isArray(factors.deltas) ? factors.deltas : [];
  const config = factors.config || {};
  const terms: ProbabilityTerm[] = [
    { label: '本底分', value: baseLogit.toFixed(2), reason: `ln(baseWeight=${baseWeight})，再进入 softmax`, type: 'base' }
  ];

  for (const delta of deltas) {
    const value = Number(delta.value || 0);
    terms.push({ label: delta.label || '变动项', value: signedPercent(value), reason: delta.reason || '用户配置的变动概率', type: value > 0 ? 'boost' : value < 0 ? 'penalty' : 'neutral' });
  }
  if (deltas.length === 0) terms.push({ label: '变动项', value: '+0%', reason: '当前没有触发喜好代币或最近吃过规则', type: 'neutral' });
  terms.push({ label: 'Softmax', value: formatPercent(probability), reason: `score=${score.toFixed(2)}，温度 T=${config.softmaxTemperature ?? 1}，归一化后所有候选概率之和为 1`, type: 'neutral' });
  return { total: formatPercent(probability), terms };
}

function compareResultRank(a: any, b: any) {
  const voteDiff = Number(b.voteCount || 0) - Number(a.voteCount || 0);
  if (voteDiff !== 0) return voteDiff;
  const countDiff = Number(b.count || 0) - Number(a.count || 0);
  if (countDiff !== 0) return countDiff;
  const timeDiff = Number(b.lastDrawAtMs || 0) - Number(a.lastDrawAtMs || 0);
  if (timeDiff !== 0) return timeDiff;
  return Number(b.originalIndex || 0) - Number(a.originalIndex || 0);
}

function decorateResults(results: any[], myVoteRestaurantId: string) {
  return (results || []).map((item: any, originalIndex: number) => {
    const probability = buildProbabilityExplanation(item.restaurant, item.candidateCount || 0);
    const voteCount = Number(item.voteCount || 0);
    return {
      ...item,
      originalIndex,
      voteCount,
      probability,
      isVoted: myVoteRestaurantId === item.restaurant?._id,
      hasVoters: voteCount > 0,
      voteSummaryText: voteCount > 0 ? `${voteCount} 票` : '未投票',
      voteButtonText: myVoteRestaurantId === item.restaurant?._id ? '已投' : '投票',
      hasMultiDraw: Number(item.count || 0) > 1,
      countText: `x${item.count || 1}`
    };
  }).sort(compareResultRank);
}

function stopSync() {
  if (sessionWatcher) {
    sessionWatcher.close();
    sessionWatcher = null;
  }
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
  watchedSessionId = '';
}

Page({
  data: {
    groupId: '',
    filters: { tag: '', tags: [] as string[], priceRange: '', locationText: '' },
    tagOptions: [] as TagOption[],
    sessionId: '',
    sessionStatus: 'active',
    finalRestaurantId: '',
    results: [] as any[],
    abstainCount: 0,
    abstainText: '',
    abstainVoters: [] as any[],
    myVoteRestaurantId: '',
    candidateCount: 0,
    syncText: '',
    drawing: false,
    loadingSession: true,
    finalizing: false
  },

  async onLoad(options: Record<string, string | undefined>) {
    const groupId = await requireGroup(options);
    this.setData({ groupId });
    await this.loadTagOptions();
    await this.loadSession();
  },

  async onShow() {
    if (this.data.groupId) {
      await this.loadTagOptions();
      await this.loadSession();
    }
  },

  onInput(event: any) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [field]: event.detail.value });
  },

  async loadTagOptions() {
    try {
      const result = await wx.cloud.callFunction({ name: 'listRestaurants', data: { groupId: this.data.groupId, includeDisabled: false } });
      const restaurants = (result.result as any)?.restaurants || [];
      this.setData({ tagOptions: buildTagOptions(restaurants, this.data.filters.tags || []) });
    } catch (error) {
      this.setData({ tagOptions: [] });
    }
  },

  toggleTagFilter(event: any) {
    const tag = String(event.currentTarget.dataset.tag || '');
    if (!tag) return;
    const current = this.data.filters.tags || [];
    const normalized = normalizeText(tag);
    const exists = current.some((item) => normalizeText(item) === normalized);
    const tags = exists ? current.filter((item) => normalizeText(item) !== normalized) : [...current, tag];
    this.setData({
      'filters.tags': tags,
      tagOptions: decorateTagOptions(this.data.tagOptions, tags)
    });
  },

  startSessionSync(sessionId: string) {
    if (!sessionId || watchedSessionId === sessionId) return;
    stopSync();
    watchedSessionId = sessionId;
    const refresh = async () => {
      if (!this.data.groupId || this.data.loadingSession || this.data.drawing || this.data.finalizing) return;
      await this.loadSessionQuietly();
    };
    pollingTimer = setInterval(refresh, 3500);
  },

  async applySession(payload: any) {
    const resolvedPayload = await resolveSessionAvatars(payload);
    const results = decorateResults(resolvedPayload.results || [], resolvedPayload.myVoteRestaurantId || '');
    this.setData({
      sessionId: resolvedPayload.sessionId || '',
      sessionStatus: resolvedPayload.status || 'active',
      finalRestaurantId: resolvedPayload.finalRestaurantId || '',
      results,
      candidateCount: results[0]?.candidateCount || 0,
      abstainCount: resolvedPayload.abstainCount || 0,
      abstainText: resolvedPayload.abstainCount ? `${resolvedPayload.abstainCount} 人弃权` : '',
      abstainVoters: resolvedPayload.abstainVoters || [],
      myVoteRestaurantId: resolvedPayload.myVoteRestaurantId || ''
    });
    this.startSessionSync(resolvedPayload.sessionId || '');
  },

  async callSession(action: string, data: Record<string, unknown> = {}) {
    const response = await wx.cloud.callFunction({
      name: 'drawSessionAction',
      data: { groupId: this.data.groupId, sessionId: this.data.sessionId, action, ...data }
    });
    await this.applySession(response.result as any);
  },

  async loadSession() {
    this.setData({ loadingSession: true });
    try { await this.callSession('get'); }
    finally { this.setData({ loadingSession: false }); }
  },

  async loadSessionQuietly() {
    await this.callSession('get');
  },

  async draw() {
    if (this.data.sessionStatus !== 'active') return;
    playDrawSound();
    this.setData({ drawing: true, syncText: '' });
    try { await this.callSession('draw', { filters: this.data.filters }); }
    catch (error) { wx.showToast({ title: '没有匹配的餐厅', icon: 'none' }); }
    finally { this.setData({ drawing: false }); }
  },

  async voteResult(event: any) {
    if (this.data.sessionStatus !== 'active') return;
    const restaurantId = event.currentTarget.dataset.id;
    if (!restaurantId) return;
    await this.callSession('vote', { restaurantId });
  },

  async abstainVote() {
    if (this.data.sessionStatus !== 'active') return;
    await this.callSession('vote', { restaurantId: 'abstain' });
  },

  async refreshVotes() {
    await this.loadSession();
  },

  async finalizeResult(event: any) {
    if (this.data.finalizing || this.data.sessionStatus !== 'active') return;
    const restaurantId = event.currentTarget.dataset.id;
    if (!restaurantId) return;
    const target = this.data.results.find((item: any) => item.restaurant?._id === restaurantId);
    this.setData({ finalizing: true });
    try {
      await this.callSession('finalize', { restaurantId });
      wx.showModal({
        title: '本轮已结束',
        content: `已决定吃「${target?.restaurant?.name || '这家'}」。结果已写入历史，并会参与最近吃过减值。`,
        showCancel: false,
        confirmText: '知道了'
      });
    } catch (error) {
      wx.showToast({ title: '本轮已结束', icon: 'none' });
      await this.loadSession();
    } finally {
      this.setData({ finalizing: false });
    }
  },

  async newRound() {
    this.setData({ drawing: true, syncText: '' });
    try { await this.callSession('new'); }
    finally { this.setData({ drawing: false }); }
  },

  onUnload() {
    stopSync();
    if (drawAudio) {
      drawAudio.destroy();
      drawAudio = null;
    }
  },

  onShareAppMessage() {
    return { title: '来抽签决定吃什么', path: buildSharePath(this.data.groupId, 'pages/draw/draw') };
  }
});
