import type { CanvasElement, SelectedField } from "@/types";
import type { ToolDefinition, SubSelectSection } from "@/tools/types";

export type { SubSelectSection };

/**
 * Returns the list of sub-select sections for an element.
 * Checks tool definition, element.data.sections, or falls back to element.data.fields.
 */
export function getSubSelectSections(
  element: CanvasElement<any>,
  tool?: ToolDefinition<any> | null,
): SubSelectSection[] {
  if (tool?.getSubSelectSections) {
    return tool.getSubSelectSections(element);
  }

  // Fallback for multi-section schema (e.g., element.data.sections)
  if (Array.isArray(element.data?.sections)) {
    return element.data.sections.map((section: any, idx: number) => ({
      id: section.id || `section-${idx}`,
      name: section.name || `Section ${idx + 1}`,
      count: Array.isArray(section.fields)
        ? section.fields.length
        : typeof section.count === "number"
          ? section.count
          : 0,
    }));
  }

  // Fallback for standard single fields array
  if (Array.isArray(element.data?.fields)) {
    return [
      {
        id: "fields",
        name: "fields",
        count: element.data.fields.length,
      },
    ];
  }

  return [];
}

/**
 * Navigates across fields and sections in the specified direction ("up" | "down").
 * Supports single-section and multi-section navigation, skipping empty sections and clamping at boundaries.
 */
export function navigateSubSelect(
  element: CanvasElement<any>,
  current: SelectedField,
  direction: "up" | "down",
  tool?: ToolDefinition<any> | null,
): SelectedField | null {
  if (element.id !== current.elementId) return null;

  if (tool?.onNavigateSubSelect) {
    return tool.onNavigateSubSelect(element, current, direction);
  }

  const sections = getSubSelectSections(element, tool);
  if (sections.length === 0) return null;

  const hasAnyItems = sections.some((s) => s.count > 0);
  if (!hasAnyItems) return null;

  let currentSecIdx = current.sectionIndex ?? 0;
  if (currentSecIdx < 0) currentSecIdx = 0;
  if (currentSecIdx >= sections.length) currentSecIdx = sections.length - 1;

  const currentSection = sections[currentSecIdx];
  const maxFieldIdx = Math.max(0, currentSection.count - 1);
  const currentFieldIdx = Math.max(0, Math.min(current.fieldIndex, maxFieldIdx));

  if (direction === "down") {
    // 1. Move down inside current section if possible
    if (currentFieldIdx + 1 < currentSection.count) {
      return {
        elementId: element.id,
        sectionIndex: currentSecIdx,
        sectionId: currentSection.id,
        fieldIndex: currentFieldIdx + 1,
      };
    }

    // 2. Move to next non-empty section
    for (let s = currentSecIdx + 1; s < sections.length; s++) {
      if (sections[s].count > 0) {
        return {
          elementId: element.id,
          sectionIndex: s,
          sectionId: sections[s].id,
          fieldIndex: 0,
        };
      }
    }

    // 3. At the end of the last section: clamp at the last item
    return {
      elementId: element.id,
      sectionIndex: currentSecIdx,
      sectionId: currentSection.id,
      fieldIndex: maxFieldIdx,
    };
  } else {
    // direction === "up"
    // 1. Move up inside current section if possible
    if (currentFieldIdx > 0) {
      return {
        elementId: element.id,
        sectionIndex: currentSecIdx,
        sectionId: currentSection.id,
        fieldIndex: currentFieldIdx - 1,
      };
    }

    // 2. Move to previous non-empty section
    for (let s = currentSecIdx - 1; s >= 0; s--) {
      if (sections[s].count > 0) {
        return {
          elementId: element.id,
          sectionIndex: s,
          sectionId: sections[s].id,
          fieldIndex: sections[s].count - 1,
        };
      }
    }

    // 3. At the top of the first section: clamp at field 0
    return {
      elementId: element.id,
      sectionIndex: currentSecIdx,
      sectionId: currentSection.id,
      fieldIndex: 0,
    };
  }
}
