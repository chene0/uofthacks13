# DEMO: https://youtu.be/QTjzPNiiu8w

# Uofthacks13 — flashbang (Chrome Extension + Node Backend)

Don't be the face of procrastination.

# Description

flashbang is a productivity tool operating based off public humiliation. Unlike standard blockers that simply restrict access, flashbang introduces "high stakes" to your browsing habits.

It silently monitors your activity on blacklisted sites (like YouTube, Twitter, and Netflix). As you procrastinate, a "shame meter" charges up. If you ignore the ominous warnings and hit 100%, the extension triggers The Protocol: it hijacks your webcam to take a mugshot, captures your current URL, and broadcasts your identity to a random active user on the network.

It is crowdsourced accountability powered by the fear of being exposed.

# Our inspiration

Last week, I had a calculus midterm the next morning. I sat down at 8:00 PM with a coffee, ready to grind. I installed a website blocker. I put my phone in another room. I was ready.

Fast forward to 3:00 AM. I wasn't doing calculus. I was five hours deep into a YouTube rabbit hole watching videos of a hydraulic press crushing gummy bears.

I realized something in that moment: Willpower is a lie. Existing productivity tools are too polite. They just say 'Access Denied' and let you turn them off. They treat you like an adult. But at 3 AM on a Tuesday, I am not an adult. I am a dopamine addict looking for a fix.

I asked myself: What is the only thing stronger than my desire to procrastinate? The fear of public humiliation.

We all have that deep, primal fear of accidentally screen-sharing the wrong tab during a Zoom call. That heart-stopping panic is the most powerful motivator on earth. So, we decided to bottle that panic and turn it into a productivity tool.

We built flashbang. It is not a productivity tool; it is a social experiment.

It operates on the principle of Mutually Assured Destruction. We don't just block your screen when you slack off. We wait. We let you dig your own grave. And when you’ve wasted too much time... FLASH. We take your mugshot, capture your screen, and broadcast your shame to a random stranger on the internet.

We built this because we believe that if you aren't disciplined enough to work for yourself, maybe you'll work to avoid becoming a meme for someone else.

## Repo layout
- `server/`: Node.js + Express + Socket.io backend
- `extension/`: Chrome extension (Manifest V3)
  - `lib/socket.io-client.min.js`: **you must provide this file locally**

## Prereqs
- Node.js 18+ (tested with Node 22)
- `pnpm`
- Chrome (or Chromium) with Developer Mode enabled

## Run the backend

```bash
cd server
pnpm install
pnpm dev
```

Server runs at `http://localhost:3000`.

## Set up the extension
1. Put your Socket.io client bundle here:
   - `extension/lib/socket.io-client.min.js`
   - It must define global `io` (the service worker loads it via `importScripts()`).
2. (Optional) Edit `extension/config.js` to point to your deployed server:
   ```js
   SERVER_URL: "https://your-app.onrender.com",
   ```
3. In Chrome, open `chrome://extensions`.
4. Enable **Developer mode**.
5. Click **Load unpacked** → select the `extension/` folder.

## Safety filters (MVP)
The extension will **never send or accept** URLs containing:
- `chrome://`
- `chrome-extension://`
- `localhost`
- `127.0.0.1`
- `accounts.google.com`
- `file://`

The server also applies the same filtering as a backstop.
