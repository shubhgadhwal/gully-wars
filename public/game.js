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
function draw() {
  requestAnimationFrame(draw);
  if (!room || !["playing", "final"].includes(room.status)) return;
  const m = myMatch();
  if (!m) return;
  const now = Date.now();
  const road = ctx.createLinearGradient(0, 0, 0, 600);
  road.addColorStop(0, "#343b42");
  road.addColorStop(0.5, "#252c32");
  road.addColorStop(1, "#30373d");
  ctx.fillStyle = "#778c69";
  ctx.fillRect(0, 0, 900, 600);
  ctx.fillStyle = road;
  ctx.fillRect(58, 0, 784, 600);
  ctx.fillRect(0, 76, 900, 448);

  ctx.strokeStyle = "#151a1e";
  ctx.lineWidth = 8;
  ctx.strokeRect(62, 80, 776, 440);
  ctx.strokeStyle = "#f2c84b";
  ctx.lineWidth = 3;
  ctx.setLineDash([34, 24]);
  ctx.beginPath();
  ctx.moveTo(450, 0);
  ctx.lineTo(450, 600);
  ctx.moveTo(0, 300);
  ctx.lineTo(900, 300);
  ctx.stroke();
  ctx.setLineDash([]);

  for (let i = 0; i < 12; i++) {
    const x = (i % 6) * 150 + 12;
    const y = i < 6 ? 8 : 544;
    ctx.fillStyle = "#11161b55";
    ctx.fillRect(x + 6, y + 7, 126, 48);
    ctx.fillStyle = ["#ee6b4d", "#f1c75b", "#4fb6a8", "#db8cb3"][i % 4];
    ctx.fillRect(x, y, 126, 48);
    ctx.fillStyle = "#26313a";
    ctx.fillRect(x + 7, y + 29, 112, 15);
    ctx.fillStyle = "#fff3d1";
    ctx.font = "800 11px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(["CHAI STOP", "KIRANA", "PANI PURI", "AUTO WORKS"][i % 4], x + 63, y + 20);
  }

  ctx.fillStyle = "#f6f1df";
  for (let x = 78; x < 840; x += 48) {
    ctx.fillRect(x, 86, 27, 6);
    ctx.fillRect(x, 508, 27, 6);
  }
  for (const o of m.obstacles) {
    if (o.hp <= 0) continue;
    ctx.fillStyle = "#080b0d66";
    ctx.beginPath();
    ctx.ellipse(o.x + 4, o.y + 10, 19, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = o.id % 3 === 0 ? "#f3a928" : "#a96f3f";
    ctx.fillRect(o.x - 16, o.y - 14, 32, 27);
    ctx.strokeStyle = "#47301d";
    ctx.lineWidth = 3;
    ctx.strokeRect(o.x - 16, o.y - 14, 32, 27);
    ctx.strokeStyle = "#ffe091";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(o.x - 13, o.y - 8);
    ctx.lineTo(o.x + 13, o.y + 7);
    ctx.moveTo(o.x + 13, o.y - 8);
    ctx.lineTo(o.x - 13, o.y + 7);
    ctx.stroke();
  }
  for (const id of m.ids) {
    const c = m.cars[id];
    const airborne = now < c.jumpUntil;
    const jumpProgress = airborne ? 1 - (c.jumpUntil - now) / 650 : 0;
    const lift = airborne ? Math.sin(jumpProgress * Math.PI) * 22 : 0;
    ctx.save();
    ctx.translate(c.x + 5, c.y + 8);
    ctx.rotate(c.angle);
    ctx.scale(1 - lift / 120, 1 - lift / 120);
    ctx.fillStyle = `rgba(0,0,0,${airborne ? 0.2 : 0.48})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, 28, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(c.x, c.y - lift);
    ctx.rotate(c.angle);
    ctx.fillStyle = "#090c0f";
    ctx.fillRect(-23, -18, 46, 8);
    ctx.fillRect(-23, 10, 46, 8);
    ctx.fillStyle = player(id)?.color || "#fff";
    ctx.beginPath();
    ctx.roundRect(-24, -15, 48, 30, 8);
    ctx.fill();
    ctx.fillStyle = "#b9ecf6";
    ctx.beginPath();
    ctx.roundRect(-5, -12, 17, 24, 5);
    ctx.fill();
    ctx.fillStyle = "#fff0a8";
    ctx.fillRect(18, -11, 6, 7);
    ctx.fillRect(18, 4, 6, 7);
    ctx.fillStyle = "#f04438";
    ctx.fillRect(-24, -11, 5, 7);
    ctx.fillRect(-24, 4, 5, 7);
    ctx.strokeStyle = "#ffffffbb";
    ctx.lineWidth = 2;
    ctx.strokeRect(-14, -12, 6, 24);
    ctx.restore();
    ctx.font = "800 13px system-ui";
    ctx.textAlign = "center";
    ctx.fillStyle = "#10151b";
    ctx.fillRect(c.x - 35, c.y - 48 - lift, 70, 18);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(player(id)?.name || "Car", c.x, c.y - 35 - lift);
    ctx.fillStyle = "#111";
    ctx.fillRect(c.x - 30, c.y - 27 - lift, 60, 6);
    ctx.fillStyle = c.hp > 40 ? "#55db75" : "#ff544a";
    ctx.fillRect(c.x - 30, c.y - 27 - lift, (60 * c.hp) / 100, 6);
  }
  ctx.textAlign = "left";
  ctx.fillStyle = "#11171d";
  ctx.fillRect(14, 108, 188, 38);
  ctx.fillStyle = "#ffc43d";
  ctx.font = "900 16px system-ui";
  ctx.fillText("DELHI BAZAAR BRAWL", 26, 133);
  const c = m.cars[me.id];
  if (c) {
    const ready = now >= c.jumpCooldown;
    ctx.fillStyle = ready ? "#50d890" : "#ffffff";
    ctx.font = "800 13px system-ui";
    ctx.fillText(ready ? "SPACE: JUMP READY" : "JUMP RECHARGING", 26, 164);
  }
}
requestAnimationFrame(draw);
