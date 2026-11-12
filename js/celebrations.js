// Celebrations on Today, kept small on purpose:
// - the pet coaches from the top of Today (what's left, what's next);
// - a saved set fills its slice of the ring and counts up, with a "+25"
//   floating off its card;
// - an exercise that reaches its target gets a green check on its tag;
// - a finished day: the pet jumps into the ring, which closes into one full
//   circle with its face inside (and it stays that way for the rest of the day);
// - every 7th day of a streak gets one full-screen celebration, where the
//   pet puts on its shades and flexes (pet.js);
// - on days the plan steps up, the pet's line under the ring says so.
// Each moment waits until Today is actually on screen (e.g. after the
// camera closes). With Reduce Motion nothing moves; the end states still show.

// Loaded after script.js and onboarding.js, and uses their helpers (data,
// todayString, serverPlan, formatDuration, streakCountEl, statusMessageEl,
// ForjaRules, Onboarding.mascot) and pet.js (ForjaPet).
const Celebrations = (function () {
  const $ = (id) => document.getElementById(id);
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, reduced() ? 0 : ms));
  const KEY_OF = { pushup: "pushups", plank: "planks", squat: "squats" };
  const COLOR = { pushups: "var(--ring-pushups)", planks: "var(--ring-planks)", squats: "var(--ring-squats)", walkRun: "var(--ring-walkrun)" };
  const TAGS = { pushups: "pushups-min-tag", planks: "planks-min-tag", squats: "squats-min-tag" };
  const LEVEL_UP_KEY = "forja-level-up-day";
  const MILESTONE_KEY = "forja-milestone-day";

  const queue = [];
  let playing = false;
  // While the day-complete moment is waiting to play, the ring stays open.
  let dayPending = false;
  // Which targets were met the last time Today was drawn (null = not yet drawn).
  let metBefore = null;

  const todayVisible = () => !$("app-screen").classList.contains("hidden") && !$("tab-today").classList.contains("hidden");
  const inSignUp = () => typeof Onboarding !== "undefined" && Onboarding.isActive();
  const remember = (key) => {
    try {
      localStorage.setItem(key, todayString());
    } catch (e) {
      // storage blocked - it just might show again
    }
  };
  const isToday = (key) => {
    try {
      return localStorage.getItem(key) === todayString();
    } catch (e) {
      return false;
    }
  };

  // Moments play one after another, each once Today is on screen.
  function enqueue(step) {
    queue.push(step);
    if (!playing) run();
  }
  async function run() {
    playing = true;
    while (queue.length) {
      while (!todayVisible()) await new Promise((resolve) => setTimeout(resolve, 200));
      const step = queue.shift();
      try {
        await step();
      } catch (e) {
        console.error("celebration failed", e);
      }
    }
    playing = false;
  }

  function countUp(input, from, to, ms) {
    const start = performance.now();
    const frame = (now) => {
      const t = Math.min(1, (now - start) / ms);
      input.value = Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  // Runs onFrame(t) every frame for `ms`, t going 0 -> 1.
  function frames(ms, onFrame) {
    return new Promise((resolve) => {
      const start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / ms);
        onFrame(t);
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  // ---------- a saved set ----------
  // The set is saved while the camera screen still covers Today, so its
  // slice of the ring and its number stay where they were (ringShown /
  // heldValue, read by script.js) until Today is back on screen. Then the
  // slice grows frame by frame - a CSS transition of a ring's dash length
  // is unreliable on iPhones - while the number counts up and a "+25"
  // floats off the card. A slice that reaches full swells for a beat.
  const FILL_MS = 700;
  const ringHold = {}; // key -> the fraction the slice keeps showing
  const valueHold = {}; // key -> the number the card keeps showing

  function ringShown(key, fraction) {
    return key in ringHold ? ringHold[key] : fraction;
  }
  function heldValue(key, value) {
    return key in valueHold ? valueHold[key] : value;
  }

  function setSaved(exercise, before, after) {
    const key = KEY_OF[exercise];
    if (!key || !(after > before) || inSignUp()) return;
    const target = Math.max(data.minimums[key], 1);
    // An extra set on a finished day: just the "+N" and the count. The
    // ring is already closed, so it stays as it is.
    const dayDone = data.lastLoggedDate === todayString();
    if (!dayDone) ringHold[key] = before / target;
    valueHold[key] = before;
    enqueue(async () => {
      await wait(250); // let Today settle after the camera closes
      const input = $(key);
      const tile = input.closest(".exercise-tile");
      const plus = document.createElement("span");
      plus.className = "celebrate-plus";
      plus.style.color = COLOR[key];
      plus.textContent = key === "planks" ? `+${after - before}s` : `+${after - before}`;
      tile.appendChild(plus);
      setTimeout(() => plus.remove(), 1300);
      delete valueHold[key];
      const from = before / target;
      const to = after / target;
      if (reduced()) {
        input.value = after;
      } else {
        countUp(input, before, after, FILL_MS);
        if (dayDone) await wait(FILL_MS);
        else await frames(FILL_MS, (t) => drawRingSlice(key, from + (to - from) * easeOut(t)));
        input.value = after;
      }
      delete ringHold[key];
      updateRings(data.lastLoggedDate === todayString());
      if (!dayDone && from < 1 && to >= 1 && !reduced()) {
        const slice = $("ring-" + key);
        await frames(320, (t) => {
          slice.style.strokeWidth = 14 + 5 * Math.sin(Math.PI * t);
        });
        slice.style.strokeWidth = "";
      }
    });
  }

  // ---------- the ring, closed ----------
  // A gapless copy of the ring (one arc per exercise, same order and colors)
  // drawn over the segments, plus the pet's face in the middle. Only
  // opacity and scale animate, which iPhones draw reliably.
  function closedRing() {
    let layer = $("ring-complete");
    if (!layer) {
      layer = document.createElementNS("http://www.w3.org/2000/svg", "g");
      layer.id = "ring-complete";
      document.querySelector(".rings-svg").appendChild(layer);
      // On a finished day the pet lives here; tapping it says another line.
      const face = document.createElement("div");
      face.id = "ring-face";
      face.className = "ring-face";
      face.setAttribute("role", "button");
      face.setAttribute("tabindex", "0");
      face.setAttribute("aria-label", tr("Forja pet - tap for another tip"));
      face.addEventListener("click", coachNextLine);
      face.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        coachNextLine();
      });
      document.querySelector(".rings-container").appendChild(face);
    }
    const keys = data.minimums.walkRun !== null ? ["pushups", "planks", "squats", "walkRun"] : ["pushups", "planks", "squats"];
    const circumference = 2 * Math.PI * 50;
    const span = circumference / keys.length;
    const shape = keys.join(",");
    if (layer.dataset.shape !== shape) {
      layer.dataset.shape = shape;
      layer.innerHTML = keys
        .map((key, i) => `<circle class="ring-complete-arc" cx="60" cy="60" r="50" stroke="${COLOR[key]}" stroke-dasharray="${span + 0.5} ${circumference}" stroke-dashoffset="${-i * span}"/>`)
        .join("");
    }
    return { layer, face: $("ring-face") };
  }

  // animate: false, "snap" (the face pops in) or "land" (the coach just
  // jumped in - its face squashes down as it lands).
  // The ring closes by each slice growing across the gap after it, then the
  // gapless copy takes over; meanwhile the whole ring (face included) pops.
  // (The copy used to scale in on its own - mid-scale its edges couldn't
  // match the gaps, and iPhones showed notches there.)
  function showClosed(closed, animate) {
    const { face } = closedRing();
    const container = document.querySelector(".rings-container");
    face.classList.toggle("is-tappable", closed);
    if (closed && !face.hasChildNodes()) face.innerHTML = Onboarding.mascot("wow", true);
    if (!closed) face.innerHTML = "";
    face.classList.remove("snap", "land", "hop");
    if (!closed || !animate || reduced()) {
      container.classList.toggle("is-complete", closed);
      return;
    }
    void face.offsetWidth;
    face.classList.add(animate === "land" ? "land" : "snap");
    frames(240, (t) => drawRingClosing(easeOut(t))).then(() => container.classList.add("is-complete"));
    if (container.animate) container.animate([{ transform: "none" }, { transform: "scale(1.05)", offset: 0.45 }, { transform: "none" }], { duration: 420, easing: "ease-out" });
  }

  // ---------- the day ----------
  function dayComplete({ streak, levelUp }) {
    if (levelUp) remember(LEVEL_UP_KEY);
    // Sign-up has its own Day 1 screens; Today just shows the finished state.
    if (inSignUp()) return;
    dayPending = true;
    enqueue(async () => {
      await wait(100);
      // The pet leaps from its spot at the top into the ring; as it lands
      // the ring closes around it and it stays there for the rest of the day.
      const landed = await coachJump();
      dayPending = false;
      showClosed(true, landed ? "land" : "snap");
      streakCountEl.classList.add("pulse");
      setTimeout(() => streakCountEl.classList.remove("pulse"), 250);
      await wait(landed ? 260 : 0);
      const milestoneDay = streak > 0 && (streak % 7 === 0 || BIG_DAYS.includes(streak)) && !isToday(MILESTONE_KEY);
      askNotifications("done", milestoneDay);
      coachRender(true, todayProgress(), true);
      if (milestoneDay) {
        await wait(1300);
        await milestone(streak);
      }
    });
  }

  // ---------- the pet coach ----------
  // Where a daily quote used to be, the pet says what today still needs -
  // in its own voice (blunt, funny, never rude: it teases the effort, never
  // the person). Every number comes from the real day: what's left, the
  // streak (as the server would count it, rest days included) and the
  // plan's next level-up. Once the day is done the pet lives in the closed
  // ring and talks from under it. It hops in when Today opens, moves to fit
  // the moment, and tapping it gets another line.
  const MOVES = { fresh: "wave", newbie: "wave", nudged: "wave", partway: "nod", close: "bounce", risk: "nod" }; // evenings: a gentle nod, never a scolding shake
  // One health tip a day, the same for everyone. Before the workout it's a
  // tap away; once the day is done it's the first thing the pet says.
  const TIPS = [
    "Sleep 7 to 9 hours tonight. Muscles grow while you rest.",
    "Drink a glass of water before your first coffee.",
    "Add protein to every meal: eggs, beans, chicken, yogurt.",
    "Phone down 30 minutes before bed. You'll fall asleep faster.",
    "Fill half your plate with vegetables. Easy win.",
    "A 10-minute walk after dinner helps your body handle the meal.",
    "Keep a water bottle where you can see it. You'll drink more.",
    "Same bedtime every night, weekends too. Your body loves a routine.",
    "Sitting a lot? Stand up and stretch for a minute.",
    "Sore? Light movement helps more than lying still.",
    "Get some daylight this morning. It helps you sleep tonight.",
    "Craving something sweet? Fruit first.",
    "Breathe in for 4, out for 6. Five times. Calmer already.",
    "Cook one meal at home this week instead of ordering.",
    "Take the stairs once today. Small wins add up.",
    "Eat slowly. It takes about 20 minutes to feel full.",
    "Swap one soda for sparkling water with lemon.",
    "Rest days are part of the plan, not a break from it.",
    "Stretch your hips today. Sitting all day makes them tight.",
    "Coffee after 2 PM can keep you up tonight.",
    "Pack a snack: nuts, fruit or yogurt. Hungry you makes worse choices.",
    "Invite a friend to train with you. It's easier together.",
    "Posture check: shoulders back, chin level.",
    "Fiber keeps you full longer: oats, beans, berries.",
    "A cool, dark room helps you sleep deeper.",
    "Fewer drinks tonight, better sleep tonight.",
    "On a phone call? Walk while you talk.",
    "Pick tomorrow's workout time tonight. Then it's already decided.",
    "Feeling tired? Try water and a short walk before more coffee.",
    "Showing up today is the habit forming. Proud of you.",
  ];
  function tipLine() {
    const day = Math.round(Date.parse(todayString() + "T00:00:00Z") / 86400000);
    return tr("<b>Tip:</b> {tip}", { tip: tr(TIPS[day % TIPS.length]) });
  }
  // The tip goes second, right after the pet's first line.
  const withTip = (lines) => [lines[0], tipLine(), ...lines.slice(1)];
  let finishedHere = false; // the day was finished in this visit: "Day N done" stays first
  let coachMoment = null; // the moment the pet last talked about
  let coachLines = []; // what it can say about it (tap = the next one)
  let coachIndex = 0;
  let coachKey = null; // moment + first line, so a redraw with nothing new stays quiet
  let coachIntroQueued = false;
  let coachMoveTimer = null;

  // "{n} push-ups", "{n} more squat"...: each form is its own tr() key.
  const plural = (n, one, many) => tr(n === 1 ? `{n} ${one}` : `{n} ${many}`, { n });
  const plankText = (seconds) => (seconds < 60 ? `${seconds}s` : formatDuration(seconds * 1000));
  const joinList = (items) => (items.length < 2 ? items.join("") : items.slice(0, -1).join(", ") + tr(" and ") + items[items.length - 1]);
  const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);

  function statsNow() {
    return { streak: data.streak, bestStreak: data.bestStreak, lastLoggedDate: data.lastLoggedDate, restDaysUsed: data.restDaysUsed, weekStartDate: data.weekStartDate };
  }
  // The streak today's workout would carry on (0 = it's already gone).
  function liveStreak() {
    return ForjaRules.shownStreak(statsNow(), todayString());
  }
  // What's left today, in the order of the ring. A plank is one hold, so a
  // short one still needs the full time.
  function leftToDo(progress) {
    const m = data.minimums;
    const left = [];
    if (progress.pushups < m.pushups) left.push(progress.pushups > 0 ? plural(m.pushups - progress.pushups, "more push-up", "more push-ups") : plural(m.pushups, "push-up", "push-ups"));
    if (progress.planks < m.planks) left.push(tr(progress.planks > 0 ? "a full {time} plank" : "a {time} plank", { time: plankText(m.planks) }));
    if (progress.squats < m.squats) left.push(progress.squats > 0 ? plural(m.squats - progress.squats, "more squat", "more squats") : plural(m.squats, "squat", "squats"));
    if (m.walkRun !== null && progress.walkRun < m.walkRun) left.push(progress.walkRun > 0 ? tr("{n} more minutes of walking", { n: m.walkRun - progress.walkRun }) : tr("a {n}-min walk or run", { n: m.walkRun }));
    return left;
  }

  // Streaks get a big moment every 7th day; say how far off the next one is.
  function weekLine(streak, done) {
    if (done) {
      const next = (Math.floor(streak / 7) + 1) * 7;
      const days = next - streak;
      return days === 1 ? tr("<b>1 more day</b> to a {next}-day streak. Same time tomorrow?", { next }) : tr("<b>{n} more days</b> to a {next}-day streak.", { n: days, next });
    }
    const next = Math.ceil((streak + 1) / 7) * 7;
    const days = next - streak; // today included
    return days === 1 ? tr("Today makes it a <b>{next}-day streak</b>. No pressure.", { next }) : tr("<b>{n} more days</b> and you hit a {next}-day streak. Today counts.", { n: days, next });
  }

  function doneLines() {
    const streak = data.streak;
    let first = tr("Day <b>{n}</b> done. See you tomorrow.", { n: streak });
    if (typeof serverPlan !== "undefined" && serverPlan) {
      const tomorrow = ForjaRules.addDays(todayString(), 1);
      if (isToday(LEVEL_UP_KEY)) {
        const t = ForjaRules.planOn(serverPlan, tomorrow).plan.targets;
        first = tr("<b>Level up!</b> Tomorrow: {pushups} push-ups · {plank} plank · {squats} squats.", { pushups: t.pushups, plank: plankText(t.planks), squats: t.squats });
      } else {
        const next = ForjaRules.nextLevelUp(serverPlan, tomorrow);
        if (next) first = tr("Day <b>{n}</b> done. Level up in <b>{days}</b>.", { n: streak, days: plural(next.inDays, "day", "days") });
      }
    }
    return [first, weekLine(streak, true), tr("That's it for today. Go brag to someone.")];
  }

  // Friends who nudged you today (usernames, oldest first), for whose
  // account and which day - script.js loads them when the app opens or
  // comes back on screen.
  let nudgedBy = { names: [], userId: null, day: null };

  function setNudgers(names, userId, day) {
    const next = { names: names.slice(), userId, day };
    if (JSON.stringify(next) === JSON.stringify(nudgedBy)) return;
    const newNudge = names.some((n) => !nudgedBy.names.includes(n));
    nudgedBy = next;
    if (typeof data === "undefined" || !data) return;
    const p = todayProgress();
    if (newNudge && data.lastLoggedDate !== todayString() && p.pushups + p.planks + p.squats + p.walkRun === 0) askNotifications("nudged");
    render();
  }

  // Asking for notifications (script.js decides whether and how): "app" =
  // the pet asks here with a one-tap button; "safari" = a sheet with the
  // Home Screen steps, once the pet has said its line.
  let notifAsk = null; // { moment: "done" | "nudged", day, state: "ask" | "busy" | "on" }

  // noSheet: a 7-day milestone is about to play; the sheet waits for
  // another day rather than cover it.
  function askNotifications(moment, noSheet) {
    const mode = typeof notifAskNow === "function" ? notifAskNow() : null;
    if (mode === "safari" && !noSheet) setTimeout(() => openHomeScreenSheet(moment), moment === "done" ? 1600 : 2600);
    if (mode !== "app") return;
    notifAsk = { moment, day: todayString(), state: "ask" };
    notifAskShown();
  }

  const hourText = (h) => `${h % 12 || 12} ${h < 12 ? tr("AM") : tr("PM")}`;

  function askLine() {
    const hour = hourText(data.reminderHour);
    if (notifAsk.state === "on") return tr("Done. I'll ping you at <b>{hour}</b> on days you haven't trained.", { hour });
    const busy = notifAsk.state === "busy";
    const ask = notifAsk.moment === "done" ? tr("Day <b>{n}</b> done. Want me to remind you tomorrow?", { n: data.streak }) : tr("Turn on notifications to see nudges right away.");
    const yes = busy ? tr("Turning On...") : notifAsk.moment === "done" ? tr("Yes, {hour}", { hour }) : tr("Turn On");
    return `${ask}<span class="pet-ask-actions"><button type="button" class="pet-ask-button is-go" data-notif-ask="yes"${busy ? " disabled" : ""}>${yes}</button><button type="button" class="pet-ask-button" data-notif-ask="no"${busy ? " disabled" : ""}>${tr("No Thanks")}</button></span>`;
  }

  // The bubble's buttons. "Yes" asks the phone right inside the tap.
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-notif-ask]");
    if (!button || !notifAsk || notifAsk.state !== "ask") return;
    const asking = notifAsk;
    if (button.dataset.notifAsk === "no") {
      notifAskDeclined();
      notifAsk = null;
      render();
      return;
    }
    const turningOn = turnOnRemindersFromAsk();
    asking.state = "busy";
    render();
    turningOn.then((on) => {
      if (notifAsk !== asking) return;
      if (on) asking.state = "on";
      else notifAsk = null;
      render();
    });
  });

  const escapeText = (text) => String(text).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

  // "Ramsesn nudged you" with their faces, then what it's about (left out
  // while the pet asks about notifications, to keep the bubble short).
  function nudgeLine(names, withWhy = true) {
    const name = (n) => `<b class="pet-nudge-name">${escapeText(n)}</b>`;
    const who = names.length === 1 ? name(names[0]) : names.length === 2 ? tr("{a} and {b}", { a: name(names[0]), b: name(names[1]) }) : tr("{a} and {n} others", { a: name(names[0]), n: names.length - 1 });
    const faces = names.slice(0, 3).map((n) => avatarHtml(n, "pet-nudge-avatar")).join("");
    const streak = liveStreak();
    const why = streak > 0 ? tr("Your <b>{n}-day streak</b> is waiting. Show them!", { n: streak }) : tr("One workout today and you're on the board.");
    return `<span class="pet-nudge-from"><span class="pet-nudge-faces">${faces}</span><span>${tr("{who} nudged you", { who })}</span></span>${withWhy ? why : ""}`;
  }

  // { moment, lines } for the day as it stands, or null while it's saving.
  // Nudged and nothing done yet: the pet says who nudged you first.
  // Asked to turn on notifications: that line comes first.
  // The day's tip: first on a done day opened later, otherwise second.
  function coachSays(done, progress) {
    const says = coachSaysPlain(done, progress);
    if (!says) return says;
    const asking = notifAsk && notifAsk.day === todayString() ? notifAsk.moment : null;
    if (done) {
      if (asking === "done") return { moment: "done", lines: [askLine(), ...withTip(says.lines)] };
      return { moment: "done", lines: finishedHere ? withTip(says.lines) : [tipLine(), ...says.lines] };
    }
    const started = progress.pushups + progress.planks + progress.squats + progress.walkRun > 0;
    const nudged = nudgedBy.names.length > 0 && nudgedBy.userId === currentUserId && nudgedBy.day === todayString();
    if (started || !nudged) return { moment: says.moment, lines: withTip(says.lines) };
    const first = asking === "nudged" ? nudgeLine(nudgedBy.names, false) + askLine() : nudgeLine(nudgedBy.names);
    return { moment: "nudged", lines: [first, ...withTip(says.lines)] };
  }

  function coachSaysPlain(done, progress) {
    if (done) return { moment: "done", lines: doneLines() };
    const left = leftToDo(progress);
    if (left.length === 0) return null; // every target met - the day is being saved
    const streak = liveStreak();
    const total = data.minimums.walkRun !== null ? 4 : 3;
    const started = progress.pushups + progress.planks + progress.squats + progress.walkRun > 0;
    if (!started) {
      // Evenings follow the pet's face (pet.js): Worried from 8 PM, Sad
      // from 10 PM. Warm words only, never guilt (user, 2026-11-07).
      const hour = new Date().getHours();
      if (hour >= 20) {
        const pushups = plural(data.minimums.pushups, "push-up", "push-ups");
        const todo = tr("{todo}. Then the day logs itself.", { todo: capital(joinList(left)) });
        return {
          moment: "risk",
          lines: [hour >= 22 ? tr("A few minutes still counts. {pushups}?", { pushups: capital(pushups) }) : tr("Still plenty of time today. {pushups}?", { pushups: capital(pushups) }), todo],
        };
      }
      if (streak === 0) return { moment: "newbie", lines: [tr("Fresh start. <b>{todo}</b>. Let's go.", { todo: capital(joinList(left)) }), tr("Day <b>1</b> is the hardest one. Get it over with.")] };
      return {
        moment: "fresh",
        lines: [tr("Day <b>{n}</b> is up for grabs. Start with {pushups}?", { n: streak + 1, pushups: plural(data.minimums.pushups, "push-up", "push-ups") }), weekLine(streak, false), tr("{todo}. Then the day logs itself.", { todo: capital(joinList(left)) })],
      };
    }
    if (left.length === 1) {
      return {
        moment: "close",
        lines: [tr("Just <b>{todo}</b> between you and day <b>{n}</b>.", { todo: left[0], n: streak + 1 }), tr("So close I can taste it. <b>{todo}</b>.", { todo: capital(left[0]) })],
      };
    }
    const doneCount = total - left.length;
    return {
      moment: "partway",
      lines: [tr("Nice. Now <b>{todo}</b>.", { todo: joinList(left) }), doneCount > 0 ? tr("<b>{n} of {total}</b> done. Don't get comfy.", { n: doneCount, total }) : tr("You've started. That's the hard part.")],
    };
  }

  function speak(el, html) {
    el.classList.remove("is-new");
    void el.offsetWidth; // restart the pop-in
    el.innerHTML = html;
    el.classList.add("is-new");
  }

  function move(name) {
    const pet = $("pet-coach-pet");
    pet.classList.remove("hop-in", "wave", "nod", "bounce", "shake", "idle");
    if (reduced()) return;
    void pet.offsetWidth;
    pet.classList.add(name);
    clearTimeout(coachMoveTimer);
    coachMoveTimer = setTimeout(() => {
      pet.classList.remove(name);
      pet.classList.add("idle");
    }, 1000);
  }

  // The pet's mood here follows the clock, not the moment (pet.js: worried
  // from 8 PM, sad from 10 PM, asleep 11 PM to 7 AM), so it's drawn once.
  function drawPet() {
    const pet = $("pet-coach-pet");
    if (!pet.querySelector(".forja-pet")) pet.innerHTML = ForjaPet.html("auto", "coach");
  }

  // Top spot (the day isn't done) or in the ring (it is). animate = the
  // pet just jumped in: the empty top spot folds away and the line pops in.
  function placeCoach(done, animate) {
    const coach = $("pet-coach");
    if (coach.classList.contains("is-gone") === done) return;
    if (!animate) coach.classList.add("no-motion");
    coach.classList.toggle("is-gone", done);
    void coach.offsetWidth;
    coach.classList.remove("no-motion");
    $("pet-coach-pet").style.visibility = "";
    $("pet-coach-bubble").classList.remove("is-quiet");
    $("pet-coach-below").classList.toggle("hidden", !done);
  }

  function coachRender(done, progress, animate) {
    if (!data || inSignUp()) return;
    if (done && animate) finishedHere = true;
    const says = coachSays(done, progress);
    if (!says) return;
    placeCoach(done, animate);
    // On a finished day the line under the ring replaces "Day complete!".
    if (done) statusMessageEl.classList.add("hidden");
    const key = says.moment + "|" + says.lines[0];
    if (key === coachKey) {
      coachLines = says.lines; // same thing to say; just keep the lines fresh
      return;
    }
    const first = coachKey === null;
    const changed = says.moment !== coachMoment;
    coachKey = key;
    coachMoment = says.moment;
    coachLines = says.lines;
    coachIndex = 0;
    if (!done) drawPet();
    const bubble = done ? $("pet-coach-below") : $("pet-coach-bubble");
    if (first || animate) {
      // Right away: the first draw (the intro below brings it in) or the
      // landing after the jump.
      speak(bubble, says.lines[0]);
      if (first) coachIntro();
      return;
    }
    // A new line (a set saved, the day moved on) plays once Today is seen,
    // after the ring has filled.
    enqueue(async () => {
      speak(bubble, says.lines[0]);
      if (!done && changed) move(MOVES[says.moment] || "nod");
      await wait(300);
    });
  }

  // Opening Today: the pet hops in, then says its line with its move.
  function coachIntro() {
    if (coachIntroQueued) return;
    coachIntroQueued = true;
    enqueue(async () => {
      coachIntroQueued = false;
      if (!coachMoment) return;
      if (coachMoment === "done") {
        faceHop();
        speak($("pet-coach-below"), coachLines[coachIndex]);
        return;
      }
      const bubble = $("pet-coach-bubble");
      bubble.classList.add("is-quiet");
      move("hop-in");
      await wait(550);
      bubble.classList.remove("is-quiet");
      speak(bubble, coachLines[coachIndex]);
      move(MOVES[coachMoment] || "nod");
    });
  }

  function faceHop() {
    const face = $("ring-face");
    if (!face || reduced()) return;
    face.classList.remove("snap", "land", "hop");
    void face.offsetWidth;
    face.classList.add("hop");
  }

  function coachNextLine() {
    if (!coachLines.length) return;
    coachIndex = (coachIndex + 1) % coachLines.length;
    if (coachMoment === "done") {
      speak($("pet-coach-below"), coachLines[coachIndex]);
      faceHop();
    } else {
      speak($("pet-coach-bubble"), coachLines[coachIndex]);
      move(coachMoment === "risk" ? "nod" : "bounce");
    }
  }

  // The jump: a still copy of the pet leaves its spot, crouches, arcs down
  // and grows to the size of the pet inside the closed ring, right on the
  // ring's middle. Today's ring fades out on the way and is back the moment
  // the pet lands - which is when the copy goes and the ring closes around
  // the real one (showClosed "land"). Resolves true once it has landed, or
  // false right away when there's nothing to animate (Reduce Motion, or the
  // pet isn't at the top). Transform/opacity only.
  function coachJump() {
    const pet = $("pet-coach-pet");
    const svg = pet.querySelector("svg");
    if (reduced() || !svg || $("pet-coach").classList.contains("is-gone") || !svg.animate) return Promise.resolve(false);
    const from = svg.getBoundingClientRect();
    const ringSvg = document.querySelector(".rings-svg");
    const ring = ringSvg.getBoundingClientRect();
    if (!from.width || !ring.width) return Promise.resolve(false);
    // The pet's orb is 120 wide on its 140-wide grid, centered at (70, 75);
    // in the ring it fills 120 of the face's 140 (pet.js VIEWBOX).
    const unit = from.width / 140;
    const faceWidth = $("ring-face").getBoundingClientRect().width || 118;
    const scale = (faceWidth * (120 / 140)) / (120 * unit);
    const endX = ring.left + ring.width / 2 - scale * 70 * unit;
    const endY = ring.top + ring.height / 2 - scale * 75 * unit;
    const midX = (from.left + endX) / 2;
    const midY = Math.min(from.top, endY) - 60;
    const flyer = svg.cloneNode(true);
    flyer.classList.add("pet-coach-flyer");
    // Drop the float it had at that moment, so it lands exactly on the
    // still face in the ring (no few-px snap when they swap).
    const bob = flyer.querySelector(".pet-bob");
    if (bob) bob.removeAttribute("transform");
    flyer.style.width = from.width + "px";
    flyer.style.height = from.height + "px";
    document.body.appendChild(flyer);
    pet.style.visibility = "hidden";
    $("pet-coach-bubble").classList.add("is-quiet");
    return new Promise((resolve) => {
      const flight = flyer.animate(
        [
          { transform: `translate(${from.left}px, ${from.top}px) scale(1)` },
          { transform: `translate(${from.left - 2}px, ${from.top + 7}px) scale(1.06, 0.9)`, offset: 0.14 },
          { transform: `translate(${midX}px, ${midY}px) scale(${(1 + scale) / 2})`, offset: 0.55, easing: "ease-in" },
          { transform: `translate(${endX}px, ${endY}px) scale(${scale})` },
        ],
        { duration: 820, easing: "ease-out", fill: "forwards" }
      );
      ringSvg.animate([{ opacity: 1 }, { opacity: 1, offset: 0.15 }, { opacity: 0, offset: 0.5 }, { opacity: 0 }], { duration: 820 });
      // It landed exactly on Today's ring and face, so it just goes (a fade
      // would show two faces while the ring pops).
      const landed = () => {
        flyer.remove();
        resolve(true);
      };
      flight.onfinish = landed;
      flight.oncancel = landed;
    });
  }

  $("pet-coach-pet").addEventListener("click", coachNextLine);

  // ---------- every 7th day ----------
  function confetti(host) {
    const colors = [COLOR.pushups, COLOR.planks, COLOR.squats, "var(--accent)"];
    for (let i = 0; i < 48; i++) {
      const piece = document.createElement("i");
      piece.className = "celebrate-confetti";
      const angle = Math.random() * Math.PI * 2;
      const distance = 110 + Math.random() * 170;
      piece.style.cssText = `--c:${colors[i % 4]};--x:${Math.round(Math.cos(angle) * distance)}px;--y:${Math.round(Math.sin(angle) * distance * 0.8 + 90)}px;--r:${Math.round(Math.random() * 720 - 360)}deg;--d:${(1.35 + Math.random() * 0.25).toFixed(2)}s`;
      host.appendChild(piece);
    }
  }

  // Every 7th day gets the flex; these get it too, and these plus the
  // first two weeks get a story image to share (script.js
  // openMilestoneShare).
  const BIG_DAYS = [30, 60, 100, 365];
  const SHARE_DAYS = [7, 14, ...BIG_DAYS];
  const MILESTONE_LINES = { 30: tr("One month in a row."), 60: tr("Two months in a row."), 100: tr("100 days in a row."), 365: tr("A whole year in a row.") };

  function milestone(streak) {
    remember(MILESTONE_KEY);
    const weeks = streak / 7;
    const line = MILESTONE_LINES[streak] || (weeks === 1 ? tr("A full week in a row.") : tr("{n} weeks in a row.", { n: weeks }));
    const canShare = SHARE_DAYS.includes(streak) && typeof openMilestoneShare === "function";
    // The last seven days, ending today (Sunday first, like getDay()).
    const letters = tr("S M T W T F S").split(" ");
    const days = Array.from({ length: 7 }, (_, i) => letters[new Date(Date.now() - (6 - i) * 86400000).getDay()]);
    return new Promise((resolve) => {
      const screen = document.createElement("div");
      screen.className = "celebrate-screen";
      screen.setAttribute("role", "dialog");
      screen.setAttribute("aria-modal", "true");
      screen.setAttribute("aria-labelledby", "celebrate-title");
      screen.innerHTML = `
        ${ForjaPet.flexSVG()}
        <span class="celebrate-number">${streak - 1}</span>
        <h2 id="celebrate-title">${tr("{n}-day streak!", { n: streak })}</h2>
        <p>${line}</p>
        <div class="celebrate-week">${days.map((d, i) => `<span class="${i === 6 ? "is-today" : ""}">${d}</span>`).join("")}</div>
        ${canShare ? `<button class="auth-submit-button celebrate-share">${tr("Share My Streak")}</button>` : ""}
        <button class="${canShare ? "tracking-cancel-button" : "auth-submit-button"} celebrate-close">${tr("Continue")}</button>`;
      document.body.appendChild(screen);
      // The number and confetti go off as the pet lands in its flex (pet.js:
      // shades on, then a double-bicep; still with Reduce Motion).
      const pet = screen.querySelector(".flex-pet");
      ForjaPet.playFlex(pet);
      if (!reduced()) confetti(screen);
      const number = screen.querySelector(".celebrate-number");
      const bump = setTimeout(() => {
        number.textContent = streak;
        number.classList.add("bump");
      }, reduced() ? 0 : 1420);
      const button = screen.querySelector(".celebrate-close");
      const close = () => {
        document.removeEventListener("keydown", onKey);
        clearTimeout(bump);
        // The pet's idle loop runs forever; stop it with the screen.
        if (pet.getAnimations) pet.getAnimations({ subtree: true }).forEach((a) => a.cancel());
        screen.remove();
        resolve();
      };
      const onKey = (event) => {
        if (event.key === "Escape") close();
      };
      button.addEventListener("click", close);
      const share = screen.querySelector(".celebrate-share");
      if (share) share.addEventListener("click", () => {
        close();
        openMilestoneShare(streak);
      });
      document.addEventListener("keydown", onKey);
      (share || button).focus();
    });
  }

  // ---------- called by render() every time Today is drawn ----------
  function renderToday(loggedToday, progress) {
    // Targets met: a green check on the tag, popping in when it's new.
    const met = {};
    for (const key of Object.keys(TAGS)) {
      met[key] = loggedToday || progress[key] >= data.minimums[key];
      $(TAGS[key]).classList.toggle("is-met", met[key]);
      if (metBefore && met[key] && !metBefore[key] && !inSignUp()) {
        enqueue(async () => {
          const tag = $(TAGS[key]);
          tag.classList.remove("pop");
          void tag.offsetWidth;
          tag.classList.add("pop");
          await wait(350);
        });
      }
    }
    metBefore = met;

    if (!dayPending) showClosed(loggedToday, false);
    // Until the jump plays, the pet stays at the top.
    coachRender(loggedToday && !dayPending, progress, false);
  }

  return { setSaved, dayComplete, renderToday, ringShown, heldValue, setNudgers, enterToday: coachIntro };
})();

// script.js may already have drawn Today before this file loaded (the app
// starts as soon as the log-in check answers); draw it again so a finished
// day shows its closed ring.
if (typeof data !== "undefined" && data) render();
