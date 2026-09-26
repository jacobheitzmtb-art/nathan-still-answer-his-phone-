# Reel Fetch

A responsive Instagram video downloader with a real Node backend, yt-dlp public-link extraction, and FFmpeg processing. No npm dependencies, accounts, analytics, external fonts, or ad scripts.

## Host the website

See [DEPLOY.md](DEPLOY.md) for the included Docker Compose + Caddy HTTPS setup. This is a server application: static hosting alone cannot run downloads. The ZIP includes source code and installation configuration, not downloaded videos, credentials, or machine-specific executables.

## Run locally

Install Node 22+, Python 3.10+, and FFmpeg. From this directory run:

    python -m pip install --target .vendor -r requirements.txt
    npm start

Open http://127.0.0.1:4178. If needed, copy .env.example to .env and set PYTHON and FFMPEG_PATH to your executable paths. Leave production settings unset for local use.

## Downloads and performance

- Accepts public Instagram post, reel, reels, and tv links; strips tracking parameters. No credentials, private-account access, login automation, or access-control bypass.
- Best available preserves the highest advertised resolution, prioritizing bitrate when equal. Available separate audio is merged into video.
- Native 1080p/720p/360p streams are packaged without video re-encoding. When a requested size is unavailable, FFmpeg creates it using H.264/AAC. No upscaling; resolution refers to the shorter dimension.
- MP3 exports use 192 kbps. Audio-only downloads retrieve a separate audio stream when available, avoiding unnecessary video transfer.
- Source transfers and identical jobs are reused within a session. Resolved link metadata is cached for 90 seconds. The browser checks preparation every 300 ms.
- Adds no watermark; does not remove existing marks. Carousels use their first video. Stories, profiles, private and login-required content are unsupported.
- Videos are limited to 20 minutes and individual media inputs/outputs to 250 MB. Two concurrent searches and two processing jobs; 30 active source sessions and 60 jobs. The in-memory limiter permits 20 POSTs per client per minute.
- Temporary sources expire 30 minutes after the session's latest processing attempt; finished outputs expire 30 minutes after preparation. Cleanup runs each minute. Files can remain on disk while the server is stopped and are cleaned on restart after expiry. No public archive is created.

## Checks

    npm run check
    npm test

With the server running:

    node test/verify-http.mjs
    node test/verify-downloads.mjs https://www.instagram.com/reel/YOUR_AUTHORIZED_POST/
    node test/benchmark.mjs https://www.instagram.com/reel/YOUR_AUTHORIZED_POST/ benchmark.json

Live verification checks every available export, actual dimensions and audio streams, and partial downloads. Development artifacts are written to .cache/verification; remove them after testing. Benchmark results depend on source, connection, and server.

## Security and operating limits

The app validates URL, Host, and Origin, caps request bodies and concurrency, uses opaque file IDs, and limits media egress to validated Instagram/Meta CDN domains. It checks redirects and DNS results, pins public IPs, and passes only local paths to FFmpeg. Client IPs are held briefly in memory for rate limiting, with no application access log.

This package targets one small server instance. Before scaling, add a shared job queue, shared rate limiter, aggregate disk quotas, and abuse monitoring. Maintain the extractor and OS packages. Instagram can change or block extraction, including hosting-provider IP addresses; public links do not guarantee retrieval.

Pages include terms, privacy, copyright, contact, disclaimer, sitemap and robots.txt. Local previews are noindex. Public deployments use configured operator details. Policies are drafts for the operator to complete, not legal certification. Only download content you are entitled to save and follow applicable platform rules.
