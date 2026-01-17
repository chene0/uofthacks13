const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");

const PORT = Number(process.env.PORT) || 3000;
const SWAP_INTERVAL_MS = Number(process.env.SWAP_INTERVAL_MS) || 15_000;

// Server-side backstop URL filtering (extension also filters).
const BANNED_SUBSTRINGS = [
  "chrome://",
  "chrome-extension://",
  "localhost",
  "127.0.0.1",
  "accounts.google.com",
];

function isHttpUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}

function isBannedUrl(url) {
  if (typeof url !== "string") return true;
  const lower = url.toLowerCase();
  return BANNED_SUBSTRINGS.some((s) => lower.includes(s));
}

function isValidPlayableUrl(url) {
  return isHttpUrl(url) && !isBannedUrl(url);
}

function shuffleInPlace(arr) {
  // Fisher-Yates
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const app = express();
app.use(cors());

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    name: "uofthacks13-server",
    connectedUsers: users.size,
  });
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

/**
 * Map<socketId, { currentUrl: string|null, isReady: boolean, lastSeen: number }>
 */
const users = new Map();

io.on("connection", (socket) => {
  console.log(`[connect] ${socket.id}`);

  users.set(socket.id, {
    currentUrl: null,
    isReady: true,
    lastSeen: Date.now(),
  });

  socket.on("update_url", (payload) => {
    const url = typeof payload === "string" ? payload : payload?.url;
    if (typeof url !== "string") return;

    const trimmed = url.trim();
    const state = users.get(socket.id);
    if (!state) return;

    state.lastSeen = Date.now();

    if (!isHttpUrl(trimmed)) return;
    if (isBannedUrl(trimmed)) {
      console.log(`[banned_url] from=${socket.id} url=${trimmed}`);
      return;
    }

    state.currentUrl = trimmed;
  });

  socket.on("disconnect", (reason) => {
    console.log(`[disconnect] ${socket.id} (${reason})`);
    users.delete(socket.id);
  });
});

setInterval(() => {
  const eligible = [];
  for (const [socketId, state] of users.entries()) {
    if (!state?.isReady) continue;
    if (!isValidPlayableUrl(state.currentUrl)) continue;
    eligible.push(socketId);
  }

  if (eligible.length < 2) return;

  shuffleInPlace(eligible);

  for (let i = 0; i + 1 < eligible.length; i += 2) {
    const a = eligible[i];
    const b = eligible[i + 1];

    const urlA = users.get(a)?.currentUrl;
    const urlB = users.get(b)?.currentUrl;

    // Extra safety: ensure we never emit a banned URL even if state got stale.
    if (!isValidPlayableUrl(urlA) || !isValidPlayableUrl(urlB)) continue;

    io.to(a).emit("force_swap", { url: urlB, partnerId: b });
    io.to(b).emit("force_swap", { url: urlA, partnerId: a });
    console.log(`[swap] ${a} <-> ${b}`);
  }

  if (eligible.length % 2 === 1) {
    console.log(`[safe] ${eligible[eligible.length - 1]} (odd user out)`);
  }
}, SWAP_INTERVAL_MS);

server.listen(PORT, () => {
  console.log(`uofthacks13-server listening on http://localhost:${PORT}`);
  console.log(`swap interval: ${SWAP_INTERVAL_MS}ms`);
});

