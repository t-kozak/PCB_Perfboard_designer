import {Ic} from "./ic";
import {CATALOG_PARTS, CatalogPart} from "../catalog/parts";

/** A fresh, unrotated `Ic` for a catalog (or synthesized) part, carrying its stable `partId`. */
export function icFromPart(part: CatalogPart, isCustom = false): Ic {
  const ic = new Ic(
    part.widthPin,
    part.heightPin,
    {...part.pinDescription},
    part.name,
    part.category,
    isCustom,
    part.kind,
    part.imageSrc,
    part.imageScaleX ?? 1,
    part.imageScaleY ?? 1,
    part.imageOffsetX ?? 0,
    part.imageOffsetY ?? 0,
  );
  ic.partId = part.id;
  return ic;
}

/**
 * The catalog entry an `Ic` template (built-in or custom) stands for, in its
 * unrotated 0° shape — a template can be rotated in the sidebar's placement
 * preview. Custom parts have no `partId`; they get `custom-<id>`.
 */
export function partOf(ic: Ic): CatalogPart {
  const swapped = ic.rotationAngle === 90 || ic.rotationAngle === 270;
  return {
    id: ic.partId ?? `custom-${ic.id}`,
    name: ic.name,
    category: ic.category,
    kind: ic.kind,
    widthPin: swapped ? ic.heightPin : ic.widthPin,
    heightPin: swapped ? ic.widthPin : ic.heightPin,
    pinDescription: {...ic.pinDescription},
    imageSrc: ic.imageSrc,
    imageScaleX: ic.imageScaleX,
    imageScaleY: ic.imageScaleY,
    imageOffsetX: ic.imageOffsetX,
    imageOffsetY: ic.imageOffsetY,
  };
}

/** Every part the sidebar currently offers (built-ins + custom), as catalog data. */
export function availableParts(): CatalogPart[] {
  return Ic.IC_CONTAINER.map(partOf);
}

/**
 * Re-run at startup and again after a project reset (`reset-project.ts`) to
 * restore the built-in catalog (src/catalog/parts.ts) alongside any custom ICs
 * saved in localStorage.
 */
export function loadDefaultIcs() {
  Ic.IC_CONTAINER = [];
  for (const part of CATALOG_PARTS) {
    Ic.add(icFromPart(part));
  }

  Ic.loadCustomIcsFromLocalStorage();
}
