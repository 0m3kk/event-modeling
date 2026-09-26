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
 */
export function getGroupAt(
  worldX: number,
  worldY: number,
  groups: GroupInfo[],
  objects: CanvasObject[],
): GroupHitResult | null {
  // Test from innermost / top groups first
  for (let i = groups.length - 1; i >= 0; i--) {
    const group = groups[i];
    const bounds = computeGroupBounds(group, objects, groups);

    // Approximate header badge bounds
    const title = group.name || "Group";
    const approxTextWidth = Math.max(60, title.length * 7.5 + 24);
    const badgeBounds: GroupBounds = {
      x: bounds.x + 16,
      y: bounds.y - 12,
      width: approxTextWidth,
      height: 24,
    };

    // 1. Check header badge hit
    if (
      worldX >= badgeBounds.x &&
      worldX <= badgeBounds.x + badgeBounds.width &&
      worldY >= badgeBounds.y &&
      worldY <= badgeBounds.y + badgeBounds.height
    ) {
      return { group, hitType: "header", bounds, badgeBounds };
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
      return { group, hitType: "border", bounds, badgeBounds };
    }

    // 3. Check interior hit
    if (
      worldX >= bounds.x &&
      worldX <= bounds.x + bounds.width &&
      worldY >= bounds.y &&
      worldY <= bounds.y + bounds.height
    ) {
      return { group, hitType: "interior", bounds, badgeBounds };
    }
  }

  return null;
}

export class GroupLayer extends Container {
  private graphics: Graphics;
  private labelsContainer: Container;

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
  ): void {
    this.graphics.clear();
    this.labelsContainer.removeChildren();

    const dpr =
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const textResolution = computeTextResolution(zoom, dpr);

    for (const group of groups) {
      const bounds = computeGroupBounds(group, objects, groups);
      const isSelected =
        selectedIds.includes(group.id) ||
        selectedIds.includes(`__group:${group.id}`);

      // 1. Draw boundary fill
      const fillColor = group.fill
        ? parseInt(group.fill.replace("#", "0x"), 16)
        : 0xf8fafc;
      this.graphics
        .roundRect(bounds.x, bounds.y, bounds.width, bounds.height, 12)
        .fill({ color: fillColor, alpha: isSelected ? 0.35 : 0.2 });

      // 2. Draw styled boundary stroke (solid, dashed, or dotted)
      const strokeColor = isSelected
        ? 0x2563eb
        : group.stroke
          ? parseInt(group.stroke.replace("#", "0x"), 16)
          : 0x6366f1;
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
      const tagColorHex = group.tagColor
        ? parseInt(group.tagColor.replace("#", "0x"), 16)
        : 0x6366f1;

      const title = group.name || "Group";
      const label = new Text({
        text: title,
        style: {
          fontSize: 11,
          fontFamily: APP_FONT_FAMILY,
          fontWeight: "bold",
          fill: 0xffffff,
        },
        resolution: textResolution,
      });

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
      this.labelsContainer.addChild(label);
    }
  }

  public override destroy(
    options?: boolean | import("pixi.js").DestroyOptions,
  ): void {
    this.graphics.destroy();
    this.labelsContainer.destroy();
    super.destroy(options);
  }
}
