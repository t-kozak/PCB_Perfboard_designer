import {redrawCanvas} from "../draw-canvas";
import {IProjectSave} from "../../interfaces/project-save.interface";
import {loadProject} from "./load-project";
import {armAutosave} from "./autosave";
window.addEventListener('DOMContentLoaded', () => {
  if(localStorage.getItem('save') !== null) {
    try {
      console.log("loaad...")
      const save: IProjectSave = JSON.parse(localStorage.getItem('save') as any) as IProjectSave
      loadProject(save);
      redrawCanvas();
    }catch (e){
      console.error(e)
      console.log("Cant load save from local storage.")
    }

  }
  // Everything now in place (blank board or restored project) — start autosaving.
  armAutosave();
});
