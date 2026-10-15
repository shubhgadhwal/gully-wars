const $ = (id) => document.getElementById(id),
  socket = io(),
  canvas = $("arena"),
  ctx = canvas.getContext("2d");
let me = null,
  room = null,
  keys = { up: false, down: false, left: false, right: false },
  jumpRequested = false,
  answeredId = null;
const params = new URLSearchParams(location.search);
if (params.has("room")) $("code").value = params.get("room");
const sections = ["setup", "lobby", "game", "end"];
function show(s) {
  sections.forEach((x) => $(x).classList.toggle("hidden", x !== s));
}
function msg(s) {
  $("message").textContent = s;
}
function myMatch() {
  return (
    room?.matches
      ?.slice()
      .reverse()
      .find((m) => m.ids.includes(me.id) && m.phase !== "ended") ||
    room?.matches
      ?.slice()
      .reverse()
      .find((m) => m.ids.includes(me.id))
  );
}
function player(id) {
  return room.players.find((p) => p.id === id);
}
function safe(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
$("join").onclick = () =>
  socket.emit("join", {
    code: $("code").value.trim().toUpperCase(),
    name: $("name").value,
    token: sessionStorage.getItem("gully-token"),
  });
$("ready").onclick = () =>
  socket.emit("ready", !room.players.find((p) => p.id === me.id)?.ready);
$("bots").onclick = () => socket.emit("addBots");
$("start").onclick = () => socket.emit("start");
$("final").onclick = () => socket.emit("startFinal");
$("copy").onclick = async () => {
  const link = location.origin + "/?room=" + room.code;
  try {
    await navigator.clipboard.writeText(link);
    $("copy").textContent = "Copied!";
  } catch {
    $("copy").textContent = link;
  }
};
socket.on("errorMessage", msg);
socket.on("joined", (data) => {
  me = data;
  sessionStorage.setItem("gully-token", data.token);
  history.replaceState({}, "", `/?room=${data.code}`);
  show("lobby");
});
socket.on("state", (r) => {
  room = r;
  if (!me) return;
  if (r.status === "lobby") {
    show("lobby");
    $("roomcode").textContent = r.code;
    $("players").innerHTML = r.players
      .map(
        (p) =>
          `<div>🚘 ${safe(p.name)} ${p.bot ? "🤖 " : ""}${p.id === r.host ? "👑" : ""} — ${p.ready ? "✅ READY" : "⌛ WAITING"} ${p.connected ? "" : "(offline)"}</div>`,
      )
      .join("");
    $("ready").textContent = r.players.find((p) => p.id === me.id)?.ready
      ? "Not Ready"
      : "I'm Ready";
    $("bots").classList.toggle(
      "hidden",
      r.host !== me.id || r.players.length === 4,
    );
    $("start").classList.toggle("hidden", r.host !== me.id);
    $("start").disabled =
      r.players.length !== 4 || !r.players.every((p) => p.ready);
  } else if (r.status === "finalReady" || r.status === "finished") {
    show("end");
    $("endtitle").textContent =
      r.status === "finished"
        ? "🏆 " + player(r.champion)?.name + " IS THE CHAMPION!"
        : "🏁 Semi-finals Complete";
    $("results").innerHTML = r.matches
      .map(
        (m) =>
          `<p>${m.round === 1 ? "Semi-final" : "Grand final"}: ${safe(player(m.winner)?.name || "Pending")} wins</p>`,
      )
      .join("");
    $("final").classList.toggle(
      "hidden",
      r.status !== "finalReady" || r.host !== me.id,
    );
  } else {
    show("game");
    const m = myMatch(),
      active = m && m.phase !== "ended";
    $("spectator").classList.toggle("hidden", active);
    if (!active) {
      $("spectator").innerHTML =
        "<h2>🏁 Your match is complete</h2><p>Waiting for the tournament to advance...</p>";
    } else {
      $("matchlabel").textContent =
        m.round === 2 ? "🏆 GRAND FINAL" : "⚔️ SEMI-FINAL";
      $("health").textContent = m.ids
        .map((id) => `${player(id)?.name}: ${Math.ceil(m.cars[id].hp)} HP`)
        .join(" | ");
      $("clock").textContent = Math.ceil(m.remaining) + "s";
      if (m.phase === "quiz" && m.quiz) {
        $("quiz").classList.remove("hidden");
        const q = m.quiz;
        const has = q.answered.includes(me.id);
        if ($("quiz").dataset.qid !== `${m.round}-${q.id}`) {
          $("quiz").dataset.qid = `${m.round}-${q.id}`;
          answeredId = null;
          $("quiz").innerHTML =
            `<h2>🇮🇳 ${safe(q.question)}</h2><div id="answers"></div><p id="qtime"></p>`;
          q.options.forEach((option, i) => {
            const b = document.createElement("button");
            b.textContent = `${"ABCD"[i]}. ${option}`;
            b.onclick = () => {
              if (answeredId === q.id) return;
              answeredId = q.id;
              socket.emit("answer", { questionId: q.id, index: i });
              document
                .querySelectorAll("#answers button")
                .forEach((b) => (b.disabled = true));
            };
            $("answers").append(b);
          });
        }
        document
          .querySelectorAll("#answers button")
          .forEach((b) => (b.disabled = has || answeredId === q.id));
        $("qtime").textContent = has
          ? "Answer locked — waiting for opponent"
          : `${q.remaining}s remaining`;
      } else {
        $("quiz").classList.add("hidden");
        $("quiz").dataset.qid = "";
      }
    }
  }
});
function send() {
  socket.emit("input", { ...keys, jump: jumpRequested });
  jumpRequested = false;
}
setInterval(() => {
  if (room && ["playing", "final"].includes(room.status)) send();
}, 50);
const mapping = {
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down",
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
};
window.addEventListener("keydown", (e) => {
  if (mapping[e.code]) {
    keys[mapping[e.code]] = true;
    e.preventDefault();
  }
  if (e.code === "Space") {
    if (!e.repeat) jumpRequested = true;
    e.preventDefault();
  }
});
window.addEventListener("keyup", (e) => {
  if (mapping[e.code]) keys[mapping[e.code]] = false;
});
document.querySelectorAll("[data-key]").forEach((b) => {
  const k = b.dataset.key;
  for (const ev of [
    "pointerdown",
    "pointerup",
    "pointercancel",
    "pointerleave",
  ])
    b.addEventListener(ev, (e) => {
      e.preventDefault();
      keys[k] = ev === "pointerdown";
    });
});
$("jump").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  jumpRequested = true;
});
window.addEventListener("blur", () => {
  keys = { up: false, down: false, left: false, right: false };
});
function pixelCar(x, y, scale, color, airborne = false) {
  const p = Math.max(1, Math.round(scale));
  const lift = airborne ? 8 * p : 0;
  ctx.fillStyle = airborne ? "#0005" : "#0009";
  ctx.fillRect(x - 19 * p, y + 7 * p, 38 * p, 5 * p);
  ctx.fillStyle = "#111820";
  ctx.fillRect(x - 22 * p, y - lift, 44 * p, 16 * p);
  ctx.fillStyle = color;
  ctx.fillRect(x - 18 * p, y - 8 * p - lift, 36 * p, 18 * p);
  ctx.fillRect(x - 12 * p, y - 14 * p - lift, 24 * p, 7 * p);
  ctx.fillStyle = "#9de5f1";
  ctx.fillRect(x - 8 * p, y - 12 * p - lift, 16 * p, 6 * p);
  ctx.fillStyle = "#ffe169";
  ctx.fillRect(x - 16 * p, y + 2 * p - lift, 6 * p, 4 * p);
  ctx.fillRect(x + 10 * p, y + 2 * p - lift, 6 * p, 4 * p);
  ctx.fillStyle = "#080b0e";
  ctx.fillRect(x - 20 * p, y + 10 * p - lift, 8 * p, 7 * p);
  ctx.fillRect(x + 12 * p, y + 10 * p - lift, 8 * p, 7 * p);
}

function projectObject(view, x, y) {
  const dx = x - view.x;
  const dy = y - view.y;
  const forward = dx * Math.cos(view.angle) + dy * Math.sin(view.angle);
  const lateral = -dx * Math.sin(view.angle) + dy * Math.cos(view.angle);
  if (forward < 15 || forward > 650) return null;
  const depth = 1 - forward / 650;
  const scale = 0.22 + depth * 1.05;
  return {
    x: 240 + lateral * scale * 0.72,
    y: 85 + depth * 142,
    scale,
    forward,
  };
}

function draw() {
  requestAnimationFrame(draw);
  if (!room || !["playing", "final"].includes(room.status)) return;
  const m = myMatch();
  const view = m?.cars[me.id];
  if (!m || !view) return;
  const now = Date.now();

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#35a7c8";
  ctx.fillRect(0, 0, 480, 88);
  ctx.fillStyle = "#f7cc59";
  ctx.fillRect(382, 18, 28, 28);
  ctx.fillStyle = "#9ad06d";
  ctx.fillRect(0, 70, 480, 78);

  const skyline = [28, 42, 33, 55, 38, 49, 31, 58, 40, 47, 35, 52];
  skyline.forEach((height, i) => {
    const x = i * 42 - 5;
    ctx.fillStyle = ["#ef6555", "#f2bb4c", "#4eb39f", "#d982aa"][i % 4];
    ctx.fillRect(x, 86 - height, 37, height);
    ctx.fillStyle = "#24313b";
    for (let wy = 0; wy < height - 10; wy += 12)
      ctx.fillRect(x + 6 + ((wy / 12) % 2) * 13, 82 - height + wy, 7, 6);
    ctx.fillStyle = "#fff0be";
    ctx.fillRect(x + 3, 83, 31, 5);
  });

  ctx.fillStyle = "#2e353b";
  ctx.beginPath();
  ctx.moveTo(202, 84);
  ctx.lineTo(278, 84);
  ctx.lineTo(470, 270);
  ctx.lineTo(10, 270);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#d9d0a8";
  ctx.beginPath();
  ctx.moveTo(195, 84);
  ctx.lineTo(202, 84);
  ctx.lineTo(10, 270);
  ctx.lineTo(0, 270);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(278, 84);
  ctx.lineTo(285, 84);
  ctx.lineTo(480, 270);
  ctx.lineTo(470, 270);
  ctx.closePath();
  ctx.fill();

  const phase = (now / 12 + Math.abs(view.speed) * 20) % 42;
  ctx.fillStyle = "#f3ce42";
  for (let i = 0; i < 7; i++) {
    const y = 92 + i * 27 + phase * (i / 9);
    const width = 2 + i * 2.2;
    ctx.fillRect(240 - width / 2, y, width, 8 + i * 2);
  }

  const visible = [];
  for (const o of m.obstacles) {
    if (o.hp <= 0) continue;
    const projected = projectObject(view, o.x, o.y);
    if (projected) visible.push({ type: "crate", ...projected, object: o });
  }
  const rivalId = m.ids.find((id) => id !== me.id);
  const rival = m.cars[rivalId];
  const rivalProjection = projectObject(view, rival.x, rival.y);
  if (rivalProjection)
    visible.push({ type: "rival", ...rivalProjection, object: rival });
  visible.sort((a, b) => b.forward - a.forward);

  for (const item of visible) {
    const size = Math.max(1, Math.round(item.scale * 2));
    if (item.type === "crate") {
      ctx.fillStyle = "#17120c88";
      ctx.fillRect(item.x - 9 * size, item.y + 5 * size, 18 * size, 4 * size);
      ctx.fillStyle = item.object.id % 3 ? "#a96835" : "#eda72f";
      ctx.fillRect(item.x - 8 * size, item.y - 8 * size, 16 * size, 15 * size);
      ctx.fillStyle = "#ffe29a";
      ctx.fillRect(item.x - 6 * size, item.y - size, 12 * size, 2 * size);
    } else {
      const airborne = now < item.object.jumpUntil;
      pixelCar(
        item.x,
        item.y,
        Math.max(0.6, item.scale),
        player(rivalId)?.color || "#e84d45",
        airborne,
      );
      ctx.fillStyle = "#10161d";
      ctx.fillRect(item.x - 30, item.y - 31, 60, 9);
      ctx.fillStyle = "#ff665c";
      ctx.fillRect(item.x - 29, item.y - 30, (58 * item.object.hp) / 100, 7);
    }
  }

  const jumping = now < view.jumpUntil;
  const jumpProgress = jumping ? 1 - (view.jumpUntil - now) / 650 : 0;
  const jumpLift = jumping ? Math.sin(jumpProgress * Math.PI) * 22 : 0;
  pixelCar(240, 230 - jumpLift, 2, player(me.id)?.color || "#49c4f5", jumping);

  if (now - view.lastHit < 180) {
    ctx.fillStyle = "#ffef8a55";
    ctx.fillRect(0, 0, 480, 270);
  }
  ctx.fillStyle = "#111820dd";
  ctx.fillRect(8, 8, 150, 43);
  ctx.fillStyle = "#ffc43d";
  ctx.font = "900 11px monospace";
  ctx.fillText("BAZAAR BRAWL", 16, 23);
  ctx.fillStyle = "#fff";
  ctx.font = "700 10px monospace";
  ctx.fillText(
    `${Math.ceil(view.hp)} HP  |  ${Math.ceil(Math.abs(view.speed) * 18)} KM/H`,
    16,
    40,
  );
  const jumpReady = now >= view.jumpCooldown;
  ctx.fillStyle = jumpReady ? "#45e58a" : "#dce4ea";
  ctx.fillText(jumpReady ? "[SPACE] JUMP READY" : "JUMP RECHARGING", 326, 20);
}
requestAnimationFrame(draw);
