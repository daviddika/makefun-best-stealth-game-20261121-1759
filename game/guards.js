// GHOSTLINE — guard and camera AI: patrols, vision cones, detection,
// suspicion, investigation, chase, and camera sweeps.
// All positions are in pixels; tile helpers convert to grid coordinates.

(function () {
  "use strict";

  var TILE = 32;

  // --- grid helpers -------------------------------------------------------

  function tileAt(grid, tx, ty) {
    if (ty < 0 || ty >= grid.length || tx < 0 || tx >= grid[0].length) return "#";
    return grid[ty][tx];
  }

  function blocksSight(ch) {
    return ch === "#" || ch === "C" || ch === "D";
  }

  function blocksMove(ch) {
    return ch === "#" || ch === "C" || ch === "D";
  }

  // Line of sight between two pixel points, sampled finely so thin walls
  // still block. Returns true when nothing sight-blocking lies between.
  function hasLineOfSight(grid, x0, y0, x1, y1) {
    var dx = x1 - x0;
    var dy = y1 - y0;
    var dist = Math.hypot(dx, dy);
    var steps = Math.max(1, Math.ceil(dist / 6));
    for (var i = 1; i < steps; i++) {
      var t = i / steps;
      var tx = Math.floor((x0 + dx * t) / TILE);
      var ty = Math.floor((y0 + dy * t) / TILE);
      if (blocksSight(tileAt(grid, tx, ty))) return false;
    }
    return true;
  }

  function angleDiff(a, b) {
    var d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  // Can this watcher (guard or camera) currently see the player?
  // Returns a 0..1 visibility strength, 0 when not seen.
  function visibilityOf(grid, watcher, px, py, opts) {
    var dx = px - watcher.x;
    var dy = py - watcher.y;
    var dist = Math.hypot(dx, dy);
    if (dist > watcher.rangePx) return 0;
    var ang = Math.atan2(dy, dx);
    if (Math.abs(angleDiff(ang, watcher.dir)) > watcher.fov / 2) return 0;
    if (!hasLineOfSight(grid, watcher.x, watcher.y, px, py)) return 0;
    var strength = 1 - (dist / watcher.rangePx) * 0.55;
    if (opts.sneaking) strength *= 0.55;
    if (opts.inBush) strength *= 0.25;
    if (opts.inShadow) strength *= 0.5;
    if (opts.veiled) strength = 0;
    if (opts.inSmoke) strength *= 0.15;
    return Math.max(0, strength);
  }

  // --- Guard ---------------------------------------------------------------

  var GUARD_STATES = ["calm", "suspicious", "alarmed", "searching"];

  function Guard(def, grid) {
    this.spawnX = (def.x + 0.5) * TILE;
    this.spawnY = (def.y + 0.5) * TILE;
    this.x = this.spawnX;
    this.y = this.spawnY;
    this.dir = -Math.PI / 2;
    this.speed = def.speed * TILE; // tiles per second -> px per second
    this.path = def.path.map(function (p) {
      return { x: (p[0] + 0.5) * TILE, y: (p[1] + 0.5) * TILE };
    });
    this.wp = 1 % this.path.length;
    this.state = "calm";
    this.meter = 0; // 0..1 detection on the player
    this.pauseTimer = 0;
    this.lookTimer = 0;
    this.investigate = null; // {x, y} point to check
    this.searchTimer = 0;
    this.lastSeen = null;
    this.chaseSpeed = this.speed * 1.75;
    this.fov = (Math.PI * 75) / 180;
    this.rangePx = 6.5 * TILE;
    this.stepTimer = 0;
    this.heard = null; // {x, y, t} noise to investigate
    this.grid = grid;
  }

  Guard.prototype.distanceTo = function (x, y) {
    return Math.hypot(x - this.x, y - this.y);
  };

  Guard.prototype.moveToward = function (tx, ty, speed, dt) {
    var dx = tx - this.x;
    var dy = ty - this.y;
    var d = Math.hypot(dx, dy);
    if (d < 1) return true;
    var step = Math.min(d, speed * dt);
    var nx = this.x + (dx / d) * step;
    var ny = this.y + (dy / d) * step;
    // Slide along walls: try x then y separately when blocked.
    if (!blocksMove(tileAt(this.grid, Math.floor(nx / TILE), Math.floor(this.y / TILE)))) {
      this.x = nx;
    }
    if (!blocksMove(tileAt(this.grid, Math.floor(this.x / TILE), Math.floor(ny / TILE)))) {
      this.y = ny;
    }
    this.dir = Math.atan2(dy, dx);
    this.stepTimer -= dt;
    if (this.stepTimer <= 0) {
      this.stepTimer = 0.42;
      if (window.GhostAudio && d > 4) window.GhostAudio.footstep(false, false);
    }
    return d <= step + 1;
  };

  Guard.prototype.patrolStep = function (dt) {
    if (this.pauseTimer > 0) {
      this.pauseTimer -= dt;
      this.lookTimer -= dt;
      if (this.lookTimer <= 0) {
        // Glance around while paused at a waypoint.
        this.dir += (Math.random() - 0.5) * 1.6;
        this.lookTimer = 0.7;
      }
      return;
    }
    var target = this.path[this.wp];
    if (this.moveToward(target.x, target.y, this.speed, dt)) {
      this.wp = (this.wp + 1) % this.path.length;
      this.pauseTimer = 0.9 + Math.random() * 0.9;
      this.lookTimer = 0.4;
    }
  };

  // Hear a noise: only calm/suspicious guards turn to investigate.
  Guard.prototype.hearNoise = function (x, y) {
    if (this.state === "alarmed") return;
    if (this.distanceTo(x, y) > 9 * TILE) return;
    this.heard = { x: x, y: y };
    this.investigate = { x: x, y: y };
    if (this.state === "calm") {
      this.state = "suspicious";
      this.meter = Math.max(this.meter, 0.35);
    }
  };

  Guard.prototype.update = function (dt, player, world) {
    var vis = visibilityOf(this.grid, this, player.x, player.y, {
      sneaking: player.sneaking,
      inBush: player.inBush,
      inShadow: player.inShadow,
      veiled: player.veiled,
      inSmoke: world.pointInSmoke(player.x, player.y),
    });

    if (vis > 0) {
      // Fill the meter faster up close and in the open.
      this.meter += vis * dt * 1.15;
      this.lastSeen = { x: player.x, y: player.y };
      if (this.meter >= 0.45 && this.state === "calm") {
        this.state = "suspicious";
        if (window.GhostAudio) window.GhostAudio.suspiciousBlip();
        world.onSuspicion(this);
      }
      if (this.meter >= 1 && this.state !== "alarmed") {
        this.state = "alarmed";
        this.investigate = null;
        if (window.GhostAudio) window.GhostAudio.alertSting();
        world.onAlarm(this);
      }
    } else if (this.state !== "alarmed") {
      // Lose the player slowly; suspicion fades, alarms do not.
      this.meter = Math.max(0, this.meter - dt * 0.22);
      if (this.state === "suspicious" && this.meter <= 0.02 && !this.investigate) {
        this.state = "calm";
      }
    }

    if (this.state === "alarmed") {
      var target = this.lastSeen || { x: player.x, y: player.y };
      // Chase the last known position; if we can still see the player, update it.
      if (vis > 0) target = { x: player.x, y: player.y };
      var arrived = this.moveToward(target.x, target.y, this.chaseSpeed, dt);
      if (arrived) {
        // Lost the trail: search the area, then give up.
        this.state = "searching";
        this.searchTimer = 4;
        this.meter = 0.6;
      }
      if (this.distanceTo(player.x, player.y) < 20) {
        world.onCaught(this);
      }
      return;
    }

    if (this.state === "searching") {
      this.searchTimer -= dt;
      this.lookTimer -= dt;
      if (this.lookTimer <= 0) {
        this.dir += (Math.random() - 0.5) * 2.2;
        this.lookTimer = 0.5;
      }
      if (this.searchTimer <= 0) {
        this.state = "calm";
        this.meter = 0;
        this.investigate = null;
      }
      return;
    }

    if (this.investigate) {
      var done = this.moveToward(this.investigate.x, this.investigate.y, this.speed * 1.25, dt);
      if (done) {
        this.investigate = null;
        this.heard = null;
        this.pauseTimer = 1.6;
        this.lookTimer = 0.3;
        if (this.meter < 0.45) this.state = "calm";
      }
      return;
    }

    this.patrolStep(dt);
  };

  // --- Camera --------------------------------------------------------------

  function Camera(def) {
    this.x = (def.x + 0.5) * TILE;
    this.y = (def.y + 0.5) * TILE;
    this.baseDir = (def.dir * Math.PI) / 180;
    this.dir = this.baseDir;
    this.arc = (def.arc * Math.PI) / 180;
    this.sweepSpeed = def.speed;
    this.sweepPhase = Math.random() * Math.PI * 2;
    this.fov = (Math.PI * 46) / 180;
    this.rangePx = def.range * TILE;
    this.meter = 0;
    this.blindedUntil = 0;
    this.spotted = false;
  }

  Camera.prototype.isBlinded = function (now) {
    return now < this.blindedUntil;
  };

  Camera.prototype.update = function (dt, now, player, world) {
    // Sweep back and forth around the base direction.
    this.sweepPhase += dt * this.sweepSpeed;
    this.dir = this.baseDir + Math.sin(this.sweepPhase) * (this.arc / 2);
    if (this.isBlinded(now)) {
      this.meter = Math.max(0, this.meter - dt);
      return;
    }
    var vis = visibilityOf(world.grid, this, player.x, player.y, {
      sneaking: player.sneaking,
      inBush: player.inBush,
      inShadow: player.inShadow,
      veiled: player.veiled,
      inSmoke: world.pointInSmoke(player.x, player.y),
    });
    if (vis > 0) {
      this.meter += vis * dt * 1.5;
      if (this.meter >= 1 && !this.spotted) {
        this.spotted = true;
        if (window.GhostAudio) window.GhostAudio.cameraSpotted();
        world.onCameraAlarm(this, { x: player.x, y: player.y });
      }
    } else {
      this.meter = Math.max(0, this.meter - dt * 0.5);
      if (this.meter < 0.3) this.spotted = false;
    }
  };

  window.GhostGuards = {
    Guard: Guard,
    Camera: Camera,
    hasLineOfSight: hasLineOfSight,
    visibilityOf: visibilityOf,
    tileAt: tileAt,
    blocksSight: blocksSight,
    blocksMove: blocksMove,
    GUARD_STATES: GUARD_STATES,
  };
})();
