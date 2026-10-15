/**
 * Data shapes shared by the "action field" cards: Command and Query.
 *
 * Both render an action token plus two field sections (a primary input/param
 * section and a response section) and differ only in naming, colour and whether
 * a legacy `fields` alias is accepted. One engine drives both.
 */
import type { FieldValidation } from "@/utils/fieldValidation";

export interface ActionField {
  name: string;
  type: string;
  isArray?: boolean;
  isRequired?: boolean;
  description?: string;
  validation?: FieldValidation;
}

export interface ActionCardData {
  name: string;
  /** RBAC permission token this card declares (e.g. `sales:placeOrder`). */
  action?: string;
  /** Primary section for Command. */
  inputs?: ActionField[];
  /** Primary section for Query. */
  params?: ActionField[];
  responses?: ActionField[];
  color?: string;
  description?: string;
  /** Backward-compatibility alias for `inputs` (Command only). */
  fields?: ActionField[];
}
