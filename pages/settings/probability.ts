import { requireGroup } from '../../utils/group';

type FormData = {
  preferencePlusPercent: string;
  preferenceMinusPercent: string;
  eatenPenaltyPercent: string;
  eatenWithinDays: string;
  softmaxTemperature: string;
};

type PreviewRow = {
  count: number;
  base: string;
  plus: string;
  eaten: string;
};

const DEFAULT_FORM: FormData = {
  preferencePlusPercent: '50',
  preferenceMinusPercent: '-50',
  eatenPenaltyPercent: '-200',
  eatenWithinDays: '2',
  softmaxTemperature: '1'
};

const COPY = {
  title: '\u5929\u610f\u64cd\u7eb5',
  subtitle: '\u8c03\u6574\u559c\u597d\u4ee3\u5e01\u3001\u6700\u8fd1\u5403\u8fc7\u60e9\u7f5a\u548c softmax \u6e29\u5ea6\u3002\u914d\u7f6e\u53ea\u4f5c\u7528\u4e8e\u5f53\u524d\u5c0f\u7ec4\uff0c\u62bd\u7b7e\u65f6\u4f1a\u7edf\u4e00\u5f52\u4e00\u5316\u3002',
  deltaTitle: '\u6982\u7387\u53d8\u52a8',
  deltaCaption: '\u8fd9\u91cc\u586b\u7684\u662f softmax \u7684\u5206\u6570\u589e\u51cf\uff0c\u4e0d\u662f\u6700\u7ec8\u6982\u7387\u767e\u5206\u70b9\u3002\u4e0b\u65b9\u9884\u89c8\u4f1a\u5b9e\u65f6\u6362\u7b97\u6210\u5b9e\u9645\u6982\u7387\u3002',
  plusLabel: '\u52a0\u503c\u4ee3\u5e01',
  plusHint: '\u4e00\u4e2a\u7528\u6237\u5728\u4e00\u5bb6\u9910\u5385\u6700\u591a\u653e\u4e00\u4e2a\u4ee3\u5e01\u3002',
  minusLabel: '\u51cf\u503c\u4ee3\u5e01',
  minusHint: '\u8d1f\u6570\u4f1a\u964d\u4f4e\u8fd9\u5bb6\u5e97\u76f8\u5bf9\u5176\u4ed6\u5019\u9009\u7684\u80dc\u7387\u3002',
  eatenLabel: '\u5403\u8fc7\u60e9\u7f5a',
  eatenHint: '\u547d\u4e2d\u6700\u8fd1\u5403\u8fc7\u7a97\u53e3\u65f6\u751f\u6548\uff0c\u9ed8\u8ba4\u529b\u5ea6\u66f4\u5f3a\u3002',
  eatenWindow: '\u5403\u8fc7\u7a97\u53e3',
  dayUnit: '\u5929',
  eatenWindowHint: '\u591a\u5c11\u5929\u5185\u7b97\u6700\u8fd1\u5403\u8fc7\u3002',
  temperature: '\u6e29\u5ea6 T',
  temperatureHint: '\u8d8a\u5c0f\u8d8a\u504f\u5411\u9ad8\u5206\uff0c\u8d8a\u5927\u8d8a\u5e73\u5747\u3002',
  previewTitle: '\u5b9e\u9645\u6982\u7387\u9884\u89c8',
  previewCaption: '\u5047\u8bbe\u6240\u6709\u9910\u5385 baseWeight \u90fd\u4e3a 1\uff0c\u53ea\u6709\u88ab\u89c2\u5bdf\u7684\u8fd9\u5bb6\u5e97\u6709\u4e00\u4e2a\u5355\u72ec\u53d8\u52a8\u3002',
  count: '\u603b\u6570',
  noChange: '\u65e0\u53d8\u52a8',
  formulaTitle: '\u5f53\u524d\u516c\u5f0f',
  formulaCaption: '\u6bcf\u4e2a\u5019\u9009\u5148\u5f97\u5206\uff0c\u518d\u8fdb\u5165 softmax\u3002',
  save: '\u4fdd\u5b58\u914d\u7f6e',
  saved: '\u5df2\u4fdd\u5b58'
};

const SAMPLE_COUNTS = [2, 5, 10, 20, 50];

function numberFromText(value: string, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function percentToDelta(value: string, fallback: number): number {
  return numberFromText(value, fallback * 100) / 100;
}

function deltaToPercent(value: number): string {
  const percent = Number(value || 0) * 100;
  return Number.isInteger(percent) ? String(percent) : String(Number(percent.toFixed(2)));
}

function formatSignedPercent(delta: number): string {
  const percent = delta * 100;
  const fixed = Number.isInteger(percent) ? String(percent) : percent.toFixed(1);
  return percent > 0 ? `+${fixed}%` : `${fixed}%`;
}

function formatProbability(value: number): string {
  const percent = value * 100;
  if (percent >= 1) return `${percent.toFixed(1)}%`;
  return `${percent.toFixed(2)}%`;
}

function probabilityWithSingleDelta(count: number, delta: number, temperature: number): number {
  if (count <= 1) return 1;
  const t = Math.max(0.1, Number(temperature) || 1);
  const changed = Math.exp(delta / t);
  return changed / (changed + count - 1);
}

function buildPreview(form: FormData) {
  const plusDelta = percentToDelta(form.preferencePlusPercent, 0.5);
  const eatenDelta = percentToDelta(form.eatenPenaltyPercent, -2);
  const temperature = numberFromText(form.softmaxTemperature, 1);
  const rows: PreviewRow[] = SAMPLE_COUNTS.map((count) => ({
    count,
    base: formatProbability(1 / count),
    plus: formatProbability(probabilityWithSingleDelta(count, plusDelta, temperature)),
    eaten: formatProbability(probabilityWithSingleDelta(count, eatenDelta, temperature))
  }));
  return {
    labels: {
      plus: `+\u4ee3\u5e01 ${formatSignedPercent(plusDelta)}`,
      eaten: `\u5403\u8fc7 ${formatSignedPercent(eatenDelta)}`
    },
    rows
  };
}

Page({
  data: {
    groupId: '',
    copy: COPY,
    form: { ...DEFAULT_FORM } as FormData,
    previewLabels: buildPreview(DEFAULT_FORM).labels,
    previewRows: buildPreview(DEFAULT_FORM).rows as PreviewRow[],
    saving: false
  },

  async onLoad(options: Record<string, string | undefined>) {
    const groupId = await requireGroup(options);
    this.setData({ groupId });
    await this.loadConfig();
  },

  async loadConfig() {
    const response = await wx.cloud.callFunction({ name: 'getProbabilityConfig', data: { groupId: this.data.groupId } });
    const config = (response.result as any)?.config || {};
    const form: FormData = {
      preferencePlusPercent: deltaToPercent(config.preferencePlusDelta ?? 0.5),
      preferenceMinusPercent: deltaToPercent(config.preferenceMinusDelta ?? -0.5),
      eatenPenaltyPercent: deltaToPercent(config.eatenPenaltyDelta ?? -2),
      eatenWithinDays: String(config.eatenWithinDays ?? 2),
      softmaxTemperature: String(config.softmaxTemperature ?? 1)
    };
    const preview = buildPreview(form);
    this.setData({ form, previewLabels: preview.labels, previewRows: preview.rows });
  },

  onInput(event: any) {
    const field = event.currentTarget.dataset.field as keyof FormData;
    const form = { ...this.data.form, [field]: event.detail.value };
    const preview = buildPreview(form);
    this.setData({ form, previewLabels: preview.labels, previewRows: preview.rows });
  },

  async save() {
    this.setData({ saving: true });
    try {
      await wx.cloud.callFunction({
        name: 'updateProbabilityConfig',
        data: {
          groupId: this.data.groupId,
          config: {
            preferencePlusDelta: percentToDelta(this.data.form.preferencePlusPercent, 0.5),
            preferenceMinusDelta: percentToDelta(this.data.form.preferenceMinusPercent, -0.5),
            eatenPenaltyDelta: percentToDelta(this.data.form.eatenPenaltyPercent, -2),
            eatenWithinDays: Number(this.data.form.eatenWithinDays || 2),
            softmaxTemperature: Number(this.data.form.softmaxTemperature || 1)
          }
        }
      });
      wx.showToast({ title: COPY.saved, icon: 'success' });
    } finally {
      this.setData({ saving: false });
    }
  }
});