import type { Entity } from "../contracts/processModel.js";

const words = (value: string): string[] =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.toLowerCase());

export const snakeCase = (value: string): string => words(value).join("_");

export const kebabCase = (value: string): string => words(value).join("-");

export const pascalCase = (value: string): string =>
  words(value)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

export const camelCase = (value: string): string => {
  const pascal = pascalCase(value);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
};

export const humanize = (value: string): string => {
  const text = words(value).join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const pluralizeWord = (word: string): string => {
  if (/(s|x|z|ch|sh)$/.test(word)) return `${word}es`;
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
};

export const pluralizeId = (id: string): string => {
  const parts = id.split("_");
  const last = parts.pop() ?? id;
  return [...parts, pluralizeWord(last)].join("_");
};

export interface EntityNames {
  readonly model: string;
  readonly singularVar: string;
  readonly pluralVar: string;
  readonly plural: string;
  readonly table: string;
  readonly controllerFile: string;
  readonly controllerKey: string;
  readonly controllerClass: string;
  readonly routePath: string;
  readonly routeName: string;
  readonly pageDir: string;
  readonly policyClass: string;
  readonly validatorFile: string;
  readonly transformerClass: string;
  readonly label: string;
  readonly pluralLabel: string;
}

export const entityNames = (entity: Entity): EntityNames => {
  const plural = entity.plural_id ?? pluralizeId(entity.id);
  const model = pascalCase(entity.id);
  return {
    model,
    singularVar: camelCase(entity.id),
    pluralVar: camelCase(plural),
    plural,
    table: plural,
    controllerFile: `${plural}_controller`,
    controllerKey: pascalCase(plural),
    controllerClass: `${pascalCase(plural)}Controller`,
    routePath: kebabCase(plural),
    routeName: plural,
    pageDir: plural,
    policyClass: `${model}Policy`,
    validatorFile: entity.id,
    transformerClass: `${model}Transformer`,
    label: entity.name,
    pluralLabel: humanize(plural),
  };
};
