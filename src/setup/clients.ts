import { homedir } from "node:os";
import { join } from "node:path";

export const CLIENT_IDS = [
  "cursor",
  "claude_code",
  "claude_desktop",
  "gemini_cli",
  "windsurf",
] as const;

export type ClientId = (typeof CLIENT_IDS)[number];

export interface ClientSpec {
  readonly id: ClientId;
  readonly label: string;
  readonly configPath: string;
  readonly skillsDir?: string;
}

export interface ClientEnvironment {
  readonly home: string;
  readonly platform: NodeJS.Platform;
  readonly appData: string | undefined;
}

export const defaultEnvironment = (): ClientEnvironment => ({
  home: homedir(),
  platform: process.platform,
  appData: process.env["APPDATA"],
});

const claudeDesktopConfig = (environment: ClientEnvironment): string => {
  if (environment.platform === "darwin") {
    return join(
      environment.home,
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json",
    );
  }
  if (environment.platform === "win32") {
    return join(
      environment.appData ?? join(environment.home, "AppData", "Roaming"),
      "Claude",
      "claude_desktop_config.json",
    );
  }
  return join(
    environment.home,
    ".config",
    "Claude",
    "claude_desktop_config.json",
  );
};

export const clientSpecs = (
  environment: ClientEnvironment,
): readonly ClientSpec[] => [
  {
    id: "cursor",
    label: "Cursor",
    configPath: join(environment.home, ".cursor", "mcp.json"),
    skillsDir: join(environment.home, ".cursor", "skills"),
  },
  {
    id: "claude_code",
    label: "Claude Code",
    configPath: join(environment.home, ".claude.json"),
    skillsDir: join(environment.home, ".claude", "skills"),
  },
  {
    id: "claude_desktop",
    label: "Claude Desktop",
    configPath: claudeDesktopConfig(environment),
  },
  {
    id: "gemini_cli",
    label: "Gemini CLI",
    configPath: join(environment.home, ".gemini", "settings.json"),
  },
  {
    id: "windsurf",
    label: "Windsurf",
    configPath: join(
      environment.home,
      ".codeium",
      "windsurf",
      "mcp_config.json",
    ),
  },
];

export const isClientId = (value: string): value is ClientId =>
  (CLIENT_IDS as readonly string[]).includes(value);
