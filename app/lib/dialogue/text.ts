const MODERN_TOPIC_PATTERN = /(?:\bai\b|人工智能|算法|机器学习|大模型|产品经理|互联网|平台|招聘|职场|薪资|当代|今天|现代|未来|社交媒体|气候变化|algorithm|machine learning|large language model|product manager|internet|platform|hiring|workplace|salary|technology|modern tech|modern|today|future|social media|climate change)/i;

export function normalizeText(value: string): string {
  return value.toLocaleLowerCase("zh-CN").replace(/\s+/g, " ").trim();
}

export function isModernTopic(value: string): boolean {
  return MODERN_TOPIC_PATTERN.test(value);
}

export function countKeywordHits(text: string, keywords: string[]): number {
  const normalized = normalizeText(text);
  return keywords.reduce((total, keyword) => {
    const target = normalizeText(keyword);
    return total + (target && normalized.includes(target) ? 1 : 0);
  }, 0);
}

export function lexicalTerms(value: string): Set<string> {
  const normalized = normalizeText(value);
  const terms = new Set<string>();

  for (const token of normalized.match(/[a-z0-9][a-z0-9_-]{1,}/g) ?? []) terms.add(token);

  const cjkRuns = normalized.match(/[\u3400-\u9fff]{2,}/g) ?? [];
  for (const run of cjkRuns) {
    for (let index = 0; index < run.length - 1; index += 1) terms.add(run.slice(index, index + 2));
  }

  return terms;
}

export function lexicalOverlap(left: string, right: string): number {
  const leftTerms = lexicalTerms(left);
  const rightTerms = lexicalTerms(right);
  let overlap = 0;
  for (const term of leftTerms) if (rightTerms.has(term)) overlap += 1;
  return overlap;
}

export function characterLength(value: string): number {
  return Array.from(value.trim()).length;
}
