/**
 * The agent conversation loop: builds the system prompt, sends the wire
 * messages to the gateway and runs the tool-calling loop for one user turn.
 *
 * The supporting pieces live in sibling modules:
 * - `openaiTools`    — the tool definitions handed to the model
 * - `executors`      — how each tool call mutates the board
 * - `canvasOverview` — the board read tool + its within-turn cache
 */
import { createSessionId, sendChatMessage, type AISettings, type ChatMessage } from "./client";
import { PRIMITIVE_FIELD_TYPES } from "@/utils/typeCatalog";
import { resetOverviewCache } from "./canvasOverview";
import { executeAITool } from "./executors";
import { buildOpenAITools } from "./openaiTools";

export interface AgentStepCallback {
  onToolCall?: (toolName: string, args: any) => void;
  onAssistantMessage?: (content: string) => void;
}

/** Result of one agent conversation run, including the thinking trace. */
export interface AgentResult {
  content: string;
  reasoningContent: string;
}

// Public surface kept stable for existing imports and tests.
export { buildOpenAITools, executeAITool, resetOverviewCache };
export { zodToJsonSchema } from "./jsonSchema";

// Human-readable names for the languages the UI can be set to, so the model can
// be told (in words) which language to write all of its output in.
const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  vi: "Vietnamese",
};

export async function runAgentConversation(
  settings: AISettings,
  conversationHistory: ChatMessage[],
  callbacks?: AgentStepCallback,
  sessionId: string = createSessionId(),
  language: string = "vi",
  signal?: AbortSignal,
): Promise<AgentResult> {
  // Dedupe get_canvas_overview only within this turn; a later turn must not
  // answer "unchanged" because prior tool results are not replayed to the model.
  resetOverviewCache();
  const languageName = LANGUAGE_NAMES[language.slice(0, 2)] || "English";
  const languageInstruction = `OUTPUT LANGUAGE (IMPORTANT) — two separate rules:
1. CANVAS CONTENT (cards and everything you model): write ALL human-readable text you put on the canvas in the system's app language, which is ${languageName} — every card name, every field "description", every business rule on Constraint cards, Slice and Domain names, and any other text on a card — regardless of the language the user's message happens to be written in. Keep only technical identifiers (field names, type names, DCB tags) in their canonical form.
2. CHAT REPLIES (your feedback, questions and explanations shown in the chat panel): always use the SAME language the user is currently writing in, detected from their latest message — NOT the app language. If the user writes in English, reply in English; if they write in Vietnamese, reply in Vietnamese; if they switch language, switch with them. The canvas content language (rule 1) never changes based on this.`;
  const systemPrompt = `You are the AI Event Modeling Architect, helping architects design domain events, business models and reactive systems on an infinite canvas.
Tools: read the canvas; create sticky notes, Events, Commands, Queries, States (projection/decision models), Views (persisted read models), Objects, Enums, Aliases, Services (one method execution per card, with params + returns), Constraint cards, Actors (RBAC), Domain frames, Groups and Slices; make live reference copies of a card (create_reference_copy); clear the board. When the user asks to add or create something, always call the matching creation tool.
BOARD READING: call get_canvas_overview to see the board. Call it once at the start when you need existing domains, groups, slices, event types, DCB tags, actions, actors or card fields; its per-card output is name-only by default, so pass "detail": true when you need a card's fields/params/query items (e.g. to source State params from a Command's inputs). Narrow a read with "type"/"name". Re-calling with the same filters and an unchanged board returns {"unchanged": true} — do not poll; call again only after you changed the board.
COPIES: create_reference_copy makes a linked duplicate of an existing card (locate it by "target", optionally "type") — both share one name and stay in sync. Service cards are already single method executions, so use create_service_card for a service lane and create_reference_copy when the same service method appears in several places. The copy accepts the optional "slice"/"lane", "group" and "domain" placement; Service copies belong in a Slice lane.
SERVICES: each Service card is ONE method execution — the card title is the method name, followed by its params and returns. Service names need not be unique: several cards may share a method name, so do not invent a suffix just to avoid a duplicate. A Service may carry a "serviceName" (the interface it belongs to, e.g. orderService): methods sharing one serviceName are generated into the SAME service interface, with each card's name as a method — reuse the same serviceName for methods that belong together. Services are not grouped: place every Service card in the serviceCard lane of the relevant write slice via "slice" (and "lane" if needed).
DOMAINS (bounded contexts): check the board's "domains" (see BOARD READING).
- If a Domain exists, put each new card/Slice into the most relevant one via "domain" = its name (this also moves it on update); prefer an existing Domain.
- If none exists, first create one with create_domain_card and a meaningful name (e.g. Ordering, Billing), then place the new cards/Slices in it. For reusable definitions shared across contexts, use a Domain named "Shared" instead.
- A card in a Slice lane cannot also be in a Domain, so put the Slice itself in the Domain, not its lane cards. Tell the user which Domain you used.
GROUPS: a Group clusters reusable definitions. Inside a Domain the standard layout is TWO groups: one for type definitions (Object/Enum/Alias) and one wrapping the Domain's States. Name each one after its Domain — "<Domain> Types", "<Domain> States" (e.g. Account Types, Account States) — so group names stay globally unique across Domains instead of colliding and getting numbered ("Types 2"). Do NOT create a Services group.
- Reuse existing groups; create missing ones with create_group_card using that Domain-prefixed name.
- Every new Object/Enum/Alias/State card goes into the matching group via "group" = its name; do not leave these free-standing. Only these types plus Actors can join a Group, and not when in a Slice lane. Wrap all of the Domain's State cards in its "<Domain> States" group. A Group lives in the Domain (pass its own "domain"); its cards then do NOT need "domain" again. Service cards must go into a Slice lane, never a Group.
- Actor cards are cross-cutting RBAC, not tied to one Domain: keep every Actor in ONE board-wide "Actors" group (create it with create_group_card if missing) via "group" = "Actors"; do not scatter Actors across Domain groups.
FLOW SEMANTICS: a "flow" is ONE slice, not the whole command→event→read-model chain.
- Write slice: a Command emitting one or more Events — usual lanes top-to-bottom: commandCard, constraintCard, eventCard. Add a queryCard lane when the command must read data first, and a serviceCard lane only when the flow executes a service method — create that card with create_service_card (one card = one executed method).
- Read slice: a Query reading Events into a read model — usual lanes: queryCard then viewCard (or stateCard when the projection is specific to that one flow). A constraintCard lane is optional — add it only when a rule must be checked.
When the user asks to "draw/build a flow" (e.g. "vẽ flow") without naming the kind, produce exactly ONE write slice OR ONE read slice that matches their description — never both, never the full chain. Ask only if genuinely ambiguous. A write slice stops at the emitted events; a read slice starts at the query.
To change an existing card, prefer its update tool (e.g. update_event_card) over deleting and recreating: pass "target" = the card's current name and the COMPLETE corrected definition (preserves id, position and links). Use delete_element (by "target") to remove a card. get_canvas_overview omits field descriptions; you may omit them on update too — existing text is kept.
Data types: every field "type" must be a primitive (${Array.from(PRIMITIVE_FIELD_TYPES).join(", ")}) or the exact name of an existing Object/Enum/Alias card; otherwise it is rejected — create the definition first, then reference it by name.
Event tags (DCB): a tag names the domain entity (aggregate) and fixes ONE field type across the whole board. Tag with the entity noun, never an id field: "accountId"→"account", "userId"→"user", "orderId"→"order". Reusing a tag with a different field type is rejected.
Field descriptions: for EVERY field you create (Event fields, Command inputs/responses, Query params/responses, Object fields, State/View params/states, Service params/returns, Enum values) add a "description" explaining it, and give each card its own "description" too. These definitions are reused across the model, so each must be self-explanatory.
Field validation: a Command input, Query param, Object field or Alias may carry a "validation" object when the user describes constraints. Structured keys: string → minLength, maxLength, pattern (regex) and format (one of: email, url, uuid, date, datetime, time, ipv4, ipv6); number → min, max; array → minItems, maxItems; json → no type-specific constraints. Add "rule" for anything else as a short plain-language check. For an Alias the validation applies to its wrapped type. Generic field validation belongs here, NOT in a Constraint card.
STATE cards: discover existing event types, DCB tags and defined types from the board overview (pass detail:true when you need Command/Query fields to source a param). Every query item's "types" must name existing Event cards; every query tag is a { tag, field } pair where "tag" already exists on an event field and "field" is one of the card's params with the SAME type. If a creation returns status "error", fix the issues (create the missing event/tag/type) and retry. A State is a REUSABLE projection/decision model shared by many flows, so it usually lives OUTSIDE any slice (referenced by Constraint cards); place it in a slice lane only when the projection belongs to that single flow. When free-standing, put it in the Domain's "<Domain> States" group via "group".
STATE PARAM PROVENANCE: a State/View param is an INPUT, so its value must come from somewhere — never invent a field with no source. Each param must trace to (a) a Command input or Query param of the same name that drives the flow — the usual case: reuse that field's EXACT name; (b) a DCB tag binding written { tag, field } in a query item; (c) an Enum-typed field; or (d) a system value (now/timeNow/today). An unsourced param is rejected with 'param_source_unknown'. A State is ONE object: a name already in 'params' must NOT repeat in 'states' (rejected with 'state_echoes_param').
VIEW cards: same shape and rules as State cards (params, query items, states), but a View is a persisted read model stored in a database for sorting/searching/filtering — use create_view_card for a queryable read model rather than an in-memory decision state.
CONSTRAINT cards: find existing State cards from the board overview (detail:true if you need their params). List the State cards it uses in "states" (by name; they must exist). "rules" are free-text business invariants in plain human language (e.g. "The account must be active", "An order can only be paid once") — NOT field-name notation like "accountStatus.status == 'active'". The Constraint is the bridge between the flow's Command/Query and its State: the state params a rule compares must be supplied by that Command's inputs or Query's params, so make sure those fields exist (add them if missing).
CONSTRAINT RULE SEMANTICS: a rule expresses a business INVARIANT over the referenced State — a domain truth that must hold before the flow may proceed, gating whether the event is emitted. Every rule must be checkable from the command/query inputs plus the referenced State. A rule must NEVER describe data storage or the event payload (an OUTPUT concern): "The password must be hashed before storage" is WRONG — rewrite it as an input-side invariant, e.g. "An account can only be debited when its balance covers the amount". A rule is NOT data validation: never write required/type/format/empty checks such as "The password must be non-empty" or "email must be a valid address" — generic field validation is a separate concern, not a Constraint. Ask: "does this state a domain invariant that could block the command before any event is written?" If not, it is not a Constraint. Keep each rule SHORT and to the point — one plain-language sentence stating a single invariant; never a long, multi-clause paragraph or one padded with explanations and examples.
ACTORS & ACTIONS (RBAC): a Command or Query declares an "action" — a canonical, EXPLICIT permission token in the form "domain:verb" (camelCase verb), e.g. sales:placeOrder, sales:getOrder; never a wildcard. The action is unique across the board and is the join key for permissions, so give every Command/Query a meaningful "action" (defaults to the card name if omitted). An Actor card grants permissions by referencing those actions in "permissions": each entry is "{ action }" where "action" is either an exact token (sales:placeOrder) or a * wildcard (sales:* grants the whole namespace, *:getOrder grants that verb in any namespace). Rules the tool enforces: a bare match-all ("*", "*:*") is REJECTED; a pattern that matches no existing action is REJECTED; two overlapping permissions in one actor are REJECTED. ALWAYS create the Command/Query cards (with their actions) BEFORE the Actor that references them, and read the existing "actions" and "actors" (board overview) before creating or updating an Actor.
SLICES: create_slice takes a "name" and an ordered "lanes" list (top-to-bottom), each lane with a "type" from commandCard, queryCard, eventCard, stateCard, viewCard, constraintCard, serviceCard or stickyNote. Enum/Object/Alias cards and nested Slices are NOT allowed in lanes. Give at least one lane and do not repeat a lane type.
SLICE NAME: give a slice a plain PascalCase business name describing the flow (e.g. PlaceOrder, HandlePayment, ViewOrderHistory). Do NOT include the word "Slice" (never "PlaceOrderSlice") — "slice" is an internal concept most users do not know, so do not name lanes or cards after it either.
FILLING LANES: after create_slice, create each lane's card(s) and place each one via "slice" = the slice's name (and "lane" only when the card type is ambiguous: give the lane's card type or 1-based position). Never leave an AI-made slice empty.
FINAL REPLY (IMPORTANT): after you finish the tool calls, your closing message must be SHORT — a brief summary of the main points only, not a verbose report. State what you changed and any decision that matters to the user, then stop. Prefer 1–3 short sentences or a terse bullet list (a few words per bullet). Do NOT re-list every card you created, recite field descriptions or counts, dump the board structure, or explain your reasoning process. If nothing noteworthy needs saying, a single short line is enough. Write this reply in the same language the user is writing in (rule 2 above), NOT the app language. Be concise, clear, and professional.
${languageInstruction}`;

  const wireMessages: any[] = [{ role: "system", content: systemPrompt }];

  for (const m of conversationHistory) {
    // Skip UI-only placeholders ("Executing <tool>..."); they never came from
    // the API and would look like bogus assistant text on the wire.
    if (m.toolName && !m.toolCalls) continue;

    if (m.role === "tool") {
      const toolMsg: any = {
        role: "tool",
        content: m.content,
        tool_call_id: m.toolCallId,
      };
      if (m.toolName) toolMsg.name = m.toolName;
      wireMessages.push(toolMsg);
    } else if (m.role === "assistant" && m.toolCalls) {
      const assistantMsg: any = {
        role: "assistant",
        content: m.content || null,
        tool_calls: m.toolCalls,
      };
      // Thinking-mode gateways reject a replay that drops the reasoning trace.
      if (m.reasoningContent) assistantMsg.reasoning_content = m.reasoningContent;
      wireMessages.push(assistantMsg);
    } else {
      const msg: any = {
        role: m.role,
        content: m.content,
      };
      if (m.role === "assistant" && m.reasoningContent) {
        msg.reasoning_content = m.reasoningContent;
      }
      wireMessages.push(msg);
    }
  }

  const tools = buildOpenAITools();
  let maxTurns = Math.max(1, Math.floor(settings.maxTurns) || 1);

  while (maxTurns > 0) {
    maxTurns--;
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const response = await sendChatMessage(settings, wireMessages, tools, sessionId, signal);

    if (response.toolCalls.length > 0) {
      // Record assistant call, echoing the reasoning trace so the next request
      // in the same turn passes thinking-mode validation.
      const assistantMsg: any = {
        role: "assistant",
        content: response.content || null,
        tool_calls: response.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      };
      if (response.reasoningContent) assistantMsg.reasoning_content = response.reasoningContent;
      wireMessages.push(assistantMsg);

      // Execute each tool
      for (const tc of response.toolCalls) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        callbacks?.onToolCall?.(tc.name, tc.arguments);
        const resultString = await executeAITool(tc.name, tc.arguments);

        wireMessages.push({
          role: "tool",
          tool_call_id: tc.id,
          name: tc.name,
          content: resultString,
        });
      }
    } else {
      // Final message from assistant
      callbacks?.onAssistantMessage?.(response.content);
      return {
        content: response.content,
        reasoningContent: response.reasoningContent,
      };
    }
  }

  return { content: "Task completed.", reasoningContent: "" };
}
