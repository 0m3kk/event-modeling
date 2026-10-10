import { Container, Graphics, Text } from "pixi.js";
import type { GroupInfo, CanvasObject, GroupBounds } from "@/types";
import { Z_INDICES, APP_FONT_FAMILY } from "@/constants/canvas";
import { drawStyledRoundRect } from "@/utils/dashedGraphics";
import { computeTextResolution } from "../textResolution";

export interface GroupHitResult {
  group: GroupInfo;
  hitType: "header" | "border" | "interior";
  bounds: GroupBounds;
  badgeBounds: GroupBounds;
}

/**
 * Computes bounding box for a group (from customBounds or member objects + child groups).
 */
export function computeGroupBounds(
  group: GroupInfo,
  objects: CanvasObject[],
  allGroups: GroupInfo[] = [],
): GroupBounds {
  if (group.customBounds) {
    return group.customBounds;
  }

  const members = objects.filter((o) => o.groupId === group.id);
  const childGroups = allGroups.filter((g) => g.parentId === group.id);

  if (members.length === 0 && childGroups.length === 0) {
    return { x: 0, y: 0, width: 240, height: 160 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const m of members) {
    minX = Math.min(minX, m.x);
    minY = Math.min(minY, m.y);
    maxX = Math.max(maxX, m.x + m.width);
    maxY = Math.max(maxY, m.y + m.height);
  }

  for (const cg of childGroups) {
    const cb = computeGroupBounds(cg, objects, allGroups);
    minX = Math.min(minX, cb.x);
    minY = Math.min(minY, cb.y);
    maxX = Math.max(maxX, cb.x + cb.width);
    maxY = Math.max(maxY, cb.y + cb.height);
  }

  const padding = 24;
  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}

/**
 * Tests if a point hits a group's header badge, border, or interior.
 *
 * When groups are nested, the same point can land inside several boundaries.
 * The deepest (most nested) group wins, so a child group stays clickable even
 * though its parent's interior covers the same spot. A header badge always
 * beats a boundary/interior hit so a group can be renamed from the header.
 */
export function getGroupAt(
  worldX: number,
  worldY: number,
  groups: GroupInfo[],
  objects: CanvasObject[],
): GroupHitResult | null {
  const groupsById = new Map(groups.map((g) => [g.id, g]));
  const depthCache = new Map<string, number>();
  const depthOf = (group: GroupInfo): number => {
    const cached = depthCache.get(group.id);
    if (cached !== undefined) return cached;
    let depth = 0;
    let current: GroupInfo | undefined = group;
    const guard = new Set<string>();
    while (current?.parentId && !guard.has(current.id)) {
      guard.add(current.id);
      current = groupsById.get(current.parentId);
      depth += 1;
    }
    depthCache.set(group.id, depth);
    return depth;
  };

  let headerHit: GroupHitResult | null = null;
  let headerDepth = -1;
  let bodyHit: GroupHitResult | null = null;
  let bodyDepth = -1;

  for (const group of groups) {
    const bounds = computeGroupBounds(group, objects, groups);

    // Approximate header badge bounds (name badge only; the domain pill that
    // may sit to its right is not a hit target).
    const title = group.name || (group.isSlice ? "Slice" : "Group");
    const approxTextWidth = Math.max(60, title.length * 7.5 + 24);
    const badgeBounds: GroupBounds = {
      x: bounds.x + 16,
      y: bounds.y - 12,
      width: approxTextWidth,
      height: 24,
    };

    const depth = depthOf(group);

    // 1. Check header badge hit
    if (
      worldX >= badgeBounds.x &&
      worldX <= badgeBounds.x + badgeBounds.width &&
      worldY >= badgeBounds.y &&
      worldY <= badgeBounds.y + badgeBounds.height
    ) {
      if (depth >= headerDepth) {
        headerHit = { group, hitType: "header", bounds, badgeBounds };
        headerDepth = depth;
      }
      continue;
    }

    // 2. Check border hit (within 8px tolerance)
    const tolerance = 8;
    const isNearOuter =
      worldX >= bounds.x - tolerance &&
      worldX <= bounds.x + bounds.width + tolerance &&
      worldY >= bounds.y - tolerance &&
      worldY <= bounds.y + bounds.height + tolerance;
    const isInsideInner =
      worldX >= bounds.x + tolerance &&
      worldX <= bounds.x + bounds.width - tolerance &&
      worldY >= bounds.y + tolerance &&
      worldY <= bounds.y + bounds.height - tolerance;

    if (isNearOuter && !isInsideInner) {
      if (depth >= bodyDepth) {
        bodyHit = { group, hitType: "border", bounds, badgeBounds };
        bodyDepth = depth;
      }
    } else if (
      worldX >= bounds.x &&
      worldX <= bounds.x + bounds.width &&
      worldY >= bounds.y &&
      worldY <= bounds.y + bounds.height
    ) {
      // 3. Check interior hit
      if (depth >= bodyDepth) {
        bodyHit = { group, hitType: "interior", bounds, badgeBounds };
        bodyDepth = depth;
      }
    }
  }

  return headerHit ?? bodyHit;
}

export class GroupLayer extends Container {
  private graphics: Graphics;
  private labelsContainer: Container;
  /**
   * Cached group title nodes keyed by group id. The label rasterization only
   * depends on the title text and the zoom-derived resolution, so dragging or
   * panning just repositions existing nodes instead of rebuilding them.
   */
  private labelNodes: Map<
    string,
    { node: Text; domainNode: Text | null; key: string }
  > = new Map();

  constructor() {
    super();
    this.zIndex = Z_INDICES.GROUPS;
    this.graphics = new Graphics();
    this.labelsContainer = new Container();
    this.addChild(this.graphics);
    this.addChild(this.labelsContainer);
  }

  public renderGroups(
    groups: GroupInfo[],
    objects: CanvasObject[],
    zoom: number = 1,
    selectedIds: string[] = [],
    textResolutionOverride?: number,
  ): void {
    this.graphics.clear();

    const dpr =
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    // Export supplies an explicit resolution (see CardLayer.renderCards).
    const textResolution =
      textResolutionOverride ?? computeTextResolution(zoom, dpr);

    const activeLabelIds = new Set<string>();

    for (const group of groups) {
      const bounds = computeGroupBounds(group, objects, groups);
      const isSelected =
        selectedIds.includes(group.id) ||
        selectedIds.includes(`__group:${group.id}`);

      // 1. Draw boundary fill
      const defaultFill = group.isSlice ? 0xf0f9ff : 0xf8fafc;
      const fillColor = group.fill
        ? parseInt(group.fill.replace("#", "0x"), 16)
        : defaultFill;
      this.graphics
        .roundRect(bounds.x, bounds.y, bounds.width, bounds.height, 12)
        .fill({ color: fillColor, alpha: isSelected ? 0.35 : 0.2 });

      // 2. Draw styled boundary stroke (solid, dashed, or dotted)
      const defaultStroke = group.isSlice ? 0x0284c7 : 0x6366f1;
      const strokeColor = isSelected
        ? 0x2563eb
        : group.stroke
          ? parseInt(group.stroke.replace("#", "0x"), 16)
          : defaultStroke;
      const strokeWidth = isSelected
        ? Math.max(2.5, (group.strokeWidth ?? 2) + 0.5)
        : (group.strokeWidth ?? 2);
      const lineStyle = group.lineStyle ?? "dashed";

      drawStyledRoundRect(
        this.graphics,
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
        12,
        lineStyle,
        {
          color: strokeColor,
          width: strokeWidth,
          alpha: isSelected ? 1 : 0.85,
        },
      );

      // 3. Draw Header Badge (tagColor pill)
      const defaultTagColor = group.isSlice ? 0x0284c7 : 0x6366f1;
      const tagColorHex = group.tagColor
        ? parseInt(group.tagColor.replace("#", "0x"), 16)
        : defaultTagColor;

      const title = group.name || (group.isSlice ? "Slice" : "Group");
      const domain = group.domain ?? group.tag;
      const labelKey = `${title}|${domain ?? ""}|${textResolution}|${tagColorHex}`;
      let entry = this.labelNodes.get(group.id);
      if (!entry || entry.key !== labelKey) {
        entry?.node.destroy();
        entry?.domainNode?.destroy();
        entry = {
          node: new Text({
            text: title,
            style: {
              fontSize: 11,
              fontFamily: APP_FONT_FAMILY,
              fontWeight: "bold",
              fill: 0xffffff,
            },
            resolution: textResolution,
          }),
          domainNode: domain
            ? new Text({
                text: domain,
                style: {
                  fontSize: 10,
                  fontFamily: APP_FONT_FAMILY,
                  fontWeight: "bold",
                  fill: tagColorHex,
                },
                resolution: textResolution,
              })
            : null,
          key: labelKey,
        };
        this.labelNodes.set(group.id, entry);
      }
      const label = entry.node;
      activeLabelIds.add(group.id);

      const badgeX = bounds.x + 16;
      const badgeY = bounds.y - 12;
      const badgePaddingX = 10;
      const badgeWidth = label.width + badgePaddingX * 2;
      const badgeHeight = 22;

      // Draw badge background pill
      this.graphics
        .roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 11)
        .fill({ color: tagColorHex, alpha: 1 })
        .stroke({
          color: isSelected ? 0x2563eb : 0xffffff,
          width: isSelected ? 2 : 1,
          alpha: 0.9,
        });

      label.x = badgeX + badgePaddingX;
      label.y = badgeY + 4;
      if (label.parent !== this.labelsContainer) {
        this.labelsContainer.addChild(label);
      }

      // Domain pill sits to the right of the name badge (light fill, colored
      // text), matching the domain pill on element cards.
      if (entry.domainNode) {
        const domainLabel = entry.domainNode;
        const dPaddingX = 8;
        const dWidth = domainLabel.width + dPaddingX * 2;
        const dHeight = 20;
        const dX = badgeX + badgeWidth + 6;
        const dY = badgeY + (badgeHeight - dHeight) / 2;

        this.graphics
          .roundRect(dX, dY, dWidth, dHeight, dHeight / 2)
          .fill({ color: 0xffffff, alpha: 0.95 })
          .stroke({ color: tagColorHex, width: 1, alpha: 0.9 });

        domainLabel.x = dX + dPaddingX;
        domainLabel.y = dY + (dHeight - domainLabel.height) / 2;
        if (domainLabel.parent !== this.labelsContainer) {
          this.labelsContainer.addChild(domainLabel);
        }
      }
    }

    // Drop labels whose group disappeared.
    for (const [id, entry] of this.labelNodes) {
      if (!activeLabelIds.has(id)) {
        entry.node.destroy();
        entry.domainNode?.destroy();
        this.labelNodes.delete(id);
      }
    }
  }

  public override destroy(
    options?: boolean | import("pixi.js").DestroyOptions,
  ): void {
    this.graphics.destroy();
    this.labelNodes.clear();
    this.labelsContainer.destroy({ children: true });
    super.destroy(options);
  }
}
