/**
 * Data shapes shared by the "projection" cards: State and View.
 *
 * Both cards model the same thing — a DCB projection built from a query — and
 * differ only in metadata (name, colour, icon, validation). Keeping one set of
 * types here lets them share a single renderer/layout engine instead of
 * maintaining two near-identical copies.
 */

/** A typed field row used by both the `params` and `states` sections. */
export interface ProjectionField {
  name: string;
  type: string;
  isArray?: boolean;
  isRequired?: boolean;
  description?: string;
}

/**
 * A DCB tag reference inside a query item.
 *
 * `tag` is a tag already attached to an event field on the board and `field` is
 * the name of a param on this card. They render as `tagName:{fieldName}`. The
 * param type MUST match the type of the event field carrying the tag.
 */
export interface ProjectionQueryTag {
  tag: string;
  field: string;
}

/**
 * One DCB query item: a set of event `types` (matched with OR) and a set of
 * `tags` (all required). Query items are combined with OR.
 */
export interface ProjectionQueryItem {
  types: string[];
  tags: ProjectionQueryTag[];
  description?: string;
}

export interface ProjectionCardData {
  name: string;
  params?: ProjectionField[];
  queryItems?: ProjectionQueryItem[];
  states?: ProjectionField[];
  color?: string;
  description?: string;
}
