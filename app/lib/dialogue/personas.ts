import personaArtifact from "./persona-runtime.json" with { type: "json" };
import type { PersonaRuntimeProfile } from "./contracts.ts";

interface PersonaArtifact {
  schemaVersion: string;
  sourceRoot: string;
  profiles: PersonaRuntimeProfile[];
}

const artifact = personaArtifact as PersonaArtifact;
const profileMap = new Map(artifact.profiles.map((profile) => [profile.id, profile]));

export const PERSONA_SCHEMA_VERSION = artifact.schemaVersion;
export const PERSONA_SOURCE_ROOT = artifact.sourceRoot;
export const PERSONAS = artifact.profiles;

export function getPersona(id: string): PersonaRuntimeProfile {
  const profile = profileMap.get(id);
  if (!profile) throw new Error(`Unknown persona: ${id}`);
  return profile;
}

export function hasPersona(id: string): boolean {
  return profileMap.has(id);
}
