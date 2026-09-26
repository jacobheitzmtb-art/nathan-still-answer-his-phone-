# Hosting Reel Fetch

## What you need

A Linux VPS or container host with Docker Compose, a domain pointing at it, and inbound ports 80/443 open. Start with 2 CPU cores, 2 GB RAM, and at least 25 GB free disk; monitor disk and resource use. Downloads require outgoing HTTPS access to Instagram/Meta. Static-only hosting cannot run this backend.

The configuration runs one Node/Python/FFmpeg container behind Caddy, which obtains and renews HTTPS certificates. The app port is not published to the Internet. Temporary media and certificates use Docker volumes.

## Deploy

1. Extract the ZIP and upload the `reel-fetch` directory to your server.
2. Point your domain's DNS A record at the server. Set an AAAA record only if IPv6 works.
3. Copy `.env.example` to `.env`. Fill in `SITE_DOMAIN` (for example `reels.example.com`, without `https://`), your real operator name, working contact/copyright mailboxes, and `HOSTING_DESCRIPTION` describing the hosting provider/location and any additional logs or retention. Quote values containing spaces or `#`.
4. In that directory, run:

```sh
docker compose up -d --build
docker compose ps
docker compose logs --tail=50 app caddy
```

5. Open `https://YOUR_DOMAIN`, review the policies and contact details, and test a video you are permitted to download. Check preview, video and audio downloads from a second device.

Compose requires the operator settings before it starts. Caddy needs working public DNS and ports 80/443 for its certificate. Caddy access logs are disabled by default; your hosting provider may have its own logs. Do not place another CDN/proxy in front without revisiting client-IP handling and privacy disclosures.

## Other Node/container hosting

Build using the Dockerfile and set `NODE_ENV=production`, `PUBLIC_ORIGIN=https://your-domain.example`, `BIND_HOST=0.0.0.0`, the operator/contact/hosting variables from `.env.example`, and `PORT` if your provider requires a different port. Route HTTPS requests to that port and preserve the public Host header. Provide writable disk at `/app/.cache` and allow native subprocesses with processing times up to eight minutes.

Set `TRUST_PROXY=1` only if requests must pass through a trusted reverse proxy that appends the real client IP to `X-Forwarded-For`, and clients cannot reach the backend directly. The included Compose network satisfies that topology. Otherwise leave it unset. Keep Host/Origin validation enabled.

Without Docker, install Node 22+, Python 3.10+, FFmpeg and the pinned requirements, then run `npm start` with the same production environment behind an HTTPS reverse proxy. Run as a dedicated unprivileged user. Use a service manager to restart the process.

## Operations

- Health endpoint: `/api/health`. It confirms the web process is alive, not that Instagram currently allows retrieval.
- Restart: `docker compose restart app`. Stop without erasing volumes: `docker compose down`.
- Update source or requirements, then run `docker compose up -d --build`. Rebuild periodically for OS security updates. Test extractor upgrades with authorized content.
- Temporary media cleanup runs every minute while the app is running. Monitor the cache volume and provision enough disk. Never publish `/app/.cache` as a static directory or disable egress restrictions.
- Add reviewed post shortcodes to `BLOCKED_SHORTCODES`, then recreate the app with `docker compose up -d`. Restart clears existing in-memory sessions; source files are cleaned after expiry.
- The limiter and job state are in one process. Use one app replica. Larger services need shared state, fair queuing, additional abuse protection, and aggregate disk quotas.
- Complete your operator policies and any jurisdiction-specific requirements before launch. Public access is not proof of permission. This package never uses Instagram credentials or bypasses access restrictions.

## Verification scope

The source app and real download flow were tested locally. Docker was unavailable on the development machine, so the container image and public HTTPS deployment still need a smoke test on your chosen host. Hosting-provider IP restrictions may differ from a local connection.
