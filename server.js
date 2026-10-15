import express from "express";
import http from "node:http";
import { Server } from "socket.io";
import crypto from "node:crypto";
const app = express();
app.use("/vendor/three", express.static("node_modules/three/build"));
app.use(express.static("public"));
app.get("/health", (_, res) => res.json({ ok: true }));
const httpServer = http.createServer(app),
  io = new Server(httpServer, { cors: { origin: "*" } });
const rooms = new Map();
const uid = () => crypto.randomBytes(6).toString("hex");
const questions = [
  [
    "Which city is known as the Pink City?",
    ["Jaipur", "Pune", "Lucknow", "Surat"],
    0,
  ],
  [
    "Who captained India in the 2011 Cricket World Cup final?",
    ["Virat Kohli", "MS Dhoni", "Rohit Sharma", "Kapil Dev"],
    1,
  ],
  [
    "Which Indian state is famous for Bihu?",
    ["Punjab", "Assam", "Goa", "Kerala"],
    1,
  ],
  [
    "What is the capital of Uttarakhand?",
    ["Dehradun", "Shimla", "Jaipur", "Bhopal"],
    0,
  ],
  [
    "Which river flows through Varanasi?",
    ["Yamuna", "Narmada", "Ganga", "Godavari"],
    2,
  ],
  ["What is the currency of India?", ["Taka", "Rupee", "Rial", "Baht"], 1],
  [
    "Which actor played Rancho in 3 Idiots?",
    ["Shah Rukh Khan", "Aamir Khan", "Salman Khan", "Ranbir Kapoor"],
    1,
  ],
  [
    "Which Indian city is called the City of Joy?",
    ["Kolkata", "Mumbai", "Chennai", "Indore"],
    0,
  ],
  [
    "Which sport uses the term googly?",
    ["Football", "Cricket", "Hockey", "Kabaddi"],
    1,
  ],
  [
    "Which monument is in Agra?",
    ["Qutub Minar", "India Gate", "Taj Mahal", "Charminar"],
    2,
  ],
  [
    "Where is the Golden Temple?",
    ["Patna", "Amritsar", "Delhi", "Ahmedabad"],
    1,
  ],
  [
    "Which state is associated with Kathakali?",
    ["Kerala", "Bihar", "Haryana", "Gujarat"],
    0,
  ],
  [
    "What is the capital of Rajasthan?",
    ["Jodhpur", "Jaipur", "Udaipur", "Ajmer"],
    1,
  ],
  [
    "Which city is known as the Silicon Valley of India?",
    ["Bengaluru", "Kanpur", "Kochi", "Nagpur"],
    0,
  ],
  [
    "Which festival is known as the festival of lights?",
    ["Holi", "Diwali", "Onam", "Baisakhi"],
    1,
  ],
  [
    "Who wrote the Indian national anthem?",
    ["Premchand", "Rabindranath Tagore", "R K Narayan", "Sarojini Naidu"],
    1,
  ],
  [
    "Which state is known for the Hornbill Festival?",
    ["Nagaland", "Tamil Nadu", "Odisha", "Maharashtra"],
    0,
  ],
  [
    "Which sea borders Mumbai?",
    ["Arabian Sea", "Red Sea", "Caspian Sea", "Black Sea"],
    0,
  ],
  [
    "Which Indian city is known for Charminar?",
    ["Hyderabad", "Jaipur", "Bhopal", "Patna"],
    0,
  ],
  [
    "Which team won the inaugural IPL season in 2008?",
    ["CSK", "Mumbai Indians", "Rajasthan Royals", "RCB"],
    2,
  ],
];
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
function arena(ids, round) {
  return {
    ids,
    round,
    phase: "drive",
    remaining: 180,
    quizClock: 25,
    quiz: null,
    quizId: 0,
    quizAnswers: {},
    quizStarted: 0,
    winner: null,
    obstacles: Array.from({ length: 18 }, (_, i) => ({
      id: i,
      x: 140 + (i % 6) * 125,
      y: 130 + Math.floor(i / 6) * 150,
      hp: i % 3 === 0 ? 25 : 12,
    })),
    cars: Object.fromEntries(
      ids.map((id, i) => [
        id,
        {
          x: i ? 740 : 160,
          y: i ? 430 : 160,
          angle: i ? Math.PI : 0,
          speed: 0,
          hp: 100,
          jumpUntil: 0,
          jumpCooldown: 0,
          correct: 0,
          inputs: {},
          lastHit: 0,
        },
      ]),
    ),
  };
}
function publicRoom(r) {
  return {
    code: r.code,
    host: r.host,
    players: r.players.map((p) => ({
      id: p.id,
      name: p.name,
      ready: p.ready,
      color: p.color,
      connected: p.connected,
      bot: !!p.bot,
    })),
    status: r.status,
    matches: r.matches.map((m) => ({
      ids: m.ids,
      round: m.round,
      phase: m.phase,
      remaining: Math.ceil(m.remaining),
      quiz: m.quiz
        ? {
            id: m.quizId,
            question: m.quiz[0],
            options: m.quiz[1],
            remaining: Math.max(
              0,
              Math.ceil(12 - (Date.now() - m.quizStarted) / 1000),
            ),
            answered: Object.keys(m.quizAnswers),
          }
        : null,
      winner: m.winner,
      obstacles: m.obstacles,
      cars: m.cars,
    })),
    champion: r.champion,
  };
}
function emit(r) {
  io.to(r.code).emit("state", publicRoom(r));
}
function fail(socket, msg) {
  socket.emit("errorMessage", msg);
}
function startMatch(r, ids, round) {
  r.matches.push(arena(ids, round));
}
function endMatch(r, m, winner) {
  m.winner = winner;
  m.phase = "ended";
  const semis = r.matches.filter((x) => x.round === 1);
  if (
    semis.length === 2 &&
    semis.every((x) => x.winner) &&
    !r.matches.some((x) => x.round === 2)
  ) {
    r.status = "finalReady";
  }
  if (m.round === 2) {
    r.champion = winner;
    r.status = "finished";
  }
}
function startQuiz(r, m) {
  m.phase = "quiz";
  m.quiz =
    questions[
      (m.quizId * 7 +
        (m.round === 2 ? 3 : 0) +
        (m.ids[0] === r.players[2]?.id ? 5 : 0)) %
        questions.length
    ];
  m.quizId++;
  m.quizAnswers = {};
  m.quizStarted = Date.now();
}
function finishQuiz(m) {
  for (const id of m.ids) {
    const a = m.quizAnswers[id],
      c = m.cars[id];
    if (a?.correct) {
      c.correct++;
      if (a.elapsed <= 5) c.hp = clamp(c.hp + 10, 0, 100);
    }
  }
  m.quiz = null;
  m.phase = "drive";
  m.quizClock = 25;
}
function collide(r, m, id, otherId, now) {
  const a = m.cars[id],
    b = m.cars[otherId],
    dx = b.x - a.x,
    dy = b.y - a.y,
    d = Math.hypot(dx, dy);
  if (d < 38 && d > 0) {
    const nx = dx / d,
      ny = dy / d,
      overlap = (38 - d) / 2;
    a.x -= nx * overlap;
    a.y -= ny * overlap;
    b.x += nx * overlap;
    b.y += ny * overlap;
    if (now - Math.max(a.lastHit, b.lastHit) > 750) {
      const impact =
        Math.abs(a.speed - b.speed) + Math.abs(a.speed) + Math.abs(b.speed);
      if (impact > 1.4) {
        const dmg = clamp(Math.round(impact * 2), 3, 20);
        a.hp = clamp(a.hp - Math.ceil(dmg / 2), 0, 100);
        b.hp = clamp(b.hp - dmg, 0, 100);
        a.lastHit = b.lastHit = now;
      }
    }
    a.speed *= -0.4;
    b.speed *= -0.4;
  }
}
function jump(m, id, now) {
  const c = m.cars[id];
  if (!c || now < c.jumpCooldown) return;
  c.jumpUntil = now + 650;
  c.jumpCooldown = now + 2400;

  const other = m.cars[m.ids.find((x) => x !== id)];
  const dx = other.x - c.x;
  const dy = other.y - c.y;
  const distance = Math.hypot(dx, dy);
  if (distance > 125 || distance === 0) return;

  const force = 95 * (1 - distance / 180);
  other.x = clamp(other.x + (dx / distance) * force, 35, 865);
  other.y = clamp(other.y + (dy / distance) * force, 35, 565);
  other.speed = clamp(other.speed - 4.5, -5.2, 5.2);
  other.hp = clamp(other.hp - Math.round(4 + force / 18), 0, 100);
  other.lastHit = now;
}
function botTurn(r, m, id, now) {
  const p = r.players.find((x) => x.id === id);
  if (!p?.bot) return;
  const c = m.cars[id],
    opponent = m.cars[m.ids.find((x) => x !== id)];
  if (!c || !opponent) return;
  const desired = Math.atan2(opponent.y - c.y, opponent.x - c.x);
  let turn = ((desired - c.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  c.inputs = { up: true, down: false, left: turn < -0.12, right: turn > 0.12 };
  if (Math.hypot(opponent.x - c.x, opponent.y - c.y) < 105) jump(m, id, now);
}
function botQuiz(r, m, now) {
  for (const id of m.ids) {
    const p = r.players.find((x) => x.id === id);
    if (!p?.bot || m.quizAnswers[id]) continue;
    const delay = 900 + (parseInt(id.slice(0, 4), 16) % 2600);
    if (now - m.quizStarted < delay) continue;
    const correct = Math.random() < 0.72;
    m.quizAnswers[id] = { correct, elapsed: (now - m.quizStarted) / 1000 };
  }
}
function update(r, dt) {
  if (!["playing", "final"].includes(r.status)) return;
  const now = Date.now();
  for (const m of r.matches) {
    if (m.phase === "ended") continue;
    if (m.phase === "quiz") {
      botQuiz(r, m, now);
      if (
        now - m.quizStarted >= 12000 ||
        Object.keys(m.quizAnswers).length === 2
      )
        finishQuiz(m);
      continue;
    }
    m.remaining -= dt;
    m.quizClock -= dt;
    for (const id of m.ids) {
      botTurn(r, m, id, now);
      const c = m.cars[id],
        input = c.inputs || {},
        airborne = now < c.jumpUntil;
      const acceleration = airborne ? 8.5 : 7;
      c.speed = clamp(
        c.speed +
          (input.up ? acceleration * dt : 0) -
          (input.down ? 9 * dt : 0),
        -2.2,
        airborne ? 6.2 : 5.2,
      );
      if (!input.up && !input.down) c.speed *= Math.pow(0.89, dt * 30);
      if (input.left) c.angle -= 2.7 * dt * (c.speed < 0 ? -1 : 1);
      if (input.right) c.angle += 2.7 * dt * (c.speed < 0 ? -1 : 1);
      c.x += Math.cos(c.angle) * c.speed * dt * 32;
      c.y += Math.sin(c.angle) * c.speed * dt * 32;
      if (c.x < 35 || c.x > 865 || c.y < 35 || c.y > 565) {
        c.x = clamp(c.x, 35, 865);
        c.y = clamp(c.y, 35, 565);
        if (Math.abs(c.speed) > 1.6 && now - c.lastHit > 750) {
          c.hp = clamp(
            c.hp - clamp(Math.round(Math.abs(c.speed) * 1.3), 3, 10),
            0,
            100,
          );
          c.lastHit = now;
        }
        c.speed *= -0.3;
      }
      for (const o of m.obstacles) {
        if (o.hp <= 0) continue;
        const d = Math.hypot(c.x - o.x, c.y - o.y);
        if (d < 30) {
          if (now - c.lastHit > 600 && Math.abs(c.speed) > 1) {
            o.hp = clamp(o.hp - Math.round(Math.abs(c.speed) * 5), 0, 25);
            c.hp = clamp(
              c.hp - clamp(Math.round(Math.abs(c.speed)), 1, 4),
              0,
              100,
            );
            c.lastHit = now;
          }
          c.speed *= -0.45;
        }
      }
    }
    collide(r, m, m.ids[0], m.ids[1], now);
    const [a, b] = m.ids;
    if (m.cars[a].hp <= 0 || m.cars[b].hp <= 0) {
      endMatch(
        r,
        m,
        m.cars[a].hp > m.cars[b].hp
          ? a
          : m.cars[b].hp > m.cars[a].hp
            ? b
            : m.cars[a].correct >= m.cars[b].correct
              ? a
              : b,
      );
      continue;
    }
    if (m.remaining <= 0) {
      const ca = m.cars[a],
        cb = m.cars[b];
      if (ca.hp !== cb.hp || ca.correct !== cb.correct) {
        endMatch(
          r,
          m,
          ca.hp > cb.hp || (ca.hp === cb.hp && ca.correct > cb.correct) ? a : b,
        );
      } else {
        m.remaining = 15;
        startQuiz(r, m);
        m.sudden = true;
      }
      continue;
    }
    if (m.quizClock <= 0) startQuiz(r, m);
  }
}
io.on("connection", (socket) => {
  socket.on("join", ({ code, name, token } = {}) => {
    name =
      String(name || "Driver")
        .trim()
        .slice(0, 18) || "Driver";
    let r;
    if (code) {
      r = rooms.get(String(code).toUpperCase());
      if (!r) return fail(socket, "Room not found");
    } else {
      let c;
      do {
        c = crypto.randomBytes(3).toString("hex").toUpperCase();
      } while (rooms.has(c));
      r = {
        code: c,
        players: [],
        host: null,
        status: "lobby",
        matches: [],
        champion: null,
      };
      rooms.set(c, r);
    }
    let p = token && r.players.find((x) => x.token === token);
    if (!p) {
      if (r.status !== "lobby" || r.players.length >= 4)
        return fail(socket, "Room is full or already started");
      p = {
        id: uid(),
        token: uid(),
        name,
        ready: false,
        color: ["#e84d45", "#49c4f5", "#ffce45", "#9a7cf6"][r.players.length],
        connected: true,
      };
      r.players.push(p);
      if (!r.host) r.host = p.id;
    }
    p.connected = true;
    socket.data = { room: r.code, id: p.id };
    socket.join(r.code);
    socket.emit("joined", { code: r.code, id: p.id, token: p.token });
    emit(r);
  });
  socket.on("ready", (ready) => {
    const r = rooms.get(socket.data?.room),
      p = r?.players.find((x) => x.id === socket.data.id);
    if (!p || r.status !== "lobby") return;
    p.ready = !!ready;
    emit(r);
  });
  socket.on("addBots", () => {
    const r = rooms.get(socket.data?.room);
    if (!r || r.host !== socket.data.id || r.status !== "lobby") return;
    const names = ["Auto Anna", "Turbo Tara", "Nitro Nikhil"];
    while (r.players.length < 4) {
      const i = r.players.length;
      r.players.push({
        id: uid(),
        token: null,
        name: names[i - 1] || "Bot " + i,
        ready: true,
        color: ["#e84d45", "#49c4f5", "#ffce45", "#9a7cf6"][i],
        connected: true,
        bot: true,
      });
    }
    emit(r);
  });
  socket.on("start", () => {
    const r = rooms.get(socket.data?.room);
    if (
      !r ||
      r.host !== socket.data.id ||
      r.status !== "lobby" ||
      r.players.length !== 4 ||
      !r.players.every((p) => p.ready)
    )
      return;
    r.status = "playing";
    startMatch(r, [r.players[0].id, r.players[1].id], 1);
    startMatch(r, [r.players[2].id, r.players[3].id], 1);
    emit(r);
  });
  socket.on("startFinal", () => {
    const r = rooms.get(socket.data?.room);
    if (!r || r.host !== socket.data.id || r.status !== "finalReady") return;
    const winners = r.matches.filter((m) => m.round === 1).map((m) => m.winner);
    r.status = "final";
    startMatch(r, winners, 2);
    emit(r);
  });
  socket.on("input", (data) => {
    const r = rooms.get(socket.data?.room);
    if (!r) return;
    const m = r.matches.find(
      (x) => x.phase === "drive" && x.ids.includes(socket.data.id) && !x.winner,
    );
    if (!m) return;
    const c = m.cars[socket.data.id];
    c.inputs = {
      up: !!data?.up,
      down: !!data?.down,
      left: !!data?.left,
      right: !!data?.right,
    };
    if (data?.jump) jump(m, socket.data.id, Date.now());
  });
  socket.on("answer", ({ questionId, index } = {}) => {
    const r = rooms.get(socket.data?.room);
    if (!r) return;
    const m = r.matches.find(
      (x) => x.phase === "quiz" && x.ids.includes(socket.data.id),
    );
    if (
      !m ||
      m.quizId !== questionId ||
      m.quizAnswers[socket.data.id] ||
      !Number.isInteger(index) ||
      index < 0 ||
      index > 3
    )
      return;
    const elapsed = (Date.now() - m.quizStarted) / 1000;
    if (elapsed > 12) return;
    m.quizAnswers[socket.data.id] = { correct: index === m.quiz[2], elapsed };
    emit(r);
  });
  socket.on("disconnect", () => {
    const r = rooms.get(socket.data?.room),
      p = r?.players.find((x) => x.id === socket.data.id);
    if (p) {
      p.connected = false;
      p.disconnectedAt = Date.now();
      emit(r);
    }
  });
});
let last = Date.now();
setInterval(() => {
  const now = Date.now(),
    dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  for (const r of rooms.values()) {
    if (["playing", "final"].includes(r.status)) {
      for (const m of r.matches) {
        if (m.phase === "ended") continue;
        for (const id of m.ids) {
          const p = r.players.find((x) => x.id === id);
          if (p && !p.connected && now - p.disconnectedAt > 30000) {
            endMatch(
              r,
              m,
              m.ids.find((x) => x !== id),
            );
            break;
          }
        }
      }
      update(r, dt);
      emit(r);
    }
  }
}, 50);
const port = process.env.PORT || 3000;
httpServer.listen(port, () =>
  console.log(`Gully Wars on http://localhost:${port}`),
);
