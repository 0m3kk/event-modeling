/**
 * Domain membership: turns the optional `domain` argument of a create/update
 * call into concrete `domainId` membership for a card.
 */
import type { CanvasElement } from "@/types";
import type { ValidationIssue } from "@/tools";
import { getElementName, nameKey } from "@/utils/naming";
import { DOMAIN_TYPE, isNestableInDomain, type DomainElement } from "@/tools/domainCard/layout";

export interface DomainPlacement {
  /** True only when the call actually carried a `domain` argument. */
  requested: boolean;
  domainId?: string;
  error?: { message: string; issues: ValidationIssue[] };
}

const DOMAIN_NOT_REQUESTED: DomainPlacement = { requested: false };

/**
 * `domain` is the Domain's name; an explicit empty `domain` detaches the card
 * from any Domain.
 *
 * Domains nest no further, so a Domain card itself can never be placed inside
 * another one. A card that is being placed into a Slice lane is handled
 * separately (lane and domain membership are mutually exclusive).
 */
export function resolveDomainMembership(
  elements: CanvasElement[],
  cardType: string,
  args: any,
): DomainPlacement {
  if (!args || typeof args !== "object" || !("domain" in args)) return DOMAIN_NOT_REQUESTED;

  const domainName = typeof args.domain === "string" ? args.domain.trim() : "";
  if (!domainName) return { requested: true, domainId: undefined };

  const issue = (code: string, message: string): DomainPlacement => ({
    requested: true,
    error: { message, issues: [{ path: "domain", code, message }] },
  });

  if (!isNestableInDomain(cardType)) {
    return issue(
      "domain_ineligible_card",
      "A Domain cannot be placed inside another Domain (domains do not nest).",
    );
  }

  const domain = elements.find(
    (el) => el.type === DOMAIN_TYPE && nameKey(getElementName(el) ?? "") === nameKey(domainName),
  ) as DomainElement | undefined;
  if (!domain) {
    return issue(
      "domain_not_found",
      `No Domain named "${domainName}" exists on the board. Create it first with create_domain_card or use get_canvas_overview to list domains.`,
    );
  }

  return { requested: true, domainId: domain.id };
}
