// GHOSTLINE — menus, overlays and saved progress.
// The canvas draws the game; this module owns every DOM screen around it.

(function () {
  "use strict";

  var SAVE_KEY = "ghostline-save-v1";
  var overlay = document.getElementById("overlay");
  var toastEl = document.getElementById("toast");
  var objectiveEl = document.getElementById("objective");
  var clockEl = document.getElementById("clock");
  var toastTimer = null;

  function loadSave() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return freshSave();
      var s = JSON.parse(raw);
      if (!s || typeof s !== "object") return freshSave();
      s.unlocked = Math.max(1, Math.min(8, s.unlocked | 0 || 1));
      s.ratings = s.ratings || {};
      s.bestScore = s.bestScore | 0;
      s.muted = !!s.muted;
      return s;
    } catch (e) {
      return freshSave();
    }
  }

  function freshSave() {
    return { unlocked: 1, ratings: {}, bestScore: 0, muted: false };
  }

  function storeSave(save) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch (e) {
      /* storage unavailable (private mode): progress just won't persist */
    }
  }

  function showToast(msg, ms) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("show");
    }, ms || 2400);
  }

  function setObjective(text) {
    objectiveEl.textContent = text;
  }

  function setClock(seconds) {
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    clockEl.textContent = (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }

  function hideOverlay() {
    overlay.classList.add("hidden");
    overlay.innerHTML = "";
  }

  function setOverlay(html) {
    overlay.classList.remove("hidden");
    overlay.innerHTML = html;
  }

  function el(html) {
    var d = document.createElement("div");
    d.innerHTML = html;
    return d.firstChild;
  }

  function ratingLabel(r) {
    return r === "GHOST" ? "GHOST" : r === "SHADOW" ? "SHADOW" : "DETECTED";
  }

  // --- screens --------------------------------------------------------------

  function showTitle(save, callbacks) {
    var best = save.bestScore > 0 ? "<p>Best campaign score: <b>" + save.bestScore + "</b></p>" : "";
    setOverlay(
      '<h1>GHOST<em>LINE</em></h1>' +
        '<p class="sub">Eight facilities. One infiltrator. Zero witnesses.</p>' +
        "<p>You are <b>Wren</b>, slipping through the facilities of the Meridian Combine to reach each exit unseen. " +
        "Guards patrol with real vision cones. Cameras sweep the halls. Crates block sight, bushes hide you, " +
        "dark floors swallow you. Throw a noisemaker to pull a guard away, drop smoke to vanish, or wear the veil cloak and walk straight past them.</p>" +
        best +
        '<div class="menu">' +
        '<button class="primary" data-act="play">▶ Play — ' + (save.unlocked > 1 ? "Continue" : "Facility 01") + "</button>" +
        '<button data-act="levels">Level select</button>' +
        '<button data-act="how">How to play</button>' +
        "</div>" +
        '<p class="keys">WASD / Arrows — move &nbsp;·&nbsp; Shift — sneak &nbsp;·&nbsp; E — interact &nbsp;·&nbsp; Q — noisemaker &nbsp;·&nbsp; F — smoke &nbsp;·&nbsp; R — veil cloak &nbsp;·&nbsp; Click — throw noisemaker &nbsp;·&nbsp; P — pause</p>'
    );
    wireButtons(callbacks);
  }

  function showLevels(save, callbacks) {
    var buttons = "";
    for (var i = 0; i < 8; i++) {
      var locked = i + 1 > save.unlocked;
      var rating = save.ratings[i + 1] || "";
      buttons +=
        '<button data-act="level" data-level="' +
        (i + 1) +
        '" class="' +
        (locked ? "locked" : "") +
        '">' +
        "Facility " +
        (i + 1 < 10 ? "0" + (i + 1) : i + 1) +
        (locked ? " 🔒" : rating ? " — " + rating : "") +
        "</button>";
    }
    setOverlay(
      "<h2>LEVEL SELECT</h2>" +
        "<p>Finish a facility to unlock the next. Ratings: <b>GHOST</b> (never seen) · <b>SHADOW</b> (suspicion only) · <b>DETECTED</b> (alarm raised).</p>" +
        '<div class="menu">' +
        buttons +
        "</div>" +
        '<div class="menu"><button data-act="back">← Back</button></div>'
    );
    wireButtons(callbacks);
  }

  function showHow(callbacks) {
    setOverlay(
      "<h2>HOW TO PLAY</h2>" +
        "<p><b>Stay out of the cones.</b> Guards and cameras fill a detection ring over your head. " +
        "Sneak (Shift) to move slower and quieter. Bushes and dark floors make you far harder to spot; crates and walls block sight entirely.</p>" +
        "<p><b>Calm → Suspicious → Alarmed.</b> A suspicious guard walks over to look. An alarmed guard chases you — break line of sight and hide until the search ends. If a guard touches you, you are caught and the facility restarts.</p>" +
        "<p><b>Gadgets.</b> <b>Q</b> throws a noisemaker — guards investigate the ping. <b>F</b> drops a smoke pellet. <b>R</b> wears the veil cloak (brief invisibility). <b>Click</b> throws a noisemaker at that tile.</p>" +
        "<p><b>Doors &amp; terminals.</b> Locked doors need a keycard (E to pick up, then walk through). Terminals (E) blind every camera for 20 seconds. Data shards are bonus points.</p>" +
        "<p><b>Rating.</b> GHOST pays best. Time under par and shards collected add to your campaign score.</p>" +
        '<div class="menu"><button class="primary" data-act="back">Got it</button></div>'
    );
    wireButtons(callbacks);
  }

  function showPaused(callbacks) {
    setOverlay(
      "<h2>PAUSED</h2>" +
        "<p>Wren waits in the dark. The patrols do not.</p>" +
        '<div class="menu">' +
        '<button class="primary" data-act="resume">Resume</button>' +
        '<button data-act="restart">Restart facility</button>' +
        '<button data-act="quit">Quit to title</button>' +
        "</div>"
    );
    wireButtons(callbacks);
  }

  function showCaught(levelName, callbacks) {
    setOverlay(
      "<h2>CAUGHT</h2>" +
        "<p>The guard got a hand on you in <b>" +
        levelName +
        "</b>. The facility resets — the patrols forget, but the score does not forgive.</p>" +
        '<div class="menu">' +
        '<button class="primary" data-act="retry">Try again</button>' +
        '<button data-act="quit">Quit to title</button>' +
        "</div>"
    );
    wireButtons(callbacks);
  }

  function showLevelComplete(result, callbacks) {
    setOverlay(
      '<p class="sub">Facility clear</p>' +
        '<div class="rating">' +
        ratingLabel(result.rating) +
        "</div>" +
        "<p>" +
        result.levelName +
        " — time <b>" +
        result.timeText +
        "</b> (par " +
        result.parText +
        ") · shards " +
        result.shardsGot +
        "/" +
        result.shardsTotal +
        " · score <b>+" +
        result.score +
        "</b></p>" +
        "<p>" +
        (result.rating === "GHOST"
          ? "Nobody saw a thing. A perfect ghost run."
          : result.rating === "SHADOW"
          ? "Someone felt watched — but no alarm ever sounded."
          : "The alarm went up. You still got out. Loudly.") +
        "</p>" +
        '<div class="menu">' +
        (result.hasNext
          ? '<button class="primary" data-act="next">Next facility →</button>'
          : '<button class="primary" data-act="campaign">See campaign result</button>') +
        '<button data-act="replay">Replay</button>' +
        '<button data-act="quit">Quit to title</button>' +
        "</div>"
    );
    wireButtons(callbacks);
  }

  function showCampaignWin(totalScore, ratings, callbacks) {
    var rows = "";
    for (var i = 1; i <= 8; i++) {
      rows += "<p>Facility " + (i < 10 ? "0" + i : i) + " — <b>" + (ratings[i] || "—") + "</b></p>";
    }
    setOverlay(
      '<p class="sub">Campaign complete</p>' +
        "<h2>THE LINE IS YOURS</h2>" +
        '<p class="big">Total score: ' +
        totalScore +
        "</p>" +
        rows +
        "<p>Wren walks out of the last facility as the sun comes up. Eight exits, eight escapes — and the Combine never knew she was there.</p>" +
        '<div class="menu">' +
        '<button class="primary" data-act="replay-all">Play again</button>' +
        '<button data-act="quit">Title</button>' +
        "</div>"
    );
    wireButtons(callbacks);
  }

  function wireButtons(callbacks) {
    var buttons = overlay.querySelectorAll("button[data-act]");
    buttons.forEach(function (b) {
      b.addEventListener("click", function () {
        var act = b.getAttribute("data-act");
        if (act === "level" && b.classList.contains("locked")) return;
        var fn = callbacks[act];
        if (fn) fn(b.getAttribute("data-level"));
      });
    });
  }

  window.GhostUI = {
    loadSave: loadSave,
    storeSave: storeSave,
    freshSave: freshSave,
    showToast: showToast,
    setObjective: setObjective,
    setClock: setClock,
    hideOverlay: hideOverlay,
    showTitle: showTitle,
    showLevels: showLevels,
    showHow: showHow,
    showPaused: showPaused,
    showCaught: showCaught,
    showLevelComplete: showLevelComplete,
    showCampaignWin: showCampaignWin,
    el: el,
  };
})();
