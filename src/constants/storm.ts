import type { BddPhase, BddStepRef, StormKind } from "@/types";

/**
 * Event Storming (Command / Event / State / …) constants.
 */

/** Header/accent color per kind. BDD cards override this with their phase color. */
export const STORM_KIND_COLORS: Record<StormKind, string> = {
  command: "#1d4ed8", // blue
  event: "#ea580c", // orange
  actor: "#db2777", // pink
  state: "#7c3aed", // violet
  constraint: "#0f766e", // teal
  query: "#4338ca", // indigo
  bdd: "#0284c7", // sky (default Given) — replaced by the phase color
};

/** Subdued/deeper header colors for dark mode to prevent harsh glare */
export const STORM_KIND_DARK_COLORS: Record<StormKind, string> = {
  command: "#1e40af", // blue 800
  event: "#9a3412", // orange 800
  actor: "#9d174d", // pink 800
  state: "#5b21b6", // violet 800
  constraint: "#115e59", // teal 800
  query: "#3730a3", // indigo 800
  bdd: "#075985", // sky 800
};

/** Display label per kind */
export const STORM_KIND_LABELS: Record<StormKind, string> = {
  command: "Command",
  event: "Event",
  actor: "Actor",
  state: "State",
  constraint: "Constraint",
  query: "Query",
  bdd: "Given/When/Then",
};

/** BDD Phase badge colors (Given, When, Then) */
export const STORM_PHASE_COLORS: Record<BddPhase, string> = {
  given: "#0284c7", // Sky 600
  when: "#d97706", // Amber 600
  then: "#059669", // Emerald 600
};

/** BDD Phase badge colors in dark mode */
export const STORM_PHASE_DARK_COLORS: Record<BddPhase, string> = {
  given: "#075985", // Sky 800
  when: "#92400e", // Amber 800
  then: "#065f46", // Emerald 800
};

export const STORM_PHASE_BG_COLORS: Record<BddPhase, string> = {
  given: "rgba(224, 242, 254, 0.95)", // Sky 100
  when: "rgba(254, 243, 199, 0.95)", // Amber 100
  then: "rgba(209, 250, 229, 0.95)", // Emerald 100
};

export const STORM_PHASE_LABELS: Record<BddPhase, string> = {
  given: "GIVEN",
  when: "WHEN",
  then: "THEN",
};

/**
 * Default card title per BDD phase. BDD cards are titled by their step, so a
 * freshly created / phase-switched card reads "Given", "When" or "Then".
 */
export const STORM_PHASE_TITLES: Record<BddPhase, string> = {
  given: "Given",
  when: "When",
  then: "Then",
};

/**
 * Kinds whose Given/When/Then step is their identity. BDD is the only such
 * kind: it always carries a phase, and its options bar switches the phase
 * instead of the (fixed) kind.
 */
export const STORM_PHASE_KINDS: readonly StormKind[] = ["bdd"];

/** Whether a kind carries a Given/When/Then phase as its identity */
export function stormHasPhase(kind: StormKind): boolean {
  return STORM_PHASE_KINDS.includes(kind);
}

/**
 * Header/accent color of a card.
 *
 * BDD cards take the color of their phase (Given sky / When amber / Then
 * emerald) so the step is readable at a glance; every other kind uses its
 * fixed kind color. Falls back to the kind color when a BDD card has no phase.
 */
export function stormAccentColor(
  kind: StormKind,
  phase?: BddPhase,
  isDark: boolean = false,
): string {
  if (isDark) {
    if (stormHasPhase(kind) && phase) {
      return STORM_PHASE_DARK_COLORS[phase] ?? STORM_KIND_DARK_COLORS[kind];
    }
    return STORM_KIND_DARK_COLORS[kind];
  }
  if (stormHasPhase(kind) && phase) {
    return STORM_PHASE_COLORS[phase] ?? STORM_KIND_COLORS[kind];
  }
  return STORM_KIND_COLORS[kind];
}

/**
 * Default card title for a storm card: BDD cards use their phase step, every
 * other kind uses its kind label (e.g. "Command"). Used to seed a real,
 * board-unique name on creation so two cards never share a visible title.
 */
export function stormDefaultTitle(kind: StormKind, phase?: BddPhase): string {
  if (stormHasPhase(kind)) return STORM_PHASE_TITLES[phase ?? "given"];
  return STORM_KIND_LABELS[kind];
}

/**
 * Kinds whose body is a list of Given/When/Then scenario steps instead of
 * generic field rows. BDD is the only such kind: a step is a named
 * Event/Command/Query/State/Error carrying concrete example payload values.
 */
export const STORM_STEP_KINDS: readonly StormKind[] = ["bdd"];

/** Whether a kind renders the BDD scenario step list instead of fields */
export function stormHasSteps(kind: StormKind): boolean {
  return STORM_STEP_KINDS.includes(kind);
}

/** Display label per scenario step ref */
export const BDD_STEP_REF_LABELS: Record<BddStepRef, string> = {
  event: "Event",
  command: "Command",
  query: "Query",
  state: "State",
  error: "Error",
};

/** Accent color per scenario step ref (reuses kind colors, adds Error). */
export const BDD_STEP_REF_COLORS: Record<BddStepRef, string> = {
  event: STORM_KIND_COLORS.event,
  command: STORM_KIND_COLORS.command,
  query: STORM_KIND_COLORS.query,
  state: STORM_KIND_COLORS.state,
  error: "#dc2626", // Red 600
};

/**
 * Step refs a phase may introduce. A Given card only lists Events; a When card
 * captures the Command or Query under test; a Then card asserts outcomes.
 */
const BDD_PHASE_REFS: Record<BddPhase, readonly BddStepRef[]> = {
  given: ["event"],
  when: ["command", "query"],
  then: ["event", "state", "error"],
};

/** The step refs allowed on a card's phase (fallback: Given events). */
export function bddRefsForPhase(phase?: BddPhase): readonly BddStepRef[] {
  return BDD_PHASE_REFS[phase ?? "given"];
}

/** The ref a freshly added step defaults to for a card's phase. */
export function bddDefaultRefForPhase(phase?: BddPhase): BddStepRef {
  return bddRefsForPhase(phase)[0] ?? "event";
}

/**
 * Kinds whose field rows render a tag pill. Event and State tags
 * feed DCB matching.
 */
export const STORM_TAGGABLE_KINDS: readonly StormKind[] = [
  "event",
  "state",
];

/** Whether a kind renders a tag pill on its field rows */
export function stormHasTags(kind: StormKind): boolean {
  return STORM_TAGGABLE_KINDS.includes(kind);
}

/** Kinds without type zones on field rows (Actor names permissions) */
export const STORM_TYPELESS_KINDS: readonly StormKind[] = ["actor"];

export function stormHasFieldTypes(kind: StormKind): boolean {
  return !STORM_TYPELESS_KINDS.includes(kind);
}

/**
 * Kinds that render a field list. Actor is fieldless (role permissions);
 * Constraint references a State and lists business rules rather than field rows.
 */
export function stormHasFields(kind: StormKind): boolean {
  return kind !== "actor" && kind !== "constraint";
}

/**
 * State cards split their fields into two distinct bands:
 * - INPUT params (`inputFields`): the tags a Query Item can filter on
 * - OUTPUT fields (`outputFields`): what rehydrating the matching events yields
 * The split keeps a card's input and output from blurring together.
 */
export const STORM_INPUT_OUTPUT_KINDS: readonly StormKind[] = [
  "state",
];

/** Whether a kind carries the INPUT param list (State) */
export function stormHasInputFields(kind: StormKind): boolean {
  return STORM_INPUT_OUTPUT_KINDS.includes(kind);
}

/** Whether a kind carries the OUTPUT (rehydrated) field list (State) */
export function stormHasOutputFields(kind: StormKind): boolean {
  return STORM_INPUT_OUTPUT_KINDS.includes(kind);
}

/**
 * Kinds with DCB Query Items ("Related Events"): a State card builds its
 * consistency boundary from events.
 */
export const STORM_QUERY_ITEM_KINDS: readonly StormKind[] = [
  "state",
];

/** Whether a kind renders the DCB Query Items section */
export function stormHasQueryItems(kind: StormKind): boolean {
  return STORM_QUERY_ITEM_KINDS.includes(kind);
}

/**
 * Kinds that carry a RESPONSE section (the output payload below their
 * input band):
 * - Query — the read-model output returned to the caller
 * - Command — the response payload the handler returns
 */
export const STORM_RESPONSE_KINDS: readonly StormKind[] = ["query", "command"];

/** Whether a kind renders the RESPONSE section below its payload/params */
export function stormHasResponseFields(kind: StormKind): boolean {
  return STORM_RESPONSE_KINDS.includes(kind);
}

/**
 * Kinds whose primary field list gets an explicit "PARAMS" label above it.
 * Query only: a Command's primary list reads as its payload and stays
 * unlabeled, even though a Command now also carries a RESPONSE section.
 */
export const STORM_PARAMS_SECTION_KINDS: readonly StormKind[] = ["query"];

export function stormHasParamsSection(kind: StormKind): boolean {
  return STORM_PARAMS_SECTION_KINDS.includes(kind);
}

/** Kinds that can carry an authorization action */
export const STORM_ACTION_KINDS: readonly StormKind[] = ["command", "query"];

export function stormHasAction(kind: StormKind): boolean {
  return STORM_ACTION_KINDS.includes(kind);
}

/**
 * Kinds whose primary field list is user input and can therefore carry
 * validation: a Command's payload fields and a Query's params. Projections
 * (State/Constraint), Events, responses and the Actor chip describe domain
 * data rather than accepting input, so they never validate.
 */
export const STORM_VALIDATION_KINDS: readonly StormKind[] = ["command", "query"];

/** Whether a kind's primary fields may carry input validation */
export function stormHasValidation(kind: StormKind): boolean {
  return STORM_VALIDATION_KINDS.includes(kind);
}

/**
 * Well-known string formats offered as validation, using the JSON Schema
 * format vocabulary so the exported schema stays portable.
 */
export const STORM_VALIDATION_FORMATS = [
  "email",
  "uuid",
  "uri",
  "hostname",
  "ipv4",
  "ipv6",
  "date",
  "date-time",
  "time",
] as const;

export type StormValidationFormat = (typeof STORM_VALIDATION_FORMATS)[number];

/** Human labels for the format options (format metadata is case-sensitive). */
export const STORM_VALIDATION_FORMAT_LABELS: Record<string, string> = {
  email: "Email",
  uuid: "UUID",
  uri: "URI / URL",
  hostname: "Hostname",
  ipv4: "IPv4",
  ipv6: "IPv6",
  date: "Date (YYYY-MM-DD)",
  "date-time": "Date-time (ISO 8601)",
  time: "Time (HH:MM:SS)",
};

export const STORM_LAYOUT = {
  cardWidth: 260,
  minWidth: 220,
  headerHeight: 38,
  rowHeight: 28,
  padding: 12,
  borderRadius: 8,
  typeZoneGap: 6,
  tagHeight: 18,
};
