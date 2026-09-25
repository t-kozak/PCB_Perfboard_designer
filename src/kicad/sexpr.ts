/**
 * Minimal S-expression reader/writer for KiCad files. Pure — no DOM.
 *
 * A list is an array; an atom is a string. Quoted and bare atoms are not
 * distinguished on read (`(pin 1)` and `(pin "1")` are the same to KiCad). On
 * write, like KiCad's own netlists, a list's head keyword is bare and every
 * other atom is quoted: `(ref "R1")`.
 */

export type SExpr = string | SExpr[];

export function parseSExpr(text: string): SExpr {
  let i = 0;
  const n = text.length;

  function skipSpace() {
    while (i < n && /\s/.test(text[i])) i++;
  }

  function readString(): string {
    i++; // opening quote
    let out = "";
    while (i < n && text[i] !== '"') {
      if (text[i] === "\\" && i + 1 < n) {
        const c = text[i + 1];
        out += c === "n" ? "\n" : c === "t" ? "\t" : c;
        i += 2;
      } else {
        out += text[i++];
      }
    }
    if (i >= n) throw new Error("Unterminated string in netlist");
    i++; // closing quote
    return out;
  }

  function readAtom(): string {
    const start = i;
    while (i < n && !/[\s()"]/.test(text[i])) i++;
    return text.slice(start, i);
  }

  function readExpr(): SExpr {
    skipSpace();
    if (i >= n) throw new Error("Unexpected end of netlist");
    if (text[i] === "(") {
      i++;
      const list: SExpr[] = [];
      for (;;) {
        skipSpace();
        if (i >= n) throw new Error("Unbalanced parentheses in netlist");
        if (text[i] === ")") {
          i++;
          return list;
        }
        list.push(readExpr());
      }
    }
    if (text[i] === ")") throw new Error(`Unexpected ")" at offset ${i}`);
    if (text[i] === '"') return readString();
    return readAtom();
  }

  const expr = readExpr();
  skipSpace();
  if (i < n) throw new Error(`Trailing content after the netlist at offset ${i}`);
  return expr;
}

/** Head symbol of a list (`(comp …)` → "comp"), or undefined. */
export function head(e: SExpr): string | undefined {
  return Array.isArray(e) && typeof e[0] === "string" ? e[0] : undefined;
}

/** Every direct child list of `e` headed `name`. */
export function children(e: SExpr, name: string): SExpr[][] {
  if (!Array.isArray(e)) return [];
  return e.filter((c): c is SExpr[] => head(c) === name);
}

/** First direct child list of `e` headed `name`. */
export function child(e: SExpr, name: string): SExpr[] | undefined {
  return children(e, name)[0];
}

/** The first atom after the head of `(name atom …)` inside `e`, e.g. `text(comp, "ref")`. */
export function text(e: SExpr, name: string): string | undefined {
  const c = child(e, name);
  return c && typeof c[1] === "string" ? c[1] : undefined;
}

/** The atoms after the head of a list — `(at 3 4 90)` → ["3","4","90"]. */
export function atoms(e: SExpr[] | undefined): string[] {
  return e ? e.slice(1).filter((x): x is string => typeof x === "string") : [];
}

function quote(a: string): string {
  return `"${a.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

/**
 * Pretty-prints an expression. A list whose children are all atoms stays on
 * one line; otherwise each child list goes on its own indented line.
 */
export function writeSExpr(e: SExpr, indent = 0): string {
  if (typeof e === "string") return quote(e);
  const flat = e.every(c => typeof c === "string");
  if (flat) return `(${e.map((c, i) => (i === 0 ? c : quote(c as string))).join(" ")})`;
  const pad = "  ".repeat(indent + 1);
  let out = "(";
  let lineLen = indent * 2 + 1;
  let first = true;
  let brokeLine = false;
  for (const [i, c] of e.entries()) {
    const leaf = typeof c === "string" || c.every(x => typeof x === "string");
    const s = i === 0 && typeof c === "string" ? c : writeSExpr(c, indent + 1);
    // Atoms and short leaf lists stay on the head's line until a nested list
    // has broken it, or it would run past ~100 columns.
    if (leaf && !brokeLine && lineLen + s.length < 100) {
      out += (first ? "" : " ") + s;
      lineLen += s.length + 1;
    } else {
      out += `\n${pad}${s}`;
      brokeLine = true;
    }
    first = false;
  }
  return out + ")";
}
