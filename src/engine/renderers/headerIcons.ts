import type { Graphics } from "pixi.js";

/**
 * Draws the kind icon on the right edge of a card header using Pixi Graphics primitives.
 * Completely deterministic, fast, resolution-independent, and runs in Node/WebGL/WebGPU without DOM.
 */
export function drawHeaderKindIcon(
  g: Graphics,
  kind: string,
  cx: number,
  cy: number,
  color: number = 0xffffff,
): void {
  const x0 = cx - 8;
  const y0 = cy - 8;

  switch (kind) {
    case "command": {
      // Terminal: >_
      g.moveTo(x0 + 3, y0 + 4.5)
        .lineTo(x0 + 7.5, y0 + 8)
        .lineTo(x0 + 3, y0 + 11.5)
        .stroke({ color, width: 1.5, cap: "round", join: "round" });

      g.moveTo(x0 + 9, y0 + 11.5)
        .lineTo(x0 + 13.5, y0 + 11.5)
        .stroke({ color, width: 1.5, cap: "round" });
      break;
    }

    case "event": {
      // Zap / Lightning bolt
      g.poly([
        x0 + 9,
        y0 + 1.5,
        x0 + 4,
        y0 + 8.5,
        x0 + 8.5,
        y0 + 8.5,
        x0 + 7.5,
        y0 + 14.5,
        x0 + 12.5,
        y0 + 7.5,
        x0 + 8.5,
        y0 + 7.5,
      ])
        .fill({ color, alpha: 0.9 })
        .stroke({ color, width: 0.8 });
      break;
    }

    case "actor": {
      // User: circle head + shoulders
      g.circle(cx, y0 + 5, 2.8).stroke({ color, width: 1.4 });

      g.moveTo(x0 + 3.5, y0 + 14)
        .quadraticCurveTo(x0 + 3.5, y0 + 9.5, cx, y0 + 9.5)
        .quadraticCurveTo(x0 + 12.5, y0 + 9.5, x0 + 12.5, y0 + 14)
        .stroke({ color, width: 1.4, cap: "round" });
      break;
    }

    case "state": {
      // Database: cylinder
      g.ellipse(cx, y0 + 4, 5.5, 1.8).stroke({ color, width: 1.2 });

      g.moveTo(x0 + 2.5, y0 + 4)
        .lineTo(x0 + 2.5, y0 + 12)
        .quadraticCurveTo(cx, y0 + 14.2, x0 + 13.5, y0 + 12)
        .lineTo(x0 + 13.5, y0 + 4)
        .stroke({ color, width: 1.2 });

      g.moveTo(x0 + 2.5, y0 + 8)
        .quadraticCurveTo(cx, y0 + 10.2, x0 + 13.5, y0 + 8)
        .stroke({ color, width: 1.2 });
      break;
    }

    case "query": {
      // Search: magnifying glass
      g.circle(cx - 1.5, cy - 1.5, 4.2).stroke({ color, width: 1.5 });
      g.moveTo(cx + 1.8, cy + 1.8)
        .lineTo(x0 + 13.5, y0 + 13.5)
        .stroke({ color, width: 1.8, cap: "round" });
      break;
    }

    case "constraint": {
      // Ban / rule: circle with diagonal line
      g.circle(cx, cy, 5.8).stroke({ color, width: 1.4 });
      g.moveTo(cx - 4.1, cy - 4.1)
        .lineTo(cx + 4.1, cy + 4.1)
        .stroke({ color, width: 1.4, cap: "round" });
      break;
    }

    case "notify": {
      // Mail: envelope
      g.roundRect(x0 + 2, y0 + 4, 12, 8.5, 1.5).stroke({ color, width: 1.2 });
      g.moveTo(x0 + 2, y0 + 4)
        .lineTo(cx, y0 + 8.5)
        .lineTo(x0 + 14, y0 + 4)
        .stroke({ color, width: 1.2, join: "round" });
      break;
    }

    case "error": {
      // Warning: triangle with an exclamation mark
      g.moveTo(cx, y0 + 1.5)
        .lineTo(x0 + 14, y0 + 13)
        .lineTo(x0 + 2, y0 + 13)
        .closePath()
        .stroke({ color, width: 1.2, join: "round" });

      g.moveTo(cx, y0 + 5.5)
        .lineTo(cx, y0 + 9.5)
        .stroke({ color, width: 1.4, cap: "round" });

      g.circle(cx, y0 + 11.2, 0.85).fill({ color });
      break;
    }

    case "bdd": {
      // Given/When/Then: ListChecks icon (matching toolbar ListChecks)
      // Checkmark 1 (top)
      g.moveTo(x0 + 2.5, y0 + 4.5)
        .lineTo(x0 + 4.5, y0 + 6.8)
        .lineTo(x0 + 7.5, y0 + 3.2)
        .stroke({ color, width: 1.4, cap: "round", join: "round" });

      // Checkmark 2 (bottom)
      g.moveTo(x0 + 2.5, y0 + 11.5)
        .lineTo(x0 + 4.5, y0 + 13.8)
        .lineTo(x0 + 7.5, y0 + 10.2)
        .stroke({ color, width: 1.4, cap: "round", join: "round" });

      // Horizontal lines on the right
      g.moveTo(x0 + 9.5, y0 + 4.5)
        .lineTo(x0 + 14, y0 + 4.5)
        .stroke({ color, width: 1.4, cap: "round" });

      g.moveTo(x0 + 9.5, y0 + 8.5)
        .lineTo(x0 + 14, y0 + 8.5)
        .stroke({ color, width: 1.4, cap: "round" });

      g.moveTo(x0 + 9.5, y0 + 12.5)
        .lineTo(x0 + 14, y0 + 12.5)
        .stroke({ color, width: 1.4, cap: "round" });
      break;
    }

    case "object": {
      // Cube / isometric box
      g.moveTo(cx, y0 + 2)
        .lineTo(x0 + 13, y0 + 5.8)
        .lineTo(x0 + 13, y0 + 11.5)
        .lineTo(cx, y0 + 14.5)
        .lineTo(x0 + 3, y0 + 11.5)
        .lineTo(x0 + 3, y0 + 5.8)
        .closePath()
        .stroke({ color, width: 1.2 });

      g.moveTo(cx, y0 + 7.5).lineTo(cx, y0 + 14.5).stroke({ color, width: 1.2 });
      g.moveTo(cx, y0 + 7.5).lineTo(x0 + 3, y0 + 5.8).stroke({ color, width: 1.2 });
      g.moveTo(cx, y0 + 7.5).lineTo(x0 + 13, y0 + 5.8).stroke({ color, width: 1.2 });
      break;
    }

    case "enum": {
      // Bullet list with lines (matching Lucide List icon)
      const dotR = 1.25;
      const xDot = x0 + 3.5;
      const xLineStart = x0 + 7;
      const xLineEnd = x0 + 13.5;

      g.circle(xDot, y0 + 4.5, dotR).fill({ color });
      g.moveTo(xLineStart, y0 + 4.5).lineTo(xLineEnd, y0 + 4.5).stroke({ color, width: 1.3, cap: "round" });

      g.circle(xDot, y0 + 8.5, dotR).fill({ color });
      g.moveTo(xLineStart, y0 + 8.5).lineTo(xLineEnd, y0 + 8.5).stroke({ color, width: 1.3, cap: "round" });

      g.circle(xDot, y0 + 12.5, dotR).fill({ color });
      g.moveTo(xLineStart, y0 + 12.5).lineTo(xLineEnd, y0 + 12.5).stroke({ color, width: 1.3, cap: "round" });
      break;
    }

    case "array": {
      // Brackets []
      g.moveTo(x0 + 5.5, y0 + 3.5)
        .lineTo(x0 + 3, y0 + 3.5)
        .lineTo(x0 + 3, y0 + 12.5)
        .lineTo(x0 + 5.5, y0 + 12.5)
        .stroke({ color, width: 1.4, cap: "square" });

      g.moveTo(x0 + 10.5, y0 + 3.5)
        .lineTo(x0 + 13, y0 + 3.5)
        .lineTo(x0 + 13, y0 + 12.5)
        .lineTo(x0 + 10.5, y0 + 12.5)
        .stroke({ color, width: 1.4, cap: "square" });
      break;
    }

    case "wrap": {
      // Parentheses () (matching Lucide Parentheses icon)
      // Left parenthesis (
      g.moveTo(cx - 2, cy - 5)
        .bezierCurveTo(cx - 5.8, cy - 2.5, cx - 5.8, cy + 2.5, cx - 2, cy + 5)
        .stroke({ color, width: 1.4, cap: "round" });

      // Right parenthesis )
      g.moveTo(cx + 2, cy - 5)
        .bezierCurveTo(cx + 5.8, cy - 2.5, cx + 5.8, cy + 2.5, cx + 2, cy + 5)
        .stroke({ color, width: 1.4, cap: "round" });
      break;
    }
  }
}

/**
 * Draws the authorization-action indicator (a shield with a check) used on
 * Command / Query card headers. Anchored at its own center like the ⓘ badge,
 * so it can sit beside it at any zoom level.
 */
export function drawActionIcon(
  g: Graphics,
  cx: number,
  cy: number,
  color: number = 0xffffff,
  alpha: number = 1,
): void {
  const halfW = 5.2;
  const top = cy - 6.4;
  const bottom = cy + 6.8;

  g.moveTo(cx, top)
    .lineTo(cx + halfW, top + 2.4)
    .lineTo(cx + halfW, cy + 1.2)
    .quadraticCurveTo(cx + halfW, bottom - 1.4, cx, bottom)
    .quadraticCurveTo(cx - halfW, bottom - 1.4, cx - halfW, cy + 1.2)
    .lineTo(cx - halfW, top + 2.4)
    .closePath()
    .stroke({ color, width: 1.3, alpha });

  // Check mark inside the shield — reads as "authorization granted".
  g.moveTo(cx - 2.2, cy)
    .lineTo(cx - 0.5, cy + 1.8)
    .lineTo(cx + 2.4, cy - 1.6)
    .stroke({ color, width: 1.3, cap: "round", join: "round", alpha });
}
