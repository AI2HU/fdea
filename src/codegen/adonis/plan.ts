import type {
  Actor,
  Entity,
  Field,
  ProcessModel,
} from "../../contracts/processModel.js";
import {
  camelCase,
  entityNames,
  humanize,
  pascalCase,
  type EntityNames,
} from "../../process/naming.js";

export type CrudKind = "list" | "view" | "create" | "update" | "delete";

export interface TransitionPlan {
  readonly stepId: string;
  readonly label: string;
  readonly method: string;
  readonly routeName: string;
  readonly permission: string;
  readonly field: string;
  readonly from: readonly string[] | undefined;
  readonly to: string;
}

export interface ManagedField {
  readonly field: Field;
  readonly initial: string | undefined;
}

export interface EntityPlan {
  readonly entity: Entity;
  readonly managed: readonly ManagedField[];
  readonly names: EntityNames;
  readonly crud: ReadonlySet<CrudKind>;
  readonly transitions: readonly TransitionPlan[];
  readonly references: ReadonlyArray<{
    readonly field: Field;
    readonly target: EntityPlan;
  }>;
  readonly displayField: string;
}

export interface RolePlan {
  readonly actor: Actor;
  readonly permissions: readonly string[];
}

export interface GenerationPlan {
  readonly entities: readonly EntityPlan[];
  readonly permissions: readonly string[];
  readonly roles: readonly RolePlan[];
}

export const crudPermission = (entityId: string, kind: CrudKind): string =>
  `${entityId}.${kind}`;

export const transitionPermission = (
  entityId: string,
  stepId: string,
): string => `${entityId}.${stepId}`;

const FIRST_DISPLAY_TYPES = new Set(["string", "enum"]);

const displayFieldOf = (entity: Entity): string => {
  if (entity.display_field !== undefined) return entity.display_field;
  const preferred =
    entity.fields.find(
      (field) => field.required && FIRST_DISPLAY_TYPES.has(field.type),
    ) ?? entity.fields.find((field) => FIRST_DISPLAY_TYPES.has(field.type));
  return preferred?.name ?? "id";
};

export const attribute = (field: Field): string =>
  camelCase(field.type === "reference" ? `${field.name}_id` : field.name);

export const relationName = (field: Field): string => camelCase(field.name);

export const buildPlan = (model: ProcessModel): GenerationPlan => {
  const crud = new Map<string, Set<CrudKind>>();
  const transitions = new Map<string, TransitionPlan[]>();
  const permissionsByActor = new Map<string, Set<string>>();
  for (const actor of model.actors) permissionsByActor.set(actor.id, new Set());

  for (const step of model.steps) {
    for (const operation of step.operations) {
      let permission: string;
      if (
        operation.kind === "transition" &&
        operation.transition !== undefined
      ) {
        permission = transitionPermission(operation.entity_id, step.id);
        const list = transitions.get(operation.entity_id) ?? [];
        const names = entityNames(
          model.entities.find(
            (entity) => entity.id === operation.entity_id,
          ) as Entity,
        );
        list.push({
          stepId: step.id,
          label: step.name,
          method: `transition${pascalCase(step.id)}`,
          routeName: `${names.routeName}.${step.id}`,
          permission,
          field: operation.transition.field,
          from: operation.transition.from,
          to: operation.transition.to,
        });
        transitions.set(operation.entity_id, list);
      } else {
        const kind = operation.kind as CrudKind;
        permission = crudPermission(operation.entity_id, kind);
        const kinds = crud.get(operation.entity_id) ?? new Set<CrudKind>();
        kinds.add(kind);
        crud.set(operation.entity_id, kinds);
      }
      for (const actorId of step.actor_ids)
        permissionsByActor.get(actorId)?.add(permission);
    }
  }

  const byId = new Map<string, EntityPlan>();
  const build = (entity: Entity): EntityPlan => {
    const cached = byId.get(entity.id);
    if (cached !== undefined) return cached;
    const base = {
      entity,
      names: entityNames(entity),
      managed: managedFieldsOf(model, entity),
      crud: crud.get(entity.id) ?? new Set<CrudKind>(),
      transitions: dedupeTransitions(transitions.get(entity.id) ?? []),
      displayField: displayFieldOf(entity),
    };
    const references: Array<{ field: Field; target: EntityPlan }> = [];
    const plan: EntityPlan = { ...base, references };
    byId.set(entity.id, plan);
    for (const field of entity.fields) {
      if (field.type !== "reference" || field.references === undefined)
        continue;
      const target = model.entities.find(
        (candidate) => candidate.id === field.references,
      );
      if (target !== undefined)
        references.push({ field, target: build(target) });
    }
    return plan;
  };
  const entities = model.entities.map(build);

  const permissions = [
    ...new Set(
      model.steps.flatMap((step) =>
        step.operations.map((operation) =>
          operation.kind === "transition"
            ? transitionPermission(operation.entity_id, step.id)
            : crudPermission(operation.entity_id, operation.kind as CrudKind),
        ),
      ),
    ),
  ].sort();

  return {
    entities,
    permissions,
    roles: model.actors.map((actor) => ({
      actor,
      permissions: [...(permissionsByActor.get(actor.id) ?? [])].sort(),
    })),
  };
};

const managedFieldsOf = (
  model: ProcessModel,
  entity: Entity,
): ManagedField[] => {
  const usage = new Map<string, { from: Set<string>; to: Set<string> }>();
  for (const step of model.steps) {
    for (const operation of step.operations) {
      if (
        operation.kind !== "transition" ||
        operation.transition === undefined ||
        operation.entity_id !== entity.id
      ) {
        continue;
      }
      const entry = usage.get(operation.transition.field) ?? {
        from: new Set<string>(),
        to: new Set<string>(),
      };
      for (const value of operation.transition.from ?? [])
        entry.from.add(value);
      entry.to.add(operation.transition.to);
      usage.set(operation.transition.field, entry);
    }
  }
  const managed: ManagedField[] = [];
  for (const field of entity.fields) {
    const entry = usage.get(field.name);
    if (entry === undefined) continue;
    const values = field.enum_values ?? [];
    const notTargets = values.filter((value) => !entry.to.has(value));
    const withExits = notTargets.filter((value) => entry.from.has(value));
    const candidates = withExits.length > 0 ? withExits : notTargets;
    managed.push({
      field,
      initial: candidates.length === 1 ? candidates[0] : undefined,
    });
  }
  return managed;
};

const dedupeTransitions = (
  list: readonly TransitionPlan[],
): TransitionPlan[] => {
  const seen = new Set<string>();
  return list.filter((item) => {
    if (seen.has(item.routeName)) return false;
    seen.add(item.routeName);
    return true;
  });
};

export const labelOf = (field: Field): string =>
  field.label ?? humanize(field.name);

const managedOf = (plan: EntityPlan, field: Field): ManagedField | undefined =>
  plan.managed.find((managed) => managed.field.name === field.name);

export const createFields = (plan: EntityPlan): Field[] =>
  plan.entity.fields.filter(
    (field) => managedOf(plan, field)?.initial === undefined,
  );

export const updateFields = (plan: EntityPlan): Field[] =>
  plan.entity.fields.filter((field) => managedOf(plan, field) === undefined);

export const initialValues = (
  plan: EntityPlan,
): Array<{ field: Field; value: string }> =>
  plan.managed.flatMap(({ field, initial }) =>
    initial === undefined ? [] : [{ field, value: initial }],
  );

export const isCreateOnly = (plan: EntityPlan, field: Field): boolean =>
  managedOf(plan, field) !== undefined &&
  managedOf(plan, field)?.initial === undefined;
