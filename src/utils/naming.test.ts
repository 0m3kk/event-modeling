import { describe, expect, it } from "vitest";
import type { CanvasObject } from "@/types";
import {
  collectComponentNameKeys,
  componentNameOf,
  defaultComponentName,
  ensureUniqueComponentName,
  fieldNameMatches,
  makeUniqueName,
  nameKey,
  normalizeExpressionForCodegen,
  toCamelCase,
} from "./naming";

function storm(id: string, name: string, kind = "event"): CanvasObject {
  return {
    id,
    type: "storm",
    x: 0,
    y: 0,
    width: 260,
    height: 150,
    stormData: { kind: kind as never, name, fields: [] },
  };
}

function bdd(
  id: string,
  name: string,
  phase: "given" | "when" | "then" = "given",
): CanvasObject {
  return {
    id,
    type: "storm",
    x: 0,
    y: 0,
    width: 260,
    height: 150,
    stormData: { kind: "bdd", name, phase, fields: [] },
  };
}

function model(id: string, name: string, kind = "object"): CanvasObject {
  return {
    id,
    type: "model",
    x: 0,
    y: 0,
    width: 240,
    height: 120,
    modelData: { kind: kind as never, name, fields: [] },
  };
}

function sticky(id: string, text = "Sticky Note"): CanvasObject {
  return {
    id,
    type: "stickyNote",
    x: 0,
    y: 0,
    width: 180,
    height: 140,
    text,
  };
}

describe("nameKey", () => {
  it("treats casing and word breaks as the same name", () => {
    const key = nameKey("CreateOrder");
    expect(nameKey("create order")).toBe(key);
    expect(nameKey("Create Order")).toBe(key);
    expect(nameKey("  create_order  ")).toBe(key);
  });

  it("treats blank and undefined as unnamed", () => {
    expect(nameKey("")).toBe("");
    expect(nameKey("   ")).toBe("");
    expect(nameKey(undefined)).toBe("");
  });
});

describe("componentNameOf", () => {
  it("reads the title of storm cards and model nodes", () => {
    expect(componentNameOf(storm("s1", "Order Placed"))).toBe("Order Placed");
    expect(componentNameOf(model("m1", "Order"))).toBe("Order");
  });

  it("has no name for other object types", () => {
    expect(componentNameOf(sticky("n1"))).toBeUndefined();
  });
});

describe("defaultComponentName", () => {
  it("uses the kind label per component type", () => {
    expect(defaultComponentName(storm("s1", "", "command"))).toBe("Command");
    expect(defaultComponentName(model("m1", "", "enum"))).toBe("Enum");
  });

  it("uses the BDD phase step for Given/When/Then cards", () => {
    expect(defaultComponentName(bdd("b1", "", "given"))).toBe("Given");
    expect(defaultComponentName(bdd("b2", "", "then"))).toBe("Then");
  });

  it("has no default for unnamed object types", () => {
    expect(defaultComponentName(sticky("n1"))).toBeUndefined();
  });
});

describe("makeUniqueName", () => {
  it("keeps a free name as-is", () => {
    expect(makeUniqueName("Order", [])).toBe("Order");
    expect(makeUniqueName("Order", ["Customer"])).toBe("Order");
  });

  it("appends the next free suffix on collision", () => {
    expect(makeUniqueName("Order", ["Order"])).toBe("Order 2");
    expect(makeUniqueName("Order", ["Order", "Order 2"])).toBe("Order 3");
  });

  it("compares names case- and spacing-insensitively", () => {
    expect(makeUniqueName("createOrder", ["Create Order"])).toBe(
      "createOrder 2",
    );
  });

  it("passes blank names through untouched", () => {
    expect(makeUniqueName("", ["Order"])).toBe("");
    expect(makeUniqueName("   ", ["Order"])).toBe("   ");
  });
});

describe("collectComponentNameKeys", () => {
  it("collects storm and model names, ignoring other object types", () => {
    const keys = collectComponentNameKeys([
      storm("s1", "Order Placed"),
      model("m1", "Order"),
      sticky("n1", "Order"),
    ]);
    expect(keys).toEqual(new Set(["order placed", "order"]));
  });

  it("counts an unnamed card as its default label", () => {
    // A blank Command card is rendered as "Command", so it must reserve it.
    const keys = collectComponentNameKeys([storm("s1", "", "command")]);
    expect(keys).toEqual(new Set(["command"]));
  });

  it("skips the excluded object", () => {
    const keys = collectComponentNameKeys(
      [storm("s1", "", "command"), model("m1", "Order")],
      "m1",
    );
    expect(keys).toEqual(new Set(["command"]));
  });
});

describe("ensureUniqueComponentName", () => {
  it("suffixes a colliding storm card", () => {
    const existing = [storm("s1", "Order Placed")];
    const result = ensureUniqueComponentName(
      storm("s2", "order placed"),
      existing,
    );
    expect(result.stormData?.name).toBe("order placed 2");
  });

  it("suffixes a colliding model node", () => {
    const existing = [model("m1", "Order")];
    const result = ensureUniqueComponentName(model("m2", "Order"), existing);
    expect(result.modelData?.name).toBe("Order 2");
  });

  it("returns the same object when the name is already free", () => {
    const object = storm("s2", "Shipped");
    expect(ensureUniqueComponentName(object, [storm("s1", "Order")])).toBe(
      object,
    );
  });

  it("seeds the default label for an unnamed card", () => {
    const result = ensureUniqueComponentName(storm("s2", "", "command"), [
      storm("s1", "Order"),
    ]);
    expect(result.stormData?.name).toBe("Command");
  });

  it("seeds a suffixed default when the label is already used by a blank card", () => {
    const existing = [storm("s1", "", "command")];
    const result = ensureUniqueComponentName(
      storm("s2", "", "command"),
      existing,
    );
    expect(result.stormData?.name).toBe("Command 2");
  });

  it("leaves non-named types unchanged", () => {
    const note = sticky("n1");
    expect(ensureUniqueComponentName(note, [storm("s1", "Order")])).toBe(note);
  });

  it("ignores the object's own current name", () => {
    const object = storm("s1", "Order");
    // Renaming to the same name is a no-ops, not a self-collision.
    expect(ensureUniqueComponentName(object, [object])).toBe(object);
  });
});

describe("toCamelCase and fieldNameMatches", () => {
  it("converts strings to camelCase", () => {
    expect(toCamelCase("Registered Email")).toBe("registeredEmail");
    expect(toCamelCase("order_item_count")).toBe("orderItemCount");
    expect(toCamelCase("user-id")).toBe("userId");
    expect(toCamelCase("alreadyCamel")).toBe("alreadyCamel");
    expect(toCamelCase("")).toBe("");
  });

  it("matches field names flexibly across casing styles", () => {
    expect(fieldNameMatches("Registered Email", "registeredEmail")).toBe(true);
    expect(fieldNameMatches("registeredEmail", "Registered Email")).toBe(true);
    expect(fieldNameMatches("registered_email", "Registered Email")).toBe(true);
    expect(fieldNameMatches("Registered Email", "Registered Email")).toBe(true);
    expect(fieldNameMatches("Email", "email")).toBe(true);
    expect(fieldNameMatches("id_123", "id_123")).toBe(true);
    expect(fieldNameMatches("otherField", "registeredEmail")).toBe(false);
    expect(fieldNameMatches("", "registeredEmail")).toBe(false);
  });

  it("normalizes expressions for codegen to camelCase identifier access", () => {
    expect(normalizeExpressionForCodegen("Command.Name")).toBe("command.name");
    expect(normalizeExpressionForCodegen("Command.Email")).toBe("command.email");
    expect(normalizeExpressionForCodegen("Command.Display Name")).toBe("command.displayName");
    expect(normalizeExpressionForCodegen("RegisterUser.Email")).toBe("registerUser.email");
    expect(normalizeExpressionForCodegen("UserRegistered.Registered Email")).toBe("userRegistered.registeredEmail");
    expect(normalizeExpressionForCodegen("hashPassword(Command.Password)")).toBe("hashPassword(command.password)");
    expect(normalizeExpressionForCodegen("now()")).toBe("now()");
    expect(normalizeExpressionForCodegen("uuid()")).toBe("uuid()");
    expect(normalizeExpressionForCodegen("'ACTIVE'")).toBe("'ACTIVE'");
    expect(normalizeExpressionForCodegen("event.email")).toBe("event.email");
    expect(normalizeExpressionForCodegen("command.displayName")).toBe("command.displayName");
    expect(normalizeExpressionForCodegen("")).toBe("");
  });
});
