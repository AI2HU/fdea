export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const hslToRgb = (h: number, s: number, l: number): Rgb => {
  const hue = ((h % 360) + 360) % 360;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - chroma / 2;
  const sector = Math.floor(hue / 60);
  const [r1, g1, b1] = [
    [chroma, x, 0],
    [x, chroma, 0],
    [0, chroma, x],
    [0, x, chroma],
    [x, 0, chroma],
    [chroma, 0, x],
  ][sector] ?? [0, 0, 0];
  return {
    r: Math.round(((r1 ?? 0) + m) * 255),
    g: Math.round(((g1 ?? 0) + m) * 255),
    b: Math.round(((b1 ?? 0) + m) * 255),
  };
};

const parseNumberList = (body: string): number[] =>
  body
    .split(/[\s,/]+/)
    .filter((part) => part !== "")
    .map((part) =>
      part.endsWith("%") ? Number(part.slice(0, -1)) / 100 : Number(part),
    );

export const parseColor = (input: string): Rgb | undefined => {
  const value = input.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/.exec(value)?.[1];
  if (hex !== undefined) {
    if (hex.length === 3 || hex.length === 4) {
      const [r, g, b] = [...hex].map((digit) => parseInt(digit + digit, 16));
      return r === undefined || g === undefined || b === undefined
        ? undefined
        : { r, g, b };
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      };
    }
    return undefined;
  }
  const rgb = /^rgba?\(([^)]+)\)$/.exec(value)?.[1];
  if (rgb !== undefined) {
    const parts = rgb.split(/[\s,/]+/).filter((part) => part !== "");
    const channels = parts
      .slice(0, 3)
      .map((part) =>
        part.endsWith("%")
          ? (Number(part.slice(0, -1)) / 100) * 255
          : Number(part),
      );
    if (
      channels.length !== 3 ||
      channels.some((channel) => Number.isNaN(channel))
    ) {
      return undefined;
    }
    const [r, g, b] = channels as [number, number, number];
    return {
      r: clamp(Math.round(r), 0, 255),
      g: clamp(Math.round(g), 0, 255),
      b: clamp(Math.round(b), 0, 255),
    };
  }
  const hsl = /^hsla?\(([^)]+)\)$/.exec(value)?.[1];
  if (hsl !== undefined) {
    const [h, s, l] = parseNumberList(hsl.replace(/deg/g, ""));
    if (h === undefined || s === undefined || l === undefined) return undefined;
    if ([h, s, l].some((part) => Number.isNaN(part))) return undefined;
    return hslToRgb(h, clamp(s, 0, 1), clamp(l, 0, 1));
  }
  return undefined;
};

export const toHex = ({ r, g, b }: Rgb): string =>
  `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;

export const luminance = ({ r, g, b }: Rgb): number => {
  const linear = (channel: number): number => {
    const scaled = channel / 255;
    return scaled <= 0.03928
      ? scaled / 12.92
      : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
};

export const saturation = ({ r, g, b }: Rgb): number => {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const lightness = (max + min) / 2;
  if (max === min) return 0;
  const delta = max - min;
  return delta / (1 - Math.abs(2 * lightness - 1));
};

export const lightness = ({ r, g, b }: Rgb): number =>
  (Math.max(r, g, b) + Math.min(r, g, b)) / 510;

export const contrastRatio = (a: Rgb, b: Rgb): number => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
};

export const readableForeground = (background: Rgb): string =>
  contrastRatio(background, { r: 255, g: 255, b: 255 }) >=
  contrastRatio(background, { r: 10, g: 10, b: 10 })
    ? "#ffffff"
    : "#0a0a0a";

export const isChromatic = (color: Rgb): boolean =>
  saturation(color) >= 0.2 && lightness(color) > 0.1 && lightness(color) < 0.9;

export const mix = (a: Rgb, b: Rgb, ratio: number): Rgb => ({
  r: Math.round(a.r * (1 - ratio) + b.r * ratio),
  g: Math.round(a.g * (1 - ratio) + b.g * ratio),
  b: Math.round(a.b * (1 - ratio) + b.b * ratio),
});
