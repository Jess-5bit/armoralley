import {
  worldWidth,
  worldHeight,
  rng,
  TYPES,
  rngInt,
  rngPlusMinus,
  clientFeatures,
  GAME_SPEED_RATIOED
} from '../core/global.js';
import { common } from '../core/common.js';
import { zones } from '../core/zones.js';
import { sprites } from '../core/sprites.js';
import { net } from '../core/network.js';
import { game } from '../core/Game.js';
import { utils } from '../core/utils.js';

const cloudTypes = [
  {
    className: 'cloud1',
    src: 'cloud-1.png',
    width: 102,
    height: 29,
    radarWidth: 7
  },
  {
    className: 'cloud2',
    src: 'cloud-2.png',
    width: 116,
    height: 28,
    radarWidth: 9
  },
  {
    className: 'cloud3',
    src: 'cloud-3.png',
    width: 125,
    height: 34,
    radarWidth: 9
  }
];

const MAX_VX = 3;
const MAX_VY = 0.5;
const MIN_SPEED = 0.5;
const NEAR_END_DISTANCE = 128;

const type = TYPES.cloud;

const Cloud = (options = {}) => {
  const cloudData = cloudTypes[rngInt(cloudTypes.length, type)];

  const { className, src, width, height } = cloudData;

  let domCanvas;

  let exports = {
    options
  };

  exports.data = common.inheritData(
    {
      type,
      isNeutral: true,
      frameCount: 0,
      windModulus: 16,
      windOffsetX: rngPlusMinus(rng(MAX_VX, type), type),
      windOffsetY: rngPlusMinus(rng(MAX_VY, type), type),
      driftXMax: MAX_VX,
      verticalDirection: 0.33,
      verticalDirectionDefault: 0.33,
      y:
        options.y || 96 + parseInt((worldHeight - 96 - 128) * rng(1, type), 10),
      width,
      halfWidth: width / 2,
      height,
      halfHeight: height / 2,
      noEnergyStatus: true
    },
    options
  );

  let { data } = exports;

  domCanvas = {
    img: {
      src: utils.image.getImageObject(src),
      source: {
        x: 0,
        y: 0,
        width: width * 2,
        height: height * 2
      },
      target: {
        x: data.x,
        y: data.y,
        width,
        height
      }
    },
    radarItem: {
      excludeStroke: true,
      // approximate size relative to that as rendered on battlefield.
      width: cloudData.radarWidth,
      height: 2,
      draw: (ctx, obj, pos, width, height) => {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.088)';

        // TODO: sort out scaling vs. touch devices - not quite right when radar is scaled up.
        const scaledWidth =
          pos.width(width) *
          game.objects.radar.data.scale *
          (clientFeatures.touch ? 0.5 : 1);

        const scaledHeight = pos.heightNoStroke(height);

        ctx.roundRect(
          pos.left(obj.data.left),
          obj.data.top - scaledHeight / 2,
          // width, height, border
          scaledWidth,
          scaledHeight,
          scaledWidth
        );

        ctx.strokeWidth = 0.25;
        ctx.stroke();
        ctx.strokeWidth = 1;
      }
    }
  };

  Object.assign(exports, {
    animate: () => animate(exports),
    domCanvas,
    drift: () => drift(exports),
    init: () => initCloud(exports),
    startDrift: () => startDrift(exports)
  });

  return exports;
};

function animate(exports) {
  let { data } = exports;

  data.frameCount++;

  if (data.frameCount % data.windModulus === 0) {
    // TODO: improve, limit on axes

    // apply "regular" wind if we aren't drifting with a helicopter.
    if (!data.driftCount) {
      const xOffset = net.active ? 0 : 0.125;
      data.windOffsetX +=
        data.x < 0 || rng(1, type) > MIN_SPEED ? xOffset : -xOffset;
    }

    data.windOffsetX = Math.max(-MAX_VX, Math.min(MAX_VX, data.windOffsetX));

    const yOffset = net.active ? 0.05 : 0.05;
    data.windOffsetY +=
      data.y < 72 || rng(1, type) > MAX_VY ? yOffset : -yOffset;
    data.windOffsetY = Math.max(-MAX_VY, Math.min(MAX_VY, data.windOffsetY));
  }

  // minimize chance of de-sync in network case... ?
  const drift = net.active ? 0.05 : 0.01;

  // don't drift off the ends of the battlefield...
  if (data.x + data.width > worldWidth) {
    data.windOffsetX = Math.max(data.windOffsetX - drift, -MAX_VX);
  } else if (data.x < 0) {
    data.windOffsetX = Math.min(data.windOffsetX + drift, MAX_VX);
  }

  // ...nor the bottom, or top.
  if (data.windOffsetY > 0 && worldHeight - data.y - 32 < 64) {
    data.windOffsetY -= 0.01;
  } else if (data.windOffsetY < 0 && data.y < 64) {
    data.windOffsetY += 0.01;
  }

  data.x += data.windOffsetX * GAME_SPEED_RATIOED;
  data.y += data.windOffsetY * GAME_SPEED_RATIOED;

  // reset drift "flag"
  data.driftCount = 0;

  zones.refreshZone(exports);

  sprites.moveTo(exports, data.x, data.y);

  sprites.draw(exports);
}

function startDrift(exports) {
  let { data } = exports;
  /**
   * Called by helicopter(s) when they enter a cloud.
   * To keep things interesting, set a new random max drift speed -
   * no slower than present wind speed, or MIN_SPEED.
   */

  const minSpeed = MIN_SPEED;

  // de-sync risk in network games.
  // TODO: revisit.
  if (net.active) return;

  data.driftXMax = Math.max(
    minSpeed,
    Math.max(Math.abs(data.windOffsetX), rng(MAX_VX, type))
  );
}

function drift(exports, isEnemy) {
  let { data } = exports;
  /**
   * "Set adrift on memory bliss of you" -PM Dawn ☁️
   * Given a helicopter, have the wind pick up and move toward the opposing base.
   * This is a key strategy for defeating groups of turrets, e.g., Midnight Oasis in Extreme mode.
   */

  // de-sync risk in network games.
  // TODO: revisit.
  if (net.active) return;

  // hackish: flag that drift is happening, so regular drift doesn't apply.
  // edge case: 2+ helicopters in a single cloud.
  data.driftCount++;

  // avoid any changes when near ends of battlefield.
  if (data.x > NEAR_END_DISTANCE && data.x < worldWidth - NEAR_END_DISTANCE) {
    data.windOffsetX += isEnemy ? -0.01 : 0.01;
    data.windOffsetX = Math.max(
      -data.driftXMax,
      Math.min(data.driftXMax, data.windOffsetX)
    );
  }
}

function initCloud(exports) {
  common.initDOM(exports);
  game.objects.radar.addItem(exports);
}

export { Cloud };
