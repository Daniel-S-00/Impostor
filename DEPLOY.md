# Deployment

Two ways to put this game on the public internet so friends can join from
anywhere.

## 1. Render (recommended for a permanent URL)

Render is a PaaS that runs long-lived Node services. The free tier is enough
for a party game.

### How `render.yaml` works

`render.yaml` is a **declarative infrastructure file** that Render reads when
you create or update a service. It describes the service in plain YAML so the
setup is reproducible, version-controlled, and reviewable in a PR.

Each field in our `render.yaml`:

| Field | Meaning |
|---|---|
| `type: web` | A long-running HTTP/WebSocket service (vs. `static` or `cron`). |
| `runtime: node` | The platform family. Render auto-detects this; we set it explicitly. |
| `plan: free` | Use the free tier. Spins down after 15 min idle; spins back up on first request. |
| `rootDir: server` | The subdirectory that contains `package.json`. |
| `buildCommand: npm install` | Runs once, before start, in the build environment. |
| `startCommand: npm start` | Runs the server. `process.env.PORT` is set by Render automatically. |
| `healthCheckPath: /` | Render pings this path to know the service is alive. |
| `autoDeploy: true` | Re-deploy automatically on every push to the connected branch. |
| `envVars[0].key: NODE_VERSION` | Pins Node 20 in the build environment. |

When you click **New Blueprint Instance** on Render and point it at the repo,
Render reads this file and provisions the service with those exact settings.
The free tier is fine for testing; upgrade to a paid plan for always-on.

### Step-by-step

1. **Push to GitHub.** Create a repo and push the project folder.
   ```powershell
   cd C:\Users\Silent\Code\Impostor-online
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin master
   ```

2. **Sign in to Render** at <https://render.com> (GitHub login is easiest).

3. **New → Blueprint.** Pick your repo. Render reads `render.yaml` and shows
   the service it will create.

4. **Apply.** Render builds (`npm install`) and starts the service. When the
   logs show `Impostor server running on http://localhost:10000` (Render's
   internal port), the service is live.

5. **Open the public URL** Render gives you (e.g.
   `https://impostor-online.onrender.com`). Share it with friends.

6. **Subsequent deploys** are automatic — just `git push`.

### Free tier caveats

- Service sleeps after 15 minutes of no traffic. First request after a sleep
  takes ~30 seconds while it spins back up. For an always-on game, upgrade to
  the $7/month Starter plan.
- In-memory rooms are lost when the service restarts. Anyone in a game when
  it spins down will need to re-create or rejoin the room.

---

## 2. Cloudflare Tunnel (testing with friends in minutes)

Best for "let's play this tonight" — run the server on your laptop, expose it
to the internet through Cloudflare's edge. No deploy, no account needed for a
quick tunnel.

### How it works (and why your IP is safe)

Your machine opens an **outbound** connection to Cloudflare's edge. Cloudflare
gives you a public URL (e.g. `https://random-word.trycloudflare.com`). When
your friends open that URL:

```
friend → Cloudflare edge → (tunnel) → your machine:3000
```

- Your real IP is never in the URL and never sent to the client.
- The connection from your machine to Cloudflare is outbound, so you don't
  need to open ports on your router or have a public IP.
- The connection from friend to Cloudflare is over HTTPS / WSS, end-to-end
  encrypted by Cloudflare.

### Quick tunnel (no account)

1. **Install `cloudflared`.**
   - Windows: <https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/>
   - Or via `winget`:
     ```powershell
     winget install Cloudflare.cloudflared
     ```

2. **Start the game server** in one terminal:
   ```powershell
   cd C:\Users\Silent\Code\Impostor-online\server
   npm start
   ```

3. **Start the tunnel** in another terminal:
   ```powershell
   cloudflared tunnel --url http://localhost:3000
   ```

4. Cloudflare prints a URL like `https://impostor-xyz.trycloudflare.com`.
   Share that URL with friends. They open it in any browser — Socket.IO
   auto-connects to the same origin.

5. To stop, Ctrl-C the tunnel and the server. The URL is gone.

### Named tunnel (free account, persistent URL)

1. Sign in to the Cloudflare dashboard at <https://one.dash.cloudflare.com>.
2. **Networks → Tunnels → Create a tunnel.** Pick a name (e.g. `impostor`).
3. Run the `cloudflared` command Cloudflare gives you. It runs as a service
   on your machine.
4. In the tunnel config, route a public hostname (e.g.
   `impostor.yourdomain.com`) to `http://localhost:3000`.
5. Now you have a stable URL that survives restarts.

### Caveats

- The laptop running the server must be awake and online for anyone to play.
- Quick-tunnel URLs are random and change every time you start a new tunnel.
- Cloudflare free tier is generous; for a regular game night this is plenty.

---

## 3. Other options (in one line each)

- **Railway** — like Render, slightly faster free tier ($5/month credit), same setup.
- **Fly.io** — global edge, WebSockets work, more setup.
- **ngrok** — like Cloudflare quick tunnel, but with a monthly bandwidth cap on the free plan.
- **VPS** (Hetzner / DigitalOcean / OVH) — $4–6/month, run `node index.js` behind nginx + Let's Encrypt, full control. Most reliable for "always on" hosting.

---

## Production hardening (do this before opening to the public)

The current setup is fine for friends. For a public deployment, also:

- Set Socket.IO CORS to a specific origin (currently open).
  ```js
  // in server/index.js
  const io = new Server(server, { cors: { origin: "https://impostor-online.onrender.com" } });
  ```
- Add reconnection logic for players who briefly lose their connection.
- Replace in-memory `rooms` with a persistent store (SQLite, Redis) so games
  survive restarts.
- Add CAPTCHA or similar on `createRoom` to deter scripted abuse.
