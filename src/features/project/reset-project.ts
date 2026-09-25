import {Utils} from "../../utils/utils";
import {loadDefaultIcs} from "../ic-catalog";
import {newProject, projectHasWork} from "./boards";

Utils.getSafeHtmlElement<HTMLButtonElement>('newProjectBtn').addEventListener('click', function() {
  if (projectHasWork() && !confirm("Start a new project? Every board in this one will be discarded (export it first to keep it).")) return;
  loadDefaultIcs(); // restore the built-in IC catalog (drops parts a loaded file brought in)
  newProject();
});
