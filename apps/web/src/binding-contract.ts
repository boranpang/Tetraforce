import type { CharacterBindingState } from "./server/binding-service";

export type BrowserBindingState = CharacterBindingState | { status: "unavailable" };
export type IncompleteBindingStatus = Exclude<BrowserBindingState["status"], "active">;
