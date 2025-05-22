/**
 * 🎮 Rough implementation based on Gamepad API spec, with some disclaimers.
 * Gamepad support can vary, per-browser. Here be dragons, etc.
 * https://www.w3.org/TR/gamepad/
 */

import { keyboardMonitor, prefsManager } from '../aa.js';
import { common } from '../core/common.js';
import { game } from '../core/Game.js';
import {
  autoStart,
  clientFeatures,
  FPS,
  isMobile,
  isSafari
} from '../core/global.js';
import { utils } from '../core/utils.js';
import { updateAsNavigation } from './gamepad-menu-navigation.js';
import { GamepadManager } from './GamepadManager.js';
import { gamePrefs } from './preferences.js';

// multiply joystick values, more responsiveness
const JOYSTICK_SENSITIVITY = 1;

// middle / "inactive" position in a 9-axis d-pad
const OFFSET_CENTER = 4;

let css = {
  menuActive: 'active',
  buttonActive: 'active',
  gamepadActive: 'gamepad-active',
  hasGamepad: 'has-gamepad',
  gamepadSelected: 'gamepad-selected'
};

let data = {
  enabled: false,
  active: false,
  foundFirstGamepad: false,
  // initial defaults
  // TODO: use joystick default values * 100
  gamepadX: 0.5 * 100,
  gamepadY: 1 * 100,
  dPadOffset: OFFSET_CENTER,
  battleOverFocusOffset: 0,
  homeFocusOffset: 0,
  logged: {},
  prefsOffset: 0,
  waitUntilButtonRelease: false,
  repeatDelay: 300,
  repeatIntervalHome: 100,
  repeatInterval: 50,
  lastButtonTS: 0,
  state: {
    // hackish: external-facing status
    isFiring: false
  },
  hasFocus: document.hasFocus()
};

let dom = {
  controls: null,
  inventory: null
};

// D-pad offset (most controllers have only one)
const DPAD = 0;

// joystick offset: helicopter control
const FLY = 0;

// joystick offset: inventory UI
const MENU = 1;

/**
 * In-game actions, joystick -> keyboard code
 */
const actions = {
  missile: {
    keyCode: () => keyboardMonitor.keyMap.smartMissile
  },
  ammo: {
    keyCode: () => keyboardMonitor.keyMap.shift,
    relatedState: 'isFiring'
  },
  paratrooper: {
    keyCode: () => keyboardMonitor.keyMap.space
  },
  bomb: {
    keyCode: () => keyboardMonitor.keyMap.ctrl
  },
  preferences: {
    keyCode: () => keyboardMonitor.keyMap.esc
  }
};

// shoulder buttons -> helicopter weapons
const shoulderMap = {
  r1: actions.missile,
  r2: actions.ammo,
  l1: actions.paratrooper,
  l2: actions.bomb
};

// ABXY buttons -> helicopter weapons
const abxyMap = {
  bottom: actions.bomb,
  left: actions.ammo,
  top: actions.paratrooper,
  right: actions.missile
};

function navigate() {
  return updateAsNavigation(gamepadManager);
}

function onGamepadUpdate() {
  if (!gamePrefs.gamepad) return;

  // ignore if window is not in focus - excluding mobile, to be safe.
  if (!data.hasFocus && !isMobile) return;

  // home menu, etc.
  if (!game.data.started) return navigate();

  // won or lost, OR, prefs modal up?
  if (game.data.battleOver || prefsManager.isActive()) return navigate();

  // regular gameplay
  return updateAA();
}

function updateAA() {
  // In-game virtual mouse pointer and gamepad UX/UI
  if (!gamePrefs.gamepad) return;

  const { lastGamepadState, gamepadState } = gamepadManager.getState();

  // PS4 / standard: 'options' - NES30Pro, 'select'
  if (
    (gamepadState.buttons.options || gamepadState.buttons.select) &&
    !lastGamepadState.buttons.options
  ) {
    prefsManager.toggleDisplay();
  }

  // activate gamepad if a button is pressed.
  if (!data.active) {
    if (gamepadState.activeButtons) {
      setActive(true);
    } else {
      // gamepad is inactive, or has been disabled; ignore input.
      return;
    }
  }

  /**
   * When gamepad is activated via button press, prevent actions until release.
   * Otherwise, helicopter would immediately fire guns etc.
   */
  if (data.waitUntilButtonRelease) {
    if (!gamepadState.activeButtons) {
      // resume standard behaviour
      data.waitUntilButtonRelease = false;
    } else {
      // wait
      return;
    }
  }

  // Joystick: Helicopter controls

  // previous
  let lastX = lastGamepadState.joysticks[FLY].x;
  let lastY = lastGamepadState.joysticks[FLY].y;

  // current
  let curX = gamepadState.joysticks[FLY].x;
  let curY = gamepadState.joysticks[FLY].y;

  if ((lastX != 0 || lastY != 0) && curX == 0 && curY == 0) {
    // no-op?
    // TODO: refactor / DRY
  } else if (curX != 0 || curY != 0) {
    if (lastX == 0 && lastY == 0) {
      // "start" moving
      game.objects.joystick?.start?.({
        clientX: data.gamepadX,
        clientY: data.gamepadY,
        isGamepad: true
      });
    } else {
      // move relative to joystick
      data.gamepadX += curX * JOYSTICK_SENSITIVITY;
      data.gamepadY += curY * JOYSTICK_SENSITIVITY * 1.5;

      data.gamepadX = Math.max(0, Math.min(100, data.gamepadX));
      data.gamepadY = Math.max(0, Math.min(100, data.gamepadY));

      game.objects.joystick.jumpTo(data.gamepadX / 100, data.gamepadY / 100);
    }
  }

  checkDPad(gamepadState.dpads?.[DPAD]);

  /**
   * Joystick and/or ABXY button(s): Flip helicopter, or inventory order
   */

  let inventoryAction;

  let js = gamepadState.joysticks;
  let ljs = lastGamepadState.joysticks;

  // joystick button
  let menuJSButtonActive =
    js[MENU].button && js[MENU].button !== ljs[MENU].button;

  // joystick button
  let flyJSButtonActive = js[FLY].button && js[FLY].button !== ljs[FLY].button;

  if (flyJSButtonActive) {
    // flip if D-pad is not engaged - otherwise, D-pad + flight joystick button = select
    if (data.dPadOffset === OFFSET_CENTER) {
      game.players.local.flip();
    } else {
      inventoryAction = true;
    }
  } else if (data.dPadOffset !== OFFSET_CENTER && menuJSButtonActive) {
    // menu joystick button has been pressed, while D-pad is engaged.
    inventoryAction = true;
  }

  // ABXY "diamond" button group(s)
  let abxy = gamepadState.abxy[0];
  let lastABXY = lastGamepadState.abxy[0];

  if (abxy) {
    // if any ABXY button is pressed, consider this an action (if the D-pad is also engaged.)
    if (abxy.activeCount > lastABXY.activeCount) {
      inventoryAction = true;
    }
  }

  if (inventoryAction && data.dPadOffset !== OFFSET_CENTER) {
    // user has selected something from the inventory UI.
    inventoryClick(data.dPadOffset);
  }

  // is an inventory order still active, D-pad + button being held?
  let inventoryButtonActive =
    inventoryAction ||
    (data.dPadOffset !== OFFSET_CENTER &&
      (abxy.activeCount || js[MENU].button || js[FLY].button));

  // was it this previously active?
  let inventoryButtonWasActive =
    lastABXY.activeCount || ljs[MENU].button || ljs[FLY].button;

  if (inventoryButtonWasActive && !inventoryButtonActive) {
    let target = dom.inventory[data.dPadOffset]?.querySelector?.('a');
    utils.css.remove(target, css.buttonActive);
  }

  // check for shoulder button changes; these are independent of the D-pad.
  checkButtonGroup(gamepadState.buttons, lastGamepadState.buttons, shoulderMap);

  // finally - if the D-pad is not active, check ABXY for regular use cases e.g., firing weapons.
  if (data.dPadOffset !== OFFSET_CENTER) return;

  checkButtonGroup(abxy, lastABXY, abxyMap);
}

function checkDPadViaJoystick(js) {
  // map joystick position to a 9-axis D-pad

  // if not found, bail safely
  if (!js) return OFFSET_CENTER;

  let { x, y } = js;

  let row, col, itemsPerRow, div;

  // 3x3
  itemsPerRow = 3;

  // one cell width or height
  div = 1 / itemsPerRow;

  // column (L->R)
  if (x <= -div) {
    col = 0;
  } else if (x >= -div && x <= div) {
    col = 1;
  } else {
    col = 2;
  }

  // row (T->B)
  if (y <= -div) {
    row = 0;
  } else if (y >= -div && y <= div) {
    row = 1;
  } else {
    row = 2;
  }

  return row * itemsPerRow + col;
}

function checkDPad(dpad) {
  if (!dpad) return;

  let { offset } = dpad;

  const { gamepadState } = gamepadManager.getState();

  if (offset === OFFSET_CENTER) {
    // D-pad inactive - try joystick, which may be assigned
    offset = checkDPadViaJoystick(gamepadState.joysticks[MENU]);
  }

  // bail if unchanged
  if (offset === data.dPadOffset) return;

  // update selection
  let items = dom.inventory;

  if (items[data.dPadOffset]) {
    // deselect
    items[data.dPadOffset].style.borderColor = '';
    // ensure the button is no longer activated
    utils.css.remove(
      items[data.dPadOffset].querySelector('a'),
      css.buttonActive
    );
  }

  if (items[offset]) {
    // inactive / active
    items[offset].style.borderColor = offset === OFFSET_CENTER ? '' : '#33ff33';
  }

  // mark the menu as being active, or not.
  utils.css.addOrRemove(dom.controls, offset !== OFFSET_CENTER, css.menuActive);

  // update
  data.dPadOffset = offset;
}

function checkButtonGroup(csGroup, lsGroup, groupMap) {
  // current state group, last state group, map
  for (let btn in groupMap) {
    // ignore if unchaged
    if (csGroup[btn] === lsGroup[btn]) continue;

    keyboardMonitor[csGroup[btn] ? 'keydown' : 'keyup']({
      keyCode: groupMap[btn].keyCode(),
      fromAATouch: true
    });

    // update local state, e.g., `isFiring`, accordingly
    if (groupMap[btn].relatedState) {
      data.state[groupMap[btn].relatedState] = !!csGroup[btn];
    }
  }
}

function inventoryClick(offset) {
  let target = dom.inventory[offset]?.querySelector?.('a');

  if (!target) return;

  // some sort of button - inventory, or helicopter controls.
  let keyMapValue;
  let keyCode;

  keyMapValue = target.getAttribute('data-keyMap');

  if (!keyMapValue) return;

  // if a comma-delimited list (e.g., smart missile types), split into an array and pick one.
  if (keyMapValue.indexOf(',') !== -1) {
    keyMapValue = oneOf(keyMapValue.split(','));
  }

  keyCode = keyboardMonitor.keyMap[keyMapValue];

  if (!keyCode) return;

  keyboardMonitor.keydown({ keyCode, fromAATouch: true });

  // update UI
  utils.css.add(target, css.buttonActive);

  // release key, momentarily
  common.setFrameTimeout(() => {
    keyboardMonitor.keyup({ keyCode });
  }, 1 / FPS);
}

function onAddOrRemove(lastKnownGamepadCount, gpInfo = {}) {
  // a gamepad has been added, or removed from the browser's perspective.

  // if prefs manager is active, gamepad list may be showing.
  if (prefsManager.isActive()) {
    prefsManager.updateGamepadList();
  }

  // ignore if pref is off
  if (!gamePrefs.gamepad) return;

  let cfg = gamepadManager.checkGamepadSupport(gpInfo.gamepad);

  let logInfo = {
    event: 'GAMEPAD',
    id: gpInfo.gamepad.id,
    label: cfg?.label,
    mapping: gpInfo?.gamepad?.mapping || 'NONE',
    supported: !!cfg,
    buttons: gpInfo.gamepad.buttons?.length || 'unknown',
    axes: gpInfo.gamepad.axes?.length || 'unknown',
    user_agent: navigator.userAgent
  };

  let effects = gpInfo?.gamepad?.vibrationActuator?.effects?.join?.(',');

  if (effects) {
    logInfo.effects = effects;
  }

  // only assign if known; Safari seems not to provide this.
  if (
    cfg?.vendor &&
    cfg?.product &&
    cfg.vendor !== 'standard' &&
    cfg.product !== 'standard'
  ) {
    logInfo.vendor = cfg.vendor;
    logInfo.product = cfg.product;
  }

  maybeLog(logInfo);

  if (game.data.started && !game.data.paused) {
    // Safari gets label first, because it lacks p/v info. Everyone else gets the ID first.
    let label = getPrettyLabel(cfg?.label, gpInfo.gamepad.id);

    // Don't notify about "standard/generic" e.g., in Safari - keep it brief.
    let labelDetail = label?.match?.(/generic/i) ? '' : `: ${label}`;

    if (gpInfo.connected && !cfg) {
      // warn if not supported
      game.objects.notifications.add(`🎮 ⛔ Not supported 😞: ${label}`);
    } else {
      game.objects.notifications.add(
        `🎮 ${gpInfo.connected ? 'Connected' : 'Disconnected'}${labelDetail}`
      );
    }
  }

  // hackish: catch the first-added gamepad for the home screen case.
  if (
    !data.foundFirstGamepad &&
    !game.data.started &&
    lastKnownGamepadCount === 1
  ) {
    data.foundFirstGamepad = true;

    /**
     * Special case: gamepad activated during auto-start (campaign) on mobile.
     * First button press should set focus on "start" button.
     * User will be prompted RE: touch required to enable sound.
     */
    if (!game.data.started && autoStart && isMobile) {
      // button press = start game, but touch may be required for sound to work.
      let node = document.getElementById('start-game-button-mobile');
      node?.focus();
    } else {
      if (prefsManager.isActive()) {
        // element depends on state - battle selection, prefs, network etc.
        prefsManager.setDefaultFocus();
      }
    }
  }

  updateCSS();

  if (lastKnownGamepadCount) return;

  // reset state, and deactivate if no gamepads connected.
  Object.keys(data.state).forEach((k) => (data.state[k] = false));
  setActive(false);
}

function getPrettyLabel(gpLabel, gpID) {
  /**
   * Safari gets label first, because it lacks p/v info.
   * Others take label if not "generic" - else, ID.
   */
  let label =
    isSafari || (gpLabel && !gpLabel?.match(/generic/i))
      ? gpLabel
      : gpID || gpLabel;

  let firstBracket = label.indexOf('(');

  if (firstBracket !== -1) {
    label = label.substr(0, firstBracket - 1);
  }

  // there might be whitespace, e.g., before the just-dropped bracket.
  label = label.trim();

  return label || 'unknown';
}

function maybeLog(info = {}) {
  /**
   * This exists to gather stats on controllers being used with the game,
   * and whether or not they are supported on the given OS + browser.
   *
   * The intent is to help sort out if custom mappings are needed,
   * e.g., as for the 8bitdo nes30pro.
   */
  if (data.logged[info.id]) return;
  data.logged[info.id] = true;
  utils.log({ info, rawValues: true });
}

function enable() {
  if (data.enabled) return;
  data.enabled = true;
  gamepadManager.enable();
}

function disable() {
  if (!data.enabled) return;
  data.enabled = false;
  gamepadManager.disable();
  // drop gamepad UI and enable mouse, etc.
  setActive(false);
  resetSelected();
}

function updateCSS() {
  utils.css.addOrRemove(
    document.body,
    gamePrefs.gamepad &&
      gamepadManager.data.lastKnownGamepadCount &&
      data.active,
    css.hasGamepad
  );

  // CSS cursor: switch between mouse and gamepad UI
  utils.css.addOrRemove(
    document.body,
    gamePrefs.gamepad && data.active,
    css.gamepadActive
  );
}

function setActive(active) {
  if (data.active === active) return;

  data.active = active;

  updateCSS();

  if (active && game.objects.joystick) {
    let jsData = game.objects.joystick.data;
    if (!clientFeatures.touch) {
      /**
       * Desktop mouse / trackpad case: sync virtual / mouse positions.
       *
       * Desktop uses the real mouse pointer rendered by the OS, with
       * CSS rendering a custom + icon. On touch/mobile, a "virtual"
       * pointer is rendered via `<div>` and positioned by touch events.
       *
       * The virtual pointer is connected to the joystick object.
       * On desktop (sans-touch), the virtual pointer is gamepad-only.
       *
       * This bit keeps the virtual pointer in sync with the real one.
       */

      const { clientX, clientY } = game.objects.view.data.mouse;

      // sync gamepad joystick UI to mouse position - note slight offset.
      data.gamepadX =
        ((clientX + 7) / game.objects.view.data.browser.screenWidth) * 100;
      data.gamepadY =
        ((clientY + 7) / game.objects.view.data.browser.screenHeight) * 100;
    } else {
      data.gamepadX = jsData.pointer.x * 100;
      data.gamepadY = jsData.pointer.y * 100;
    }

    game.objects.joystick.jumpTo(data.gamepadX, data.gamepadY);
  }

  // joystick cursor
  game.objects.joystick?.setPointerVisibility(active);

  // explicitly stop cursor, too?
  if (!active) {
    game.objects.joystick?.stop?.();
    resetSelected();
  }

  // start or stop ignoring mouse (and touch) movement, respectively.
  game.objects.view.data.ignoreMouseMove = active;

  /**
   * If becoming active, ignore the current button(s) so e.g.,
   * mouse -> gamepad hand-off doesn't trigger an immediate action
   * like firing the guns.
   */
  if (active) {
    data.waitUntilButtonRelease = true;
  }

  // return the previous state, for interested parties.
  return !active;
}

function setFocus(node) {
  // native focus, and CSS "selection"
  if (document.activeElement) {
    utils.css.remove(document.activeElement, gamepad.css.gamepadSelected);
  }
  if (!node) return;
  if (node.focus) {
    utils.css.add(node, gamepad.css.gamepadSelected);
    node.focus();
  }
}

function resetSelected() {
  // ensure any "selected" (focus-related) CSS is dropped.
  Array.from(document.querySelectorAll(`.${css.gamepadSelected}`)).forEach(
    (node) => utils.css.remove(node, css.gamepadSelected)
  );
  // attempt to blur current node, too.
  if (document.activeElement) {
    document.activeElement.blur();
  }
}

function scanGamepads() {
  // iterate through current list, reporting results
  let results = [];
  for (const pad of navigator.getGamepads()) {
    // note: pad may be null, per gamepad API spec.
    if (!pad || !pad.connected) continue;
    let config = gamepadManager.checkGamepadSupport(pad);
    let gpi = gamepadManager.getGPI();
    results.push({
      id: config?.label || pad.id,
      prettyLabel: getPrettyLabel(config?.label, pad.id),
      supported: !!config,
      isStandard: !!config?.isStandard,
      // "is this the one in use"? (active via button press)
      inUse: pad.index === gpi
    });
  }
  return results;
}

function onGameMenu() {
  enable();
}

function onGameStart() {
  // TODO: tie into game prefs etc.
  enable();

  if (!gamePrefs.gamepad) return;

  dom.controls = document.getElementById('mobile-controls');
  dom.inventory = Array.from(dom.controls.querySelectorAll('.inventory-item'));
}

function onFocus() {
  data.hasFocus = true;
}

function onBlur() {
  data.hasFocus = false;
}

window.addEventListener('blur', onBlur);
window.addEventListener('focus', onFocus);

const gamepadManager = GamepadManager({
  onChange: onGamepadUpdate, // update / animate()-style callback
  onAddOrRemove
});

// "API" (for now)
const gamepad = {
  animate: () => {
    // hackish: don't run if in editor mode
    // TODO: disable when editor starts.
    if (game.objects.editor) return;
    gamepadManager.animate();
  },
  css,
  checkDPadViaJoystick,
  data,
  disable,
  enable,
  onGameMenu,
  onGameStart,
  resetSelected,
  scanGamepads,
  setActive,
  setFocus,
  rumble: gamepadManager.rumble
};

export { gamepad, DPAD, FLY, MENU, OFFSET_CENTER };
