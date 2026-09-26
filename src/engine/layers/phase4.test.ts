import { describe, it, expect } from "vitest";
import { computeGroupBounds, getGroupAt } from "./GroupLayer";
import {
  getAllCardinalAnchors,
  getCardinalAnchorPoint,
  computeElbowPath,
} from "@/utils/elbowRouting";
import { collectMatchingEventIds } from "@/utils/stormQuery";
import type { CanvasObject, GroupInfo } from "@/types";

describe("Phase 4: Groups, Elbow Connectors & Visual Links", () => {
  describe("GroupLayer - Groups", () => {
    it("computes dynamic group bounds from members with 24px padding", () => {
      const group: GroupInfo = {
        id: "g1",
        name: "Order Processing",
      };
      const objects: CanvasObject[] = [
        {
          id: "c1",
          type: "storm",
          x: 100,
          y: 100,
          width: 200,
          height: 100,
          groupId: "g1",
        },
        {
          id: "c2",
          type: "storm",
          x: 400,
          y: 200,
          width: 150,
          height: 120,
          groupId: "g1",
        },
      ];

      const bounds = computeGroupBounds(group, objects);
      // minX = 100, minY = 100, maxX = 550, maxY = 320
      expect(bounds.x).toBe(100 - 24);
      expect(bounds.y).toBe(100 - 24);
      expect(bounds.width).toBe(550 - 100 + 48);
      expect(bounds.height).toBe(320 - 100 + 48);
    });

    it("prefers customBounds when explicitly set on the group", () => {
      const group: GroupInfo = {
        id: "g1",
        name: "Order Processing",
        customBounds: { x: 50, y: 60, width: 300, height: 200 },
      };
      const bounds = computeGroupBounds(group, []);
      expect(bounds).toEqual({ x: 50, y: 60, width: 300, height: 200 });
    });

    it("expands parent group bounds to encompass nested sub-groups", () => {
      const parentGroup: GroupInfo = {
        id: "parent-g",
        name: "Core Domain",
      };
      const childGroup: GroupInfo = {
        id: "child-g",
        name: "Sub Context",
        parentId: "parent-g",
        customBounds: { x: 200, y: 200, width: 100, height: 100 },
      };
      const parentCard: CanvasObject = {
        id: "pc",
        type: "storm",
        x: 50,
        y: 50,
        width: 60,
        height: 60,
        groupId: "parent-g",
      };

      const bounds = computeGroupBounds(parentGroup, [parentCard], [parentGroup, childGroup]);
      // minX = 50, minY = 50, maxX = 300, maxY = 300
      expect(bounds.x).toBe(50 - 24);
      expect(bounds.y).toBe(50 - 24);
      expect(bounds.width).toBe(300 - 50 + 48);
      expect(bounds.height).toBe(300 - 50 + 48);
    });

    it("detects clicks on group header badge, border, and interior", () => {
      const group: GroupInfo = {
        id: "g1",
        name: "Inventory",
        customBounds: { x: 100, y: 100, width: 400, height: 300 },
      };

      // Header badge is positioned around x + 16, y - 12 (width approx 90, height 24)
      const headerHit = getGroupAt(130, 95, [group], []);
      expect(headerHit?.hitType).toBe("header");
      expect(headerHit?.group.id).toBe("g1");

      // Outer border is around x=100, y=200
      const borderHit = getGroupAt(102, 200, [group], []);
      expect(borderHit?.hitType).toBe("border");

      // Deep interior (e.g. x=250, y=250)
      const interiorHit = getGroupAt(250, 250, [group], []);
      expect(interiorHit?.hitType).toBe("interior");

      // Outside
      const outsideHit = getGroupAt(30, 30, [group], []);
      expect(outsideHit).toBeNull();
    });
  });

  describe("Elbow Connectors & Cardinal Magnetic Anchors", () => {
    it("generates 4 cardinal magnetic anchors for cards and groups", () => {
      const cardBounds = { x: 100, y: 100, width: 200, height: 100 };
      const anchors = getAllCardinalAnchors("card-1", cardBounds);

      expect(anchors).toHaveLength(4);
      expect(anchors.find((a) => a.anchor === "top")?.point).toEqual({
        x: 200,
        y: 100,
      });
      expect(anchors.find((a) => a.anchor === "right")?.point).toEqual({
        x: 300,
        y: 150,
      });
      expect(anchors.find((a) => a.anchor === "bottom")?.point).toEqual({
        x: 200,
        y: 200,
      });
      expect(anchors.find((a) => a.anchor === "left")?.point).toEqual({
        x: 100,
        y: 150,
      });
    });

    it("routes clean 90-degree orthogonal path between card anchor and group anchor", () => {
      const cardBounds = { x: 100, y: 100, width: 200, height: 100 };
      const groupBounds = { x: 450, y: 250, width: 300, height: 200 };

      const startPt = getCardinalAnchorPoint(cardBounds, "right");
      const endPt = getCardinalAnchorPoint(groupBounds, "left");

      const points = computeElbowPath(startPt, "right", endPt, "left");
      expect(points.length).toBeGreaterThanOrEqual(4);
      expect(points[0]).toEqual(startPt);
      expect(points[points.length - 1]).toEqual(endPt);

      // Verify each segment is orthogonal
      for (let i = 0; i < points.length - 1; i++) {
        const isOrthogonal =
          points[i].x === points[i + 1].x || points[i].y === points[i + 1].y;
        expect(isOrthogonal).toBe(true);
      }
    });
  });

  describe("DCB Real-Time Visual Linking", () => {
    it("matches State card DCB Query Items to Event cards in real time", () => {
      const eventCard1: CanvasObject = {
        id: "ev-1",
        type: "storm",
        x: 100,
        y: 100,
        width: 200,
        height: 100,
        stormData: {
          kind: "event",
          name: "OrderPlaced",
          fields: [
            { id: "f1", name: "orderId", fieldType: "uuid", tag: "item" },
          ],
        },
      };

      const eventCard2: CanvasObject = {
        id: "ev-2",
        type: "storm",
        x: 100,
        y: 250,
        width: 200,
        height: 100,
        stormData: {
          kind: "event",
          name: "OrderShipped",
          fields: [
            { id: "f2", name: "orderId", fieldType: "uuid", tag: "item" },
          ],
        },
      };

      const eventCard3: CanvasObject = {
        id: "ev-3",
        type: "storm",
        x: 100,
        y: 400,
        width: 200,
        height: 100,
        stormData: {
          kind: "event",
          name: "CustomerRegistered",
          fields: [
            { id: "f3", name: "customerId", fieldType: "uuid", tag: "user" },
          ],
        },
      };

      const stateCard: CanvasObject = {
        id: "state-1",
        type: "storm",
        x: 400,
        y: 100,
        width: 240,
        height: 150,
        stormData: {
          kind: "state",
          name: "OrderState",
          fields: [
            { id: "sf1", name: "id", fieldType: "uuid", tag: "item" },
          ],
          queryItems: [
            {
              id: "qi1",
              types: ["OrderPlaced", "OrderShipped"],
              tagFieldIds: ["sf1"],
            },
          ],
        },
      };

      const objects = [eventCard1, eventCard2, eventCard3, stateCard];
      const matchingIds = collectMatchingEventIds(objects, stateCard);

      expect(matchingIds).toHaveLength(2);
      expect(matchingIds).toContain("ev-1");
      expect(matchingIds).toContain("ev-2");
      expect(matchingIds).not.toContain("ev-3");
    });
  });
});
