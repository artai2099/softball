# Vercel + LiveKit video setup

The browser must receive a public secure WebSocket URL for LiveKit. A URL such as `wss://localhost:7880` points to the computer running the browser, not the server that hosts your Vercel application. LiveKit's production deployment guidance uses a public `wss://` endpoint with a trusted TLS certificate.

## Vercel production variables

In Vercel, open **Project → Settings → Environment Variables** and configure these for **Production**:

```text
LIVEKIT_URL=wss://YOUR_PUBLIC_LIVEKIT_HOST
LIVEKIT_PUBLIC_URL=wss://YOUR_PUBLIC_LIVEKIT_HOST
LIVEKIT_API_KEY=YOUR_LIVEKIT_API_KEY
LIVEKIT_API_SECRET=YOUR_LIVEKIT_API_SECRET
```

Use the URL and matching API credentials from your LiveKit Cloud project, or from a production self-hosted LiveKit endpoint. Do not use `localhost` for the production browser endpoint.

After changing the variables, create a new Vercel deployment. Environment variable changes do not retroactively change an already-built deployment.

## LiveKit Cloud

For LiveKit Cloud, set the project WebSocket URL shown by LiveKit as both `LIVEKIT_URL` and `LIVEKIT_PUBLIC_URL`, and use that project's API key and secret.

## Self-hosted LiveKit

For self-hosting, expose LiveKit through a real domain and trusted TLS certificate, for example `wss://livekit.example.com`. The LiveKit WebSocket/API port is normally placed behind TLS termination/reverse proxy, and the required WebRTC connectivity ports must also be reachable.

## Local development

A local browser can use `wss://localhost:7880` while the browser and LiveKit server are on the same machine. Keep the local value separate from the Vercel production value.

## What this build changes

* `/api/livekit/token` returns `LIVEKIT_PUBLIC_URL` when it is configured, falling back to `LIVEKIT_URL` for local development.
* Production server startup rejects a `localhost` LiveKit URL with an explicit configuration error.
* The CSP permits the configured LiveKit origin and Vercel's `vercel.live` toolbar script.
* The camera UI gives a readable configuration error instead of attempting a browser connection to local `localhost`.
