export const ACTION_TYPES = [
  "reframe",
  "agree_extend",
  "challenge",
  "contextualize",
  "concretize",
  "admit_limit",
  "ask_back",
] as const;

export const EPISTEMIC_STATUSES = ["grounded", "grounded_with_inference", "uncertain"] as const;
export const EVIDENCE_USE_TYPES = ["paraphrase", "inference", "boundary"] as const;
export const DISCUSSION_STAGES = ["define", "evidence", "conflict", "today", "unfinished"] as const;

export type ActionType = (typeof ACTION_TYPES)[number];
export type EpistemicStatus = (typeof EPISTEMIC_STATUSES)[number];
export type EvidenceUseType = (typeof EVIDENCE_USE_TYPES)[number];
export type DiscussionStage = (typeof DISCUSSION_STAGES)[number];
export type DialogueLanguage = "zh" | "en";
export type PersonaMode = "historical_interpretation" | "living_public_view";

export interface EvidenceRecord {
  id: string;
  claim: string;
  status: "verified" | "interpreted" | "speculative" | string;
  evidence_type: string;
  source_title: string;
  source_creator: string;
  source_date: string;
  source_url: string;
  locator: string;
  excerpt: string;
  notes: string;
  confidence: "high" | "medium" | "low" | string;
}

export interface PersonaRelation {
  id: string;
  target: string;
  relation_type: string;
  stance: string;
  summary: string;
  evidence_ids: string[];
  historical_directness: string;
}

export interface PersonaRuntimeProfile {
  id: string;
  displayName: string;
  originalName: string;
  personaMode: PersonaMode;
  sourceUpdatedAt: string;
  discussionRole: string;
  keywords: string[];
  preferredActions: ActionType[];
  anchorEvidenceIds: string[];
  contemporaryEvidenceIds: string[];
  personaMarkdown: string;
  evidence: EvidenceRecord[];
  relations: PersonaRelation[];
}

export interface DialogueTurn {
  turn_id: string;
  speaker_id: string;
  reply_to: {
    turn_id: string | null;
    speaker_id: string;
    claim: string;
  };
  action_type: ActionType;
  speech_segments: string[];
  evidence_uses: Array<{
    evidence_id: string;
    use_type: EvidenceUseType;
    supports: string;
  }>;
  epistemic_status: EpistemicStatus;
  uncertainty: string;
  unresolved_tension: string;
  suggested_next_speakers: string[];
}

export interface DialogueRequest {
  question: string;
  castIds: string[];
  history: DialogueTurn[];
  stage: DiscussionStage;
  userContribution: boolean;
  language: DialogueLanguage;
}

export interface SpeakerScore {
  speakerId: string;
  total: number;
  reasons: string[];
}

export interface SpeakerSelection {
  speakerId: string;
  allowedActions: ActionType[];
  scores: SpeakerScore[];
}

export const DIALOGUE_TURN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    turn_id: { type: "string" },
    speaker_id: { type: "string" },
    reply_to: {
      type: "object",
      additionalProperties: false,
      properties: {
        turn_id: { type: ["string", "null"] },
        speaker_id: { type: "string" },
        claim: { type: "string" },
      },
      required: ["turn_id", "speaker_id", "claim"],
    },
    action_type: { type: "string", enum: ACTION_TYPES },
    speech_segments: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      // The provider schema constrains shape only. A maxLength here makes
      // some compatible providers cut a sentence mid-word. The semantic
      // validator applies language-aware limits before browser display.
      items: { type: "string", minLength: 4 },
    },
    evidence_uses: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          evidence_id: { type: "string" },
          use_type: { type: "string", enum: EVIDENCE_USE_TYPES },
          supports: { type: "string" },
        },
        required: ["evidence_id", "use_type", "supports"],
      },
    },
    epistemic_status: { type: "string", enum: EPISTEMIC_STATUSES },
    uncertainty: { type: "string" },
    unresolved_tension: { type: "string" },
    suggested_next_speakers: {
      type: "array",
      maxItems: 2,
      items: { type: "string" },
    },
  },
  required: [
    "turn_id",
    "speaker_id",
    "reply_to",
    "action_type",
    "speech_segments",
    "evidence_uses",
    "epistemic_status",
    "uncertainty",
    "unresolved_tension",
    "suggested_next_speakers",
  ],
} as const;

export const DIALOGUE_TEXT_FORMAT = {
  type: "json_schema",
  name: "unfinished_table_dialogue_turn",
  strict: true,
  schema: DIALOGUE_TURN_SCHEMA,
} as const;
