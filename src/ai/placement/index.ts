/** Placement resolution for AI tool calls (slice / group / domain membership). */
export { resolveSliceMembership, type SlicePlacement } from "./slice";
export { resolveDomainMembership, type DomainPlacement } from "./domain";
export { resolveGroupMembership, type GroupPlacement } from "./group";
export {
  AI_PLACEMENT_GAP,
  applyCreatedPlacement,
  containerContentOrigin,
  resolveCreatedPlacement,
} from "./created";
