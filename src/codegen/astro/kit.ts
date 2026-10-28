const CONFIG_IMPORT = "import { defineConfig } from 'astro/config';";
const CONFIG_EXPORT = "export default defineConfig({});";
const TSCONFIG_BASE = "astro/tsconfigs/strict";

export const TYPECHECK_SCRIPT = "astro check && vue-tsc --noEmit";

/** Registers the Vue integration and the Tailwind Vite plugin. */
export const astroConfig = (source: string): string | undefined => {
  if (!source.includes(CONFIG_IMPORT) || !source.includes(CONFIG_EXPORT)) {
    return undefined;
  }
  return source
    .replace(
      CONFIG_IMPORT,
      `${CONFIG_IMPORT}
import vue from '@astrojs/vue';
import tailwindcss from '@tailwindcss/vite';`,
    )
    .replace(
      CONFIG_EXPORT,
      `export default defineConfig({
  integrations: [vue()],
  vite: {
    plugins: [tailwindcss()],
  },
});`,
    );
};

const parseObject = (source: string): Record<string, unknown> | undefined => {
  try {
    const parsed: unknown = JSON.parse(source);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
};

/** Adds the `~/*` alias that the shared Vue primitives import from. */
export const astroTsconfig = (source: string): string | undefined => {
  const config = parseObject(source);
  if (config?.["extends"] !== TSCONFIG_BASE) return undefined;
  const compilerOptions = (config["compilerOptions"] ?? {}) as Record<
    string,
    unknown
  >;
  const next = {
    ...config,
    compilerOptions: { ...compilerOptions, paths: { "~/*": ["./src/*"] } },
  };
  return `${JSON.stringify(next, null, 2)}\n`;
};

/** `astro check` skips `.vue` files, so vue-tsc runs alongside it. */
export const astroPackageJson = (source: string): string | undefined => {
  const pkg = parseObject(source);
  const scripts = pkg?.["scripts"] as Record<string, string> | undefined;
  if (pkg === undefined || scripts?.["build"] !== "astro build") {
    return undefined;
  }
  const next = { ...pkg, scripts: { ...scripts, typecheck: TYPECHECK_SCRIPT } };
  return `${JSON.stringify(next, null, 2)}\n`;
};
