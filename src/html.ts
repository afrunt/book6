const MAP: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v: unknown): string => String(v ?? '').replace(/[&<>"']/g, (c) => MAP[c]);

/** Tagged template that escapes interpolations unless they are wrapped with raw(). */
export class Raw { constructor(public value: string) {} }
export const raw = (s: string): Raw => new Raw(s);
export function html(strings: TemplateStringsArray, ...vals: unknown[]): Raw {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < vals.length) {
      const v = vals[i];
      out += Array.isArray(v) ? v.map((x) => (x instanceof Raw ? x.value : esc(x))).join('') : v instanceof Raw ? v.value : esc(v);
    }
  });
  return new Raw(out);
}

