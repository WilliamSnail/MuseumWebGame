/* =============================================================================
   fx.js - 佩佩博物館 2 進階版 - interaction & effects toolkit
   -----------------------------------------------------------------------------
   Exactly one global: FX.  Plain ES2020; 11-20 起拆成 fx_core、fx_sound、fx_misc、fx_dice、fx_drag（這個檔只負責把它們組成 FX）. 音效大多即時合成；11-15 起少數用 /sfx/*.mp3（Pixabay，見 shared/sfx_files.js），用到才下載。
   Nothing here touches document/window at load time (safe to load in Node);
   every DOM / Web Audio access happens inside functions.
   Settings are read at call time from FX.settings and body.reduce-motion.
   ========================================================================== */
import { api, reduced } from "./fx_core.js";
import { sound } from "./fx_sound.js";
import { countTo, floatText, goldDust, press, spotlight, spotlightEnd, toast } from "./fx_misc.js";
import { createDiceTray, rollOverlay } from "./fx_dice.js";
import { drag, makeDraggable, makeDropTarget } from "./fx_drag.js";

Object.assign(api, {
  version: '1.0',
  settings: { reduceMotion: false, muted: false },
  isReduced: reduced,
  sound,
  createDiceTray,
  rollOverlay,
  makeDraggable,
  makeDropTarget,
  drag,
  countTo,
  toast,
  floatText,
  goldDust,
  spotlight,
  spotlightEnd,
  press,
});

export const FX = api;
