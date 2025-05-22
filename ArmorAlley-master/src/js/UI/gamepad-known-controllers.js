import { isFirefox } from '../core/global.js';
import { configGamePad } from './gamepad-config.js';
import { STD } from './GamepadManager.js';

/**
 * 🎮 "Standard" and other controllers, with "known" mappings for Armor Alley.
 * https://w3c.github.io/gamepad/standard_gamepad.svg
 *
 * Browsers are responsible for determining gamepad mapping, standard or not.
 * Browsers may report different results for the same controller.
 *
 * When the controller is not standard (and in some other special cases),
 * custom mapping is likely required and can vary by browser. Here be dragons.
 */
const knownControllers = {};

function addKnownController(label, data) {
  knownControllers[label] = data;
}

function addControllers() {
  addKnownController(STD, {
    /**
     * Reference / standard controller layout
     * PS4 = "Sony DualShock 4" model CUH-ZCT2 (Vendor: 054c, product: 09cc)
     * This is commonly recognized as a "standard" gamepad layout / mapping
     * https://w3c.github.io/gamepad/standard_gamepad.svg
     * https://beej.us/blog/data/javascript-gamepad/
     */

    /**
     * "Standalone" buttons - shoulders, select/start, logo etc.
     * ABXY, joysticks and D-pads defined separately
     */
    buttons: {
      // left shoulder button
      l1: 'btn4',

      // left shoulder spring-loaded trigger, value 0-1 (PS4)
      l2: 'btn6',

      // right shoulder button
      r1: 'btn5',

      // right shoulder spring-loaded trigger, value 0-1 (PS4)
      r2: 'btn7',

      // PS4 label: "OPTIONS"
      options: 'btn9',

      // PS4 label: "SHARE" (CREATE on PS5)
      share: 'btn8',

      // PS4: PlayStation logo (opens Control Center in macOS)
      logo: 'btn16'
    },

    /**
     * "ABXY" ("diamond") button layouts
     *
     *   Sony      Std     XBOX
     *  /‾‾‾‾‾\  /‾‾‾‾‾\  /‾‾‾‾‾\
     *     △        X        Y
     *   □   ○    Y   A    X   B
     *     ×        B        A
     *  \_____/  \_____/  \_____/
     *
     */
    abxy: [
      {
        top: 'btn3',
        left: 'btn2',
        right: 'btn1',
        bottom: 'btn0'
      }
    ],

    /**
     * Directional pad (D-pad) definitions
     *
     * ↖ ↑ ↗
     * ← · →
     * ↙ ↓ ↘
     *
     * Button order, per D-pad: [up, down, left, right]
     * Standard controllers typically have one D-pad.
     */
    dpads: [['btn12', 'btn13', 'btn14', 'btn15']],

    joystickOptions: {
      /**
       * Number of decimal points, for analog joystick inputs
       * This helps to avoid drift / "jitter" and almost-zero values,
       * e.g., 0.0039 being reported when the joystick is not being touched.
       * Proper calibration is the next logical option.
       */
      precision: 2,

      /**
       * Minimum value for movement, also to avoid drift.
       * Any value ≤ will be considered as zero.
       */
      zeroPoint: 0.03,

      /**
       * Extra wiggle room to account for joystick drift, beyond values
       * read during "drift calibration." 0 = disabled.
       */
      // NOTE: not yet implemented.
      driftBufferPercent: 100,

      // some controllers might report values in reverse of the spec.
      invertXAxis: false,
      invertYAxis: false
    },

    /**
     * 🕹️ Joystick definitions
     * Each joystick axis has a value between -1 and +1.
     * The order is [x-axis, y-axis], and a single button when pressed.
     * Standard controllers should have two joysticks.
     */
    joysticks: [
      {
        // x-axis, y-axis
        axes: ['axes0', 'axes1'],
        button: 'btn10'
      },
      { axes: ['axes2', 'axes3'], button: 'btn11' }
    ]
  });

  const patterns = {
    // shared mappings used by some 8Bitdo controllers, when non-standard
    eightBitDo: {
      abxy0134: [
        {
          // X
          top: 'btn3',

          // Y
          left: 'btn4',

          // A
          right: 'btn0',

          // B
          bottom: 'btn1'
        }
      ],
      nesButtons: {
        // as labeled, NES-style
        select: 'btn10',
        start: 'btn11',

        // shoulder / side buttons
        l1: 'btn6',
        r1: 'btn7',
        l2: 'btn8',
        r2: 'btn9'
      }
    }
  };

  const modernEightBitDo = {
    abxy: patterns.eightBitDo.abxy0134,
    buttons: patterns.eightBitDo.nesButtons,
    // x/y, button
    joysticks: isFirefox
      ? [
          { axes: ['axes1', 'axes2'], button: 'btn13' },
          { axes: ['axes3', 'axes4'], button: 'btn14' }
        ]
      : [
          { axes: ['axes0', 'axes1'], button: 'btn13' },
          { axes: ['axes2', 'axes5'], button: 'btn14' }
        ],
    dpads: [
      /**
       * Special case, 8Bitdo D-pads: one multi-value axis instead of buttons.
       * The axis gets one of 9 values, representing each direction in order.
       * Safari avoids this as the controller mapping is standard there.
       * ↖ ↑ ↗
       * ← · →
       * ↙ ↓ ↘
       */
      {
        axis: isFirefox ? 'axes0' : 'axes9',
        values: [
          // column and row order: up + left, up, right + up, left, center etc.
          1, -1, -0.7143, 0.7143, 3.2857, -0.4286, 0.42857, 0.1429, -0.1429
        ]
      }
    ]
  };

  const modernEightBitDoInvertedY = {
    ...knownControllers[STD],
    overrides: {
      firefox: {
        buttons: {
          /**
           * NOTE: Shoulder buttons are somewhat broken, here.
           * TODO: fix spring-loaded triggers which currently don't work as buttons.
           */

          // left shoulder button
          l1: 'btn8',
    
          // TODO: fix for axis case of -1 / 1
          l2: 'axis4',
    
          // right shoulder button
          r1: 'btn9',
    
          // TODO: fix for axis case of -1 / 1
          r2: 'axis5',
    
          share: null,
          select: 'btn5',
    
          option: null,
          start: 'btn4',
    
          logo: null
        },
        dpads: [['btn0', 'btn1', 'btn2', 'btn3']],
        abxy:[
          {
            // X
            top: 'btn14',
    
            // Y
            left: 'btn13',
    
            // A
            right: 'btn12',
    
            // B
            bottom: 'btn11'
          }
        ]
      }
    },
    joystickOptions: {
      ...knownControllers[STD].joystickOptions,
      invertYAxis: true
    }
  }

  addKnownController('nes30Pro', {
    /**
     * 8Bitdo "NES30 Pro" controller, bluetooth version (firmware 4.10)
     * This is NOT recognized as a "standard" gamepad layout in most browsers,
     * and requires special handling. Safari identifies it as standard.
     */

    buttons: patterns.eightBitDo.nesButtons,

    /**
     * "ABXY" ("diamond") button layout
     *  /‾‾‾‾‾\
     *     X
     *   Y   A
     *     B
     *  \_____/
     */
    abxy: patterns.eightBitDo.abxy0134,

    joystickOptions: {
      precision: 2,
      zeroPoint: 0.03
    },

    // x/y, button
    joysticks: [
      { axes: ['axes0', 'axes1'], button: 'btn13' },
      { axes: ['axes2', 'axes5'], button: 'btn14' }
    ],

    dpads: [
      /**
       * Special case: 8Bitdo NES30 Pro (Bluetooth) D-pad updates one axis
       * instead of buttons. The axis is set to one of 9 values, representing
       * the individual directions in order. axes3 + axes4 provide integer
       * values for this controller, but are ignored in this case.
       * ↖ ↑ ↗
       * ← · →
       * ↙ ↓ ↘
       */
      {
        axis: 'axes9',
        values: [
          // column and row order: up + left, up, right + up, left, center etc.
          1, -1, -0.7143, 0.7143, 3.2857, -0.4286, 0.4286, 0.1429, -0.1429
        ]
      }
    ],

    overrides: {
      // Firefox reports slightly different axis mapping - tested on macOS.
      firefox: {
        joysticks: [
          { axes: ['axes1', 'axes2'], button: 'btn13' },
          { axes: ['axes3', 'axes4'], button: 'btn14' }
        ],
        dpads: [
          {
            axis: 'axes0',
            values: [
              // column and row order: up + left, up, right + up, left, center etc.
              1,
              -1, -0.7143, -0.4286, 3.2857, -0.1429, 0.1429, 0.4286, 0.7143
            ]
          }
        ]
      }
    }
  });

  /**
   * Fallback / standard controller case
   * For controllers lacking an exact ID match
   */
  configGamePad({
    label: 'Standard / Generic Controller',
    vendor: STD,
    product: STD,
    ...knownControllers[STD]
  });

  // NES30 Pro, connecting via USB
  configGamePad({
    label: '8Bitdo NES30 Pro',
    vendor: '2dc8',
    product: '9001',
    ...knownControllers.nes30Pro
  });

  // NES30 Pro, connecting via Bluetooth
  configGamePad({
    label: 'Bluetooth Wireless Controller (8Bitdo NES30 Pro)',
    vendor: '2dc8',
    product: '3820',
    ...knownControllers.nes30Pro
  });

  configGamePad({
    /**
     * Safari sees the NES30 Pro as a standard controller, with unique mapping.
     * Unlike Chrome + Firefox, Safari has 4 standard axes vs. 1 for the D-pad.
     * In testing, Safari does not provide a product or vendor ID.
     * The label here matches the Safari ID, a fallback for vendor/product.
     */
    label: '8Bitdo NES30 Pro Extended Gamepad',
    ...knownControllers[STD]
  });

  configGamePad({
    /**
     * Sony PS4 DualShock under Safari, macOS
     * (lacks product + vendor ID, but has `dual-rumble` vibration actuator)
     */
    label: 'Wireless Controller Extended Gamepad',
    ...knownControllers[STD]
  });

  configGamePad({
    /**
     * Sony PS4 DualShock under Safari, macOS, connected via Bluetooth
     * (lacks product + vendor ID, but has `dual-rumble` vibration actuator)
     */
    label: 'DUALSHOCK 4 Wireless Controller Extended Gamepad',
    ...knownControllers[STD]
  });

  configGamePad({
    label: 'DUALSHOCK 4 Wireless Controller (Sony PlayStation)',
    vendor: '054c',
    product: '09cc',
    ...knownControllers[STD]
  });

  configGamePad({
    /**
     * Nintendo Switch (original) Joy-Con, left + right controller pair
     * Tested on Chrome under Windows 10, connected via Bluetooth
     * These are recognized (together, L+R?) as a standard controller.
     * Vibration / rumble feedback should be supported.
     */
    label: 'Nintendo Switch Joy-Con L+R',
    vendor: '057e',
    product: '200e',
    ...knownControllers[STD]
  });

  configGamePad({
    /**
     * 8Bitdo SN30 pro
     * Support for rumble feature varies, depending on browser and mode.
     *
     * When powered off, hold START + [button] to set the mode.
     * SEQUENCE TIP: Push and hold X or Y first, then press and hold START.
     * Press the pairing button if your device does not show a prompt.
     *
     * Mode        Vibration (macOS)   Notes (tested 02/2025, macOS Sequoia)
     * ---------------------------------------------------------------------
     * START+X     Chrome, Safari      +trigger-rumble effect in Chrome.
     * START+Y     Chrome, Safari      Controller not detected in Firefox
     * START+B     N/A
     * START+A     Chrome, Safari      Shows as PS4 DualShock, v/p 054c/05c4
     *
     * iOS Safari: Vibration API appears not to be implemented.
     * These are for bluetooth connections only. "START+A mode" works w/USB.
     * Mode        Playable     Device name (tested 02/2025, iOS 18.3 22D60)
     * ---------------------------------------------------------------------
     * START+X     Yes          8Bitdo SN30 Pro
     * START+Y     Yes          Pro Controller
     * START+B     Yes          8Bitdo SN30 Pro
     * START+A     Yes          DUALSHOCK 4 Wireless Controller
     *
     * Modes per manual: X: Windows, Y: Switch, B: Android, A: macOS
     * https://download.8bitdo.com/Manual/Controller/SN30pro+SF30pro/SN30pro+SF30pro_Manual.pdf?20220513
     */
    label: '8bitdo SN30 Pro (Bluetooth)',
    vendor: '2dc8',
    product: '6101',
    ...knownControllers[STD],
    ...modernEightBitDo
  });

  configGamePad({
    /**
     * 8Bitdo SN30 pro, connected via USB-C.
     * Recognized on iOS, but no vibration on iOS Safari.
     *
     * If not recognized, unplug and turn off (hold START 5 seconds),
     * then press A, hold, then press and also hold START.
     * Three green LEDs on controller should flash. Connect USB.
     *
     * In this mode, the controller appears as a PS4 DualShock.
     *
     * X-mode works partially, but joystick vertical is flipped.
     */
    label: '8bitdo SN30 Pro (USB-C)',
    vendor: '2dc8',
    product: '6001',
    ...knownControllers[STD],
    ...modernEightBitDo
  });

  configGamePad({
    /**
     * 8Bitdo SN30 pro, connected via USB-C in X-input mode.
     * Standard under Chrome, but joystick vertical is inverted.
     * Non-standard under Firefox.
     */
    label: '8bitdo SN30 Pro (USB-C, X-input, inverted Y-axis joysticks)',
    vendor: '045e',
    product: '028e',
    ...modernEightBitDoInvertedY
  });

  configGamePad({
    /**
     * 8Bitdo SN30 pro (USB-C and/or bluetooth), START + A-mode (DualShock)
     * Standard under Firefox, but no vibration feature.
     * Standard + vibration in Chrome and Safari.
     */
    label: '8bitdo SN30 Pro (USB-C / Bluetooth, START+A mode)',
    vendor: '054c',
    product: '05c4',
    ...knownControllers[STD]
  });

  configGamePad({
    /**
     * 8Bitdo SN30 pro (USB-C and/or bluetooth), START + Y-mode (Switch Pro)
     * Not detected at all under Firefox.
     * Standard + vibration in Chrome and Safari.
     */
    label: '8bitdo SN30 Pro (USB-C / Bluetooth, START+Y / Switch mode)',
    vendor: '057e',
    product: '2009',
    ...knownControllers[STD]
  });

  configGamePad({
    /**
     * 8Bitdo Ultimate Wireless 2.4G (+ Bluetooth + USB-C)
     * Likely requires firmware v2.0 or newer.
     *
     * Label provided is when connecting via bluetooth.
     * Label when connected via USB-C differs slightly:
     * "8BitDo Ultimate wireless Controller for PC Extended Gamepad"
     *
     * Vibration looks to work on desktop Safari, in a specific case.
     * From my findings, vibration is not supported in iOS Safari at all.
     *
     * With the controller's mode switched to "X":
     * Connect via wifi to the base, then press and hold (-) and (LB).
     * The controller will vibrate to indicate it's in "Switch mode."
     *
     * Vibration works when in X + "Switch" and on wifi, but not Bluetooth.
     *
     * When connected via USB-C, (-) and (LB) switch mode doesn't work.
     *
     * NOTE: With the physical switch in "X" mode, the controller may cause
     * a crash in Firefox tabs using the gamepad API with 2.4G and the
     * aforementioned (-) and (LB) combo. "D" mode does not seem to do this.
     *
     */
    label: '8BitDo Ultimate wireless Extended Gamepad',
    vendor: '2dc8',
    product: '3012',
    ...knownControllers[STD],
    ...modernEightBitDo
  });

  configGamePad({
    /**
     * 8Bitdo Ultimate Wireless 2.4G - 3013 is the bluetooth product ID.
     */
    label: '8BitDo Ultimate wireless Extended Gamepad',
    vendor: '2dc8',
    product: '3013',
    ...knownControllers[STD],
    ...modernEightBitDo
  });

  configGamePad({
    /**
     * 8Bitdo "generic" fallback - best guess if vendor, but no product match.
     */
    label: '8BitDo Generic fallback',
    vendor: '2dc8',
    product: 'GENERIC',
    ...knownControllers[STD],
    ...modernEightBitDo
  });
}

export { addControllers };
