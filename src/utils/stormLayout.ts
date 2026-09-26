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
  "notify",
  "query",
  "state",
  "constraint",
];

export const STORM_LANE_LABELS: Record<StormKind, string> = {
  actor: "Actor",
  command: "Command",
  event: "Event",
  notify: "Notify",
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
 * kind (Actor -> Command -> Event -> Notify -> Query -> State -> Constraint),
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
