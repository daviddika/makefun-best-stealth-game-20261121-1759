// GHOSTLINE — game state, loop, input, gadgets, scoring and screenshots.
// Owns the run: builds a level from LEVELS, steps guards and cameras,
// resolves detection, gadgets, doors, terminals, shards and the exit.

(function () {
  "use strict";

  var TILE = 32;
  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var Audio = window.GhostAudio;
  var UI = window.GhostUI;
  var GG = window.GhostGuards;
  var Render = window.GhostRender;

  var save = UI.loadSave();
  if (save.muted) Audio.setMuted(true);

  var state = "title"; // title | levels | how | playing | paused | caught | complete | campaign
  var levelIndex = 0;
  var world = null;
  var campaignScore = 0;
  var raf = 0;
  var lastTs = 0;
  var keys = {};
  var shotMode = null;

  // --- level build ----------------------------------------------------------

  function parseLevel(def) {
    var grid = def.map.map(function (row) {
      return row.split("");
    });
    var player = { x: 0, y: 0 };
    var exitTile = { x: 0, y: 0 };
    var keycards = [];
    var shards = [];
    var terminals = [];
    for (var ty = 0; ty < 19; ty++) {
      for (var tx = 0; tx < 30; tx++) {
        var ch = grid[ty][tx];
        var cx = (tx + 0.5) * TILE;
        var cy = (ty + 0.5) * TILE;
        if (ch === "P") {
          player = { x: cx, y: cy, dir: 0, speed: 4.4 * TILE, sneaking: false, inBush: false, inShadow: false, veiled: false };
          grid[ty][tx] = ".";
        } else if (ch === "E") {
          exitTile = { x: tx, y: ty };
        } else if (ch === "K") {
          keycards.push({ x: cx, y: cy, taken: false });
          grid[ty][tx] = ".";
        } else if (ch === "*") {
          shards.push({ x: cx, y: cy, taken: false });
          grid[ty][tx] = ".";
        } else if (ch === "T") {
          terminals.push({ x: tx, y: ty, hacked: false });
        } else if (ch === "G" || ch === "M") {
          grid[ty][tx] = ".";
        }
      }
    }
    return { grid: grid, player: player, exitTile: exitTile, keycards: keycards, shards: shards, terminals: terminals };
  }

  function startLevel(index, opts) {
    opts = opts || {};
    levelIndex = index;
    var def = LEVELS[index];
    var built = parseLevel(def);
    var guards = def.guards.map(function (g) {
      return new GG.Guard(g, built.grid);
    });
    var cameras = def.cameras.map(function (c) {
      return new GG.Camera(c);
    });
    world = {
      level: def,
      levelNumber: index + 1,
      grid: built.grid,
      player: built.player,
      exitTile: built.exitTile,
      keycards: built.keycards,
      shards: built.shards,
      terminals: built.terminals,
      guards: guards,
      cameras: cameras,
      noisemakers: [],
      smokes: [],
      gadgets: { noisemaker: GADGETS.noisemaker, smoke: GADGETS.smoke, veil: GADGETS.veil },
      hasKeycard: false,
      shardsGot: 0,
      shardsTotal: built.shards.length,
      time: 0,
      now: 0,
      worstMeter: 0,
      everSuspicious: false,
      everAlarmed: false,
      camerasBlind: false,
      camerasBlindUntil: 0,
      veilUntil: 0,
      hacking: null,
      hackProgress: 0,
      stepTimer: 0,
      caught: false,
      finished: false,
    };
    UI.setObjective(def.name + " — reach the EXIT unseen.");
    UI.setClock(0);
    UI.hideOverlay();
    state = "playing";
    if (opts.silent !== true) UI.showToast(def.name + " — " + def.brief, 3600);
  }

  // --- world queries ----------------------------------------------------------

  function tileChar(tx, ty) {
    if (ty < 0 || ty >= 19 || tx < 0 || tx >= 30) return "#";
    return world.grid[ty][tx];
  }

  function pointInSmoke(x, y) {
    for (var i = 0; i < world.smokes.length; i++) {
      var s = world.smokes[i];
      if (Math.hypot(x - s.x, y - s.y) < s.radius) return true;
    }
    return false;
  }

  function updatePlayerCover() {
    var p = world.player;
    var tx = Math.floor(p.x / TILE);
    var ty = Math.floor(p.y / TILE);
    var ch = tileChar(tx, ty);
    p.inBush = ch === "B";
    p.inShadow = ch === ",";
    p.veiled = world.now < world.veilUntil;
  }

  // --- interactions -----------------------------------------------------------

  function nearestInteractable() {
    var p = world.player;
    var best = null;
    var bestD = 1.6 * TILE;
    function consider(x, y, kind, ref) {
      var d = Math.hypot(x - p.x, y - p.y);
      if (d < bestD) {
        bestD = d;
        best = { kind: kind, ref: ref, x: x, y: y };
      }
    }
    world.keycards.forEach(function (k) {
      if (!k.taken) consider(k.x, k.y, "keycard", k);
    });
    world.shards.forEach(function (s) {
      if (!s.taken) consider(s.x, s.y, "shard", s);
    });
    world.terminals.forEach(function (t) {
      if (!t.hacked) consider((t.x + 0.5) * TILE, (t.y + 0.5) * TILE, "terminal", t);
    });
    return best;
  }

  function interact() {
    if (!world || state !== "playing") return;
    var it = nearestInteractable();
    if (!it) return;
    var p = world.player;
    if (it.kind === "keycard") {
      it.ref.taken = true;
      world.hasKeycard = true;
      Audio.keycardPickup();
      UI.showToast("Keycard acquired — locked doors will open.");
    } else if (it.kind === "shard") {
      it.ref.taken = true;
      world.shardsGot++;
      Audio.shardPickup();
      UI.showToast("Data shard " + world.shardsGot + "/" + world.shardsTotal + " (+150)");
    } else if (it.kind === "terminal") {
      world.hacking = it.ref;
      world.hackProgress = 0;
      Audio.hackStart();
      UI.showToast("Hacking terminal… stay still.");
    }
  }

  function throwNoisemaker(tx, ty) {
    if (!world || state !== "playing") return;
    if (world.gadgets.noisemaker <= 0) {
      UI.showToast("No noisemakers left.");
      return;
    }
    world.gadgets.noisemaker--;
    var x = (tx + 0.5) * TILE;
    var y = (ty + 0.5) * TILE;
    world.noisemakers.push({ x: x, y: y, radius: 14, t: 0, life: 2.2 });
    Audio.throwSound();
    setTimeout(function () {
      if (world) Audio.noisemakerPing();
    }, 450);
    world.guards.forEach(function (g) {
      g.hearNoise(x, y);
    });
    UI.showToast("Noisemaker thrown — guards investigate the ping.");
  }

  function dropSmoke() {
    if (!world || state !== "playing") return;
    if (world.gadgets.smoke <= 0) {
      UI.showToast("No smoke pellets left.");
      return;
    }
    world.gadgets.smoke--;
    var p = world.player;
    world.smokes.push({ x: p.x, y: p.y, radius: 2.6 * TILE, t: 0, life: SMOKE_SECONDS });
    Audio.smokeSound();
    UI.showToast("Smoke out — you are hidden inside the cloud.");
  }

  function useVeil() {
    if (!world || state !== "playing") return;
    if (world.gadgets.veil <= 0) {
      UI.showToast("No veil cloak charges left.");
      return;
    }
    if (world.now < world.veilUntil) return;
    world.gadgets.veil--;
    world.veilUntil = world.now + VEIL_SECONDS;
    Audio.veilSound();
    UI.showToast("Veil cloak — invisible for " + VEIL_SECONDS + "s.");
  }

  // --- world events -----------------------------------------------------------

  var worldEvents = {
    grid: null,
    pointInSmoke: pointInSmoke,
    onSuspicion: function (g) {
      world.everSuspicious = true;
    },
    onAlarm: function (g) {
      world.everAlarmed = true;
      world.everSuspicious = true;
      UI.showToast("ALARM — a guard spotted you! Break line of sight!");
    },
    onCameraAlarm: function (cam, pos) {
      world.everAlarmed = true;
      world.everSuspicious = true;
      UI.showToast("Camera spotted you — guards are coming!");
      world.guards.forEach(function (g) {
        g.lastSeen = { x: pos.x, y: pos.y };
        if (g.state !== "alarmed") {
          g.state = "alarmed";
          g.meter = 1;
        }
      });
    },
    onCaught: function (g) {
      if (world.caught || world.finished) return;
      world.caught = true;
      state = "caught";
      Audio.caughtSound();
      UI.showCaught(world.level.name, menuCallbacks);
    },
  };

  // --- update -----------------------------------------------------------------

  function update(dt) {
    if (!world || state !== "playing") return;
    if (world.frozen) return; // staged screenshot scene: hold the pose
    world.now += dt;
    world.time += dt;
    worldEvents.grid = world.grid;
    var p = world.player;

    // Movement
    var mx = 0;
    var my = 0;
    if (keys["arrowup"] || keys["w"]) my -= 1;
    if (keys["arrowdown"] || keys["s"]) my += 1;
    if (keys["arrowleft"] || keys["a"]) mx -= 1;
    if (keys["arrowright"] || keys["d"]) mx += 1;
    p.sneaking = !!keys["shift"];
    var moving = mx !== 0 || my !== 0;
    if (moving) {
      var len = Math.hypot(mx, my);
      mx /= len;
      my /= len;
      var speed = p.speed * (p.sneaking ? 0.45 : 1);
      if (world.hacking) speed *= 0.25;
      var nx = p.x + mx * speed * dt;
      var ny = p.y + my * speed * dt;
      if (!GG.blocksMove(tileChar(Math.floor(nx / TILE), Math.floor(p.y / TILE)))) p.x = nx;
      if (!GG.blocksMove(tileChar(Math.floor(p.x / TILE), Math.floor(ny / TILE)))) p.y = ny;
      p.dir = Math.atan2(my, mx);
      p.x = Math.max(12, Math.min(960 - 12, p.x));
      p.y = Math.max(12, Math.min(608 - 12, p.y));
      world.stepTimer -= dt;
      if (world.stepTimer <= 0) {
        world.stepTimer = p.sneaking ? 0.55 : 0.38;
        Audio.footstep(p.sneaking, p.inShadow);
      }
      // Running makes noise guards can hear.
      if (!p.sneaking) {
        world.guards.forEach(function (g) {
          if (g.distanceTo(p.x, p.y) < 3.2 * TILE) g.hearNoise(p.x, p.y);
        });
      }
    }

    // Locked door: walk through when the player has the keycard.
    var ptx = Math.floor(p.x / TILE);
    var pty = Math.floor(p.y / TILE);
    if (tileChar(ptx, pty) === "D") {
      if (world.hasKeycard) {
        world.grid[pty][ptx] = ".";
        Audio.doorOpen();
        UI.showToast("Door unlocked with the keycard.");
      } else {
        // Push the player back out of the door tile.
        p.x -= mx * p.speed * dt;
        p.y -= my * p.speed * dt;
        UI.showToast("Locked — find the keycard first.");
      }
    }

    // Hacking a terminal (hold still near it).
    if (world.hacking) {
      var h = world.hacking;
      var d = Math.hypot((h.x + 0.5) * TILE - p.x, (h.y + 0.5) * TILE - p.y);
      if (d > 1.8 * TILE || moving) {
        world.hacking = null;
        world.hackProgress = 0;
        UI.showToast("Hack interrupted.");
      } else {
        world.hackProgress += dt / 2.5;
        if (world.hackProgress >= 1) {
          h.hacked = true;
          world.hacking = null;
          world.camerasBlindUntil = world.now + CAMERA_BLIND_SECONDS;
          world.camerasBlind = true;
          world.cameras.forEach(function (c) {
            c.blindedUntil = world.camerasBlindUntil;
            c.meter = 0;
          });
          Audio.hackDone();
          UI.showToast("Terminal hacked — all cameras blind for 20s.");
        }
      }
    }
    if (world.camerasBlind && world.now >= world.camerasBlindUntil) {
      world.camerasBlind = false;
      UI.showToast("Cameras are live again.");
    }

    updatePlayerCover();

    // Watchers
    var worst = 0;
    world.guards.forEach(function (g) {
      g.update(dt, p, worldEvents);
      worst = Math.max(worst, g.meter);
    });
    world.cameras.forEach(function (c) {
      c.update(dt, world.now, p, worldEvents);
      worst = Math.max(worst, c.meter);
    });
    world.worstMeter = worst;

    // Noisemakers and smoke decay
    world.noisemakers = world.noisemakers.filter(function (n) {
      n.t += dt;
      n.radius = 14 + n.t * 90;
      return n.t < n.life;
    });
    world.smokes = world.smokes.filter(function (s) {
      s.t += dt;
      return s.t < s.life;
    });

    // Exit
    if (ptx === world.exitTile.x && pty === world.exitTile.y) {
      finishLevel();
    }

    UI.setClock(world.time);
  }

  function finishLevel() {
    world.finished = true;
    state = "complete";
    var time = world.time;
    var par = world.level.par;
    var rating = world.everAlarmed ? "DETECTED" : world.everSuspicious ? "SHADOW" : "GHOST";
    var score = 1000;
    if (rating === "GHOST") score += 600;
    else if (rating === "SHADOW") score += 250;
    score += world.shardsGot * 150;
    score += Math.max(0, Math.round((par - time) * 8));
    campaignScore += score;
    var best = ratingRank(rating);
    var prev = save.ratings[world.levelNumber];
    if (!prev || ratingRank(prev) > best) save.ratings[world.levelNumber] = rating;
    if (world.levelNumber < 8 && save.unlocked < world.levelNumber + 1) save.unlocked = world.levelNumber + 1;
    if (campaignScore > save.bestScore) save.bestScore = campaignScore;
    UI.storeSave(save);
    Audio.levelClear();
    var mm = Math.floor(time / 60);
    var ss = Math.floor(time % 60);
    var pm = Math.floor(par / 60);
    var ps = Math.floor(par % 60);
    UI.showLevelComplete(
      {
        rating: rating,
        levelName: world.level.name,
        timeText: (mm < 10 ? "0" : "") + mm + ":" + (ss < 10 ? "0" : "") + ss,
        parText: (pm < 10 ? "0" : "") + pm + ":" + (ps < 10 ? "0" : "") + ps,
        shardsGot: world.shardsGot,
        shardsTotal: world.shardsTotal,
        score: score,
        hasNext: world.levelNumber < 8,
      },
      menuCallbacks
    );
    if (world.levelNumber === 8) {
      Audio.winJingle();
    }
  }

  function ratingRank(r) {
    return r === "GHOST" ? 0 : r === "SHADOW" ? 1 : 2;
  }

  // --- render loop --------------------------------------------------------------

  function frame(ts) {
    raf = requestAnimationFrame(frame);
    var dt = Math.min(0.05, (ts - lastTs) / 1000 || 0);
    lastTs = ts;
    if (world && state === "playing") update(dt);
    if (world) {
      Render.drawWorld(ctx, world, ts / 1000);
      // Hack progress bar — top centre, clear of the bottom HUD panels.
      if (world.hacking && world.hackProgress > 0) {
        ctx.save();
        ctx.fillStyle = "rgba(5,8,11,0.8)";
        ctx.fillRect(380, 12, 200, 18);
        ctx.fillStyle = "#35d0c0";
        ctx.fillRect(382, 14, 196 * world.hackProgress, 14);
        ctx.fillStyle = "#e8f4e2";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("HACKING…", 480, 44);
        ctx.restore();
      }
    }
  }

  // --- menus ----------------------------------------------------------------------

  var menuCallbacks = {
    play: function () {
      Audio.unlock();
      Audio.startAmbient();
      var idx = Math.min(save.unlocked, 8) - 1;
      startLevel(idx);
    },
    levels: function () {
      state = "levels";
      UI.showLevels(save, menuCallbacks);
    },
    how: function () {
      state = "how";
      UI.showHow(menuCallbacks);
    },
    back: function () {
      state = "title";
      UI.showTitle(save, menuCallbacks);
    },
    level: function (n) {
      Audio.unlock();
      Audio.startAmbient();
      startLevel(parseInt(n, 10) - 1);
    },
    resume: function () {
      state = "playing";
      UI.hideOverlay();
    },
    restart: function () {
      startLevel(levelIndex);
    },
    retry: function () {
      startLevel(levelIndex);
    },
    quit: function () {
      state = "title";
      world = null;
      UI.showTitle(save, menuCallbacks);
    },
    next: function () {
      startLevel(levelIndex + 1);
    },
    replay: function () {
      startLevel(levelIndex);
    },
    campaign: function () {
      state = "campaign";
      UI.showCampaignWin(campaignScore, save.ratings, menuCallbacks);
    },
    "replay-all": function () {
      campaignScore = 0;
      startLevel(0);
    },
  };

  // --- input ------------------------------------------------------------------------

  window.addEventListener("keydown", function (e) {
    var k = e.key.toLowerCase();
    keys[k] = true;
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].indexOf(k) >= 0) e.preventDefault();
    if (k === "m") {
      Audio.setMuted(!Audio.isMuted());
      save.muted = Audio.isMuted();
      UI.storeSave(save);
      UI.showToast(Audio.isMuted() ? "Sound muted." : "Sound on.");
      return;
    }
    if (k === "p" || k === "escape") {
      if (state === "playing") {
        state = "paused";
        UI.showPaused(menuCallbacks);
      } else if (state === "paused") {
        state = "playing";
        UI.hideOverlay();
      }
      return;
    }
    if (state !== "playing") return;
    if (k === "e") interact();
    else if (k === "q") {
      // Throw toward the player's facing direction, 3 tiles ahead.
      var p = world.player;
      var tx = Math.floor((p.x + Math.cos(p.dir) * 3 * TILE) / TILE);
      var ty = Math.floor((p.y + Math.sin(p.dir) * 3 * TILE) / TILE);
      throwNoisemaker(tx, ty);
    } else if (k === "f") dropSmoke();
    else if (k === "r") useVeil();
  });

  window.addEventListener("keyup", function (e) {
    keys[e.key.toLowerCase()] = false;
  });

  canvas.addEventListener("click", function (e) {
    if (state !== "playing" || !world) return;
    var rect = canvas.getBoundingClientRect();
    var tx = Math.floor(((e.clientX - rect.left) / rect.width) * 30);
    var ty = Math.floor(((e.clientY - rect.top) / rect.height) * 19);
    throwNoisemaker(tx, ty);
  });

  window.addEventListener("pointerdown", function () {
    Audio.unlock();
    Audio.startAmbient();
  });

  // --- screenshot modes ---------------------------------------------------------------
  // ?shot=title|play|alarm|win&seed=N renders a fixed, deterministic scene
  // for screenshots. These are real renders of the game's own code.

  function applyShotMode() {
    var params = new URLSearchParams(window.location.search);
    shotMode = params.get("shot");
    if (!shotMode) return;
    if (shotMode === "title") {
      state = "title";
      UI.showTitle(save, menuCallbacks);
      return;
    }
    if (shotMode === "play") {
      startLevel(1, { silent: true });
      world.frozen = true; // hold the staged pose for the screenshot
      // Mid-level: player sneaking past a patrol, guards visible.
      world.player.x = 9.5 * TILE;
      world.player.y = 9.5 * TILE;
      world.player.sneaking = true;
      world.player.dir = 0.3;
      world.player.inBush = false;
      world.player.inShadow = false;
      world.guards[0].x = 12.5 * TILE;
      world.guards[0].y = 9.5 * TILE;
      world.guards[0].dir = Math.PI;
      world.guards[1].x = 18.5 * TILE;
      world.guards[1].y = 7.5 * TILE;
      world.guards[1].dir = Math.PI / 2;
      world.guards[1].meter = 0.4;
      world.guards[1].state = "suspicious";
      world.everSuspicious = true;
      world.worstMeter = 0.4;
      return;
    }
    if (shotMode === "alarm") {
      startLevel(2, { silent: true });
      world.frozen = true; // hold the staged pose for the screenshot
      world.player.x = 14.5 * TILE;
      world.player.y = 10.5 * TILE;
      world.player.dir = -0.6;
      world.guards[0].x = 11.5 * TILE;
      world.guards[0].y = 10.5 * TILE;
      world.guards[0].dir = 0;
      world.guards[0].meter = 1;
      world.guards[0].state = "alarmed";
      world.guards[1].x = 17.5 * TILE;
      world.guards[1].y = 8.5 * TILE;
      world.guards[1].dir = Math.PI / 2;
      world.guards[1].meter = 0.85;
      world.guards[1].state = "suspicious";
      world.everAlarmed = true;
      world.worstMeter = 1;
      world.noisemakers.push({ x: 20.5 * TILE, y: 12.5 * TILE, radius: 60, t: 0.5, life: 2.2 });
      return;
    }
    if (shotMode === "win") {
      startLevel(0, { silent: true });
      world.player.x = 27.5 * TILE;
      world.player.y = 1.5 * TILE;
      world.player.dir = 0;
      world.shardsGot = 1;
      world.shards.forEach(function (s) {
        s.taken = true;
      });
      world.hasKeycard = true;
      // Show the completion screen over the level.
      world.finished = true;
      state = "complete";
      UI.showLevelComplete(
        {
          rating: "GHOST",
          levelName: world.level.name,
          timeText: "01:04",
          parText: "01:15",
          shardsGot: 1,
          shardsTotal: 1,
          score: 1872,
          hasNext: true,
        },
        menuCallbacks
      );
    }
  }

  // --- boot ---------------------------------------------------------------------------

  UI.showTitle(save, menuCallbacks);
  applyShotMode();
  lastTs = performance.now();
  raf = requestAnimationFrame(frame);

  // Expose a tiny handle for automated play-testing in the browser console.
  window.Ghostline = {
    getState: function () {
      return state;
    },
    getWorld: function () {
      return world;
    },
    startLevel: startLevel,
    save: save,
  };
})();
