export type ParsedDianpingShare = {
  name: string;
  address: string;
  sourceUrl: string;
};

function cleanLine(line: string): string {
  return line.trim().replace(/^\u3010|\u3011$/g, '').trim();
}

function isUrl(line: string): boolean {
  return /^https?:\/\//.test(line);
}

function isNoiseLine(line: string): boolean {
  if (!line || isUrl(line)) return true;
  if (/\u5927\u4f17\u70b9\u8bc4|\u70b9\u51fb|\u590d\u5236|\u63a8\u8350|\u5206\u4eab|\u6253\u5f00|\u67e5\u770b|\u4eba\u5747/.test(line)) return true;
  if (/^[\u2605\u2606\u661f\s\d.]+$/.test(line)) return true;
  if (/^\uffe5?\d+(?:\.\d+)?\s*\/\s*\u4eba/.test(line)) return true;
  if (/^\d+(?:\.\d+)?\s*\u5206?$/.test(line)) return true;
  return false;
}

function scoreAddressLike(line: string): number {
  let score = 0;
  if (/(?:\u5730\u5740|\u5546\u6237\u5730\u5740|\u4f4d\u7f6e)[:\uff1a]/.test(line)) score += 5;
  if (/(?:\u7701|\u5e02|\u533a|\u53bf|\u9547|\u4e61|\u6751)/.test(line)) score += 2;
  if (/(?:\u8def|\u8857|\u9053|\u5df7|\u5f04|\u53f7|\u697c|\u5c42|\u5ea7|\u95e8|\u5e97|\u5e7f\u573a|\u5546\u573a|\u8d2d\u7269\u4e2d\u5fc3)/.test(line)) score += 2;
  if (/\d/.test(line)) score += 1;
  if (/[()\uff08\uff09]/.test(line) && line.length < 28) score -= 2;
  return score;
}

function stripAddressLabel(line: string): string {
  return line.replace(/^(?:\u5730\u5740|\u5546\u6237\u5730\u5740|\u4f4d\u7f6e)[:\uff1a]\s*/, '').trim();
}

function isLocationFallback(line: string): boolean {
  if (isNoiseLine(line)) return false;
  return /[\\/\u3001]|\u5546\u5708|\u9644\u8fd1|\u5468\u8fb9|\u5730\u94c1|\u5546\u573a|\u8d2d\u7269\u4e2d\u5fc3/.test(line);
}

function extractBracketName(text: string): string {
  const matches = Array.from(text.matchAll(/\u3010([^\u3011\r\n]{2,80})\u3011/g));
  for (const match of matches) {
    const candidate = cleanLine(match[1] || '');
    if (!isNoiseLine(candidate)) return candidate;
  }
  return '';
}

export function parseDianpingShareText(text: string): ParsedDianpingShare {
  const rawLines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const lines = rawLines.map(cleanLine).filter(Boolean);
  const sourceUrl = text.match(/https?:\/\/[^\s]+/)?.[0] || '';

  const explicitAddress = text.match(/(?:\u5730\u5740|\u5546\u6237\u5730\u5740|\u4f4d\u7f6e)[:\uff1a]\s*([^\n\r]+)/)?.[1]?.trim() || '';
  const bracketName = extractBracketName(text);
  const name = bracketName || lines.find((line) => !isNoiseLine(line) && scoreAddressLike(line) < 4) || '';

  const addressCandidates = lines
    .filter((line) => line !== name && !isNoiseLine(line))
    .map((line) => ({ line: stripAddressLabel(line), score: scoreAddressLike(line) }))
    .filter((item) => item.score >= 3)
    .sort((a, b) => b.score - a.score);
  const fallbackLocation = lines.find((line) => line !== name && isLocationFallback(line)) || '';
  const address = explicitAddress || addressCandidates[0]?.line || fallbackLocation;

  return {
    name,
    address,
    sourceUrl
  };
}