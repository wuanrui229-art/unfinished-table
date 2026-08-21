import type { DialogueTurn, EvidenceRecord, EvidenceUseType, PersonaMode } from "./contracts.ts";
import { stripInternalEvidenceIds } from "./presentation.ts";

export type PublicCitation = {
  kind: "历史依据" | "公开观点" | "当代推演" | "边界说明";
  title: string;
  creator: string;
  date: string;
  url: string;
  locator: string;
  supports: string;
};

function citationKind(useType: EvidenceUseType, personaMode: PersonaMode): PublicCitation["kind"] {
  if (useType === "inference") return "当代推演";
  if (useType === "boundary") return "边界说明";
  return personaMode === "living_public_view" ? "公开观点" : "历史依据";
}

function cleanPublicText(value: string): string {
  const cleaned = stripInternalEvidenceIds(value).replace(/^(?:至|到|与|及|、|，|；|\s)+$/g, "").trim();
  return cleaned;
}

export function buildPublicCitations(
  turn: DialogueTurn,
  evidence: EvidenceRecord[],
  personaMode: PersonaMode = "historical_interpretation",
): PublicCitation[] {
  const records = new Map(evidence.map((record) => [record.id, record]));

  return turn.evidence_uses.flatMap((use) => {
    const record = records.get(use.evidence_id);
    if (!record) return [];
    return [{
      kind: citationKind(use.use_type, personaMode),
      title: record.source_title,
      creator: record.source_creator,
      date: record.source_date,
      url: record.source_url,
      locator: cleanPublicText(record.locator),
      supports: cleanPublicText(use.supports),
    }];
  });
}
