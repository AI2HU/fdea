import type { DesignCues } from "../contracts/project.js";
import { isChromatic, parseColor, toHex } from "../design/color.js";

const GENERIC_FONTS = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "ui-rounded",
  "inherit",
  "initial",
  "unset",
  "emoji",
  "math",
  "-apple-system",
  "blinkmacsystemfont",
  "segoe ui",
  "helvetica",
  "arial",
  "roboto",
  "helvetica neue",
]);

const firstBrandFont = (declaration: string): string | undefined => {
  for (const raw of declaration.split(",")) {
    const family = raw.trim().replace(/^["']|["']$/g, "");
    if (family === "" || family.startsWith("var(")) continue;
    if (!GENERIC_FONTS.has(family.toLowerCase())) return family;
  }
  return undefined;
};

const normalizeColor = (value: string): string | undefined => {
  const parsed = parseColor(value);
  return parsed === undefined ? undefined : toHex(parsed);
};

export const cuesFromCss = (css: string): DesignCues => {
  const colors: DesignCues["colors"] = [];
  const fonts = new Map<string, number>();
  let radius: string | undefined;
  let background: string | undefined;

  for (const match of css.matchAll(/--([a-z0-9-]+)\s*:\s*([^;}{]+)/gi)) {
    const name = (match[1] ?? "").toLowerCase();
    const value = (match[2] ?? "").trim();
    if (
      /(^|-)(primary|brand)(-|$)/.test(name) &&
      !/foreground|text|contrast/.test(name)
    ) {
      const color = normalizeColor(value);
      if (color !== undefined) {
        colors.push({
          value: color,
          cue: `css_custom_property:--${name}`,
          weight: 10,
        });
      }
    } else if (/(^|-)accent(-|$)/.test(name) && !/foreground|text/.test(name)) {
      const color = normalizeColor(value);
      if (color !== undefined) {
        colors.push({
          value: color,
          cue: `css_custom_property:--${name}`,
          weight: 4,
        });
      }
    } else if (/^(color-)?background$/.test(name)) {
      background ??= normalizeColor(value);
    } else if (/radius/.test(name) && /^\d+(\.\d+)?(rem|px)$/.test(value)) {
      radius ??= value;
    } else if (/font/.test(name) && /sans|body|base|family|^font$/.test(name)) {
      const family = firstBrandFont(value);
      if (family !== undefined) fonts.set(family, (fonts.get(family) ?? 0) + 5);
    }
  }

  for (const match of css.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
    const family = firstBrandFont(match[1] ?? "");
    if (family !== undefined) fonts.set(family, (fonts.get(family) ?? 0) + 1);
  }

  const frequency = new Map<string, number>();
  for (const match of css.matchAll(
    /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)/g,
  )) {
    const color = normalizeColor(match[0]);
    if (color !== undefined)
      frequency.set(color, (frequency.get(color) ?? 0) + 1);
  }
  for (const [value, count] of frequency) {
    const parsed = parseColor(value);
    if (parsed !== undefined && isChromatic(parsed)) {
      colors.push({ value, cue: "css_color_frequency", weight: count });
    }
  }

  return {
    colors,
    fonts: [...fonts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name),
    ...(radius === undefined ? {} : { radius }),
    ...(background === undefined ? {} : { background }),
  };
};

export const mergeCues = (...all: readonly DesignCues[]): DesignCues => {
  const fonts = [...new Set(all.flatMap((cues) => cues.fonts))];
  const radius = all.find((cues) => cues.radius !== undefined)?.radius;
  const background = all.find(
    (cues) => cues.background !== undefined,
  )?.background;
  return {
    colors: all.flatMap((cues) => cues.colors),
    fonts,
    ...(radius === undefined ? {} : { radius }),
    ...(background === undefined ? {} : { background }),
  };
};
