import {
  rnd,
  rndInt,
  plusMinus,
  TYPES,
  GAME_SPEED_RATIOED,
  worldWidth
} from '../core/global.js';
import { common } from '../core/common.js';
import { sprites } from '../core/sprites.js';
import { game, getObjectById } from '../core/Game.js';
import { utils } from '../core/utils.js';
import { gamePrefs } from '../UI/preferences.js';
import { levelFlags } from '../levels/default.js';

const Smoke = (options = {}) => {
  let domCanvas, data, exports;

  // live reference
  let oParent = getObjectById(options.oParent);

  data = common.inheritData(
    {
      type: 'smoke',
      frameCount: 0,
      spriteFrameModulus: parseInt(
        (options.spriteFrameModulus || 2) * (1 / GAME_SPEED_RATIOED),
        10
      ),
      spriteFrame:
        options.spriteFrame !== undefined ? options.spriteFrame : rndInt(6),
      spriteFrames: 11,
      isFading: false,
      fadeFrame: 0,
      fadeFrames: 8,
      direction: 0,
      width: 9,
      height: 9,
      gravity: options.gravity !== undefined ? options.gravity : 0.5,
      rotation: rnd(360),
      rotationAmount: plusMinus(rnd(5)),
      // by default, allow some randomness
      baseScale: options.baseScale || 0.65 + rnd(0.35),
      // hackish: use provided, or default values.
      vX: options.vX !== undefined ? options.vX : plusMinus(rnd(3)),
      vY: options.vY !== undefined ? options.vY : -rnd(3),
      parentWasCloaked: options.parentWasCloaked,
      // don't draw if originating from an opposing helicopter that should be hidden, unless it's in view.
      isStealthSmoke:
        levelFlags.stealth &&
        oParent &&
        oParent.data.type === TYPES.helicopter &&
        !oParent.data.isOnScreen &&
        oParent.data.isEnemy !== game.players.local.data.isEnemy,
      oParent: options.oParent
    },
    options
  );

  domCanvas = {
    img: {
      src: refreshSprite(data),
      source: {
        x: 0,
        y: 0,
        width: 18,
        height: 18,
        is2X: true,
        // frame size
        frameWidth: 36,
        frameHeight: 36,
        // sprite offset indices
        frameX: 0,
        frameY: 0
      },
      target: {
        width: 36,
        height: 36
      }
    }
  };

  let isBackground;

  // background vs. foreground canvas: show some "relative to damage" smoke behind ground units, helicopters and balloons.
  if (
    oParent &&
    (oParent.data.bottomAligned ||
      oParent.data.type === TYPES.helicopter ||
      oParent.data.type === TYPES.balloon)
  ) {
    // lastly - if a cloaked helicopter, always put behind helicopter and cloud.
    isBackground = oParent.data.cloaked || options.background || rnd(1) >= 0.5;
  }

  if (isBackground) {
    // place in different array, draw earlier.
    data.gameObjectGroup = 'backgroundSmoke';
  }

  exports = {
    animate: () => animate(exports),
    data,
    domCanvas,
    die: () => die(exports),
    options
  };

  // in the original, smoke generation increments a key seed value for the game.
  game.incrementRandSeed();

  return exports;
};

function refreshSprite(data) {
  return utils.image.getImageObject(`smoke_v${data.spriteFrame}.png`);
}

function die(exports) {
  let { data } = exports;

  if (data.dead) return;

  data.dead = true;
}

function animate(exports) {
  let { data, domCanvas, options } = exports;

  if (data.vX !== null && data.vY !== null) {
    data.x +=
      data.vX *
      (options.fixedSpeed ? 1 : Math.max(0.9, Math.random())) *
      GAME_SPEED_RATIOED;
    data.y +=
      (data.vY * (options.fixedSpeed ? 1 : Math.max(0.9, Math.random())) +
        data.gravity) *
      GAME_SPEED_RATIOED;

    if (options.deceleration) {
      data.vX *= 1 - (1 - options.deceleration) * GAME_SPEED_RATIOED;
      data.vY *= 1 - (1 - options.deceleration) * GAME_SPEED_RATIOED;
      if (options.increaseDeceleration !== undefined) {
        options.deceleration *=
          1 - (1 - options.increaseDeceleration) * GAME_SPEED_RATIOED;
      }
    }
  }

  if (data.rotation !== undefined) {
    data.rotation += data.rotationAmount;
  }

  // animate and fade
  if (data.frameCount % data.spriteFrameModulus === 0) {
    // first, animate through sprite. then, fade opacity.
    if (data.spriteFrame < data.spriteFrames) {
      data.spriteFrame++;
      domCanvas.img.src = refreshSprite(data);
    } else {
      data.isFading = true;
    }
  }

  sprites.draw(exports);

  // if fading, animate every frame.
  if (data.isFading) {
    data.fadeFrame += GAME_SPEED_RATIOED;

    if (data.fadeFrame < data.fadeFrames) {
      domCanvas.img.target.opacity = 1 - data.fadeFrame / data.fadeFrames;
    }

    if (data.fadeFrame > data.fadeFrames) {
      // animation (and object) considered finished
      die(exports);
      return true;
    }
  }

  // smoke particles on radar, why not.
  if (
    gamePrefs.radar_enhanced_fx &&
    !game.objects.radar.data.isJammed &&
    !data.isStealthSmoke
  ) {
    common.domCanvas.draw({
      data: {
        type: 'on-radar',
        x: data.x,
        y: data.y,
        // fake it 'til you make it.
        isOnScreen: true
      },
      domCanvas: {
        width: 1.75,
        height: 1.75,
        ctxName: 'radar',
        draw: (ctx, obj, pos, width, height) => {
          // special case: don't draw smoke from a cloaked helicopter (i.e., in a cloud.)
          if (data.parentWasCloaked) return;
          const left =
            pos.left(
              (obj.data.x / worldWidth) *
                game.objects.view.data.browser.screenWidth
            ) - width;
          const top =
            (data.y / game.objects.view.data.battleField.height) *
              game.objects.radar.data.height -
            height;
          if (domCanvas.img?.target?.opacity) {
            ctx.fillStyle = `rgba(153, 153, 153, ${domCanvas.img?.target?.opacity}`;
          } else {
            ctx.fillStyle = '#999';
          }
          ctx.fillRect(left, top, width, height);
        }
      }
    });
  }

  data.frameCount++;

  return data.dead && data.canDestroy;
}

export { Smoke };
