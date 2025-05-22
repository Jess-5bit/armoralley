// helicopter AI extension: avoidance methods

import { searchParams, TYPES } from '../core/global.js';
import { collisionCheckX, isFacingTarget } from '../core/logic.js';
import {
  averageForce,
  MAX_AVOID_AHEAD,
  MAX_VELOCITY,
  seek,
  Vector
} from '../core/Vector.js';
import {
  brakeX,
  brakeXY,
  findEnemy,
  getCompositeObject,
  lineIntersectsObject,
  TOO_LOW
} from './Helicopter-utils.js';
import { addForce } from './Helicopter-forces.js';
import { steerTowardTarget } from './Helicopter-steering.js';
import { common } from '../core/common.js';
import { levelFlags } from '../levels/default.js';
import { gameType } from '../aa.js';
import { getObjectById } from '../core/Game.js';

const debugCanvas = searchParams.get('debugCanvas');
const whiskerColor = '#888';

function improvedAvoid(data, nearbyObstacle, avoidScale = 0.67) {
  let target = new Vector(nearbyObstacle.data.x, nearbyObstacle.data.y);
  let pos = new Vector(data.x, data.y);
  let velocity = new Vector(data.vX, data.vY);

  // avoid = seek in reverse
  let seekForce = seek(target, pos, velocity, data.vXMax, data.vXMax);
  let avoidance = seekForce.clone();

  avoidance.normalize();

  if (avoidScale) {
    avoidance.setMag(avoidScale);
  }

  // and reverse.
  avoidance.mult(-1);

  if (data.y > TOO_LOW && (data.vY > 0 || avoidance.y > 0)) {
    // TOO LOW case: avoidance might be trying to move further downward to ignore a ground unit, i.e., bunker. Ignore and move upward.
    avoidance.y = Math.abs(avoidance.y) * -0.125;
  }

  // finally, average.
  averageForce(avoidance, data.averages, 'avoid');

  return avoidance;
}

function collisionAvoidance(data, pos, velocity, obstacles) {
  /**
   * Using "whiskers" that project from the helicopter at angles
   * and magnitudes based on velocity, detect and avoid nearby obstacles.
   * Use `debugCanvas=1` to see these drawn visually during gameplay.
   */

  // start from center of chopper
  let halfOffset = new Vector(data.halfWidth, data.halfHeight);

  let position = pos.clone();
  position.add(halfOffset);

  // min/max ranges, to keep things reasonably sane
  const magVel = Math.max(
    data.width * 0.75,
    Math.min(data.width, (MAX_AVOID_AHEAD * velocity.mag()) / MAX_VELOCITY)
  );

  let tv = velocity.clone();
  tv.setMag(magVel);

  let ahead = position.clone();
  ahead.add(tv);

  if (debugCanvas) {
    common.domCanvas.drawForceVector(position, tv, whiskerColor, 1);
    common.domCanvas.drawPoint(ahead, whiskerColor);
  }

  // figure out angle, then subtract an amount

  // TODO: DRY

  let angle = velocity.getAngle();

  let whiskerAngleOffset = 40 * (Math.PI / 180);

  angle -= whiskerAngleOffset;

  // left whiskers
  let leftWhiskerX = Math.cos(angle) * MAX_AVOID_AHEAD;
  let leftWhiskerY = Math.sin(angle) * MAX_AVOID_AHEAD;

  let leftWhisker = position.clone();

  let tvLeft = velocity.clone();
  tvLeft.add(new Vector(leftWhiskerX, leftWhiskerY));
  tvLeft.setMag(magVel);

  leftWhisker.add(tvLeft);

  angle = velocity.getAngle();

  angle += whiskerAngleOffset;

  // left whiskers
  let rightWhiskerX = Math.cos(angle) * MAX_AVOID_AHEAD;
  let rightWhiskerY = Math.sin(angle) * MAX_AVOID_AHEAD;

  let rightWhisker = position.clone();

  let tvRight = velocity.clone();
  tvRight.add(new Vector(rightWhiskerX, rightWhiskerY));
  tvRight.setMag(magVel);

  rightWhisker.add(tvRight);

  let tvAbove = new Vector(0, -MAX_VELOCITY);
  tvAbove.setMag((magVel * 2) / 3.5);

  let above = position.clone();
  above.add(tvAbove);

  let tvBelow = new Vector(0, MAX_VELOCITY);
  tvBelow.setMag((magVel * 2) / 3);

  let below = position.clone();
  below.add(tvBelow);

  // rear, lower

  let rearWhisker = position.clone();

  let tvRear = new Vector(MAX_VELOCITY, MAX_VELOCITY);

  tvRear.setMag((magVel * 2) / 3);

  rearWhisker.add(tvRear);

  // front, lower

  let frontWhisker = position.clone();

  let tvFront = new Vector(-MAX_VELOCITY, MAX_VELOCITY);

  tvFront.setMag((magVel * 2) / 3);

  frontWhisker.add(tvFront);

  // ---

  if (debugCanvas) {
    common.domCanvas.drawForceVector(position, tvLeft, whiskerColor, 1);
    common.domCanvas.drawPoint(leftWhisker, whiskerColor);

    common.domCanvas.drawForceVector(position, tvRight, whiskerColor, 1);
    common.domCanvas.drawPoint(rightWhisker, whiskerColor);

    common.domCanvas.drawForceVector(position, tvAbove, whiskerColor, 1);
    common.domCanvas.drawPoint(above, whiskerColor);

    common.domCanvas.drawForceVector(position, tvBelow, whiskerColor, 1);
    common.domCanvas.drawPoint(below, whiskerColor);

    common.domCanvas.drawForceVector(position, tvRear, whiskerColor, 1);
    common.domCanvas.drawPoint(rearWhisker, whiskerColor);

    common.domCanvas.drawForceVector(position, tvFront, whiskerColor, 1);
    common.domCanvas.drawPoint(frontWhisker, whiskerColor);
  }

  let avoidCount = 0;
  let newAvoidance;
  let totalAvoidance = new Vector(0, 0);

  let vehicleLines = [
    ahead,
    leftWhisker,
    rightWhisker,
    above,
    below,
    rearWhisker
  ];

  for (let i = 0; i < obstacles.length; i++) {
    let obstacle = obstacles[i];
    let collision;

    // aligned, or too close on X? if so, check that Y delta is "risky."
    collision =
      // note: using lookahead
      collisionCheckX(obstacle.data, data, MAX_AVOID_AHEAD) &&
      Math.abs(data.y - obstacle.data.y) < data.height * 2;

    if (obstacle.data.type === TYPES.helicopter && data.isKamikaze) {
      // chopper <-> chopper collision desired
      collision = false;
    }

    if (collision) {
      avoidCount++;

      if (obstacle.data.type === 'composite') {
        totalAvoidance.add(avoidComposite(obstacle, data));
      }

      // slow down, braking effect?
      brakeXY(data, 0.975);

      newAvoidance = improvedAvoid(data, obstacle);

      totalAvoidance.add(newAvoidance);
    } else {
      // if not aligned on X, check rays.
      for (let j = 0; j < vehicleLines.length; j++) {
        collision = lineIntersectsObject(
          position,
          velocity,
          vehicleLines[j],
          obstacle.data
        );

        if (obstacle.data.type === TYPES.helicopter && data.isKamikaze) {
          // chopper <-> chopper collision desired
          collision = false;
        }

        // add all obstacle avoidance vectors, then divide to get the average.
        if (collision) {
          if (debugCanvas) {
            common.domCanvas.drawPoint(vehicleLines[j], '#ff33ff');
          }

          avoidCount++;

          if (obstacle.data.type === 'composite') {
            totalAvoidance.add(avoidComposite(obstacle, data));
          }

          newAvoidance = improvedAvoid(data, {
            data: { x: vehicleLines[j].x, y: vehicleLines[j].y }
          });

          totalAvoidance.add(newAvoidance);
        }
      }
    }
  }

  if (avoidCount) {
    // average the avoidance forces, based on the number of obstacles found.
    totalAvoidance.div(avoidCount);
  } else {
    // nullify
    totalAvoidance.mult(0);
  }

  return totalAvoidance;
}

function avoidComposite(obstacle, data) {
  // hackish: if there is a "composite" object in the mix, brake on X and add an upward vertical force.
  // this is to help ensure that the chopper slows down and flies upward to avoid bunker -> chain -> balloon structures.
  // brake somewhat aggressively
  brakeXY(data, 0.975);
  // if facing the obstacle, navigate upward to try to get above it.
  if (isFacingTarget(obstacle.data, data)) {
    // move upward to avoid obstacle in path
    return new Vector(0, -0.66);
  }
  // no change.
  return new Vector(0, 0);
}

function avoidBuildings(data) {
  /**
   * AVOID BUILDINGS (unless trying to land)
   */

  let parsedBuildings = [];

  let buildings = findEnemy(
    data,
    [
      TYPES.helicopter,
      TYPES.balloon,
      TYPES.bunker,
      TYPES.superBunker,
      TYPES.chain
    ],
    MAX_AVOID_AHEAD
  ).concat(findEnemy(data, [TYPES.helicopter], 256));

  let steerTarget;

  let b;

  buildings?.forEach?.((id) => {
    b = getObjectById(id);
    // IF the closest thing is a free-floating balloon, seek it out - IF we have ammo and it's targetable...
    if (
      b.data.type === 'balloon' &&
      // don't go after balloons with aimed missiles - "too expensive."
      levelFlags.bullets &&
      b.data.cpuCanTarget &&
      !b.objects?.chain &&
      data.ammo &&
      !data.foundSteerTarget &&
      !data.wantsLandingPad
    ) {
      // only steer toward one thing per frame.
      data.foundSteerTarget = true;
      steerTarget = b;
    }

    if (debugCanvas && b) {
      // console.log('found building', b.data.guid, b.data.y, data.y);
      common.domCanvas.drawDebugRect(
        b.data.x,
        b.data.y,
        b.data.width,
        b.data.height,
        '#66ffff',
        'rgba(255, 255, 255, 0.33)'
      );
    }

    // hackish: if a bunker <-> chain <-> balloon, treat the whole thing as one big obstacle shape.
    // BUT, don't wrap bunkers or balloons up in here; let them stay in the list as unique objects to be avoided.

    if (b.data.type === 'chain') {
      let compositeObj = getCompositeObject(b);
      b = {
        data: compositeObj
      };
      if (debugCanvas) {
        common.domCanvas.drawDebugRect(
          compositeObj.x,
          compositeObj.y,
          compositeObj.width,
          compositeObj.height,
          '#ff6666',
          'rgba(255, 0, 0, 0.33)'
        );
      }
    }

    parsedBuildings.push(b);
  });

  let avoidance = collisionAvoidance(
    data,
    new Vector(data.x, data.y),
    new Vector(data.vX, data.vY),
    parsedBuildings
  );

  if (avoidance.mag() > 0) {
    brakeXY(data, 0.98);
    addForce(data, avoidance, 'avoid');
    return true;
  }

  // if no avoidance, but we found something to chase...
  if (steerTarget) {
    steerTowardTarget(data, steerTarget.data, data.halfWidth);
  }
}

function avoidAboveOrBelow(tData, data) {
  /**
   * AVOID HUMAN CHOPPER (or other obstacle)
   */

  if (!tData) return;

  if (tData.type === TYPES.helicopter && data.isKamikaze) {
    // chopper <-> chopper collision desired
    return;
  }

  // X-axis align, and player (or some other obstacle) is flying above CPU - an advantage (or slightly below, not an advantage.)
  if (
    tData.type === TYPES.helicopter &&
    collisionCheckX(tData, data) &&
    Math.abs(tData.y - data.y) < data.height * 2
  ) {
    // something is near the chopper - dodge up or down, in particular.
    let avoidMag = 0.5;
    let avoidForce = improvedAvoid(data, { data: tData }, avoidMag);
    addForce(data, avoidForce, 'avoid', tData.type);
    return true;
  }
}

function avoidNearbyMunition(data) {
  /**
   * NEARBY OBSTACLES: GUNFIRE, MISSILES, BOMBS ETC.
   */

  if (data.isKamikaze) {
    // chopper <-> chopper collision desired
    return;
  }

  let nearbyObstacle;
  let validObstacle;
  let gunfireObstacles = findEnemy(data, TYPES.gunfire, 192);

  nearbyObstacle = getObjectById(gunfireObstacles[0]);

  let isTurretGunfire;
  let isSmartMissile;
  let isAimedMissile;
  let fromHelicopter;

  // don't dodge gunfire that's moving away / past chopper.
  if (nearbyObstacle) {
    isTurretGunfire =
      nearbyObstacle.data.type === TYPES.gunfire &&
      nearbyObstacle.data.parentType === TYPES.turret;

    if (nearbyObstacle.data.vX > 0 && nearbyObstacle.data.x > data.x) {
      // gunfire passing to the right - ignore.
      if (!isTurretGunfire) {
        brakeX(data, 0.95);
      }
      nearbyObstacle = null;
    } else if (nearbyObstacle.data.vX < 0 && nearbyObstacle.data.x < data.x) {
      // gunfire passing to the left - ignore.
      if (!isTurretGunfire) {
        brakeX(data, 0.95);
      }
      nearbyObstacle = null;
    }
  }

  if (nearbyObstacle) {
    // reasonably close on Y-axis?
    validObstacle = Math.abs(data.y - nearbyObstacle.data.y) < data.height * 2;
    if (isTurretGunfire) {
      data.avoidingTurret = true;
      // hackish: circuitous reference
      // if being fired at, consider deploying a smart missile.
      let checkBombs = false;
      data.ai.maybeFireSmartMissileAtTurret(checkBombs);
      data.ai.maybeDropParatroopersNearTarget(nearbyObstacle.data.parent);
    }
  }

  if (!validObstacle) {
    // smart + aimed missiles
    gunfireObstacles = findEnemy(
      data,
      [TYPES.smartMissile, TYPES.aimedMissile],
      192
    );
    nearbyObstacle = getObjectById(gunfireObstacles[0]);
    validObstacle = !!nearbyObstacle;
    isSmartMissile =
      validObstacle && nearbyObstacle.data.type === TYPES.smartMissile;
    isAimedMissile =
      validObstacle && nearbyObstacle.data.type === TYPES.aimedMissile;
  }

  if (!validObstacle) {
    // bombs
    gunfireObstacles = findEnemy(data, TYPES.bomb, 64);
    nearbyObstacle = getObjectById(gunfireObstacles[0]);
    validObstacle = !!nearbyObstacle;
  }

  if (!validObstacle) return;

  // incoming munition or object
  let avoidScale = isTurretGunfire || isSmartMissile ? 3 : undefined;
  let avoidMunition = improvedAvoid(data, nearbyObstacle, avoidScale);

  // hackish: reduce X avoidance of gunfire and smart missiles significantly.
  if (isTurretGunfire || isSmartMissile) {
    // don't avoid turrets on X at all.
    avoidMunition.x = 0;
  } else {
    // cut down X-axis movement for regular case.
    avoidMunition.x *= 0.5;
  }

  // did the munition originate from a chopper?
  fromHelicopter = nearbyObstacle.data.parentType === TYPES.helicopter;

  // player may be targeting CPU with dumb (aimed) or smart missiles.
  // in certain modes, maybe "retaliate" by starting to target helicopters if not already.
  if (
    !data.targeting.helicopters &&
    (isAimedMissile || isSmartMissile) &&
    (gameType === 'hard' || gameType === 'extreme')
  ) {
    data.ai.maybeChaseHelicopters();
    // special extreme case: retaliate, too.
    if (gameType === 'extreme') {
      data.ai.maybeRetaliateWithSmartMissile(nearbyObstacle.data.parent);
    }
  }

  // avoid getting stuck at the top; dive below if near the top of the screen.
  if (data.y < 64 && data.vY < 0) {
    avoidMunition.y = Math.abs(avoidMunition.y);
  }

  addForce(data, avoidMunition, 'avoid', 'munition');
}

export { avoidNearbyMunition, avoidAboveOrBelow, avoidBuildings };
