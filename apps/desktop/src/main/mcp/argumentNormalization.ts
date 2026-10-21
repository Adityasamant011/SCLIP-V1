/** Repair only unambiguous transport encodings according to the advertised schema.
 * No missing values, comma splitting or editorial defaults. The
 * existing command validators still enforce bounds, identity and permissions. */
export function normalizeToolArguments(value: unknown, schema: any, depth = 0): any {
  if (!schema || depth > 40) return value
  const types: string[] = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : []
  if (typeof value === 'string') {
    // Empty XML object tags from Hermes represent an explicitly empty object.
    // Only repair an object-only schema; string unions and missing values retain their meaning.
    if(value.trim()==='' && types.includes('object') && !types.includes('string') && !types.includes('array'))return {}

    if (types.includes('object') || types.includes('array')) {
      try {
        const parsed = JSON.parse(value)
        if (parsed && typeof parsed === 'object' && (Array.isArray(parsed) ? types.includes('array') : types.includes('object'))) value = parsed
      } catch { /* Leave malformed JSON for the existing validator. */ }
    } else if (!types.includes('string')) {
      if ((types.includes('number') || types.includes('integer')) && /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) {
        const n = Number(value)
        if (Number.isFinite(n) && (!types.includes('integer') || Number.isSafeInteger(n))) value = n
      } else if (types.includes('boolean') && (value === 'true' || value === 'false')) value = value === 'true'
    }
  }
  if (types.includes('array') && !types.includes('object') && !schema.items?.properties?.item) {
    // Hermes wraps a bare XML item dictionary in a singleton list before MCP
    // dispatch. Unwrap that exact transport shape too, not genuine item fields.
    for(let wrappers=0;wrappers<16;wrappers++) {
      const candidate = Array.isArray(value) && value.length === 1 ? value[0] : value
      if(!candidate || typeof candidate !== 'object' || Array.isArray(candidate) || Object.keys(candidate).length!==1 || !Object.hasOwn(candidate,'item')) break
      const item=(candidate as Record<string,unknown>).item
      value=Array.isArray(item)?item:[item]
    }
  }
  if (Array.isArray(value) && types.includes('array')) return value.map(v => normalizeToolArguments(v, schema.items, depth + 1))
  if (value && typeof value === 'object' && !Array.isArray(value) && (types.includes('object') || schema.properties)) {
    return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, normalizeToolArguments(v, schema.properties?.[key] ?? (typeof schema.additionalProperties === 'object' ? schema.additionalProperties : undefined), depth + 1)]))
  }
  return value
}
