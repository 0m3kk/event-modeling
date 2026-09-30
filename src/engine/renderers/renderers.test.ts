import { describe, it, expect } from "vitest";
import { Container, Text } from "pixi.js";
import { StormCardRenderer } from "./StormCardRenderer";
import { ModelNodeRenderer } from "./ModelNodeRenderer";
import { StickyNoteRenderer } from "./StickyNoteRenderer";
import { TextBoxRenderer } from "./TextBoxRenderer";
import type { CanvasObject } from "@/types";

describe("Pixi Card Renderers", () => {
  it("renders Storm command card with action and fields", () => {
    const container = new Container();
    const obj: CanvasObject = {
      id: "cmd-1",
      type: "storm",
      x: 100,
      y: 100,
      width: 240,
      height: 140,
      stormData: {
        kind: "command",
        name: "CreateOrder",
        action: "order:create:tenant",
        fields: [
          { id: "f1", name: "orderId", fieldType: "uuid", required: true },
          { id: "f2", name: "amount", fieldType: "number" },
        ],
      },
    };

    const res = StormCardRenderer.draw(container, obj, 1, false);
    // The action no longer occupies a row: header + two field rows + the
    // always-present Command RESPONSE band (one section label).
    expect(res.height).toBe(126);
    expect(res.hitZones.length).toBeGreaterThan(0);

    const headerZone = res.hitZones.find((z) => z.type === "header");
    expect(headerZone).toBeDefined();
    expect(headerZone?.currentText).toBe("CreateOrder");

    // The action is a compact header badge (left of the ⓘ icon), not a row.
    const actionZone = res.hitZones.find((z) => z.type === "action");
    expect(actionZone).toBeDefined();
    expect(actionZone?.currentText).toBe("order:create:tenant");
    expect(actionZone?.bounds.y).toBeLessThan(36);
    expect(actionZone?.bounds.height).toBeLessThanOrEqual(20);

    const fieldNames = res.hitZones.filter((z) => z.type === "fieldName");
    expect(fieldNames.length).toBe(2);

    const fieldTypes = res.hitZones.filter((z) => z.type === "fieldType");
    expect(fieldTypes.length).toBe(2);
  });

  it("draws the validation check on Command fields and Query params only", () => {
    const commandObj: CanvasObject = {
      id: "cmd-val",
      type: "storm",
      x: 0,
      y: 0,
      width: 260,
      height: 120,
      stormData: {
        kind: "command",
        name: "PlaceOrder",
        fields: [
          {
            id: "f1",
            name: "quantity",
            fieldType: "number",
            validation: { min: 1 },
          },
          { id: "f2", name: "note", fieldType: "string" },
        ],
      },
    };

    // A validated row shows the ✓ badge even when it is not selected.
    const idleRes = StormCardRenderer.draw(new Container(), commandObj, 1, false);
    const idleZones = idleRes.hitZones.filter((z) => z.type === "validation");
    expect(idleZones).toHaveLength(1);
    expect(idleZones[0].fieldId).toBe("f1");
    expect(idleZones[0].currentText).toBe("min 1");

    // Selecting a validated field draws the ✓ badge with its rule summary.
    const commandContainer = new Container();
    const commandRes = StormCardRenderer.draw(
      commandContainer,
      commandObj,
      1,
      true,
      "f1",
    );
    const commandTexts = commandContainer.children
      .filter((c): c is Text => c instanceof Text)
      .map((t) => t.text);
    expect(commandTexts.filter((t) => t === "✓").length).toBe(1);

    const commandZones = commandRes.hitZones.filter(
      (z) => z.type === "validation",
    );
    expect(commandZones).toHaveLength(1);
    expect(commandZones[0].fieldId).toBe("f1");
    expect(commandZones[0].currentText).toBe("min 1");

    // A selected field without rules still shows the muted ✓ affordance.
    const emptyRes = StormCardRenderer.draw(
      new Container(),
      commandObj,
      1,
      true,
      "f2",
    );
    const emptyZone = emptyRes.hitZones.find(
      (z) => z.type === "validation" && z.fieldId === "f2",
    );
    expect(emptyZone?.currentText).toBe("Add validation rules");
    // The validated sibling keeps its badge while f2 is selected.
    expect(
      emptyRes.hitZones.some(
        (z) => z.type === "validation" && z.fieldId === "f1",
      ),
    ).toBe(true);

    // Query response fields are output, never validated — only Params are.
    const queryObj: CanvasObject = {
      id: "q-val",
      type: "storm",
      x: 0,
      y: 0,
      width: 260,
      height: 160,
      stormData: {
        kind: "query",
        name: "GetOrder",
        fields: [
          {
            id: "p1",
            name: "orderId",
            fieldType: "uuid",
            validation: { pattern: "^x$" },
          },
        ],
        responseFields: [
          {
            id: "r1",
            name: "status",
            fieldType: "string",
            validation: { minLength: 1 },
          },
        ],
      },
    };

    const queryContainer = new Container();
    const queryRes = StormCardRenderer.draw(
      queryContainer,
      queryObj,
      1,
      true,
      "p1",
    );
    const queryTexts = queryContainer.children
      .filter((c): c is Text => c instanceof Text)
      .map((t) => t.text);
    expect(queryTexts.filter((t) => t === "✓").length).toBe(1);

    const queryZones = queryRes.hitZones.filter((z) => z.type === "validation");
    expect(queryZones).toHaveLength(1);
    expect(queryZones[0].fieldId).toBe("p1");
    expect(queryZones[0].section).toBe("params");

    // A Response row never gets a validation badge, even when selected.
    const responseRes = StormCardRenderer.draw(
      new Container(),
      queryObj,
      1,
      true,
      "r1",
    );
    expect(
      responseRes.hitZones.some(
        (z) => z.type === "validation" && z.fieldId === "r1",
      ),
    ).toBe(false);
    // The Params row keeps its badge regardless of selection.
    expect(
      responseRes.hitZones.some(
        (z) => z.type === "validation" && z.fieldId === "p1",
      ),
    ).toBe(true);
  });

  it("draws validation badges on model object fields, arrays and wraps", () => {
    const objectObj: CanvasObject = {
      id: "obj-val",
      type: "model",
      x: 0,
      y: 0,
      width: 240,
      height: 120,
      modelData: {
        kind: "object",
        name: "Customer",
        fields: [
          {
            id: "f1",
            name: "email",
            fieldType: "string",
            validation: { format: "email" },
          },
        ],
      },
    };
    const objectRes = ModelNodeRenderer.draw(new Container(), objectObj, 1, false);
    const objectZone = objectRes.hitZones.find((z) => z.type === "validation");
    expect(objectZone?.fieldId).toBe("f1");
    expect(objectZone?.currentText).toBe("format email");

    const arrayObj: CanvasObject = {
      id: "arr-val",
      type: "model",
      x: 0,
      y: 0,
      width: 240,
      height: 80,
      modelData: {
        kind: "array",
        name: "Tags",
        itemType: "string",
        validation: { maxItems: 5 },
      },
    };
    const arrayRes = ModelNodeRenderer.draw(new Container(), arrayObj, 1, false);
    const arrayZone = arrayRes.hitZones.find((z) => z.type === "validation");
    expect(arrayZone?.fieldId).toBeUndefined();
    expect(arrayZone?.currentText).toBe("max items 5");

    // Enum nodes never validate.
    const enumObj: CanvasObject = {
      id: "enum-val",
      type: "model",
      x: 0,
      y: 0,
      width: 240,
      height: 80,
      modelData: {
        kind: "enum",
        name: "Status",
        values: [{ id: "v1", name: "Open" }],
      },
    };
    const enumRes = ModelNodeRenderer.draw(new Container(), enumObj, 1, false);
    expect(enumRes.hitZones.some((z) => z.type === "validation")).toBe(false);
  });

  it("allows wider card width so long titles and field names fit without truncation", () => {
    const longName = "veryLongBillingAccountIdentificationNumber";
    const longTitle = "ProcessCustomerMonthlyInvoicePaymentCommand";
    const containerNarrow = new Container();
    const narrowObj: CanvasObject = {
      id: "cmd-narrow",
      type: "storm",
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      stormData: {
        kind: "command",
        name: longTitle,
        fields: [{ id: "f1", name: longName, fieldType: "string" }],
      },
    };

    StormCardRenderer.draw(containerNarrow, narrowObj, 1, false);
    const narrowTexts = containerNarrow.children
      .filter((c): c is Text => c instanceof Text)
      .map((t) => t.text);
    expect(narrowTexts.some((t) => t.includes("…"))).toBe(true);

    const containerWide = new Container();
    const wideObj: CanvasObject = {
      ...narrowObj,
      id: "cmd-wide",
      width: 500,
    };
    StormCardRenderer.draw(containerWide, wideObj, 1, false);
    const wideTexts = containerWide.children
      .filter((c): c is Text => c instanceof Text)
      .map((t) => t.text);
    expect(wideTexts.includes(longTitle)).toBe(true);
    expect(wideTexts.some((t) => t.includes(longName))).toBe(true);
  });

  it("shows the action badge only when the card has an action", () => {
    const obj: CanvasObject = {
      id: "cmd-2",
      type: "storm",
      x: 0,
      y: 0,
      width: 240,
      height: 120,
      stormData: {
        kind: "command",
        name: "CreateOrder",
        fields: [],
      },
    };

    // No action → no badge, even when selected
    const unselected = StormCardRenderer.draw(new Container(), obj, 1, false);
    expect(unselected.hitZones.some((z) => z.type === "action")).toBe(false);

    const selected = StormCardRenderer.draw(new Container(), obj, 1, true);
    expect(selected.hitZones.some((z) => z.type === "action")).toBe(false);
  });

  it("renders Given/When/Then (BDD) card with phase badge and scenario steps", () => {
    const container = new Container();
    const obj: CanvasObject = {
      id: "bdd-1",
      type: "storm",
      x: 100,
      y: 100,
      width: 240,
      height: 120,
      stormData: {
        kind: "bdd",
        name: "Given",
        phase: "given",
        fields: [],
        steps: [
          {
            id: "s1",
            ref: "event",
            name: "OrderPlaced",
            payload: [{ id: "p1", key: "orderId", value: "42" }],
          },
        ],
      },
    };

    const res = StormCardRenderer.draw(container, obj, 1, false);
    expect(res.hitZones.some((z) => z.type === "header")).toBe(true);
    // Step selection + inline-edit zones replace the old field rows.
    expect(res.hitZones.some((z) => z.type === "bddStep")).toBe(true);
    expect(res.hitZones.some((z) => z.type === "bddStepName")).toBe(true);
    expect(res.hitZones.some((z) => z.type === "bddPayloadValue")).toBe(true);
    expect(res.hitZones.some((z) => z.type === "fieldType")).toBe(false);

    const texts = container.children
      .filter((c): c is Text => c instanceof Text)
      .map((t) => t.text);
    expect(texts).toContain("OrderPlaced");
    expect(texts).toContain("42");
  });

  it("shows an add-step placeholder on an empty BDD card", () => {
    const container = new Container();
    const obj: CanvasObject = {
      id: "bdd-empty",
      type: "storm",
      x: 100,
      y: 100,
      width: 240,
      height: 80,
      stormData: { kind: "bdd", name: "Then", phase: "then", fields: [] },
    };

    const res = StormCardRenderer.draw(container, obj, 1, true);
    expect(res.hitZones.some((z) => z.type === "bddAddStep")).toBe(true);
    expect(res.height).toBe(80);
  });

  it("renders a long field tag in full instead of truncating it", () => {
    const container = new Container();
    const longTag = "customerBillingAccountReference";
    const obj: CanvasObject = {
      id: "ev-tag",
      type: "storm",
      x: 0,
      y: 0,
      width: 260,
      height: 100,
      stormData: {
        kind: "event",
        name: "OrderPlaced",
        fields: [
          { id: "f1", name: "orderId", fieldType: "uuid", tag: longTag },
        ],
      },
    };

    const res = StormCardRenderer.draw(container, obj, 1, false);

    // The tag is rendered verbatim (no ellipsis) and the hit zone carries it.
    const texts = container.children
      .filter((c): c is Text => c instanceof Text)
      .map((t) => t.text);
    expect(texts).toContain(`#${longTag}`);

    const tagZone = res.hitZones.find((z) => z.type === "fieldTag");
    expect(tagZone).toBeDefined();
    expect(tagZone?.currentText).toBe(longTag);
    // The pill is sized to the full text, well past the old 80px cap.
    expect(tagZone!.bounds.width).toBeGreaterThan(80);
  });

  it("renders Storm query card with dual sections (params & response)", () => {
    const container = new Container();
    const obj: CanvasObject = {
      id: "qry-1",
      type: "storm",
      x: 100,
      y: 100,
      width: 240,
      height: 160,
      stormData: {
        kind: "query",
        name: "GetOrder",
        action: "order:read:tenant",
        fields: [{ id: "p1", name: "orderId", fieldType: "uuid" }],
        responseFields: [
          { id: "r1", name: "order", fieldType: "OrderPayload" },
        ],
      },
    };

    const res = StormCardRenderer.draw(container, obj, 1, false);
    expect(res.hitZones.filter((z) => z.type === "fieldName").length).toBe(2);
    expect(res.hitZones.some((z) => z.section === "params")).toBe(true);
    expect(res.hitZones.some((z) => z.section === "response")).toBe(true);
  });

  it("renders Storm command card with a RESPONSE band and an unlabeled payload", () => {
    const container = new Container();
    const obj: CanvasObject = {
      id: "cmd-resp",
      type: "storm",
      x: 100,
      y: 100,
      width: 240,
      height: 180,
      stormData: {
        kind: "command",
        name: "PlaceOrder",
        action: "order:create:tenant",
        fields: [{ id: "p1", name: "orderId", fieldType: "uuid" }],
        responseFields: [{ id: "r1", name: "orderId", fieldType: "uuid" }],
      },
    };

    const res = StormCardRenderer.draw(container, obj, 1, false);
    expect(res.hitZones.filter((z) => z.type === "fieldName").length).toBe(2);
    expect(res.hitZones.some((z) => z.section === "response")).toBe(true);

    // Command payload rows stay unlabeled: RESPONSE shows, PARAMS does not.
    const labels = container.children
      .filter((c): c is Text => c instanceof Text)
      .map((t) => t.text);
    expect(labels).toContain("RESPONSE");
    expect(labels).not.toContain("PARAMS");
  });

  it("renders Storm state card with DCB query items", () => {
    const container = new Container();
    const obj: CanvasObject = {
      id: "state-1",
      type: "storm",
      x: 100,
      y: 100,
      width: 240,
      height: 140,
      stormData: {
        kind: "state",
        name: "OrderState",
        fields: [],
        inputFields: [
          { id: "f1", name: "status", fieldType: "string" },
        ],
        queryItems: [
          {
            id: "qi1",
            types: ["OrderPlaced", "OrderCancelled"],
            tagFieldIds: ["f1"],
          },
        ],
      },
    };

    const res = StormCardRenderer.draw(container, obj, 1, false);
    const qZone = res.hitZones.find((z) => z.type === "queryItem");
    expect(qZone).toBeDefined();
    expect(qZone?.queryItemId).toBe("qi1");
  });

  it("renders Storm constraint card with field rows, query items and constraint lines", () => {
    const container = new Container();
    const obj: CanvasObject = {
      id: "c-1",
      type: "storm",
      x: 100,
      y: 100,
      width: 240,
      height: 140,
      stormData: {
        kind: "constraint",
        name: "OrderConstraints",
        // Constraint shares the State body: INPUT params + Related Events
        // + projected FIELDS, then the free-text Constraints section.
        fields: [],
        inputFields: [
          { id: "cf1", name: "total", fieldType: "number", tag: "order" },
        ],
        queryItems: [
          { id: "cqi1", types: ["OrderPlaced"], tagFieldIds: ["cf1"] },
        ],
        constraints: [
          { id: "c1", text: "Total amount must be greater than zero" },
        ],
      },
    };

    const res = StormCardRenderer.draw(container, obj, 1, false);
    // Field rows render for constraint cards (typed + taggable)
    expect(res.hitZones.filter((z) => z.type === "fieldName").length).toBe(1);
    expect(res.hitZones.some((z) => z.type === "fieldType")).toBe(true);
    expect(
      res.hitZones.some(
        (z) => z.type === "fieldTag" && z.currentText === "order",
      ),
    ).toBe(true);
    // Related Events (DCB Query Items) render for constraint cards too
    const qZone = res.hitZones.find((z) => z.type === "queryItem");
    expect(qZone).toBeDefined();
    expect(qZone?.queryItemId).toBe("cqi1");
    // And the free-text constraints section
    const cZone = res.hitZones.find((z) => z.type === "constraint");
    expect(cZone).toBeDefined();
    expect(cZone?.currentText).toBe("Total amount must be greater than zero");

    // Verify Pixi Text was configured with wordWrap according to node width
    const cTextChild = container.children.find(
      (c) => (c as Text).text === "Total amount must be greater than zero",
    ) as Text | undefined;
    expect(cTextChild).toBeDefined();
    expect(cTextChild?.style.wordWrap).toBe(true);
    expect(cTextChild?.style.wordWrapWidth).toBe(240 - 22 - 10);

    const bulletChild = container.children.find(
      (c) => (c as Text).text === "•",
    ) as Text | undefined;
    expect(bulletChild).toBeDefined();
  });

  it("renders constraint card with wrapped text and expanded height for long rules", () => {
    const container = new Container();
    const obj: CanvasObject = {
      id: "c-long",
      type: "storm",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      stormData: {
        kind: "constraint",
        name: "OrderConstraints",
        fields: [],
        constraints: [
          {
            id: "c1",
            text: "Total amount must be greater than zero and customer account must be in verified status before placing order",
          },
        ],
      },
    };

    const res = StormCardRenderer.draw(container, obj, 1, false);
    const cZone = res.hitZones.find((z) => z.type === "constraint");
    expect(cZone).toBeDefined();
    // The hit zone height should be taller than single-row height (26)
    expect(cZone!.bounds.height).toBeGreaterThan(26);
    // Card height should accommodate the wrapped text
    expect(res.height).toBeGreaterThan(100);
  });

  it("renders Storm actor card with permissions", () => {
    const container = new Container();
    const obj: CanvasObject = {
      id: "act-1",
      type: "storm",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      stormData: {
        kind: "actor",
        name: "Admin",
        fields: [],
        permissions: ["order:*", "user:*"],
      },
    };

    const res = StormCardRenderer.draw(container, obj, 1, false);
    expect(res.hitZones.some((z) => z.currentText === "Admin")).toBe(true);
    expect(res.hitZones.some((z) => z.currentText === "order:*")).toBe(true);
  });

  it("renders Data Model object node", () => {
    const container = new Container();
    const obj: CanvasObject = {
      id: "model-obj",
      type: "model",
      x: 50,
      y: 50,
      width: 220,
      height: 120,
      modelData: {
        kind: "object",
        name: "UserProfile",
        fields: [
          { id: "mf1", name: "username", fieldType: "string", required: true },
          { id: "mf2", name: "email", fieldType: "string" },
        ],
      },
    };

    const res = ModelNodeRenderer.draw(container, obj, 1, false);
    expect(
      res.hitZones.some(
        (z) => z.type === "header" && z.currentText === "UserProfile",
      ),
    ).toBe(true);
    expect(res.hitZones.filter((z) => z.type === "fieldName").length).toBe(2);
    expect(res.hitZones.filter((z) => z.type === "fieldType").length).toBe(2);
  });

  it("renders Data Model enum, array, and wrap nodes", () => {
    const enumContainer = new Container();
    const enumObj: CanvasObject = {
      id: "model-enum",
      type: "model",
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      modelData: {
        kind: "enum",
        name: "OrderStatus",
        values: [
          { id: "v1", name: "PENDING", value: "PENDING" },
          { id: "v2", name: "CONFIRMED", value: "CONFIRMED" },
        ],
      },
    };
    const enumRes = ModelNodeRenderer.draw(enumContainer, enumObj, 1, false);
    expect(enumRes.hitZones.filter((z) => z.type === "enumValue").length).toBe(
      2,
    );

    const arrayContainer = new Container();
    const arrayObj: CanvasObject = {
      id: "model-arr",
      type: "model",
      x: 0,
      y: 0,
      width: 200,
      height: 80,
      modelData: {
        kind: "array",
        name: "OrderList",
        itemType: "Order",
      },
    };
    const arrRes = ModelNodeRenderer.draw(arrayContainer, arrayObj, 1, false);
    expect(
      arrRes.hitZones.some(
        (z) => z.type === "itemType" && z.currentText === "Order",
      ),
    ).toBe(true);

    const wrapContainer = new Container();
    const wrapObj: CanvasObject = {
      id: "model-wrap",
      type: "model",
      x: 0,
      y: 0,
      width: 200,
      height: 80,
      modelData: {
        kind: "wrap",
        name: "OptionalUser",
        innerType: "UserProfile",
      },
    };
    const wrapRes = ModelNodeRenderer.draw(wrapContainer, wrapObj, 1, false);
    expect(
      wrapRes.hitZones.some(
        (z) => z.type === "innerType" && z.currentText === "UserProfile",
      ),
    ).toBe(true);
  });

  it("renders StickyNote and TextBox with text hit zones", () => {
    const stickyContainer = new Container();
    const stickyObj: CanvasObject = {
      id: "sticky-1",
      type: "stickyNote",
      x: 0,
      y: 0,
      width: 180,
      height: 140,
      text: "Workshop feedback note",
    };
    const stickyRes = StickyNoteRenderer.draw(
      stickyContainer,
      stickyObj,
      1,
      false,
    );
    expect(
      stickyRes.hitZones.some(
        (z) =>
          z.type === "stickyText" && z.currentText === "Workshop feedback note",
      ),
    ).toBe(true);

    const textContainer = new Container();
    const textObj: CanvasObject = {
      id: "text-1",
      type: "textBox",
      x: 0,
      y: 0,
      width: 200,
      height: 40,
      text: "Lane Header: Checkout Process",
    };
    const textRes = TextBoxRenderer.draw(textContainer, textObj, 1, false);
    expect(
      textRes.hitZones.some(
        (z) =>
          z.type === "textBoxText" &&
          z.currentText === "Lane Header: Checkout Process",
      ),
    ).toBe(true);
  });

  it("exposes info (desc) zones for card and field descriptions", () => {
    const container = new Container();
    const obj: CanvasObject = {
      id: "cmd-info",
      type: "storm",
      x: 0,
      y: 0,
      width: 240,
      height: 140,
      stormData: {
        kind: "command",
        name: "CreateOrder",
        description: "Places an order",
        fields: [
          {
            id: "f1",
            name: "orderId",
            fieldType: "uuid",
            description: "The id",
          },
          { id: "f2", name: "amount", fieldType: "number" },
        ],
      },
    };

    // Card description → header desc zone even when not selected
    const res = StormCardRenderer.draw(container, obj, 1, false);
    const headerDesc = res.hitZones.find(
      (z) => z.type === "desc" && !z.fieldId,
    );
    expect(headerDesc).toBeDefined();
    expect(headerDesc?.currentText).toBe("Places an order");

    // Field description → row desc zone carrying the field id
    const fieldDesc = res.hitZones.find(
      (z) => z.type === "desc" && z.fieldId === "f1",
    );
    expect(fieldDesc).toBeDefined();
    expect(fieldDesc?.currentText).toBe("The id");

    // No description + not selected → no muted add affordances
    const bare = new Container();
    const bareObj: CanvasObject = {
      ...obj,
      stormData: { ...obj.stormData!, description: undefined, fields: [] },
    };
    const bareRes = StormCardRenderer.draw(bare, bareObj, 1, false);
    expect(bareRes.hitZones.some((z) => z.type === "desc")).toBe(false);

    // Selected with no description → muted header + selected row affordances
    const selected = new Container();
    const selectedObj: CanvasObject = {
      ...obj,
      stormData: {
        ...obj.stormData!,
        description: undefined,
        fields: [
          { id: "f1", name: "orderId", fieldType: "uuid" },
          { id: "f2", name: "amount", fieldType: "number" },
        ],
      },
    };
    const selectedRes = StormCardRenderer.draw(
      selected,
      selectedObj,
      1,
      true,
      "f1",
    );
    expect(
      selectedRes.hitZones.some((z) => z.type === "desc" && !z.fieldId),
    ).toBe(true);
    expect(
      selectedRes.hitZones.some((z) => z.type === "desc" && z.fieldId === "f1"),
    ).toBe(true);
    expect(
      selectedRes.hitZones.some((z) => z.type === "desc" && z.fieldId === "f2"),
    ).toBe(false);
  });

  it("exposes info (desc) zones on model nodes", () => {
    const obj: CanvasObject = {
      id: "model-info",
      type: "model",
      x: 0,
      y: 0,
      width: 220,
      height: 120,
      modelData: {
        kind: "object",
        name: "User",
        description: "A user",
        fields: [{ id: "mf1", name: "id", fieldType: "uuid" }],
      },
    };

    const res = ModelNodeRenderer.draw(new Container(), obj, 1, false);
    expect(res.hitZones.some((z) => z.type === "desc" && !z.fieldId)).toBe(
      true,
    );

    // Selected row with no description gets a muted affordance
    const selected = ModelNodeRenderer.draw(
      new Container(),
      obj,
      1,
      true,
      "mf1",
    );
    expect(
      selected.hitZones.some((z) => z.type === "desc" && z.fieldId === "mf1"),
    ).toBe(true);
  });

  it("populates and queries hit zones via CardLayer", async () => {
    const { CardLayer } = await import("../layers/CardLayer");
    const cardLayer = new CardLayer();

    const sampleCard: CanvasObject = {
      id: "cmd-test",
      type: "storm",
      x: 100,
      y: 100,
      width: 240,
      height: 140,
      stormData: {
        kind: "command",
        name: "PlaceOrder",
        fields: [{ id: "f1", name: "orderId", fieldType: "uuid" }],
      },
    };

    cardLayer.renderCards([sampleCard], 1, []);
    const headerHit = cardLayer.getHitZoneAt("cmd-test", 50, 15);
    expect(headerHit).toBeDefined();
    expect(headerHit?.type).toBe("header");
    expect(headerHit?.currentText).toBe("PlaceOrder");

    cardLayer.destroy();
  });

  it("scopes row selection highlight to the specific card that owns the field", async () => {
    const { CardLayer } = await import("../layers/CardLayer");
    const cardLayer = new CardLayer();

    const card1: CanvasObject = {
      id: "card-1",
      type: "model",
      x: 0,
      y: 0,
      width: 240,
      height: 140,
      modelData: {
        kind: "object",
        name: "Order",
        fields: [{ id: "f1", name: "status", fieldType: "OrderStatus" }],
      },
    };

    const card2: CanvasObject = {
      id: "card-2",
      type: "model",
      x: 300,
      y: 0,
      width: 240,
      height: 140,
      modelData: {
        kind: "object",
        name: "Customer",
        fields: [{ id: "f2", name: "role", fieldType: "UserRole" }],
      },
    };

    // Render with selection for card-1's field
    cardLayer.renderCards(
      [card1, card2],
      1,
      ["card-1"],
      { objectId: "card-1", fieldId: "f1" },
    );

    // Card-1's hit zone for f1 should be queryable
    const typeHit = cardLayer.getHitZoneAt("card-1", 200, 48);
    expect(typeHit).toBeDefined();
    expect(typeHit?.fieldId).toBe("f1");

    cardLayer.destroy();
  });

  it("renders model field types with model kind color and styling", () => {
    const addressModel: CanvasObject = {
      id: "m-addr",
      type: "model",
      x: 300,
      y: 0,
      width: 240,
      height: 120,
      modelData: {
        kind: "object",
        name: "Address",
        fields: [{ id: "f-street", name: "street", fieldType: "string" }],
      },
    };

    const statusModel: CanvasObject = {
      id: "m-status",
      type: "model",
      x: 600,
      y: 0,
      width: 240,
      height: 120,
      modelData: {
        kind: "enum",
        name: "OrderStatus",
        values: [{ id: "v1", name: "PENDING" }, { id: "v2", name: "PAID" }],
      },
    };

    const customerCard: CanvasObject = {
      id: "card-cust",
      type: "storm",
      x: 0,
      y: 0,
      width: 260,
      height: 140,
      stormData: {
        kind: "command",
        name: "PlaceOrder",
        fields: [
          { id: "f-addr", name: "shippingAddress", fieldType: "Address" },
          { id: "f-status", name: "status", fieldType: "OrderStatus" },
          { id: "f-note", name: "note", fieldType: "string" },
        ],
      },
    };

    const allObjects = [customerCard, addressModel, statusModel];
    const container = new Container();
    const res = StormCardRenderer.draw(container, customerCard, 1, false, undefined, allObjects);

    const typeZones = res.hitZones.filter((z) => z.type === "fieldType");
    expect(typeZones).toHaveLength(3);
    expect(typeZones[0].currentText).toBe("Address");
    expect(typeZones[1].currentText).toBe("OrderStatus");
    expect(typeZones[2].currentText).toBe("string");

    // The model type zone should be wider than the primitive type zone to accommodate the icon
    expect(typeZones[0].bounds.width).toBeGreaterThanOrEqual(72);

    // Find the text elements inside container
    const textChildren = container.children.filter((c) => c instanceof Text) as Text[];
    const addressText = textChildren.find((t) => t.text === "Address");
    const statusText = textChildren.find((t) => t.text === "OrderStatus");
    const noteText = textChildren.find((t) => t.text === "string");

    expect(addressText).toBeDefined();
    expect(statusText).toBeDefined();
    expect(noteText).toBeDefined();

    // Model type texts use bold/semibold font weight and model kind color
    expect(addressText?.style.fontWeight).toBe("600");
    expect(statusText?.style.fontWeight).toBe("600");
    // Primitive type text uses normal weight and slate color (0x64748b)
    expect(noteText?.style.fill).toBe(0x64748b);
  });
});

