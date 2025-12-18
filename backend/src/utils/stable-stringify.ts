/**
 * Deterministic JSON stringification for consistent hashing
 * Sorts object keys alphabetically
 */
export function stableStringify(obj: any): string {
  if (obj === null) return 'null';
  if (obj === undefined) return 'undefined';
  if (typeof obj !== 'object') return JSON.stringify(obj);

  if (Array.isArray(obj)) {
    return '[' + obj.map(item => stableStringify(item)).join(',') + ']';
  }

  const keys = Object.keys(obj).sort();
  const pairs = keys.map(key => {
    const value = stableStringify(obj[key]);
    return `${JSON.stringify(key)}:${value}`;
  });

  return '{' + pairs.join(',') + '}';
}
