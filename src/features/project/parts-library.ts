import {Utils} from "../../utils/utils";
import {availableParts} from "../ic-catalog";
import {partsLibraryMarkdown} from "../../catalog/library";

// Downloads the parts library (src/catalog/library.ts) — built-ins plus this
// browser's custom parts — as a Markdown file to hand to an LLM writing a netlist.
Utils.getSafeHtmlElement<HTMLButtonElement>('partsLibraryBtn').addEventListener('click', function() {
  const url = URL.createObjectURL(new Blob([partsLibraryMarkdown(availableParts())], {type: "text/markdown"}));
  const a = document.createElement('a');
  a.setAttribute("href", url);
  a.setAttribute("download", "perfboard-parts-library.md");
  document.body.appendChild(a); // required for firefox
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});
