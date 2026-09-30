import type { StormKind } from "@/types";

/**
 * Left-to-right lane order for an event-storming board. BDD (Given/When/Then)
 * cards are intentionally absent: they belong to scenario flows, so
 * `arrangeStormLanes` leaves them where the user placed them.
 */
export const STORM_LANE_ORDER: StormKind[] = [
  "actor",
  "command",
  "event",
  "external",
  "query",
  "state",
  "constraint",
];

export const STORM_LANE_LABELS: Record<StormKind, string> = {
  actor: "Actor",
  command: "Command",
  event: "Event",
  external: "External",
  query: "Query",
  state: "State",
  constraint: "Constraint",
  bdd: "Given/When/Then",
};

export interface StormLaneCard {
  id: string;
  kind: StormKind;
  width: number;
  height: number;
}

export interface StormLanePosition {
  id: string;
  x: number;
  y: number;
  lane: StormKind;
}

export interface StormLaneLayoutOptions {
  /** Horizontal gap between lanes (px). */
  laneGap?: number;
  /** Vertical gap between cards within a lane (px). */
  rowGap?: number;
  /** Top-left anchor of the board. */
  origin?: { x: number; y: number };
}

/**
 * Places event-storming cards into vertical lanes ordered left-to-right by
 * kind (Actor -> Command -> Event -> External -> Query -> State -> Constraint),
 * stacking cards within each lane.
 */
export function arrangeStormLanes(
  cards: StormLaneCard[],
  options: StormLaneLayoutOptions = {},
): StormLanePosition[] {
  const laneGap = options.laneGap ?? 80;
  const rowGap = options.rowGap ?? 40;
  const origin = options.origin ?? { x: 0, y: 0 };

  const byLane = new Map<StormKind, StormLaneCard[]>();
  for (const kind of STORM_LANE_ORDER) byLane.set(kind, []);
  for (const card of cards) {
    const lane = byLane.get(card.kind);
    if (lane) lane.push(card);
    else byLane.set(card.kind, [card]);
  }

  const positions: StormLanePosition[] = [];
  let x = origin.x;

  for (const kind of STORM_LANE_ORDER) {
    const laneCards = byLane.get(kind) ?? [];
    if (laneCards.length === 0) continue;

    const laneWidth = Math.max(...laneCards.map((c) => c.width));
    let y = origin.y;
    for (const card of laneCards) {
      positions.push({ id: card.id, x, y, lane: kind });
      y += card.height + rowGap;
    }
    x += laneWidth + laneGap;
  }

  return positions;
}

export interface VerticalSliceLayoutOptions {
  rowGap?: number;
  colGap?: number;
  origin?: { x: number; y: number };
}

/**
 * Arranges cards in a Vertical Slice from top to bottom:
 * - Layer 0 (Top): Command, Query
 * - Layer 1 (Middle): Constraint — and State when the slice has no read-side
 *   Constraint
 * - Layer 2 (Bottom): Event, External — or State when a read-side Constraint
 *   occupies layer 1
 * - Layer 3: Actor, etc.
 *
 * A Constraint is treated as read-side (sitting between Query and State) when
 * the batch models a read path — it contains a State and no Command. Otherwise
 * it is a write-side Constraint, as before.
 *
 * Cards within each layer are arranged horizontally with colGap and centered
 * relative to the widest layer.
 */
export function arrangeVerticalSlice(
  cards: StormLaneCard[],
  options: VerticalSliceLayoutOptions = {},
): StormLanePosition[] {
  const rowGap = options.rowGap ?? 60;
  const colGap = options.colGap ?? 40;
  const origin = options.origin ?? { x: 0, y: 0 };

  const hasCommand = cards.some((c) => c.kind === "command");
  const hasState = cards.some((c) => c.kind === "state");
  const hasConstraint = cards.some((c) => c.kind === "constraint");
  // Read-side constraints push State (and everything below) down one layer.
  const readSideConstraint = hasState && !hasCommand && hasConstraint;
  const offset = readSideConstraint ? 1 : 0;

  const layers: StormLaneCard[][] = Array.from(
    { length: 4 + offset },
    (): StormLaneCard[] => [],
  );
  for (const card of cards) {
    if (card.kind === "command" || card.kind === "query") {
      layers[0].push(card);
    } else if (card.kind === "constraint") {
      layers[1].push(card);
    } else if (card.kind === "state") {
      layers[1 + offset].push(card);
    } else if (card.kind === "event" || card.kind === "external") {
      layers[2 + offset].push(card);
    } else {
      layers[3 + offset].push(card);
    }
  }

  const activeLayers = layers.filter((l) => l.length > 0);
  if (activeLayers.length === 0) return [];

  const layerWidths = activeLayers.map((layer) =>
    layer.reduce((sum, c, i) => sum + c.width + (i > 0 ? colGap : 0), 0),
  );
  const maxWidth = Math.max(...layerWidths);

  const positions: StormLanePosition[] = [];
  let y = origin.y;

  for (let l = 0; l < activeLayers.length; l++) {
    const layer = activeLayers[l];
    const width = layerWidths[l];
    const height = Math.max(...layer.map((c) => c.height));
    let x = origin.x + (maxWidth - width) / 2;

    for (const card of layer) {
      positions.push({
        id: card.id,
        x: Math.round(x),
        y: Math.round(y),
        lane: card.kind,
      });
      x += card.width + colGap;
    }

    y += height + rowGap;
  }

  return positions;
}

