// GHOSTLINE — all canvas drawing: floor, cover, vision cones, entities,
// effects, HUD and the live minimap. No images: every sprite is drawn.

(function () {
  "use strict";

  var TILE = 32;

  // Palette
  var COL = {
    floor: "#232a26",
    floorAlt: "#20261f",
    shadow: "#171d24",
    wall: "#39424e",
    wallTop: "#4b5866",
    crate: "#6b4f2a",
    crateEdge: "#8a6a38",
    bush: "#2c4a26",
    bushLeaf: "#3f6b31",
    door: "#7a5c1e",
    doorEdge: "#c9a13b",
    exit: "#1d5c2e",
    exitGlow: "#7ee787",
    terminal: "#12303a",
    terminalScreen: "#35d0c0",
    shard: "#ffd479",
    keycard: "#e8b4ff",
    player: "#e8f4e2",
    playerCloak: "#9fd8ff",
    guard: "#ff6b5e",
    guardSuspicious: "#ffb020",
    guardAlarmed: "#ff2e2e",
    camera: "#c9d6c2",
    smoke: "rgba(200,205,200,0.35)",
  };

  // Raycast-clipped vision cone: march each ray until a wall/crate blocks
  // it, so the cone wraps around cover instead of painting through walls.
  function drawCone(ctx, grid, x, y, dir, fov, range, color, alpha) {
    var rays = 48;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (var i = 0; i <= rays; i++) {
      var a = dir - fov / 2 + (fov * i) / rays;
      var dx = Math.cos(a);
      var dy = Math.sin(a);
      var r = range;
      for (var d = 8; d <= range; d += 6) {
        var tx = Math.floor((x + dx * d) / TILE);
        var ty = Math.floor((y + dy * d) / TILE);
        var ch = ty < 0 || ty >= grid.length || tx < 0 || tx >= grid[0].length ? "#" : grid[ty][tx];
        if (ch === "#" || ch === "C" || ch === "D") {
          r = d;
          break;
        }
      }
      ctx.lineTo(x + dx * r, y + dy * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawFloorTile(ctx, ch, px, py, time) {
    var x = px * TILE;
    var y = py * TILE;
    if (ch === "#") {
      ctx.fillStyle = COL.wall;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = COL.wallTop;
      ctx.fillRect(x, y, TILE, 4);
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(x + 3, y + 8, TILE - 6, 2);
      ctx.fillRect(x + 3, y + 18, TILE - 6, 2);
      return;
    }
    if (ch === ",") {
      ctx.fillStyle = COL.shadow;
      ctx.fillRect(x, y, TILE, TILE);
    } else {
      ctx.fillStyle = (px + py) % 2 === 0 ? COL.floor : COL.floorAlt;
      ctx.fillRect(x, y, TILE, TILE);
    }
    // faint grid seams
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);

    if (ch === "C") {
      ctx.fillStyle = COL.crate;
      ctx.fillRect(x + 3, y + 3, TILE - 6, TILE - 6);
      ctx.strokeStyle = COL.crateEdge;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 3.5, y + 3.5, TILE - 7, TILE - 7);
      ctx.beginPath();
      ctx.moveTo(x + 3, y + 3);
      ctx.lineTo(x + TILE - 3, y + TILE - 3);
      ctx.moveTo(x + TILE - 3, y + 3);
      ctx.lineTo(x + 3, y + TILE - 3);
      ctx.stroke();
    } else if (ch === "B") {
      ctx.fillStyle = COL.bush;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = COL.bushLeaf;
      for (var i = 0; i < 5; i++) {
        var bx = x + 6 + ((i * 5 + px * 7 + py * 3) % 20);
        var by = y + 6 + ((i * 11 + py * 5) % 20);
        ctx.beginPath();
        ctx.arc(bx, by, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (ch === "D") {
      ctx.fillStyle = COL.door;
      ctx.fillRect(x + 2, y, TILE - 4, TILE);
      ctx.fillStyle = COL.doorEdge;
      ctx.fillRect(x + TILE / 2 - 2, y + 4, 4, TILE - 8);
      ctx.fillStyle = "#ff5e5e";
      ctx.beginPath();
      ctx.arc(x + TILE / 2, y + 8, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (ch === "E") {
      var pulse = 0.5 + 0.3 * Math.sin(time * 3);
      ctx.fillStyle = COL.exit;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.strokeStyle = COL.exitGlow;
      ctx.globalAlpha = pulse;
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 4, y + 4, TILE - 8, TILE - 8);
      ctx.globalAlpha = 1;
      ctx.fillStyle = COL.exitGlow;
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("EXIT", x + TILE / 2, y + TILE / 2);
    } else if (ch === "T") {
      ctx.fillStyle = COL.terminal;
      ctx.fillRect(x + 4, y + 4, TILE - 8, TILE - 8);
      ctx.fillStyle = COL.terminalScreen;
      ctx.fillRect(x + 8, y + 8, TILE - 16, 10);
      ctx.fillStyle = "#0b2a26";
      ctx.fillRect(x + 10, y + 20, TILE - 20, 6);
    }
  }

  function drawKeycard(ctx, x, y, time) {
    var bob = Math.sin(time * 4) * 2;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.fillStyle = COL.keycard;
    ctx.fillRect(-7, -4, 14, 8);
    ctx.fillStyle = "#7a2ea6";
    ctx.fillRect(-7, -4, 4, 8);
    ctx.restore();
  }

  function drawShard(ctx, x, y, time) {
    var bob = Math.sin(time * 3 + x) * 2.5;
    var rot = time * 1.5;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.rotate(rot);
    ctx.fillStyle = COL.shard;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5, 0);
    ctx.lineTo(0, 8);
    ctx.lineTo(-5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawGuard(ctx, g, time, grid) {
    // Vision cone first (under the body).
    var color =
      g.state === "alarmed" ? "rgba(255,46,46,0.30)" : g.state === "suspicious" || g.state === "searching" ? "rgba(255,176,32,0.28)" : "rgba(255,220,120,0.20)";
    drawCone(ctx, grid, g.x, g.y, g.dir, g.fov, g.rangePx, color, 1);
    // Body
    ctx.fillStyle = "#1c1f24";
    ctx.beginPath();
    ctx.arc(g.x, g.y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = g.state === "alarmed" ? COL.guardAlarmed : g.state === "calm" ? COL.guard : COL.guardSuspicious;
    ctx.beginPath();
    ctx.arc(g.x, g.y, 9, 0, Math.PI * 2);
    ctx.fill();
    // Facing tick
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(g.x, g.y);
    ctx.lineTo(g.x + Math.cos(g.dir) * 13, g.y + Math.sin(g.dir) * 13);
    ctx.stroke();
    // Detection meter ring
    if (g.meter > 0.03) {
      ctx.strokeStyle = g.meter >= 1 ? "#ff2e2e" : "#ffb020";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(g.x, g.y, 15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, g.meter));
      ctx.stroke();
    }
    // State mark
    if (g.state !== "calm") {
      ctx.fillStyle = g.state === "alarmed" ? "#ff2e2e" : "#ffb020";
      ctx.font = "bold 13px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(g.state === "alarmed" ? "!" : "?", g.x, g.y - 16);
    }
  }

  function drawCamera(ctx, cam, now, grid) {
    var blinded = cam.isBlinded(now);
    var color = blinded ? "rgba(120,120,120,0.15)" : cam.meter > 0.6 ? "rgba(255,46,46,0.30)" : "rgba(255,220,120,0.22)";
    drawCone(ctx, grid, cam.x, cam.y, cam.dir, cam.fov, cam.rangePx, color, 1);
    ctx.fillStyle = "#20242a";
    ctx.fillRect(cam.x - 7, cam.y - 7, 14, 14);
    ctx.fillStyle = blinded ? "#777" : cam.meter > 0.6 ? "#ff2e2e" : COL.camera;
    ctx.beginPath();
    ctx.arc(cam.x, cam.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = blinded ? "#777" : "#c9d6c2";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cam.x, cam.y);
    ctx.lineTo(cam.x + Math.cos(cam.dir) * 12, cam.y + Math.sin(cam.dir) * 12);
    ctx.stroke();
    if (cam.meter > 0.03 && !blinded) {
      ctx.strokeStyle = "#ff2e2e";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cam.x, cam.y, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, cam.meter));
      ctx.stroke();
    }
  }

  function drawPlayer(ctx, p, time) {
    ctx.save();
    if (p.veiled) ctx.globalAlpha = 0.45;
    // Sneak shadow ring
    if (p.sneaking) {
      ctx.strokeStyle = "rgba(126,231,135,0.5)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 15, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = "#1c1f24";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.veiled ? COL.playerCloak : COL.player;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8.5, 0, Math.PI * 2);
    ctx.fill();
    // Hood / facing wedge
    ctx.fillStyle = "#2c4a26";
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(p.dir) * 8, p.y + Math.sin(p.dir) * 8);
    ctx.arc(p.x, p.y, 6, p.dir - 0.9, p.dir + 0.9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // Veil shimmer
    if (p.veiled) {
      ctx.strokeStyle = "rgba(159,216,255,0.8)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 13 + Math.sin(time * 6) * 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawNoisemaker(ctx, n, time) {
    var pulse = 0.4 + 0.3 * Math.sin(time * 10);
    ctx.strokeStyle = "rgba(255,214,120," + pulse + ")";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#ffd678";
    ctx.beginPath();
    ctx.arc(n.x, n.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSmoke(ctx, s) {
    ctx.fillStyle = COL.smoke;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(220,225,220,0.18)";
    ctx.beginPath();
    ctx.arc(s.x - s.radius * 0.4, s.y + s.radius * 0.3, s.radius * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- HUD -----------------------------------------------------------------

  function drawHud(ctx, w, time) {
    // Panels sit along the bottom edge so the spawn (top-left) and the
    // exit (top-right) are never covered.
    var pad = 10;
    var y = 608 - 64 - pad;
    var x = pad;
    ctx.save();
    ctx.fillStyle = "rgba(5,8,11,0.72)";
    ctx.fillRect(x, y, 300, 64);
    ctx.strokeStyle = "rgba(126,231,135,0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, 300, 64);
    ctx.fillStyle = "#e8f4e2";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(w.level.name, x + 10, y + 8);
    ctx.fillStyle = "#9fb3a4";
    ctx.font = "12px sans-serif";
    ctx.fillText("Shards " + w.shardsGot + "/" + w.shardsTotal + "   Keycard " + (w.hasKeycard ? "YES" : "—") + "   Cameras " + (w.camerasBlind ? "BLIND" : "LIVE"), x + 10, y + 28);
    ctx.fillText("Noisemaker " + w.gadgets.noisemaker + " · Smoke " + w.gadgets.smoke + " · Veil " + w.gadgets.veil, x + 10, y + 46);
    // Detection bar (worst watcher meter) — bottom, right of the info panel.
    var worst = w.worstMeter;
    var bw = 150;
    var bx = x + 300 + pad;
    ctx.fillStyle = "rgba(5,8,11,0.72)";
    ctx.fillRect(bx - 8, y, bw + 16, 64);
    ctx.strokeStyle = "rgba(255,176,32,0.4)";
    ctx.strokeRect(bx - 7.5, y + 0.5, bw + 16, 64);
    ctx.fillStyle = "#9fb3a4";
    ctx.font = "12px sans-serif";
    ctx.fillText("SPOTTED", bx, y + 8);
    ctx.fillStyle = "#20261f";
    ctx.fillRect(bx, y + 28, bw, 10);
    ctx.fillStyle = worst >= 1 ? "#ff2e2e" : worst > 0.45 ? "#ffb020" : "#7ee787";
    ctx.fillRect(bx, y + 28, bw * Math.min(1, worst), 10);
    ctx.fillStyle = worst >= 1 ? "#ff6b5e" : "#d7e3d0";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText(worst >= 1 ? "ALARM!" : worst > 0.45 ? "SUSPICIOUS" : worst > 0.03 ? "SEEN…" : "UNSEEN", bx, y + 44);
    ctx.restore();
  }

  function drawMinimap(ctx, w) {
    var scale = 3.2;
    var mw = 30 * scale;
    var mh = 19 * scale;
    var ox = 960 - mw - 10;
    var oy = 608 - mh - 10;
    ctx.save();
    ctx.fillStyle = "rgba(5,8,11,0.78)";
    ctx.fillRect(ox - 4, oy - 4, mw + 8, mh + 8);
    ctx.strokeStyle = "rgba(126,231,135,0.4)";
    ctx.strokeRect(ox - 3.5, oy - 3.5, mw + 7, mh + 7);
    for (var ty = 0; ty < 19; ty++) {
      for (var tx = 0; tx < 30; tx++) {
        var ch = w.grid[ty][tx];
        if (ch === "#") ctx.fillStyle = "#4b5866";
        else if (ch === "C") ctx.fillStyle = "#8a6a38";
        else if (ch === "E") ctx.fillStyle = "#7ee787";
        else if (ch === "D") ctx.fillStyle = "#c9a13b";
        else continue;
        ctx.fillRect(ox + tx * scale, oy + ty * scale, scale, scale);
      }
    }
    // Exit marker
    ctx.fillStyle = "#7ee787";
    ctx.fillRect(ox + w.exitTile.x * scale - 1, oy + w.exitTile.y * scale - 1, scale + 2, scale + 2);
    // Guards
    w.guards.forEach(function (g) {
      ctx.fillStyle = g.state === "alarmed" ? "#ff2e2e" : "#ff6b5e";
      ctx.beginPath();
      ctx.arc(ox + (g.x / 32) * scale, oy + (g.y / 32) * scale, 2.4, 0, Math.PI * 2);
      ctx.fill();
    });
    // Player
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(ox + (w.player.x / 32) * scale, oy + (w.player.y / 32) * scale, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // --- whole frame ---------------------------------------------------------

  function drawWorld(ctx, w, time) {
    ctx.clearRect(0, 0, 960, 608);
    for (var ty = 0; ty < 19; ty++) {
      for (var tx = 0; tx < 30; tx++) {
        drawFloorTile(ctx, w.grid[ty][tx], tx, ty, time);
      }
    }
    // Pickups
    w.keycards.forEach(function (k) {
      if (!k.taken) drawKeycard(ctx, k.x, k.y, time);
    });
    w.shards.forEach(function (s) {
      if (!s.taken) drawShard(ctx, s.x, s.y, time);
    });
    // Smoke under cones
    w.smokes.forEach(function (s) {
      drawSmoke(ctx, s);
    });
    // Cones + watchers
    w.cameras.forEach(function (c) {
      drawCamera(ctx, c, w.now, w.grid);
    });
    w.guards.forEach(function (g) {
      drawGuard(ctx, g, time, w.grid);
    });
    w.noisemakers.forEach(function (n) {
      drawNoisemaker(ctx, n, time);
    });
    drawPlayer(ctx, w.player, time);
    drawHud(ctx, w, time);
    drawMinimap(ctx, w);
  }

  window.GhostRender = {
    drawWorld: drawWorld,
    drawCone: drawCone,
    COL: COL,
  };
})();
