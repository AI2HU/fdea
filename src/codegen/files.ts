export interface GeneratedFile {
  readonly path: string;
  readonly contents: string;
}

export const file = (path: string, contents: string): GeneratedFile => ({
  path,
  contents: contents.endsWith("\n") ? contents : `${contents}\n`,
});

export const quote = (value: string): string => JSON.stringify(value);

export const quoteList = (values: readonly string[]): string =>
  `[${values.map(quote).join(", ")}]`;
