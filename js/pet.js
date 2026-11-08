// The Forja pet: an orb with a face. The look, moves and timings come from
// the pet spec (a claude.ai page, 2026-11-07); the mood rules were changed
// with the user the same day:
//   - mood follows the time of day, never rest days (rest days are good):
//     Neutral, Worried from 8 PM, Sad from 10 PM while there's no workout
//     yet; inside the closed ring it's Happy and spins in place
//   - it sleeps 11 PM to 7 AM (drowsy from 10:30); a set wakes it, and it
//     dozes off again 10 minutes after
//   - each person can name it and pick its colors (Account > Your Pet),
//     all free; saved in their data like everything else (data.pet)
//
// ForjaPet.html(mood, place) gives an <svg> to drop into the page; every
// one that lands in the page comes alive by itself, and one shared loop
// animates them all (paused while the app is in the background).
const ForjaPet = (function () {
  const BODIES = [["Ember", "#D85A30"], ["Amber", "#EF9F27"], ["Blue", "#378ADD"], ["Teal", "#1D9E75"], ["Charcoal", "#2C2C2A"], ["Gold", "#BA7517"], ["Pink", "#D4537E"], ["Violet", "#7F77DD"], ["Moss", "#639922"], ["Steel", "#888780"]];
  const EYES = [["Auto", null], ["Ink", "#2C2C2A"], ["Cream", "#F1EFE8"], ["Amber", "#FAC775"], ["Sky", "#85B7EB"]];
  const SHAPES = ["Pill", "Shiny pill", "Bean", "Glint", "Content", "Chill"];
  const DEFAULT = { name: "", body: "#D85A30", eye: null, shape: "Pill" };
  const NAME_MAX = 16;

  const WORRIED_FROM = 20 * 60; // minutes after midnight
  const SAD_FROM = 22 * 60;
  const DROWSY_FROM = 22 * 60 + 30;
  const BEDTIME = 23 * 60;
  const WAKE_UP = 7 * 60;
  const AWAKE_AFTER_SET_MS = 10 * 60 * 1000;

  // ---------- the person's pet ----------
  // Only the swatches on offer are ever used, so nothing typed into saved
  // data can reach the drawing.
  function config() {
    const saved = (typeof data !== "undefined" && data && data.pet) || {};
    return {
      name: typeof saved.name === "string" ? saved.name.slice(0, NAME_MAX) : "",
      body: BODIES.some((b) => b[1] === saved.body) ? saved.body : DEFAULT.body,
      eye: EYES.some((e) => e[1] && e[1] === saved.eye) ? saved.eye : null,
      shape: SHAPES.includes(saved.shape) ? saved.shape : DEFAULT.shape,
    };
  }

  function save(change) {
    if (typeof data === "undefined" || !data) return;
    data.pet = { ...config(), ...change };
    data.pet = config(); // cleaned
    saveData(data);
    live.forEach((pet) => pet.paint());
  }

  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return ((n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255;
  };
  const lighten = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    const f = (c) => Math.round(c + (255 - c) * a).toString(16).padStart(2, "0");
    return "#" + f(n >> 16) + f((n >> 8) & 255) + f(n & 255);
  };
  // Auto eyes: dark on light bodies, cream on dark ones.
  const eyeColor = (c) => c.eye || (lum(c.body) < 0.35 ? "#F1EFE8" : "#2C2C2A");
  const shineColor = (c) => lighten(c.body, lum(c.body) < 0.25 ? 0.3 : 0.4);

  function eyesSVG(shape, color) {
    const glint = lum(color) > 0.7 ? "#2C2C2A" : "#FFFFFF";
    if (shape === "Shiny pill") return eyesSVG("Pill", color) + `<circle cx="85.5" cy="97.5" r="2.4" fill="${glint}"/><circle cx="118.5" cy="97.5" r="2.4" fill="${glint}"/>`;
    if (shape === "Bean") return `<rect x="77" y="94" width="13" height="20" rx="6.5" fill="${color}" transform="rotate(-10 83.5 104)"/><rect x="110" y="94" width="13" height="20" rx="6.5" fill="${color}" transform="rotate(10 116.5 104)"/>`;
    if (shape === "Glint") return `<circle cx="83.5" cy="104" r="8.5" fill="${color}"/><circle cx="116.5" cy="104" r="8.5" fill="${color}"/><circle cx="86.5" cy="100.5" r="2.8" fill="${glint}"/><circle cx="119.5" cy="100.5" r="2.8" fill="${glint}"/><circle cx="81" cy="107.5" r="1.3" fill="${glint}"/><circle cx="114" cy="107.5" r="1.3" fill="${glint}"/>`;
    if (shape === "Content") return `<path d="M74.5 109 A9 9 0 0 1 92.5 109 Z" fill="${color}"/><path d="M107.5 109 A9 9 0 0 1 125.5 109 Z" fill="${color}"/>`;
    if (shape === "Chill") return `<path d="M74.5 99 A9 9 0 0 0 92.5 99 Z" fill="${color}"/><path d="M107.5 99 A9 9 0 0 0 125.5 99 Z" fill="${color}"/>`;
    return `<rect x="78" y="92" width="11" height="24" rx="5.5" fill="${color}"/><rect x="111" y="92" width="11" height="24" rx="5.5" fill="${color}"/>`;
  }
  const happySVG = (c) => `<g stroke="${c}" stroke-width="5" fill="none" stroke-linecap="round"><path d="M76 108 Q83.5 96 91 108"/><path d="M109 108 Q116.5 96 124 108"/></g>`;
  const sleepSVG = (c) => `<g stroke="${c}" stroke-width="5" stroke-linecap="round"><path d="M77 108 H90"/><path d="M110 108 H123"/></g>`;

  // ---------- time of day ----------
  let lastSetAt = 0;
  const minutesNow = () => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  };
  function sleepNow() {
    if (Date.now() - lastSetAt < AWAKE_AFTER_SET_MS) return "awake";
    const m = minutesNow();
    if (m >= BEDTIME || m < WAKE_UP) return "asleep";
    return m >= DROWSY_FROM ? "drowsy" : "awake";
  }
  function moodNow() {
    if (Date.now() - lastSetAt < AWAKE_AFTER_SET_MS) return "idle"; // on it
    const m = minutesNow();
    if (m < WAKE_UP) return "sad"; // still the evening before, to it
    return m >= SAD_FROM ? "sad" : m >= WORRIED_FROM ? "worried" : "idle";
  }

  // ---------- one pet on the page ----------
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  function interp(keys, p) {
    for (let i = 1; i < keys.length; i++) {
      if (p <= keys[i][0]) {
        const a = keys[i - 1], b = keys[i], u = smooth((p - a[0]) / (b[0] - a[0]));
        return a.map((v, j) => v + (b[j] - v) * u);
      }
    }
    return keys[keys.length - 1];
  }
  // [progress, y, scaleX, scaleY, turn]: crouch, spinning leap, squash landing.
  const CHEER = [[0, 0, 1, 1, 0], [0.14, 0, 1.18, 0.82, 0], [0.26, -30, 0.9, 1.12, 100], [0.38, -48, 1, 1, 260], [0.5, -18, 0.94, 1.06, 360], [0.57, 0, 1.2, 0.8, 360], [0.69, 0, 0.95, 1.05, 360], [0.82, 0, 1.03, 0.97, 360], [1, 0, 1, 1, 360]];
  const SIGH = [[0, 1, 0], [0.45, 1.06, -2], [0.75, 0.92, 4], [1, 1, 0]];
  const YAWN = [[0, 1, 0, 0], [0.25, 1.08, 5, 0.85], [0.55, 1.1, 9, 1], [0.8, 0.95, 3, 0.7], [1, 1, 0, 0]];

  // Where it sits sets how much room it gets: "ring" fits inside Today's
  // closed ring (no shadow, spins); everywhere else leaves room for hops.
  const VIEWBOX = { ring: "30 35 140 140", any: "30 30 140 160" };
  const live = new Set();
  let petCount = 0;

  class Pet {
    constructor(svg) {
      const mood = svg.dataset.mood || "idle";
      this.svg = svg;
      this.place = svg.dataset.place || "";
      this.auto = mood === "auto"; // Today: follows the clock
      this.inRing = this.place === "ring";
      this.mood = this.auto ? moodNow() : mood;
      // data-awake (the landing page): never sleeps, whatever the hour.
      this.clock = (this.auto || this.inRing) && !svg.hasAttribute("data-awake");
      this.sleep = this.clock ? sleepNow() : "awake";
      if (this.sleep === "drowsy") this.heavy = 0.45;
      this.phase = Math.random() * 6;
      svg.dataset.live = "1";
      const clip = "forja-pet-lids-" + ++petCount;
      if (!svg.getAttribute("viewBox")) svg.setAttribute("viewBox", VIEWBOX[this.inRing ? "ring" : "any"]);
      svg.innerHTML = `<defs><clipPath id="${clip}"><rect x="60" y="80" width="80" height="45"/></clipPath></defs>${this.inRing ? "" : '<ellipse class="pet-shadow" cx="100" cy="181" rx="38" ry="5"/>'}<g class="pet-bob"><g class="pet-orb"><circle class="pet-body" cx="100" cy="105" r="60"/><path class="pet-shine" d="M66 82 A42 42 0 0 1 92 60" stroke-width="6" stroke-linecap="round" fill="none"/><g class="pet-look"><g class="pet-eyes"></g><g clip-path="url(#${clip})"><g class="pet-lids"><polygon points="72,80 95,80 95,95 72,104"/><polygon points="105,80 128,80 128,104 105,95"/></g></g><g class="pet-happy"></g><g class="pet-asleep"></g><ellipse class="pet-mouth" cx="100" cy="131" rx="6" ry="0"/></g></g></g><g class="pet-sparks"></g>`;
      const q = (s) => svg.querySelector(s);
      this.el = { shadow: q(".pet-shadow"), bob: q(".pet-bob"), orb: q(".pet-orb"), body: q(".pet-body"), shine: q(".pet-shine"), look: q(".pet-look"), eyes: q(".pet-eyes"), lids: q(".pet-lids"), happy: q(".pet-happy"), asleep: q(".pet-asleep"), mouth: q(".pet-mouth"), sparks: q(".pet-sparks") };
      const now = performance.now();
      this.look = { x: 0, y: 0 };
      this.nextBlink = now + 800 + Math.random() * 3000;
      this.blinkAt = this.blink2 = this.cheerAt = this.sighAt = this.wiggleAt = this.glanceAt = this.yawnAt = this.fallAt = -1;
      this.glanceX = 0;
      this.happyUntil = 0;
      this.nextHabit = now + 3000 + Math.random() * 4000;
      this.nextCheck = now + 2000;
      this.heavy = this.heavy || 0;
      this.slant = this.mood === "sad" ? 1.1 : this.mood === "worried" ? 0.78 : 0;
      this.visible = true;
      svg.addEventListener("pointerdown", () => this.tap());
      this.paint();
      if (svg.dataset.cheer) setTimeout(() => this.cheer(), 250);
      live.add(this);
      kick();
    }

    paint() {
      const c = config();
      const eye = eyeColor(c);
      this.el.body.setAttribute("fill", c.body);
      this.el.shine.setAttribute("stroke", shineColor(c));
      this.el.eyes.innerHTML = eyesSVG(this.svg.dataset.shape || c.shape, eye);
      this.el.happy.innerHTML = happySVG(eye);
      this.el.asleep.innerHTML = sleepSVG(eye);
      this.el.lids.setAttribute("fill", c.body);
      this.el.mouth.setAttribute("fill", eye);
    }

    later(ms, fn) {
      const at = this.sleep;
      setTimeout(() => {
        if (this.sleep === at) fn();
      }, ms);
    }

    tap() {
      const orb = this.el.orb;
      orb.classList.remove("squish");
      void orb.getBoundingClientRect();
      orb.classList.add("squish");
      if (this.sleep === "asleep" || this.sleep === "falling") {
        // Groggy for about 30 seconds, then back to sleep if it's still night.
        this.sleep = "groggy";
        setTimeout(() => (this.yawnAt = performance.now()), 900);
        this.later(30000, () => (sleepNow() === "asleep" ? this.fallAsleep() : (this.sleep = "awake")));
      } else if (this.sleep === "awake" && this.mood !== "sad" && this.mood !== "worried") {
        this.happyUntil = performance.now() + 900;
      }
    }

    fallAsleep() {
      this.sleep = "falling";
      this.fallAt = performance.now();
      this.later(2500, () => (this.sleep = "asleep"));
    }

    // The clock moved on: drowsy, asleep, morning, or a new mood.
    check() {
      if (this.auto) this.mood = moodNow();
      if (!this.clock) return;
      const want = sleepNow();
      if (want === this.sleep || this.sleep === "groggy" || this.sleep === "falling") return;
      if (want === "asleep") this.fallAsleep();
      else if (want === "drowsy") {
        this.sleep = "drowsy";
        this.yawnAt = performance.now();
      } else {
        this.sleep = "awake"; // morning, or a set just woke it
        this.yawnAt = performance.now();
      }
    }

    // Crouch, spinning leap with sparks, squash landing, then Happy.
    // Reduce Motion: no leap, squash or sparks - just the happy face.
    cheer() {
      const now = performance.now();
      this.sleep = "awake";
      this.happyUntil = now + 1600;
      this.wiggleAt = this.sighAt = -1;
      if (reduced()) {
        if (!this.auto) this.mood = "happy";
        return;
      }
      this.cheerAt = now;
      setTimeout(() => this.sparks(), 420);
    }

    sparks() {
      const colors = ["#FAC775", "#EF9F27", "#F0997B"];
      for (let i = 0; i < 12; i++) {
        const spark = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        spark.setAttribute("cx", 100);
        spark.setAttribute("cy", 57);
        spark.setAttribute("r", 2 + Math.random() * 2.5);
        spark.setAttribute("fill", colors[i % 3]);
        spark.setAttribute("class", "pet-spark");
        this.el.sparks.appendChild(spark);
        const angle = (i / 12) * Math.PI * 2 + Math.random() * 0.4;
        const distance = 55 + Math.random() * 30;
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            spark.style.transform = `translate(${Math.cos(angle) * distance}px,${Math.sin(angle) * distance}px)`;
            spark.style.opacity = 0;
          })
        );
        setTimeout(() => spark.remove(), 760);
      }
    }

    // Small things it does now and then, by mood.
    habit(now) {
      if (this.inRing || this.cheerAt > 0 || this.yawnAt > 0) return;
      if (this.sleep === "asleep") return void (this.sighAt = now);
      if (this.sleep !== "awake") return;
      const r = Math.random();
      if (this.mood === "sad") this.sighAt = now;
      else if (this.mood === "happy") this.wiggleAt = now;
      else if (this.mood === "worried" && r < 0.6) {
        this.glanceAt = now;
        this.glanceX = (Math.random() < 0.5 ? -1 : 1) * 10;
      } else if (this.mood !== "worried" && r < 0.4) {
        this.glanceAt = now;
        this.glanceX = (Math.random() < 0.5 ? -1 : 1) * 11;
      } else if (this.mood !== "worried" && r < 0.7) this.wiggleAt = now;
      else {
        this.blinkAt = now;
        this.blink2 = now + 280;
      }
    }

    frame(now) {
      if (now > this.nextCheck) {
        this.nextCheck = now + 2000;
        this.check();
      }
      const S = this.sleep, m = this.mood, awake = S === "awake", t = now / 1000 + this.phase, k = reduced() ? 0 : 1;
      let y, sx = 1, sy = 1, turn = 0, faceY = 0, breathe, eyeMul = 1, mouth = 0;
      if (S === "asleep") { y = Math.sin(t) * 2 * k + 5; breathe = 1 + Math.sin(t) * 0.025 * k; }
      else if (!awake) { y = Math.sin(t * 1.2) * 3 * k + 3; breathe = 1 + Math.sin(t * 1.2) * 0.02 * k; }
      else if (m === "happy") { const h = Math.abs(Math.sin(t * 4)); y = -h * 10 * k; const g = Math.pow(1 - h, 6) * k; sx *= 1 + g * 0.08; sy *= 1 - g * 0.08; breathe = 1; }
      else if (m === "sad") { y = Math.sin(t * 1.2) * 2 * k + 8; breathe = 1 + Math.sin(t * 1.2) * 0.01 * k; }
      else if (m === "worried") { y = Math.sin(t * 1.6) * 3.5 * k + 4; breathe = 1 + Math.sin(t * 1.6) * 0.012 * k; }
      else { y = Math.sin(t * 2) * 5 * k; breathe = 1 + Math.sin(t * 2) * 0.015 * k; }
      sx *= 2 - breathe;
      sy *= breathe;
      // In the ring it stays put and spins: one eased full turn (1.2 s)
      // every 3.5 s. Asleep, it just breathes there.
      if (this.inRing) {
        y = 0;
        if (awake) {
          sx = sy = 1;
          const p = (t % 3.5) / 1.2;
          turn = p < 1 ? (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2) * 360 * k : 0;
        }
      }
      if (now > this.nextHabit) {
        this.habit(now);
        this.nextHabit = now + 3500 + Math.random() * 4000;
      }
      if (this.sighAt > 0) {
        const p = (now - this.sighAt) / (S === "asleep" ? 2400 : 1600);
        if (p < 1) { const v = interp(SIGH, p); sy *= 1 + (v[1] - 1) * k; sx *= 1 - (v[1] - 1) * k; faceY += v[2] * k; }
        else this.sighAt = -1;
      }
      if (this.wiggleAt > 0) {
        const p = (now - this.wiggleAt) / 700;
        if (p < 1) turn += Math.sin(p * Math.PI * 4) * 8 * (1 - p) * k;
        else this.wiggleAt = -1;
      }
      if (this.yawnAt > 0) {
        const p = (now - this.yawnAt) / 1500;
        if (p < 1) { const v = interp(YAWN, p); sy *= 1 + (v[1] - 1) * k; sx *= 1 - (v[1] - 1) * k; mouth = v[2]; eyeMul *= 1 - 0.85 * v[3]; faceY -= v[3] * 2 * k; }
        else this.yawnAt = -1;
      }
      if (S === "falling") {
        const p = (now - this.fallAt) / 2500;
        const nod = (Math.exp(-(((p - 0.25) / 0.08) ** 2)) + Math.exp(-(((p - 0.65) / 0.08) ** 2))) * k;
        faceY += 6 * nod;
        y += 3 * nod;
      }
      if (this.cheerAt > 0) {
        const p = (now - this.cheerAt) / 1100;
        if (p < 1) { const v = interp(CHEER, p); y = y * (1 - smooth(p * 4)) + v[1] * k; sx *= v[2]; sy *= v[3]; turn += (v[4] % 360) * k; }
        else {
          this.cheerAt = -1;
          if (!this.auto) this.mood = "happy";
        }
      }
      if (!this.visible) return;
      this.el.bob.setAttribute("transform", `translate(0 ${y.toFixed(2)}) rotate(${turn.toFixed(2)} 100 105) translate(100 165) scale(${sx.toFixed(3)} ${sy.toFixed(3)}) translate(-100 -165)`);
      if (this.el.shadow) {
        const lift = Math.max(0, -y);
        this.el.shadow.setAttribute("rx", Math.max(16, 38 - lift * 0.45 + (y > 0 ? y * 0.6 : 0)).toFixed(1));
        this.el.shadow.style.opacity = Math.max(0.35, 1 - lift / 70);
      }
      let heavyTarget = 0;
      if (S === "drowsy") heavyTarget = 0.45;
      else if (S === "groggy") heavyTarget = 0.5;
      else if (S === "falling") heavyTarget = 0.45 + 0.55 * smooth((now - this.fallAt) / 2300);
      this.heavy += (heavyTarget - this.heavy) * 0.08;
      const happy = awake && (m === "happy" || now < this.happyUntil);
      const slantTarget = awake && !happy ? (m === "sad" ? 1.1 : m === "worried" ? 0.78 : 0) : 0;
      this.slant += (slantTarget - this.slant) * 0.08;
      if (now > this.nextBlink && S !== "asleep" && S !== "falling") {
        this.blinkAt = now;
        this.nextBlink = now + 2400 + Math.random() * 3200;
      }
      if (this.blink2 > 0 && now > this.blink2) {
        this.blinkAt = now;
        this.blink2 = -1;
      }
      let open = 1;
      if (this.blinkAt > 0) {
        const p = (now - this.blinkAt) / (!awake || m === "sad" ? 260 : 160);
        if (p < 1) open = Math.abs(1 - 2 * p) * 0.92 + 0.08;
        else this.blinkAt = -1;
      }
      let lookX = 0, lookY = awake ? (m === "sad" ? 6 : m === "worried" ? 3 : 0) : 5;
      if (this.glanceAt > 0) {
        const p = (now - this.glanceAt) / 1400;
        if (p < 1) lookX = this.glanceX * (p < 0.15 ? smooth(p / 0.15) : p > 0.8 ? 1 - smooth((p - 0.8) / 0.2) : 1);
        else this.glanceAt = -1;
      }
      this.look.x += (lookX - this.look.x) * 0.12;
      this.look.y += (lookY - this.look.y) * 0.12;
      this.el.look.setAttribute("transform", `translate(${this.look.x.toFixed(2)} ${(this.look.y + faceY).toFixed(2)})`);
      const eyes = Math.max(0.05, open * eyeMul * (1 - this.heavy * 0.82));
      this.el.eyes.setAttribute("transform", `translate(0 112) scale(1 ${eyes.toFixed(3)}) translate(0 -112)`);
      this.el.lids.setAttribute("transform", `translate(0 ${(-24 * (1 - this.slant)).toFixed(2)})`);
      this.el.mouth.setAttribute("ry", mouth.toFixed(2));
      this.el.mouth.style.display = mouth > 0.3 ? "" : "none";
      const asleep = S === "asleep";
      this.el.eyes.style.display = asleep || happy ? "none" : "";
      this.el.happy.style.display = happy ? "" : "none";
      this.el.asleep.style.display = asleep ? "" : "none";
      this.el.lids.style.display = this.slant > 0.02 && !asleep && !happy ? "" : "none";
    }
  }

  // ---------- the shared loop ----------
  let raf = 0;
  let nextSeen = 0;
  function tick(now) {
    raf = 0;
    // Which pets are on screen (read before any drawing, twice a second).
    const look = now > nextSeen;
    if (look) nextSeen = now + 500;
    live.forEach((pet) => {
      if (!pet.svg.isConnected) return live.delete(pet);
      if (look) pet.visible = pet.svg.getClientRects().length > 0;
    });
    live.forEach((pet) => pet.frame(now));
    kick();
  }
  function kick() {
    if (!raf && live.size && !document.hidden) raf = requestAnimationFrame(tick);
  }
  document.addEventListener("visibilitychange", kick);

  function mount(root) {
    if (root.matches && root.matches("svg.forja-pet:not([data-live])")) new Pet(root);
    else if (root.querySelectorAll) root.querySelectorAll("svg.forja-pet:not([data-live])").forEach((svg) => new Pet(svg));
  }
  new MutationObserver((changes) => changes.forEach((c) => c.addedNodes.forEach((node) => node.nodeType === 1 && mount(node)))).observe(document.documentElement, { childList: true, subtree: true });

  // mood: idle | happy | worried | sad | auto (Today's clock)
  // place: "ring" for inside Today's closed ring; cheer: jump in on arrival;
  // awake: never sleeps (the landing page, seen at any hour).
  function html(mood, place, cheer, awake) {
    const ring = place === "ring";
    return `<svg class="${ring ? "pet-face" : "ob-mascot"} forja-pet" viewBox="${VIEWBOX[ring ? "ring" : "any"]}" data-mood="${mood}" data-place="${place || ""}"${cheer ? ' data-cheer="1"' : ""}${awake ? " data-awake" : ""} aria-hidden="true"></svg>`;
  }

  // A set was saved: any pet that's asleep wakes for it (and dozes off 10
  // minutes after).
  function setSaved() {
    lastSetAt = Date.now();
    live.forEach((pet) => pet.check());
  }

  // ---------- the flex: sunglasses + double-bicep (streak moments) ----------
  // Its own drawing, since only these moments give it arms and props.
  const ARM = '<line class="fx-limb" x1="0" y1="0" x2="22" y2="0" stroke-width="11" stroke-linecap="round"/><ellipse class="fx-fill fx-bicep" cx="11" cy="-3" rx="9" ry="4"/><g class="fx-fore"><line class="fx-limb" x1="0" y1="0" x2="19" y2="0" stroke-width="10" stroke-linecap="round"/><circle class="fx-fill" cx="20" cy="0" r="7.5"/></g><g class="fx-pump" stroke="#EF9F27" stroke-width="2.5" stroke-linecap="round" opacity="0"><path d="M4 -16 L1 -22"/><path d="M12 -18 L12 -25"/><path d="M20 -16 L23 -22"/></g>';
  const LENS_L = "M71 94 H97 V101 C97 107 93 111 86 111 H82 C75 111 71 107 71 101 Z";
  const LENS_R = "M103 94 H129 V101 C129 107 125 111 118 111 H114 C107 111 103 107 103 101 Z";
  let flexCount = 0;
  function flexSVG(cls) {
    const c = config();
    const id = "forja-flex-" + ++flexCount;
    const glass = lum(c.body) < 0.25 ? "#5F5E5A" : "none";
    return `<svg xmlns="http://www.w3.org/2000/svg" class="${cls || "flex-pet"}" viewBox="5 -27 190 215" aria-hidden="true">
      <defs><clipPath id="${id}-lids"><rect x="60" y="80" width="80" height="45"/></clipPath><clipPath id="${id}-lens"><path d="${LENS_L}"/><path d="${LENS_R}"/></clipPath></defs>
      <ellipse class="fx-shadow" cx="100" cy="181" rx="38" ry="5" fill="#000" opacity=".18"/>
      <g class="fx-mover">
        <g class="fx-arm" data-base="translate(156 117)">${ARM}</g><g class="fx-arm" data-base="translate(44 117) scale(-1 1)">${ARM}</g>
        <circle class="fx-fill" cx="100" cy="105" r="60"/>
        <path d="M66 82 A42 42 0 0 1 92 60" stroke="${shineColor(c)}" stroke-width="6" stroke-linecap="round" fill="none"/>
        <g class="fx-eyes">${eyesSVG(c.shape, eyeColor(c))}</g>
        <g clip-path="url(#${id}-lids)"><g class="fx-fill fx-lids"><polygon points="72,80 95,80 95,103 72,93"/><polygon points="105,80 128,80 128,93 105,103"/></g></g>
        <g class="fx-glasses">
          <path d="M71 97 L63 94" stroke="#2C2C2A" stroke-width="3" stroke-linecap="round"/><path d="M129 97 L137 94" stroke="#2C2C2A" stroke-width="3" stroke-linecap="round"/>
          <path d="M97 97 Q100 94.5 103 97" stroke="#2C2C2A" stroke-width="3" fill="none" stroke-linecap="round"/>
          <path d="${LENS_L}" fill="#2C2C2A" stroke="${glass}" stroke-width="1.5"/><path d="${LENS_R}" fill="#2C2C2A" stroke="${glass}" stroke-width="1.5"/>
          <g clip-path="url(#${id}-lens)"><rect class="fx-glint" x="0" y="83" width="7" height="40" fill="#FFFFFF" opacity=".55"/></g>
        </g>
      </g>
    </svg>`.replace(/class="fx-fill([^"]*)"/g, `class="fx-fill$1" fill="${c.body}"`).replace(/class="fx-limb"/g, `class="fx-limb" stroke="${c.body}"`);
  }

  // [ms, ...values] keyframes: hop (y, sx, sy), shades (y, turn), arms (scale, forearm).
  const keyAt = (keys, ms) => {
    if (ms <= keys[0][0]) return keys[0].slice(1);
    for (let i = 1; i < keys.length; i++) {
      if (ms <= keys[i][0]) {
        const a = keys[i - 1], b = keys[i], u = smooth((ms - a[0]) / (b[0] - a[0]));
        return a.slice(1).map((v, j) => v + (b[j + 1] - v) * u);
      }
    }
    return keys[keys.length - 1].slice(1);
  };
  const HOP = [[0, 0, 1, 1], [300, 6, 1.14, 0.86], [480, -14, 0.9, 1.12], [700, -32, 1, 1], [900, 0, 1.06, 0.94], [980, 0, 1.18, 0.82], [1120, 0, 0.97, 1.03], [1260, 0, 1, 1], [1450, -2, 0.98, 1.03]];
  const SHADES = [[780, -150, -12], [1040, 4, 4], [1150, 0, 0]];
  const ARMS = [[1150, 0, 0], [1280, 1.1, -20], [1350, 1, -60], [1450, 1, -118], [1560, 1, -96]];
  const FINAL = 2600; // shades on, arms up, between pumps

  function pumpAt(ms) {
    const hits = [1600, 1950];
    if (ms > 2700) {
      const n = Math.floor((ms - 2700) / 1700);
      hits.push(2700 + n * 1700, 2700 + n * 1700 + 350);
    }
    let v = 0;
    for (const h of hits) {
      const p = (ms - h) / 260;
      if (p >= 0 && p < 1) v = Math.max(v, Math.sin(p * Math.PI));
    }
    return v;
  }

  function drawFlex(svg, ms, still) {
    const q = (s) => svg.querySelector(s);
    let [y, sx, sy] = keyAt(HOP, ms);
    if (ms > 1450 && !still) y += Math.sin((ms - 1450) / 455) * 3;
    const pump = still ? 0 : pumpAt(ms);
    sy *= 1 + pump * 0.025;
    sx *= 1 - pump * 0.01;
    q(".fx-mover").setAttribute("transform", `translate(0 ${y.toFixed(2)}) translate(100 165) scale(${sx.toFixed(3)} ${sy.toFixed(3)}) translate(-100 -165)`);
    const lift = Math.max(0, -y);
    q(".fx-shadow").setAttribute("rx", Math.max(18, 38 - lift * 0.45 + (y > 0 ? y * 0.6 : 0)).toFixed(1));
    const lid = ms <= 0 ? 0 : ms < 250 ? smooth(ms / 250) : ms < 700 ? 1 : 0;
    q(".fx-lids").setAttribute("transform", `translate(0 ${(-24 * (1 - lid)).toFixed(2)})`);
    q(".fx-lids").style.display = lid > 0.02 ? "" : "none";
    const glasses = q(".fx-glasses");
    if (ms >= 780) {
      const [gy, gr] = keyAt(SHADES, ms);
      glasses.style.display = "";
      glasses.setAttribute("transform", `translate(0 ${gy.toFixed(2)}) rotate(${gr.toFixed(2)} 100 101) translate(100 102) scale(1.3) translate(-100 -102)`);
    } else glasses.style.display = "none";
    q(".fx-eyes").style.display = ms >= 1040 ? "none" : "";
    const gp = (ms - 1300) / 450;
    q(".fx-glint").setAttribute("transform", `translate(${(gp >= 0 && gp <= 1 ? 60 + gp * 80 : -40).toFixed(1)} 0) rotate(25 0 103)`);
    const [armScale, fore] = keyAt(ARMS, ms);
    const bulge = 4 + pump * 4.5;
    svg.querySelectorAll(".fx-arm").forEach((arm) => {
      arm.setAttribute("transform", `${arm.dataset.base} rotate(-14) scale(${armScale.toFixed(3)})`);
      arm.querySelector(".fx-fore").setAttribute("transform", `translate(22 0) rotate(${(fore - pump * 12).toFixed(2)})`);
      const bicep = arm.querySelector(".fx-bicep");
      bicep.setAttribute("ry", bulge.toFixed(2));
      bicep.setAttribute("cy", (-1 - bulge * 0.55).toFixed(2));
      bicep.setAttribute("rx", (9 + pump * 1.5).toFixed(2));
      const lines = arm.querySelector(".fx-pump");
      lines.setAttribute("opacity", pump.toFixed(2));
      lines.setAttribute("transform", `translate(0 ${(-pump * 3).toFixed(2)})`);
    });
  }

  // Hop, shades drop on, arms pop out, then a bicep pump every 1.7 s for
  // as long as it's on screen. Reduce Motion: the end pose, still.
  function playFlex(svg) {
    if (reduced()) return drawFlex(svg, FINAL, true);
    const start = performance.now();
    const step = (now) => {
      if (!svg.isConnected) return;
      drawFlex(svg, now - start, false);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // The flex as a picture, in this person's colors (share images).
  function flexImage() {
    const holder = document.createElement("div");
    holder.innerHTML = flexSVG("flex-pet");
    const svg = holder.firstElementChild;
    drawFlex(svg, FINAL, true);
    // Trimmed to the pose (no room for the hop) and the old picture's
    // shape, so it fits above the streak number the same way.
    svg.setAttribute("viewBox", "5 22 190 179");
    svg.setAttribute("width", 640);
    svg.setAttribute("height", Math.round((640 * 179) / 190));
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.outerHTML);
    });
  }

  // ---------- Account > Your Pet ----------
  const $ = (id) => document.getElementById(id);
  function renderScreen() {
    const c = config();
    const swatch = (group, value, label, color, text) =>
      `<button type="button" class="pet-swatch" data-group="${group}" data-value="${value}" aria-label="${label}" aria-pressed="${value === (group === "body" ? c.body : c.eye || "auto")}"${color ? ` style="background:${color}"` : ""}>${text || ""}</button>`;
    $("pet-name").value = c.name;
    $("pet-bodies").innerHTML = BODIES.map(([n, hex]) => swatch("body", hex, tr(n), hex)).join("");
    $("pet-eye-colors").innerHTML = EYES.map(([n, hex]) => swatch("eye", hex || "auto", hex ? tr(n) : tr("Auto"), hex, hex ? "" : tr("Auto"))).join("");
    $("pet-shapes").innerHTML = SHAPES.map(
      (s) => `<button type="button" class="pet-shape" data-group="shape" data-value="${s}" aria-label="${tr(s)}" aria-pressed="${s === c.shape}"><svg class="forja-pet" viewBox="38 43 124 124" data-mood="idle" data-place="tile" data-shape="${s}" aria-hidden="true"></svg></button>`
    ).join("");
  }

  function initScreen() {
    if (!$("pet-screen")) return;
    $("open-pet-button").addEventListener("click", () => {
      $("pet-preview").innerHTML = html("idle", "preview");
      renderScreen();
      showScreen("pet-screen");
    });
    $("pet-screen-back-button").addEventListener("click", () => showScreen("account-screen"));
    $("pet-screen").addEventListener("click", (event) => {
      const pick = event.target.closest("[data-group]");
      if (!pick) return;
      const { group, value } = pick.dataset;
      save(group === "body" ? { body: value } : group === "eye" ? { eye: value === "auto" ? null : value } : { shape: value });
      $("pet-screen").querySelectorAll(`[data-group="${group}"]`).forEach((b) => b.setAttribute("aria-pressed", String(b === pick)));
    });
    // Saves as it's typed, like the iPhone's own Settings (once typing
    // pauses, so it's not a save per letter).
    let nameTimer = 0;
    const saveName = () => {
      clearTimeout(nameTimer);
      const name = $("pet-name").value.trim().slice(0, NAME_MAX);
      if (name !== config().name) save({ name });
    };
    $("pet-name").addEventListener("input", () => {
      clearTimeout(nameTimer);
      nameTimer = setTimeout(saveName, 700);
    });
    $("pet-name").addEventListener("change", saveName);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { mount(document); initScreen(); });
  else { mount(document); initScreen(); }

  return { html, config, save, setSaved, moodNow, sleepNow, flexSVG, playFlex, flexImage, NAME_MAX, BODIES, EYES, SHAPES };
})();
