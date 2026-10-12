import { describe, it, expect, vi } from "vitest";
import { Container, Graphics } from "pixi.js";
import {
  CARD_HEADER_HEIGHT,
  CARD_ROW_HEIGHT,
  CARD_CORNER_RADIUS,
  CARD_DEFAULT_WIDTH,
  computeStandardCardSize,
  drawStandardCardFrame,
  renderStandardCardTitle,
  renderStandardCardFields,
  formatFieldNameLabel,
  renderHeaderDescBadge,
  getStandardCardSubSelect,
  getHeaderDescBadgeCenter,
  navigateStandardCardSubSelect,
  getStandardCardInlineEditTarget,
  measureCardTitleWidth,
  measureFieldRowWidth,
  measureStandardCardContentWidth,
  CARD_TITLE_RIGHT_RESERVE,
} from "./cardLayout";
import type { CanvasElement } from "@/types";

describe("cardLayout helpers", () => {
  describe("constants & computeStandardCardSize", () => {
    it("has correct standard geometry constants", () => {
      expect(CARD_HEADER_HEIGHT).toBe(32);
      expect(CARD_ROW_HEIGHT).toBe(28);
      expect(CARD_CORNER_RADIUS).toBe(8);
      expect(CARD_DEFAULT_WIDTH).toBe(220);
    });

    it("computes minimum height when 0 fields exist", () => {
      const size = computeStandardCardSize(0);
      expect(size.width).toBe(220);
      expect(size.height).toBe(32 + 28); // 1 content slot minimum
    });

    it("computes height based on field count", () => {
      const size = computeStandardCardSize(3);
      expect(size.width).toBe(220);
      expect(size.height).toBe(32 + 3 * 28); // 116
    });

    it("accepts custom width", () => {
      const size = computeStandardCardSize(2, 280);
      expect(size.width).toBe(280);
      expect(size.height).toBe(32 + 2 * 28);
    });
  });

  describe("content-width helpers", () => {
    it("measures a title with the header badge reserve", () => {
      // "Order Placed" = 12 chars * 13 * 0.6 = 93.6; + 12 left + badge reserve.
      expect(measureCardTitleWidth("OrderPlaced")).toBeCloseTo(
        12 + 93.6 + CARD_TITLE_RIGHT_RESERVE,
      );
    });

    it("reserves enough for the reference-shifted header badge", () => {
      // The badge moves from width-17 to width-40 when a reference corner badge
      // is present, so the reserve must clear the further-left position.
      expect(CARD_TITLE_RIGHT_RESERVE).toBeGreaterThanOrEqual(40 + 7);
    });

    it("measures a field row (name + gap + type + padding)", () => {
      // "Field" = 5 * 12 * 0.6 = 36; type "abcdefghijklmnopqrstuvwxyz"
      // -> "Abcdefghijklmnopqrstuvwxyz" = 26 * 11 * 0.6 = 171.6.
      expect(
        measureFieldRowWidth({ name: "field", type: "abcdefghijklmnopqrstuvwxyz" }),
      ).toBeCloseTo(12 + 36 + 30 + 171.6 + 12);
    });

    it("adds markers (required, validation, tag) to the row width", () => {
      const plain = measureFieldRowWidth({ name: "id", type: "string" });
      const marked = measureFieldRowWidth({
        name: "id",
        type: "string",
        isRequired: true,
        isTag: true,
        tag: "account",
      });
      expect(marked).toBeGreaterThan(plain);
    });

    it("never drops below the base width", () => {
      expect(measureStandardCardContentWidth("E", [], 220)).toBe(220);
    });

    it("grows past the base width for a long field row", () => {
      const width = measureStandardCardContentWidth(
        "E",
        [{ name: "field", type: "abcdefghijklmnopqrstuvwxyz" }],
        220,
      );
      expect(width).toBe(262); // ceil(12 + 36 + 30 + 171.6 + 12)
    });
  });

  describe("getStandardCardSubSelect", () => {
    it("returns null when clicking inside header (y <= 32)", () => {
      expect(getStandardCardSubSelect({ x: 50, y: 0 }, 3)).toBeNull();
      expect(getStandardCardSubSelect({ x: 50, y: 16 }, 3)).toBeNull();
      expect(getStandardCardSubSelect({ x: 50, y: 32 }, 3)).toBeNull();
    });

    it("maps y coordinate to corresponding field index", () => {
      // Row 0: 32 < y <= 60
      expect(getStandardCardSubSelect({ x: 50, y: 33 }, 3)).toBe(0);
      expect(getStandardCardSubSelect({ x: 50, y: 59 }, 3)).toBe(0);

      // Row 1: 60 < y <= 88
      expect(getStandardCardSubSelect({ x: 50, y: 61 }, 3)).toBe(1);

      // Row 2: 88 < y <= 116
      expect(getStandardCardSubSelect({ x: 50, y: 89 }, 3)).toBe(2);
    });

    it("returns null when clicking beyond field count", () => {
      expect(getStandardCardSubSelect({ x: 50, y: 150 }, 3)).toBeNull();
    });
  });

  describe("navigateStandardCardSubSelect", () => {
    it("returns null if field count is 0", () => {
      const result = navigateStandardCardSubSelect("el-1", { elementId: "el-1", fieldIndex: 0 }, "down", 0);
      expect(result).toBeNull();
    });

    it("moves down clamped to last index", () => {
      const res1 = navigateStandardCardSubSelect("el-1", { elementId: "el-1", fieldIndex: 0 }, "down", 3);
      expect(res1?.fieldIndex).toBe(1);

      const res2 = navigateStandardCardSubSelect("el-1", { elementId: "el-1", fieldIndex: 2 }, "down", 3);
      expect(res2?.fieldIndex).toBe(2);
    });

    it("moves up clamped to first index", () => {
      const res1 = navigateStandardCardSubSelect("el-1", { elementId: "el-1", fieldIndex: 2 }, "up", 3);
      expect(res1?.fieldIndex).toBe(1);

      const res2 = navigateStandardCardSubSelect("el-1", { elementId: "el-1", fieldIndex: 0 }, "up", 3);
      expect(res2?.fieldIndex).toBe(0);
    });
  });

  describe("getStandardCardInlineEditTarget", () => {
    const mockElement: CanvasElement<{ name: string; fields: { name: string; type: string }[] }> = {
      id: "card-1",
      type: "eventCard",
      x: 100,
      y: 200,
      width: 220,
      height: 88,
      data: {
        name: "OrderPlaced",
        fields: [
          { name: "orderId", type: "string" },
          { name: "amount", type: "float" },
        ],
      },
    };

    it("resolves header name edit target on header click", () => {
      const target = getStandardCardInlineEditTarget(mockElement, { x: 50, y: 15 });
      expect(target).not.toBeNull();
      expect(target?.elementId).toBe("card-1");
      expect(target?.initialValue).toBe("Order Placed");
      expect(target?.worldBounds).toEqual({
        x: 108,
        y: 204,
        width: 204,
        height: 24,
      });
    });

    it("resolves field name edit target on field row click", () => {
      // Row 0: y in [32, 60] -> e.g. y = 45
      const target = getStandardCardInlineEditTarget(mockElement, { x: 50, y: 45 });
      expect(target).not.toBeNull();
      expect(target?.elementId).toBe("card-1");
      expect(target?.initialValue).toBe("Order ID");
      expect(target?.worldBounds.y).toBe(200 + 32 + 0 * 28 + 2);
    });

    it("returns null when clicking below fields", () => {
      const target = getStandardCardInlineEditTarget(mockElement, { x: 50, y: 300 });
      expect(target).toBeNull();
    });

    it("shows verbatim/uppercased names when humanize is off", () => {
      const rawElement: CanvasElement<{ name: string; fields: { name: string }[] }> = {
        ...mockElement,
        data: { name: "OrderStatus", fields: [{ name: "in_progress" }] },
      };

      const verbatim = getStandardCardInlineEditTarget(rawElement, { x: 50, y: 45 }, "Enum", {
        humanizeFieldNames: false,
      });
      expect(verbatim?.initialValue).toBe("in_progress");

      // Editor mirrors the card display: verbatim, ALL CAPS.
      const upper = getStandardCardInlineEditTarget(rawElement, { x: 50, y: 45 }, "Enum", {
        humanizeFieldNames: false,
        uppercaseFieldNames: true,
      });
      expect(upper?.initialValue).toBe("IN_PROGRESS");
    });
  });

  describe("Rendering helpers", () => {
    it("draws card frame graphics without errors", () => {
      const g = new Graphics();
      expect(() => {
        drawStandardCardFrame(g, {
          width: 220,
          height: 88,
          headerColor: "#f97316",
          isDark: false,
          isSelected: true,
          selectedFieldIndex: 1,
          fieldCount: 2,
        });
      }).not.toThrow();
    });

    it("renders card title and fields in container without errors", () => {
      const container = new Container();
      expect(() => {
        renderStandardCardTitle(container, "OrderPlaced", "#f97316", 1);
        renderStandardCardFields(container, {
          elementId: "card-1",
          fields: [
            { name: "orderId", type: "string" },
            { name: "amount", type: "float" },
          ],
          selectedFieldIndex: 0,
          width: 220,
          isDark: false,
          textResolution: 1,
        });
      }).not.toThrow();
    });

    it("renders a validation badge for a field that declares rules", () => {
      const container = new Container();
      expect(() => {
        renderStandardCardFields(container, {
          elementId: "card-1",
          fields: [
            { name: "email", type: "string", validation: { pattern: "^.+@.+$" } },
            { name: "age", type: "integer", validation: { min: 0, max: 120 } },
            { name: "plain", type: "string" },
          ],
          selectedFieldIndex: -1,
          width: 260,
          isDark: false,
          textResolution: 1,
        });
      }).not.toThrow();
    });

    it("formats field labels per the humanize/uppercase display rules", () => {
      // Identifiers are humanized by default.
      expect(formatFieldNameLabel("orderId")).toBe("Order ID");
      // Enum-style: verbatim (underscores kept) ...
      expect(formatFieldNameLabel("in_progress", { humanize: false })).toBe("in_progress");
      // ... and uppercased for display only.
      expect(
        formatFieldNameLabel("in_progress", { humanize: false, uppercase: true }),
      ).toBe("IN_PROGRESS");
      // Missing names never throw.
      expect(formatFieldNameLabel(undefined, { humanize: false })).toBe("");
    });
  });

  describe("description badges", () => {
    const card: CanvasElement<{ description?: string; fields?: { name: string; type: string; description?: string }[] }> = {
      id: "card-1",
      type: "eventCard",
      x: 0,
      y: 0,
      width: 220,
      height: 88,
      data: {
        description: "Card level note",
        fields: [
          { name: "orderId", type: "string", description: "Row note" },
          { name: "amount", type: "float" },
        ],
      },
    };

    it("computes the header badge center, offset for reference cards", () => {
      expect(getHeaderDescBadgeCenter(220, false)).toEqual({ x: 203, y: 16 });
      expect(getHeaderDescBadgeCenter(220, true)).toEqual({ x: 180, y: 16 });
    });

    it("renders the header badge without throwing (DOM-free)", () => {
      const container = new Container();
      expect(() =>
        renderHeaderDescBadge(container, {
          elementId: card.id,
          width: 220,
          isDark: false,
          isSelected: true,
          hasDescription: false,
          hasReference: false,
          textResolution: 1,
        }),
      ).not.toThrow();
    });
  });
});
