import type { Field } from "../../contracts/processModel.js";
import { camelCase } from "../../process/naming.js";
import { referenceOptionsName } from "./emitData.js";
import { file, quote, type GeneratedFile } from "./files.js";
import {
  attribute,
  crudPermission,
  initialValues,
  updateFields,
  relationName,
  type EntityPlan,
  type GenerationPlan,
} from "./plan.js";

export interface HttpOptions {
  readonly rbac: boolean;
}

const preloads = (plan: EntityPlan): string =>
  plan.references
    .map(({ field }) => `.preload(${quote(relationName(field))})`)
    .join("");

const dateFields = (plan: EntityPlan): Field[] =>
  plan.entity.fields.filter(
    (field) => field.type === "date" || field.type === "datetime",
  );

const attributesExpression = (
  plan: EntityPlan,
  mode: "create" | "update",
): string => {
  const dates = dateFields(plan);
  const initials = mode === "create" ? initialValues(plan) : [];
  if (dates.length === 0 && initials.length === 0) return "payload";
  const dateParts = dates.map((field) => {
    const key = attribute(field);
    return field.required
      ? `${key}: DateTime.fromISO(payload.${key})`
      : `${key}: payload.${key} ? DateTime.fromISO(payload.${key}) : null`;
  });
  const initialParts = initials.map(
    ({ field, value }) => `${attribute(field)}: ${quote(value)}`,
  );
  return `{ ...payload, ${[...dateParts, ...initialParts].join(", ")} }`;
};

const optionsLoaders = (plan: EntityPlan): { loads: string; props: string } => {
  const seen = new Map<string, string>();
  const loads: string[] = [];
  const props: string[] = [];
  for (const { field, target } of plan.references) {
    const variable = referenceOptionsName(field);
    const display =
      target.displayField === "id" ? "id" : camelCase(target.displayField);
    if (!seen.has(variable)) {
      seen.set(variable, variable);
      loads.push(
        `    const ${variable} = (await ${target.names.model}.query().orderBy(${quote(display)})).map((row) => ({ id: row.id, label: String(row.${display}) }))`,
      );
    }
    props.push(variable);
  }
  return { loads: loads.join("\n"), props: props.join(", ") };
};

const authorize = (
  plan: EntityPlan,
  action: string,
  options: HttpOptions,
): string =>
  options.rbac
    ? `    await bouncer.with(${plan.names.policyClass}).authorize(${quote(action)})\n`
    : "";

const afterWrite = (plan: EntityPlan, variable: string): string => {
  if (plan.crud.has("view")) {
    return `response.redirect().toRoute(${quote(`${plan.names.routeName}.show`)}, { id: ${variable}.id })`;
  }
  if (plan.crud.has("list")) {
    return `response.redirect().toRoute(${quote(`${plan.names.routeName}.index`)})`;
  }
  return "response.redirect().toRoute('dashboard')";
};

const afterDelete = (plan: EntityPlan): string =>
  plan.crud.has("list")
    ? `response.redirect().toRoute(${quote(`${plan.names.routeName}.index`)})`
    : "response.redirect().toRoute('dashboard')";

export const controllerFile = (
  plan: EntityPlan,
  options: HttpOptions,
): GeneratedFile => {
  const { names } = plan;
  const needsDateTime = dateFields(plan).length > 0;
  const { loads, props } = optionsLoaders(plan);
  const methods: string[] = [];

  if (plan.crud.has("list")) {
    methods.push(`  async index({ inertia${options.rbac ? ", bouncer" : ""} }: HttpContext) {
${authorize(plan, "list", options)}    const ${names.pluralVar} = await ${names.model}.query()${preloads(plan)}.orderBy('id', 'desc')

    return inertia.render(${quote(`${names.pageDir}/index`)}, {
      ${names.pluralVar}: ${names.transformerClass}.transform(${names.pluralVar}),
    })
  }`);
  }
  if (plan.crud.has("create")) {
    methods.push(`  async create({ inertia${options.rbac ? ", bouncer" : ""} }: HttpContext) {
${authorize(plan, "create", options)}${loads === "" ? "" : `${loads}\n`}
    return inertia.render(${quote(`${names.pageDir}/create`)}, { ${props} })
  }

  async store({ request, response, session${options.rbac ? ", bouncer" : ""} }: HttpContext) {
${authorize(plan, "create", options)}    const payload = await request.validateUsing(create${names.model}Validator)
    const ${names.singularVar} = await ${names.model}.create(${attributesExpression(plan, "create")})

    session.flash('success', ${quote(`${names.label} created.`)})
    return ${afterWrite(plan, names.singularVar)}
  }`);
  }
  if (plan.crud.has("view")) {
    methods.push(`  async show({ inertia, params${options.rbac ? ", bouncer" : ""} }: HttpContext) {
${authorize(plan, "view", options)}    const ${names.singularVar} = await ${names.model}.query()${preloads(plan)}.where('id', params.id).firstOrFail()

    return inertia.render(${quote(`${names.pageDir}/show`)}, {
      ${names.singularVar}: ${names.transformerClass}.transform(${names.singularVar}),
    })
  }`);
  }
  if (plan.crud.has("update")) {
    methods.push(`  async edit({ inertia, params${options.rbac ? ", bouncer" : ""} }: HttpContext) {
${authorize(plan, "update", options)}    const ${names.singularVar} = await ${names.model}.query()${preloads(plan)}.where('id', params.id).firstOrFail()
${loads === "" ? "" : `${loads}\n`}
    return inertia.render(${quote(`${names.pageDir}/edit`)}, {
      ${names.singularVar}: ${names.transformerClass}.transform(${names.singularVar}),${props === "" ? "" : `\n      ${props},`}
    })
  }

  async update({ params, request, response, session${options.rbac ? ", bouncer" : ""} }: HttpContext) {
${authorize(plan, "update", options)}    const ${names.singularVar} = await ${names.model}.findOrFail(params.id)
    const payload = await request.validateUsing(update${names.model}Validator${updateFields(plan).some((field) => field.unique === true) ? `, { meta: { id: ${names.singularVar}.id } }` : ""})
    ${names.singularVar}.merge(${attributesExpression(plan, "update")})
    await ${names.singularVar}.save()

    session.flash('success', ${quote(`${names.label} updated.`)})
    return ${afterWrite(plan, names.singularVar)}
  }`);
  }
  if (plan.crud.has("delete")) {
    methods.push(`  async destroy({ params, response, session${options.rbac ? ", bouncer" : ""} }: HttpContext) {
${authorize(plan, "delete", options)}    const ${names.singularVar} = await ${names.model}.findOrFail(params.id)
    await ${names.singularVar}.delete()

    session.flash('success', ${quote(`${names.label} deleted.`)})
    return ${afterDelete(plan)}
  }`);
  }
  for (const transition of plan.transitions) {
    const field = camelCase(transition.field);
    const guard =
      transition.from === undefined
        ? ""
        : `    if (!${JSON.stringify(transition.from)}.includes(${names.singularVar}.${field})) {
      session.flash('error', ${quote(`${transition.label} is not available in the current state.`)})
      return response.redirect().back()
    }
`;
    methods.push(`  async ${transition.method}({ params, response, session${options.rbac ? ", bouncer" : ""} }: HttpContext) {
${authorize(plan, transition.stepId, options)}    const ${names.singularVar} = await ${names.model}.findOrFail(params.id)
${guard}    ${names.singularVar}.${field} = ${quote(transition.to)}
    await ${names.singularVar}.save()

    session.flash('success', ${quote(`${transition.label} done.`)})
    return response.redirect().back()
  }`);
  }

  const validators = [
    plan.crud.has("create") ? `create${names.model}Validator` : undefined,
    plan.crud.has("update") ? `update${names.model}Validator` : undefined,
  ].filter((value): value is string => value !== undefined);
  const targetImports = [
    ...new Map(
      plan.references
        .filter(() => plan.crud.has("create") || plan.crud.has("update"))
        .map(({ target }) => [target.names.model, target.entity.id] as const),
    ),
  ]
    .filter(([model]) => model !== names.model)
    .map(([model, id]) => `import ${model} from '#models/${id}'`);

  return file(
    `app/controllers/${names.controllerFile}.ts`,
    `import type { HttpContext } from '@adonisjs/core/http'
${needsDateTime ? "import { DateTime } from 'luxon'\n" : ""}import ${names.model} from '#models/${plan.entity.id}'
${targetImports.join("\n")}
import ${names.transformerClass} from '#transformers/${plan.entity.id}_transformer'
${validators.length === 0 ? "" : `import { ${validators.join(", ")} } from '#validators/${plan.entity.id}'\n`}${options.rbac ? `import ${names.policyClass} from '#policies/${plan.entity.id}_policy'\n` : ""}
export default class ${names.controllerClass} {
${methods.join("\n\n")}
}`,
  );
};

export const policyFile = (plan: EntityPlan): GeneratedFile => {
  const methods = [
    ...([...plan.crud] as const).map((kind) => ({
      name: kind,
      permission: crudPermission(plan.entity.id, kind),
    })),
    ...plan.transitions.map((transition) => ({
      name: transition.stepId,
      permission: transition.permission,
    })),
  ];
  return file(
    `app/policies/${plan.entity.id}_policy.ts`,
    `import type User from '#models/user'
import { BasePolicy } from '@adonisjs/bouncer'

export default class ${plan.names.policyClass} extends BasePolicy {
${methods
  .map(
    (method) => `  async ${method.name}(user: User) {
    return user.can(${quote(method.permission)})
  }`,
  )
  .join("\n\n")}
}`,
  );
};

export const routesFile = (plan: GenerationPlan): GeneratedFile => {
  const lines: string[] = [];
  for (const entity of plan.entities) {
    const { names } = entity;
    const base = `/${names.routePath}`;
    const key = names.controllerKey;
    const route = (
      method: string,
      path: string,
      action: string,
      name: string,
    ): void => {
      lines.push(
        `    router.${method}(${quote(path)}, [controllers.${key}, ${quote(action)}]).as(${quote(`${names.routeName}.${name}`)})`,
      );
    };
    if (entity.crud.has("list")) route("get", base, "index", "index");
    if (entity.crud.has("create")) {
      route("get", `${base}/create`, "create", "create");
      route("post", base, "store", "store");
    }
    if (entity.crud.has("view")) route("get", `${base}/:id`, "show", "show");
    if (entity.crud.has("update")) {
      route("get", `${base}/:id/edit`, "edit", "edit");
      route("put", `${base}/:id`, "update", "update");
    }
    if (entity.crud.has("delete"))
      route("delete", `${base}/:id`, "destroy", "destroy");
    for (const transition of entity.transitions) {
      lines.push(
        `    router.post(${quote(`${base}/:id/${transition.stepId.replaceAll("_", "-")}`)}, [controllers.${key}, ${quote(transition.method)}]).as(${quote(transition.routeName)})`,
      );
    }
  }
  return file(
    "start/routes.ts",
    `import { middleware } from '#start/kernel'
import { controllers } from '#generated/controllers'
import router from '@adonisjs/core/services/router'

router.get('/', ({ response }) => response.redirect().toRoute('dashboard')).as('home')

router
  .group(() => {
    router.get('login', [controllers.Session, 'create'])
    router.post('login', [controllers.Session, 'store'])
  })
  .use(middleware.guest())

router
  .group(() => {
    router.on('/dashboard').renderInertia('dashboard', {}).as('dashboard')
    router.post('logout', [controllers.Session, 'destroy'])

${lines.join("\n")}
  })
  .use(middleware.auth())
`,
  );
};

/** Appended after Lucid schema generation + MCP provider registration. */
export const MCP_ROUTE = `router.mcp().use([middleware.mcp(), middleware.auth({ guards: ['api'] })])
`;
