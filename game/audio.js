// GHOSTLINE — synthesized sound. No audio files: every effect is built
// from WebAudio oscillators and noise buffers at run time.
(function () {
  "use strict";

  var ctx = null;
  var master = null;
  var muted = false;
  var ambientNodes = null;

  function ensureContext() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    return ctx;
  }

  function unlock() {
    var c = ensureContext();
    if (c && c.state === "suspended") c.resume();
  }

  function tone(freq, dur, type, vol, slideTo, delay) {
    if (muted) return;
    var c = ensureContext();
    if (!c) return;
    var t0 = c.currentTime + (delay || 0);
    var o = c.createOscillator();
    var g = c.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  function noiseBurst(dur, vol, filterFreq, delay) {
    if (muted) return;
    var c = ensureContext();
    if (!c) return;
    var t0 = c.currentTime + (delay || 0);
    var len = Math.max(1, Math.floor(c.sampleRate * dur));
    var buf = c.createBuffer(1, len, c.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = c.createBufferSource();
    src.buffer = buf;
    var f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = filterFreq || 1200;
    var g = c.createGain();
    g.gain.value = vol || 0.25;
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t0);
  }

  // Footstep: soft thud, pitch varies with surface and sneak state.
  function footstep(sneaking, onShadow) {
    var base = onShadow ? 140 : 180;
    noiseBurst(0.07, sneaking ? 0.05 : 0.12, sneaking ? 500 : 900);
    tone(base, 0.06, "sine", sneaking ? 0.03 : 0.08, base * 0.6);
  }

  function pickup() {
    tone(660, 0.09, "triangle", 0.22);
    tone(990, 0.12, "triangle", 0.2, null, 0.07);
  }

  function shardPickup() {
    tone(880, 0.08, "sine", 0.2);
    tone(1174, 0.1, "sine", 0.2, null, 0.06);
    tone(1568, 0.14, "sine", 0.18, null, 0.12);
  }

  function keycardPickup() {
    tone(520, 0.1, "square", 0.12);
    tone(780, 0.16, "square", 0.12, null, 0.09);
  }

  function doorOpen() {
    noiseBurst(0.25, 0.15, 700);
    tone(180, 0.25, "sawtooth", 0.06, 90);
  }

  function hackStart() {
    tone(440, 0.08, "square", 0.1);
    tone(554, 0.08, "square", 0.1, null, 0.09);
    tone(659, 0.08, "square", 0.1, null, 0.18);
  }

  function hackDone() {
    tone(523, 0.1, "triangle", 0.2);
    tone(784, 0.18, "triangle", 0.2, null, 0.1);
  }

  function throwSound() {
    noiseBurst(0.12, 0.18, 2400);
    tone(300, 0.15, "sine", 0.1, 520);
  }

  function noisemakerPing() {
    tone(1200, 0.3, "sine", 0.22, 900);
    tone(1200, 0.3, "sine", 0.18, 900, 0.35);
  }

  function smokeSound() {
    noiseBurst(0.5, 0.2, 500);
  }

  function veilSound() {
    tone(220, 0.4, "sine", 0.14, 880);
    tone(330, 0.4, "sine", 0.1, 1320, 0.05);
  }

  // Rising two-note sting when a guard spots you.
  function alertSting() {
    tone(196, 0.16, "sawtooth", 0.16);
    tone(185, 0.16, "sawtooth", 0.16, null, 0.14);
    tone(311, 0.32, "sawtooth", 0.2, null, 0.28);
    noiseBurst(0.2, 0.1, 3000, 0.28);
  }

  function suspiciousBlip() {
    tone(440, 0.1, "square", 0.09, 520);
  }

  function caughtSound() {
    tone(110, 0.5, "sawtooth", 0.22, 55);
    tone(165, 0.5, "sawtooth", 0.16, 82, 0.1);
    noiseBurst(0.4, 0.2, 800, 0.05);
  }

  function winJingle() {
    var notes = [523, 659, 784, 1046, 784, 1046];
    notes.forEach(function (n, i) {
      tone(n, 0.22, "triangle", 0.2, null, i * 0.13);
    });
  }

  function levelClear() {
    tone(392, 0.14, "triangle", 0.2);
    tone(523, 0.14, "triangle", 0.2, null, 0.12);
    tone(659, 0.26, "triangle", 0.22, null, 0.24);
  }

  function cameraSpotted() {
    tone(880, 0.09, "square", 0.12);
    tone(880, 0.09, "square", 0.12, null, 0.13);
  }

  // Quiet ambient drone + slow pulse, started on first user gesture.
  function startAmbient() {
    var c = ensureContext();
    if (!c || ambientNodes) return;
    var o1 = c.createOscillator();
    var o2 = c.createOscillator();
    var g = c.createGain();
    var lfo = c.createOscillator();
    var lfoGain = c.createGain();
    o1.type = "sine";
    o2.type = "sine";
    o1.frequency.value = 55;
    o2.frequency.value = 55.7;
    g.gain.value = 0.035;
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 0.018;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);
    o1.connect(g);
    o2.connect(g);
    g.connect(master);
    o1.start();
    o2.start();
    lfo.start();
    ambientNodes = { o1: o1, o2: o2, lfo: lfo, g: g };
  }

  function setMuted(m) {
    muted = !!m;
    if (master) master.gain.value = muted ? 0 : 0.5;
  }

  function isMuted() {
    return muted;
  }

  window.GhostAudio = {
    unlock: unlock,
    startAmbient: startAmbient,
    footstep: footstep,
    pickup: pickup,
    shardPickup: shardPickup,
    keycardPickup: keycardPickup,
    doorOpen: doorOpen,
    hackStart: hackStart,
    hackDone: hackDone,
    throwSound: throwSound,
    noisemakerPing: noisemakerPing,
    smokeSound: smokeSound,
    veilSound: veilSound,
    alertSting: alertSting,
    suspiciousBlip: suspiciousBlip,
    caughtSound: caughtSound,
    winJingle: winJingle,
    levelClear: levelClear,
    cameraSpotted: cameraSpotted,
    setMuted: setMuted,
    isMuted: isMuted,
  };
})();
