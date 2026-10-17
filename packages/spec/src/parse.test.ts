import { describe, it, expect } from "vitest";
import { parseSpecification, SpecParseError } from "./parse";

describe("parseSpecification", () => {
  it("parses a minimal spec", () => {
    const spec = parseSpecification("name: Shop\nevents:\n  - name: OrderPlaced\n");
    expect(spec.name).toBe("Shop");
    expect(spec.events?.[0].name).toBe("OrderPlaced");
  });

  it("parses inline data definitions", () => {
    const source = [
      "name: Shop",
      "events:",
      "  - name: OrderPlaced",
      "    fields:",
      "      - name: order",
      "        type:",
      "          object: Order",
      "          fields:",
      "            - name: id",
      "              type: string",
    ].join("\n");
    const spec = parseSpecification(source);
    const field = spec.events?.[0].fields?.[0];
    expect(typeof field?.type).toBe("object");
  });

  it("parses a top-level `types` registry referenced by name", () => {
    const source = [
      "name: Account",
      "types:",
      "  - object: Profile",
      "    fields:",
      "      - name: id",
      "        type: AccountId",
      "  - alias: AccountId",
      "    of: string",
      "events:",
      "  - name: AccountCreated",
      "    fields:",
      "      - name: profile",
      "        type: Profile",
    ].join("\n");
    const spec = parseSpecification(source);
    expect(spec.types).toHaveLength(2);
    expect(spec.types?.[0]).toMatchObject({ object: "Profile" });
    expect(spec.types?.[1]).toMatchObject({ alias: "AccountId", of: "string" });
    expect(spec.events?.[0].fields?.[0].type).toBe("Profile");
  });

  it("rejects a document that does not match the contract", () => {
    expect(() => parseSpecification("events: nope")).toThrow(SpecParseError);
  });

  it("rejects invalid YAML", () => {
    expect(() => parseSpecification("a: [unclosed")).toThrow(SpecParseError);
  });
});
