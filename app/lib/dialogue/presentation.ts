const INTERNAL_EVIDENCE_ID = /\s*(?:\[\s*)?\bev\s*[-_ ]?\s*\d{3}\b(?:\s*\])?\s*/gi;

export function stripInternalEvidenceIds(text: string): string {
  return text
    .replace(INTERNAL_EVIDENCE_ID, " ")
    .replace(/[ \t]+([，。！？；：、])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
