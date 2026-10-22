import type {
  DesignSpec,
  DesignTokens,
  ProjectState,
} from "../contracts/project.js";
import {
  luminance,
  mix,
  parseColor,
  readableForeground,
  toHex,
} from "./color.js";

export const SYSTEM_FONT_STACK =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const SHADCN_DEFAULT_TOKENS: DesignTokens = {
  primary: "oklch(0.205 0 0)",
  primary_foreground: "oklch(0.985 0 0)",
  background: "oklch(1 0 0)",
  foreground: "oklch(0.145 0 0)",
  accent: "oklch(0.97 0 0)",
  muted: "oklch(0.97 0 0)",
  border: "oklch(0.922 0 0)",
  destructive: "oklch(0.577 0.245 27.325)",
  radius: "0.625rem",
  font_sans: SYSTEM_FONT_STACK,
};

const cuePriority = (cue: string): number => {
  if (/^css_custom_property:--(.*-)?(primary|brand)/.test(cue)) return 4;
  if (cue === "meta_theme_color") return 3;
  if (cue.startsWith("css_custom_property:")) return 2;
  return 1;
};

export const resolveDesign = (state: ProjectState): DesignSpec => {
  if (state.submitted_design !== undefined) {
    return {
      kind: "agent_provided",
      tokens: state.submitted_design.tokens,
      provenance: state.submitted_design.provenance,
    };
  }
  const designSources = state.sources.filter(
    (source) => source.role === "design",
  );
  const candidates = designSources.flatMap((source) =>
    source.design_cues.colors.map((color) => ({
      ...color,
      sourceId: source.id,
    })),
  );
  const primary = candidates
    .filter((candidate) => parseColor(candidate.value) !== undefined)
    .sort(
      (a, b) => cuePriority(b.cue) - cuePriority(a.cue) || b.weight - a.weight,
    )[0];
  if (primary === undefined) {
    return {
      kind: "shadcn_default",
      tokens: SHADCN_DEFAULT_TOKENS,
      provenance: [],
    };
  }
  const primaryRgb = parseColor(primary.value);
  if (primaryRgb === undefined) {
    return {
      kind: "shadcn_default",
      tokens: SHADCN_DEFAULT_TOKENS,
      provenance: [],
    };
  }
  const provenance = [
    { source_id: primary.sourceId, cue: `primary from ${primary.cue}` },
  ];

  let background = "#ffffff";
  const backgroundSource = designSources.find(
    (source) => source.design_cues.background !== undefined,
  );
  const backgroundRgb = parseColor(
    backgroundSource?.design_cues.background ?? "",
  );
  if (
    backgroundSource !== undefined &&
    backgroundRgb !== undefined &&
    luminance(backgroundRgb) > 0.7
  ) {
    background = toHex(backgroundRgb);
    provenance.push({
      source_id: backgroundSource.id,
      cue: "background from css",
    });
  }
  const white = { r: 255, g: 255, b: 255 };
  const fontSource = designSources.find(
    (source) => source.design_cues.fonts.length > 0,
  );
  const font = fontSource?.design_cues.fonts[0];
  if (fontSource !== undefined && font !== undefined) {
    provenance.push({ source_id: fontSource.id, cue: `font ${font}` });
  }
  const radiusSource = designSources.find(
    (source) => source.design_cues.radius !== undefined,
  );
  if (radiusSource !== undefined) {
    provenance.push({ source_id: radiusSource.id, cue: "radius from css" });
  }
  return {
    kind: "inferred",
    tokens: {
      primary: toHex(primaryRgb),
      primary_foreground: readableForeground(primaryRgb),
      background,
      foreground:
        readableForeground(parseColor(background) ?? white) === "#ffffff"
          ? "#fafafa"
          : "#0a0a0a",
      accent: toHex(mix(primaryRgb, parseColor(background) ?? white, 0.9)),
      muted: "#f5f5f5",
      border: "#e5e5e5",
      destructive: "#dc2626",
      radius: radiusSource?.design_cues.radius ?? "0.5rem",
      font_sans:
        font === undefined
          ? SYSTEM_FONT_STACK
          : `"${font}", ${SYSTEM_FONT_STACK}`,
    },
    provenance,
  };
};
