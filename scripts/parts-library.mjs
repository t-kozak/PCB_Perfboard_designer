// Regenerates docs/parts-library.md from the built-in catalog (src/catalog/)
// — `pnpm parts-library`. Vite's module runner loads the TypeScript directly.
import {writeFileSync} from "node:fs";
import {runnerImport} from "vite";

const {module: library} = await runnerImport("/src/catalog/library.ts");
const {module: parts} = await runnerImport("/src/catalog/parts.ts");
const out = new URL("../docs/parts-library.md", import.meta.url);
writeFileSync(out, library.partsLibraryMarkdown(parts.CATALOG_PARTS));
console.log(`Wrote ${out.pathname}`);
