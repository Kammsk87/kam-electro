import type { FoundationModule } from "@personaos/types";

export const serviceManifest: FoundationModule[] = [
  "identity",
  "workspace",
  "media",
  "ai",
  "content",
  "publishing",
  "analytics",
  "planner",
  "memory",
  "research",
  "notifications",
  "settings"
];

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}
