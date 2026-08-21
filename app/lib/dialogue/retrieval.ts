import type { EvidenceRecord, PersonaRuntimeProfile } from "./contracts.ts";
import { isModernTopic, lexicalOverlap } from "./text.ts";

interface RankedEvidence {
  record: EvidenceRecord;
  score: number;
  sourceIndex: number;
}

function scoreEvidence(profile: PersonaRuntimeProfile, record: EvidenceRecord, query: string): number {
  const modern = isModernTopic(query);
  let score = lexicalOverlap(query, `${record.claim} ${record.notes} ${record.source_title}`) * 2;

  if (record.status === "verified") score += 2;
  if (record.status === "interpreted") score += 1;
  if (profile.anchorEvidenceIds.includes(record.id)) score += 1;

  if (modern && profile.contemporaryEvidenceIds.includes(record.id)) score += 12;
  if (!modern && record.status === "speculative") score -= 10;
  if (modern && record.status !== "speculative") score += 1;

  return score;
}

export function retrieveEvidence(
  profile: PersonaRuntimeProfile,
  query: string,
  limit = 5,
): EvidenceRecord[] {
  const ranked: RankedEvidence[] = profile.evidence
    .map((record, sourceIndex) => ({ record, sourceIndex, score: scoreEvidence(profile, record, query) }))
    .sort((left, right) => right.score - left.score || left.sourceIndex - right.sourceIndex);

  const selected: EvidenceRecord[] = [];
  const add = (record: EvidenceRecord | undefined) => {
    if (record && !selected.some((item) => item.id === record.id) && selected.length < limit) selected.push(record);
  };

  if (isModernTopic(query)) {
    for (const id of profile.contemporaryEvidenceIds) add(profile.evidence.find((record) => record.id === id));
    for (const id of profile.anchorEvidenceIds.slice(0, 2)) add(profile.evidence.find((record) => record.id === id));
  }

  for (const item of ranked) add(item.record);
  return selected;
}
