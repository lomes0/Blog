/**
 * Join class names, dropping anything falsy.
 *
 * haklex writes this inline at every call site as
 * `` `${a}${className ? ` ${className}` : ""}` ``, roughly sixty times across
 * the kit. One helper instead: the ported components read as component code
 * rather than as string arithmetic, and an added third class does not need the
 * template rewritten.
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/**
 * Every Base UI part types `className` as `string | ((state) => string)` — the
 * function form lets a caller vary classes on `open`/`pressed`/`side` without
 * a wrapper. haklex's kit ignores it: their templates interpolate `className`
 * into a string, so passing a function would stringify the function source
 * into the class attribute. Ours preserves it, which is why the kit's wrappers
 * merge with this rather than with `cx`.
 */
export function mergeClass<State>(
  base: string,
  incoming: string | ((state: State) => string | undefined) | undefined,
): string | ((state: State) => string) {
  if (typeof incoming === "function") {
    return (state: State) => cx(base, incoming(state));
  }
  return cx(base, incoming);
}
