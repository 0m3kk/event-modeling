/**
 * Turns a YAML document string into a tree of lines so a viewer can collapse and
 * expand nested keys.
 *
 * The document is assumed to come from our own emitter (see `specExport.ts`):
 * block-style mappings and sequences, two-space indents, and scalars that stay
 * on a single line (multi-line strings are emitted as escaped, quoted JSON). Under
 * that assumption nesting is described entirely by indentation, so a line's
 * children are simply the following lines that are indented further than it.
 */

export interface YamlOutlineNode {
  /** Index of the source line; stable for the lifetime of the document. */
  id: number;
  /** Original line text, including its leading indentation. */
  text: string;
  /** Leading whitespace width in spaces (0 for top-level keys). */
  indent: number;
  /** Lines nested under this one, in document order. */
  children: YamlOutlineNode[];
  /** Total number of lines hidden when this node is collapsed. */
  descendants: number;
}

export interface YamlOutline {
  /** Top-level lines (indent 0). */
  roots: YamlOutlineNode[];
  /** Every line, in document order. */
  nodes: YamlOutlineNode[];
  /** Ids of the lines that own children and can therefore be folded. */
  foldableIds: number[];
}

/** Builds the collapsible outline for a serialized YAML document. */
export function buildYamlOutline(yaml: string): YamlOutline {
  const lines = yaml.split("\n");
  // The serializer terminates the document with a newline; drop the blank tail.
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();

  const roots: YamlOutlineNode[] = [];
  const nodes: YamlOutlineNode[] = [];
  const stack: YamlOutlineNode[] = [];

  lines.forEach((text, id) => {
    const indent = text.length - text.trimStart().length;
    const node: YamlOutlineNode = {
      id,
      text,
      indent,
      children: [],
      descendants: 0,
    };

    // Pop ancestors until we reach one that is less indented than this line.
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    if (stack.length > 0) stack[stack.length - 1].children.push(node);
    else roots.push(node);
    stack.push(node);
    nodes.push(node);
  });

  const countDescendants = (node: YamlOutlineNode): number =>
    node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);

  const foldableIds: number[] = [];
  for (const node of nodes) {
    node.descendants = countDescendants(node);
    if (node.children.length > 0) foldableIds.push(node.id);
  }

  return { roots, nodes, foldableIds };
}
