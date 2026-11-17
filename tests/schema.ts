// A small JSON Schema checker covering the keywords our schemas use.
type Schema = Record<string, any>;
export function validate(value: unknown, schema: Schema, path = '$'): string[] {
  const errs: string[] = [];
  const t = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
  if (schema.enum && !schema.enum.includes(value)) errs.push(`${path}: ${JSON.stringify(value)} is not one of ${schema.enum.join(', ')}`);
  if (schema.type && t !== schema.type) return [...errs, `${path}: expected ${schema.type}, got ${t}`];
  if (t === 'number') {
    if (schema.minimum !== undefined && (value as number) < schema.minimum) errs.push(`${path}: below minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && (value as number) > schema.maximum) errs.push(`${path}: above maximum ${schema.maximum}`);
  }
  if (t === 'array') {
    const a = value as unknown[];
    if (schema.minItems !== undefined && a.length < schema.minItems) errs.push(`${path}: fewer than ${schema.minItems} items`);
    if (schema.maxItems !== undefined && a.length > schema.maxItems) errs.push(`${path}: more than ${schema.maxItems} items`);
    (schema.prefixItems ?? []).forEach((s: Schema, i: number) => i < a.length && errs.push(...validate(a[i], s, `${path}[${i}]`)));
    if (schema.items) a.forEach((v, i) => errs.push(...validate(v, schema.items, `${path}[${i}]`)));
  }
  if (t === 'object') {
    const o = value as Record<string, unknown>;
    for (const k of schema.required ?? []) if (!(k in o)) errs.push(`${path}: missing "${k}"`);
    for (const [k, v] of Object.entries(o)) {
      const s = schema.properties?.[k];
      if (s) errs.push(...validate(v, s, `${path}.${k}`));
      else if (schema.additionalProperties === false) errs.push(`${path}: unexpected "${k}"`);
    }
  }
  return errs;
}
