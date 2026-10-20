import { z } from 'zod';

/**
 * Builds the JSON schema for `output_config.format` from a Zod schema.
 *
 * The SDK's `zodOutputFormat` helper moves `enum` and `const` into the
 * description text, so the model is only asked, not constrained, to pick a
 * catalogue id. Structured outputs do support `enum` and `const`, so this
 * transform keeps them in the grammar and moves only the keywords the API
 * rejects (numeric bounds, string lengths, large `minItems`) into the
 * description. The response is still validated with the Zod schema itself.
 */

type JsonSchema = Record<string, unknown>;

const KEPT_STRING_FORMATS = new Set(['date-time', 'time', 'date', 'duration', 'email', 'hostname', 'uri', 'ipv4', 'ipv6', 'uuid']);

function take<T = unknown>(schema: JsonSchema, key: string): T | undefined {
  const value = schema[key] as T | undefined;
  delete schema[key];
  return value;
}

function strict(input: JsonSchema): JsonSchema {
  const schema: JsonSchema = { ...input };
  const out: JsonSchema = {};

  const defs = take<Record<string, JsonSchema>>(schema, '$defs');
  if (defs) out.$defs = Object.fromEntries(Object.entries(defs).map(([name, def]) => [name, strict(def)]));

  const ref = take<string>(schema, '$ref');
  if (ref !== undefined) {
    out.$ref = ref;
    return out;
  }

  take(schema, '$schema');
  const type = take<string>(schema, 'type');
  const anyOf = take<JsonSchema[]>(schema, 'anyOf') ?? take<JsonSchema[]>(schema, 'oneOf');
  const allOf = take<JsonSchema[]>(schema, 'allOf');
  if (anyOf) out.anyOf = anyOf.map(strict);
  else if (allOf) out.allOf = allOf.map(strict);
  if (type !== undefined) out.type = type;

  const enumValues = take<unknown[]>(schema, 'enum');
  if (enumValues) out.enum = enumValues;
  if ('const' in schema) out.const = take(schema, 'const');

  const description = take<string>(schema, 'description');
  if (description !== undefined) out.description = description;

  if (type === 'object') {
    const properties = take<Record<string, JsonSchema>>(schema, 'properties') ?? {};
    out.properties = Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, strict(value)]));
    take(schema, 'additionalProperties');
    out.additionalProperties = false;
    const required = take<string[]>(schema, 'required');
    if (required) out.required = required;
  } else if (type === 'string') {
    const format = take<string>(schema, 'format');
    if (format && KEPT_STRING_FORMATS.has(format)) out.format = format;
    else if (format) schema.format = format;
    take(schema, 'pattern');
  } else if (type === 'array') {
    const items = take<JsonSchema>(schema, 'items');
    if (items) out.items = strict(items);
    const minItems = take<number>(schema, 'minItems');
    if (minItems === 0 || minItems === 1) out.minItems = minItems;
    else if (minItems !== undefined) schema.minItems = minItems;
  }

  // Integer bounds generated for z.number().int() are the safe-integer range
  // and carry no meaning; drop them instead of describing them.
  if (schema.minimum === Number.MIN_SAFE_INTEGER) delete schema.minimum;
  if (schema.maximum === Number.MAX_SAFE_INTEGER) delete schema.maximum;

  const rest = Object.entries(schema);
  if (rest.length > 0) {
    const note = `{${rest.map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join(', ')}}`;
    out.description = out.description ? `${out.description}\n\n${note}` : note;
  }
  return out;
}

export function outputFormat(schema: z.ZodType) {
  return {
    type: 'json_schema' as const,
    schema: strict(z.toJSONSchema(schema, { reused: 'ref' }) as JsonSchema),
  };
}
