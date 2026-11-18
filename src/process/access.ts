import type {
  Actor,
  Operation,
  ProcessModel,
  Step,
} from "../contracts/processModel.js";
import { humanize } from "./naming.js";

export type CrudKind = "list" | "view" | "create" | "update" | "delete";

export const crudPermission = (entityId: string, kind: CrudKind): string =>
  `${entityId}.${kind}`;

export const transitionPermission = (
  entityId: string,
  stepId: string,
): string => `${entityId}.${stepId}`;

export const operationPermission = (
  step: Step,
  operation: Operation,
): string =>
  operation.kind === "transition"
    ? transitionPermission(operation.entity_id, step.id)
    : crudPermission(operation.entity_id, operation.kind);

export interface RoleAccess {
  readonly actor: Actor;
  readonly permissions: readonly string[];
}

export interface AccessMatrix {
  readonly permissions: readonly string[];
  readonly roles: readonly RoleAccess[];
}

/** One role per actor, granted every operation of the steps that actor performs. */
export const deriveAccess = (model: ProcessModel): AccessMatrix => {
  const byActor = new Map<string, Set<string>>();
  for (const actor of model.actors) byActor.set(actor.id, new Set());
  const all = new Set<string>();
  for (const step of model.steps) {
    for (const operation of step.operations) {
      const permission = operationPermission(step, operation);
      all.add(permission);
      for (const actorId of step.actor_ids)
        byActor.get(actorId)?.add(permission);
    }
  }
  return {
    permissions: [...all].sort(),
    roles: model.actors.map((actor) => ({
      actor,
      permissions: [...(byActor.get(actor.id) ?? [])].sort(),
    })),
  };
};

export interface AccessPermission {
  readonly slug: string;
  readonly label: string;
  readonly granted_by_steps: readonly string[];
}

export interface AccessRolePreview {
  readonly id: string;
  readonly name: string;
  readonly permissions: readonly string[];
}

export interface AccessMatrixPreview {
  readonly roles: readonly AccessRolePreview[];
  readonly permissions: readonly AccessPermission[];
  readonly summary: string;
  readonly notes: readonly string[];
}

const describePermissions = (model: ProcessModel): AccessPermission[] => {
  const entityName = new Map(
    model.entities.map((entity) => [entity.id, entity.name]),
  );
  const described = new Map<string, { label: string; steps: Set<string> }>();
  for (const step of model.steps) {
    for (const operation of step.operations) {
      const slug = operationPermission(step, operation);
      const entity =
        entityName.get(operation.entity_id) ?? humanize(operation.entity_id);
      const label =
        operation.kind === "transition"
          ? `${step.name} (${entity})`
          : `${humanize(operation.kind)} ${entity}`;
      const entry = described.get(slug) ?? { label, steps: new Set<string>() };
      entry.steps.add(step.name);
      described.set(slug, entry);
    }
  }
  return [...described.entries()]
    .map(([slug, { label, steps }]) => ({
      slug,
      label,
      granted_by_steps: [...steps],
    }))
    .sort((left, right) => left.slug.localeCompare(right.slug));
};

const formatAccessSummary = (
  roles: readonly AccessRolePreview[],
  permissions: readonly AccessPermission[],
  notes: readonly string[],
): string => {
  const labelOf = new Map(
    permissions.map((permission) => [permission.slug, permission.label]),
  );
  const roleBlocks = roles.map((role) => {
    const lines =
      role.permissions.length === 0
        ? "- _No permissions: this role can sign in but cannot act on the process._"
        : role.permissions
            .map((slug) => `- ${labelOf.get(slug) ?? slug} (\`${slug}\`)`)
            .join("\n");
    return `### ${role.name} (\`${role.id}\`)\n${lines}`;
  });
  const header = `| Permission | ${roles.map((role) => role.name).join(" | ")} |`;
  const divider = `| --- | ${roles.map(() => ":---:").join(" | ")} |`;
  const rows = permissions.map(
    (permission) =>
      `| ${permission.label} | ${roles
        .map((role) =>
          role.permissions.includes(permission.slug) ? "yes" : "",
        )
        .join(" | ")} |`,
  );
  const matrix =
    roles.length === 0 || permissions.length === 0
      ? ""
      : `\n\n## Matrix\n\n${[header, divider, ...rows].join("\n")}`;
  return `# Who can do what

${roleBlocks.join("\n\n")}${matrix}

### Notes
${notes.map((note) => `- ${note}`).join("\n")}`;
};

export const buildAccessMatrixPreview = (
  model: ProcessModel,
): AccessMatrixPreview => {
  const access = deriveAccess(model);
  const roles = access.roles.map((role) => ({
    id: role.actor.id,
    name: role.actor.name,
    permissions: role.permissions,
  }));
  const permissions = describePermissions(model);
  const notes = [
    "Each process actor becomes a role; a role is granted every operation of the steps its actor performs.",
    "The UI, the HTTP routes and the MCP tools (when enabled) enforce the same permissions.",
    "To change who can do what, change the actors of the process steps and resubmit the process model.",
  ];
  return {
    roles,
    permissions,
    notes,
    summary: formatAccessSummary(roles, permissions, notes),
  };
};
