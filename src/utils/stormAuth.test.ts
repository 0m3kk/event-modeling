import { describe, expect, it } from "vitest";
import {
  matchesPermission,
  parseAction,
  formatAction,
  getAuthorizedActors,
  getActorPermissions,
  getAllDefinedActions,
  suggestActionForCard,
  COMMON_SCOPES,
} from "./stormAuth";
import type { CanvasObject } from "@/types";

describe("stormAuth", () => {
  describe("COMMON_SCOPES", () => {
    it("includes 'any' in COMMON_SCOPES", () => {
      expect(COMMON_SCOPES).toContain("any");
      expect(COMMON_SCOPES[1]).toBe("any");
    });
  });

  describe("matchesPermission", () => {
    it("matches exact permissions", () => {
      expect(matchesPermission("order:create:own", "order:create:own")).toBe(
        true,
      );
      expect(matchesPermission("order:read:all", "order:read:all")).toBe(true);
      expect(matchesPermission("ORDER:CREATE:OWN", "order:create:own")).toBe(
        true,
      );
      expect(matchesPermission(" order:create:own ", "order:create:own")).toBe(
        true,
      );
    });

    it("rejects non-matching exact permissions", () => {
      expect(matchesPermission("order:create:own", "order:create:all")).toBe(
        false,
      );
      expect(matchesPermission("order:create:own", "order:delete:own")).toBe(
        false,
      );
      expect(matchesPermission("user:create:own", "order:create:own")).toBe(
        false,
      );
    });

    it("handles global wildcards (*, *:*, *:*:*)", () => {
      expect(matchesPermission("*", "order:create:own")).toBe(true);
      expect(matchesPermission("*:*", "order:create:own")).toBe(true);
      expect(matchesPermission("*:*:*", "order:create:own")).toBe(true);
      expect(matchesPermission("*", "custom_action")).toBe(true);
    });

    it("handles trailing wildcards (e.g. order:*)", () => {
      expect(matchesPermission("order:*", "order:create")).toBe(true);
      expect(matchesPermission("order:*", "order:create:own")).toBe(true);
      expect(matchesPermission("order:*", "order:read:all:extended")).toBe(
        true,
      );
      expect(matchesPermission("user:*", "order:create:own")).toBe(false);
    });

    it("handles intermediate and scope wildcards", () => {
      expect(matchesPermission("order:create:*", "order:create:own")).toBe(
        true,
      );
      expect(matchesPermission("order:create:*", "order:create:all")).toBe(
        true,
      );
      expect(matchesPermission("order:create:*", "order:read:own")).toBe(false);

      expect(matchesPermission("*:read:*", "order:read:own")).toBe(true);
      expect(matchesPermission("*:read:*", "user:read:all")).toBe(true);
      expect(matchesPermission("*:read:*", "order:create:own")).toBe(false);

      expect(matchesPermission("*:*:own", "order:create:own")).toBe(true);
      expect(matchesPermission("*:*:own", "order:create:all")).toBe(false);
    });

    it("returns false for empty input", () => {
      expect(matchesPermission("", "order:create:own")).toBe(false);
      expect(matchesPermission("order:*", "")).toBe(false);
      expect(matchesPermission("   ", "   ")).toBe(false);
    });
  });

  describe("parseAction & formatAction", () => {
    it("parses 3-part action strings", () => {
      expect(parseAction("order:create:own")).toEqual({
        resource: "order",
        verb: "create",
        scope: "own",
      });
    });

    it("parses partial action strings", () => {
      expect(parseAction("order:create")).toEqual({
        resource: "order",
        verb: "create",
        scope: "",
      });
      expect(parseAction("order")).toEqual({
        resource: "order",
        verb: "",
        scope: "",
      });
    });

    it("formats action from components", () => {
      expect(formatAction("order", "create", "own")).toBe("order:create:own");
      expect(formatAction(" Order ", " CREATE ", " ALL ")).toBe(
        "order:create:all",
      );
      expect(formatAction("order", "read")).toBe("order:read");
    });
  });

  describe("getAuthorizedActors", () => {
    const mockObjects: CanvasObject[] = [
      {
        id: "actor-1",
        type: "storm",
        x: 0,
        y: 0,
        width: 260,
        height: 150,
        stormData: {
          kind: "actor",
          name: "Customer",
          fields: [],
          permissions: ["order:create:own", "order:read:own"],
        },
      },
      {
        id: "actor-2",
        type: "storm",
        x: 0,
        y: 0,
        width: 260,
        height: 150,
        stormData: {
          kind: "actor",
          name: "Admin",
          fields: [],
          permissions: ["*"],
        },
      },
      {
        id: "actor-3",
        type: "storm",
        x: 0,
        y: 0,
        width: 260,
        height: 150,
        stormData: {
          kind: "actor",
          name: "SupportAgent",
          fields: [],
          permissions: ["order:read:*"],
        },
      },
      {
        id: "command-1",
        type: "storm",
        x: 0,
        y: 0,
        width: 260,
        height: 150,
        stormData: {
          kind: "command",
          name: "CreateOrder",
          fields: [],
          action: "order:create:own",
        },
      },
      {
        id: "sticky-1",
        type: "stickyNote",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      },
    ];

    it("returns actors matching the action", () => {
      const authorizedForCreate = getAuthorizedActors(
        mockObjects,
        "order:create:own",
      );
      expect(authorizedForCreate.map((a) => a.id)).toEqual([
        "actor-1",
        "actor-2",
      ]);

      const authorizedForRead = getAuthorizedActors(
        mockObjects,
        "order:read:own",
      );
      expect(authorizedForRead.map((a) => a.id)).toEqual([
        "actor-1",
        "actor-2",
        "actor-3",
      ]);

      const authorizedForDelete = getAuthorizedActors(
        mockObjects,
        "order:delete:all",
      );
      expect(authorizedForDelete.map((a) => a.id)).toEqual(["actor-2"]);
    });

    it("returns empty array when action is empty or no actors match", () => {
      expect(getAuthorizedActors(mockObjects, "")).toEqual([]);
      expect(
        getAuthorizedActors(mockObjects, "unrelated:action:here").map(
          (a) => a.id,
        ),
      ).toEqual(["actor-2"]);
      expect(
        getAuthorizedActors(
          mockObjects.filter((o) => o.id !== "actor-2"),
          "unrelated:action:here",
        ),
      ).toEqual([]);
    });

    it("extracts permissions defined as field rows on actor cards", () => {
      const actorWithFields: CanvasObject = {
        id: "actor-fields",
        type: "storm",
        x: 0,
        y: 0,
        width: 260,
        height: 150,
        stormData: {
          kind: "actor",
          name: "Editor",
          fields: [
            { id: "f1", name: "article:publish:own", fieldType: "" },
            { id: "f2", name: "article:edit:own", fieldType: "" },
          ],
        },
      };

      expect(getActorPermissions(actorWithFields.stormData)).toEqual([
        "article:publish:own",
        "article:edit:own",
      ]);

      const authorized = getAuthorizedActors(
        [actorWithFields],
        "article:publish:own",
      );
      expect(authorized.map((a) => a.id)).toEqual(["actor-fields"]);
    });
  });

  describe("getAllDefinedActions", () => {
    it("collects actions from commands, queries and actor concrete permissions", () => {
      const mockObjects: CanvasObject[] = [
        {
          id: "cmd-1",
          type: "storm",
          x: 0,
          y: 0,
          width: 260,
          height: 150,
          stormData: {
            kind: "command",
            name: "CreateOrder",
            fields: [],
            action: "order:create:own",
          },
        },
        {
          id: "query-1",
          type: "storm",
          x: 0,
          y: 0,
          width: 260,
          height: 150,
          stormData: {
            kind: "query",
            name: "GetOrder",
            fields: [],
            action: "order:read:own",
          },
        },
        {
          id: "actor-1",
          type: "storm",
          x: 0,
          y: 0,
          width: 260,
          height: 150,
          stormData: {
            kind: "actor",
            name: "Customer",
            fields: [],
            permissions: ["order:create:own", "user:update:self", "*"],
          },
        },
      ];

      const actions = getAllDefinedActions(mockObjects);
      expect(actions).toEqual([
        "order:create:own",
        "order:read:own",
        "user:update:self",
      ]);
    });
  });

  describe("suggestActionForCard", () => {
    it("suggests actions from command names", () => {
      expect(suggestActionForCard("command", "CreateOrder")).toBe(
        "order:create:own",
      );
      expect(suggestActionForCard("command", "AddOrderItem")).toBe(
        "order-item:create:own",
      );
      expect(suggestActionForCard("command", "CancelOrder")).toBe(
        "order:delete:own",
      );
      expect(suggestActionForCard("command", "UpdateUserProfile")).toBe(
        "user-profile:update:own",
      );
    });

    it("suggests actions from query names", () => {
      expect(suggestActionForCard("query", "GetOrder")).toBe("order:read:own");
      expect(suggestActionForCard("query", "FindUser")).toBe("user:read:own");
      expect(suggestActionForCard("query", "ListAllOrders")).toBe(
        "orders:list:all",
      );
    });
  });

  describe("getActorPermissions precedence", () => {
    it("uses permissions array and ignores legacy fields if permissions is defined", () => {
      expect(
        getActorPermissions({
          kind: "actor",
          name: "Guest",
          permissions: ["*:register:public"],
          fields: [{ id: "f1", name: "*", fieldType: "" }],
        }),
      ).toEqual(["*:register:public"]);

      expect(
        getActorPermissions({
          kind: "actor",
          name: "Guest",
          permissions: [],
          fields: [{ id: "f1", name: "*", fieldType: "" }],
        }),
      ).toEqual([]);
    });

    it("does not match *:register:public or *:*:public with profile:update:own", () => {
      expect(
        matchesPermission("*:register:public", "profile:update:own"),
      ).toBe(false);
      expect(
        matchesPermission("*:*:public", "profile:update:own"),
      ).toBe(false);
    });
  });
});
