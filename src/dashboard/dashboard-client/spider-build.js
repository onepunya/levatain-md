
import React from "https://esm.sh/react@18";

const { useLayoutEffect, useRef, useState } = React;
const e = React.createElement;

const TARGETS = [
  ".page header.top .brand",
  ".page header.top .serverline",
  ".page header.top .prompt",
  ".page header.top .clockbox",
  ".page header.top .replay",
  ".page h2.label",
  ".page .card",
  ".page .panel",
  ".page footer.bottom",
].join(",");

const BODY_COLORS = ["#e6fbff", "#e6fbff", "#d9ccff"];
const LEG_COLORS = ["rgba(190,240,250,.92)", "rgba(190,240,250,.92)", "rgba(200,185,255,.92)"];
const THREAD_LIFE = 650;
const PULSE_LIFE = 420;

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function turnToward(current, desired, maxStep) {
  let diff = desired - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + clamp(diff, -maxStep, maxStep);
}

function restartTyping(el) {
  const typed = el.querySelector(".typed");
  if (!typed) return;
  typed.style.animation = "none";
  void typed.offsetWidth;
  typed.style.animation = "";
}

function restartBars(el) {
  el.querySelectorAll(".fill").forEach((bar) => {
    const target = bar.style.width;
    if (!target) return;
    bar.style.transition = "none";
    bar.style.width = "0%";
    void bar.offsetWidth;
    bar.style.transition = "";
    bar.style.width = target;
  });
}

function revealFully(item) {
  item.el.classList.remove("sb-hide");
  item.el.style.clipPath = "";
  item.el.style.opacity = "";
  item.done = true;
}

function drawSpider(ctx, s) {
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.heading + Math.PI / 2);
  ctx.scale(s.scale, s.scale);
  ctx.strokeStyle = LEG_COLORS[s.tone];
  ctx.lineWidth = 1.1;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 4; i += 1) {
      const ay = (i - 1.5) * 1.9;
      const sway = Math.sin(s.phase + i * 1.6 + (side > 0 ? 0 : Math.PI)) * 3.4;
      const tx = side * 10.5;
      const ty = (i - 1.5) * 5.4 + sway;
      const kx = side * 6.2;
      const ky = (ay + ty) / 2 - 3.2 - Math.abs(sway) * 0.25;
      ctx.beginPath();
      ctx.moveTo(side * 1.6, ay);
      ctx.lineTo(kx, ky);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }
  }
  ctx.fillStyle = BODY_COLORS[s.tone];
  ctx.beginPath();
  ctx.ellipse(0, 3.2, 3.1, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, -2.4, 2.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function startBuild(canvas, hooks) {
  const ctx = canvas.getContext("2d");
  const mobile = window.matchMedia("(max-width: 760px)").matches;
  const maxSpiders = mobile ? 9 : 15;

  let width = 0;
  let height = 0;
  let raf = 0;
  let lastT = 0;
  let running = false;
  let stopped = false;
  let spiders = [];
  let threads = [];
  let pulses = [];

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  resize();

  const items = Array.from(document.querySelectorAll(TARGETS))
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { el, claimed: false, done: false, top: r.top + window.scrollY, left: r.left };
    })
    .sort((a, b) => (Math.abs(a.top - b.top) < 24 ? a.left - b.left : a.top - b.top));

  items.forEach((item) => {
    item.el.classList.add("sb-hide");
    item.el.style.clipPath = "";
    item.el.style.opacity = "";
  });

  function isVisible(item) {
    if (!item.el.isConnected) return true;
    const r = item.el.getBoundingClientRect();
    return r.bottom > 0 && r.top < height - 24;
  }

  function openItems() {
    return items.filter((item) => !item.done && !item.claimed && isVisible(item));
  }

  function spawn(delay) {
    const side = Math.floor(rand(0, 4));
    let x;
    let y;
    if (side === 0) {
      x = rand(0, width);
      y = -30;
    } else if (side === 1) {
      x = width + 30;
      y = rand(0, height * 0.7);
    } else if (side === 2) {
      x = -30;
      y = rand(0, height * 0.7);
    } else {
      x = rand(0, width);
      y = -30;
    }
    spiders.push({
      x,
      y,
      heading: Math.atan2(height / 2 - y, width / 2 - x),
      speed: rand(380, 580),
      scale: rand(0.75, 1.1),
      tone: Math.floor(rand(0, 3)),
      phase: rand(0, 6),
      wait: delay,
      state: "walk",
      job: null,
      jobT: 0,
      vy: 0,
      stitchT: 0,
    });
  }

  function spawnWave(count) {
    for (let i = 0; i < count; i += 1) spawn(i * 70);
  }

  function claim(s) {
    const open = openItems().slice(0, 6);
    if (!open.length) return null;
    let best = open[0];
    let bestD = Infinity;
    open.forEach((item) => {
      const r = item.el.getBoundingClientRect();
      const d = Math.hypot(r.left - s.x, r.top + r.height / 2 - s.y);
      if (d < bestD) {
        bestD = d;
        best = item;
      }
    });
    best.claimed = true;
    return best;
  }

  function finishItem(s) {
    const item = s.job;
    const r = item.el.getBoundingClientRect();
    revealFully(item);
    pulses.push({ x: r.left, y: r.top, w: r.width, h: r.height, born: performance.now() });
    s.job = null;
    s.state = "walk";
    s.jobT = 0;
  }

  function startWeave(s, r) {
    const item = s.job;
    s.state = "weave";
    s.weaveT = 0;
    s.weaveDur = clamp(240 + r.width * 0.55, 300, 820);
    s.vy = (s.y < r.top + r.height / 2 ? 1 : -1) * rand(520, 760);
    item.el.style.opacity = "1";
    item.el.style.clipPath = "inset(-12px 100% -12px -12px)";
    if (item.el.matches(".prompt")) restartTyping(item.el);
    restartBars(item.el);
  }

  function updateSpider(s, dt, now) {
    if (s.wait > 0) {
      s.wait -= dt * 1000;
      return;
    }

    if (s.state === "leave") {
      const edgeX = s.x < width / 2 ? -40 : width + 40;
      const edgeY = s.y < height / 2 ? -40 : height + 40;
      const toX = Math.abs(s.x - edgeX) < Math.abs(s.y - edgeY) ? edgeX : s.x;
      const toY = toX === edgeX ? s.y : edgeY;
      s.heading = turnToward(s.heading, Math.atan2(toY - s.y, toX - s.x), 12 * dt);
      const step = s.speed * dt;
      s.x += Math.cos(s.heading) * step;
      s.y += Math.sin(s.heading) * step;
      s.phase += step * 0.5;
      if (s.x < -36 || s.x > width + 36 || s.y < -36 || s.y > height + 36) s.dead = true;
      return;
    }

    if (!s.job) {
      s.job = claim(s);
      s.jobT = 0;
      if (!s.job) {
        s.state = "leave";
        return;
      }
    }

    const item = s.job;
    if (!item.el.isConnected) {
      item.claimed = false;
      revealFully(item);
      s.job = null;
      return;
    }

    const r = item.el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) {
      revealFully(item);
      s.job = null;
      return;
    }

    if (s.state === "walk") {
      s.jobT += dt * 1000;
      const tx = r.left - 5;
      const ty = clamp(r.top + r.height / 2, 12, height - 12);
      const dist = Math.hypot(tx - s.x, ty - s.y);
      if (dist < 9 || s.jobT > 3500) {
        s.x = tx;
        s.y = ty;
        startWeave(s, r);
        return;
      }
      const want = Math.atan2(ty - s.y, tx - s.x) + Math.sin(now / 90 + s.phase) * 0.12;
      s.heading = turnToward(s.heading, want, 10 * dt);
      const step = Math.min(s.speed * dt, dist);
      s.x += Math.cos(s.heading) * step;
      s.y += Math.sin(s.heading) * step;
      s.phase += step * 0.5;
      return;
    }

    s.weaveT += dt * 1000;
    const p = clamp(s.weaveT / s.weaveDur, 0, 1);
    const eased = 1 - Math.pow(1 - p, 2);
    const fx = r.left + eased * r.width;
    const top = clamp(r.top + 3, 8, height - 8);
    const bottom = clamp(r.bottom - 3, top, height - 8);
    const px = s.x;
    const py = s.y;
    s.x += (fx - s.x) * Math.min(1, dt * 20);
    s.y += s.vy * dt;
    if (s.y > bottom) {
      s.y = bottom;
      s.vy = -Math.abs(s.vy);
    } else if (s.y < top) {
      s.y = top;
      s.vy = Math.abs(s.vy);
    }
    const mx = s.x - px;
    const my = s.y - py;
    if (mx * mx + my * my > 0.01) s.heading = turnToward(s.heading, Math.atan2(my, mx), 14 * dt);
    s.phase += Math.hypot(mx, my) * 0.5;

    item.el.style.clipPath = `inset(-12px ${((1 - eased) * 100).toFixed(2)}% -12px -12px)`;

    s.stitchT += dt * 1000;
    if (s.stitchT > 32) {
      s.stitchT = 0;
      threads.push({ x1: s.x, y1: s.y, x2: r.left, y2: rand(r.top, r.bottom), born: now });
      threads.push({ x1: s.x, y1: s.y, x2: rand(r.left, fx), y2: r.top, born: now });
      if (threads.length > 160) threads.splice(0, threads.length - 160);
    }

    s.frontier = { x: fx, top: r.top, bottom: r.bottom };

    if (p >= 1) finishItem(s);
  }

  function draw(now) {
    ctx.clearRect(0, 0, width, height);

    threads = threads.filter((t) => now - t.born < THREAD_LIFE);
    ctx.lineWidth = 0.8;
    threads.forEach((t) => {
      const a = 1 - (now - t.born) / THREAD_LIFE;
      ctx.strokeStyle = `rgba(210,245,255,${(a * 0.5).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(t.x1, t.y1);
      ctx.lineTo(t.x2, t.y2);
      ctx.stroke();
    });

    pulses = pulses.filter((p) => now - p.born < PULSE_LIFE);
    pulses.forEach((p) => {
      const a = 1 - (now - p.born) / PULSE_LIFE;
      ctx.strokeStyle = `rgba(34,211,238,${(a * 0.7).toFixed(3)})`;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(p.x - 0.5, p.y - 0.5, p.w + 1, p.h + 1);
    });

    spiders.forEach((s) => {
      if (s.state === "weave" && s.frontier) {
        const f = s.frontier;
        ctx.strokeStyle = "rgba(34,211,238,.22)";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(f.x, f.top);
        ctx.lineTo(f.x, f.bottom);
        ctx.stroke();
        ctx.strokeStyle = "rgba(160,240,255,.9)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(f.x, f.top);
        ctx.lineTo(f.x, f.bottom);
        ctx.stroke();
      }
    });

    spiders.forEach((s) => {
      if (s.wait <= 0) drawSpider(ctx, s);
    });
  }

  function frame(now) {
    if (stopped) return;
    const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016);
    lastT = now;
    spiders.forEach((s) => updateSpider(s, dt, now));
    spiders = spiders.filter((s) => !s.dead);
    draw(now);

    const working = spiders.length > 0;
    const fading = threads.length > 0 || pulses.length > 0;
    if (working || fading) {
      raf = requestAnimationFrame(frame);
      return;
    }

    running = false;
    ctx.clearRect(0, 0, width, height);
    if (items.every((item) => item.done)) {
      hooks.onDone();
    } else {
      hooks.onIdle();
    }
  }

  function run() {
    if (running || stopped) return;
    running = true;
    lastT = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function wake() {
    if (stopped) return;
    const open = openItems();
    if (!open.length) return;
    if (!running) {
      hooks.onBusy();
      spawnWave(Math.min(maxSpiders, open.length));
      run();
    } else if (spiders.length < Math.min(maxSpiders, open.length)) {
      spawn(0);
    }
  }

  function onScroll() {
    wake();
  }

  function onResize() {
    resize();
    wake();
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize);

  hooks.onBusy();
  spawnWave(Math.min(maxSpiders, Math.max(1, openItems().length)));
  run();

  return function stop() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onResize);
    items.forEach(revealFully);
    ctx.clearRect(0, 0, width, height);
  };
}

export function SpiderBuild({ onDone }) {
  const canvasRef = useRef(null);
  const stopRef = useRef(null);
  const [busy, setBusy] = useState(true);

  const skip = () => {
    if (stopRef.current) stopRef.current();
    onDone();
  };

  useLayoutEffect(() => {
    document.documentElement.classList.add("sb");
    const stop = startBuild(canvasRef.current, {
      onDone: () => onDone(),
      onIdle: () => setBusy(false),
      onBusy: () => setBusy(true),
    });
    stopRef.current = stop;

    const onKey = (ev) => {
      if (ev.key === "Escape") {
        stop();
        onDone();
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
      stop();
    };
  }, []);

  return e(
    React.Fragment,
    null,
    e("canvas", { ref: canvasRef, className: "sb-canvas", "aria-hidden": "true" }),
    busy ? e("button", { type: "button", className: "sb-skip", onClick: skip }, "Lewati") : null,
  );
}
