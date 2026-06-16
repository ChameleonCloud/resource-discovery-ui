# resource-discovery-ui

Frontend for Chameleon Cloud resource discovery. Lets users search and filter physical nodes, view availability, and generate reservation instructions.

## Development

**Prerequisites:** Node 20+

```bash
npm install
npm run dev
```

The dev server proxies `/api` to the backend. Point it at a running instance:

```bash
npm install
VITE_API_BASE_URL=http://localhost:8000 npm run dev
```

Or create a `.env.local` and just run `npm run dev`:

```
VITE_API_BASE_URL=http://localhost:8000
```

### Testing the backend manually

```bash
curl http://localhost:8000/sites
curl http://localhost:8000/nodes/search?limit=10
curl http://localhost:8000/sites/tacc/availability
curl http://localhost:8000/sites/tacc/clusters/chameleon/nodes/<node-id>/availability
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with HMR |
| `npm run build` | Type-check + production build |
| `npm run test` | Run all tests |
| `npm run test:watch` | Watch mode for tests |
| `npm run lint` | Run ESLint |

## Environment variables

All variables are baked in at build time via Vite.

| Variable | Default | Description |
|---|---|---|
| `VITE_API_BASE_URL` | `/api` | Backend API base URL. In dev, set to the backend host. In prod, nginx proxies `/api/` to the backend. |
| `VITE_CORE_SITE_IDS` | `uc,tacc,ncar` | Comma-separated site IDs treated as "core" Chameleon sites. |
| `VITE_FEATURE_KVM` | `false` | Enable KVM/VM support. Set to `true` only when the backend VM API is available. |

## Docker

```bash
docker build \
  --build-arg VITE_API_BASE_URL=http://backend:8000 \
  --build-arg VITE_CORE_SITE_IDS=uc,tacc,ncar \
  -t resource-discovery-ui .

docker run -p 8080:80 resource-discovery-ui
```

In the container, nginx serves the static build and proxies `/api/` to `http://backend:8000/`. Override the backend host in `nginx.conf` or via a custom nginx config mount.

## CI / Releases

GitHub Actions runs on every PR and push:

- **test** — type-check, lint, unit tests (all branches)
- **publish** — builds and pushes to `ghcr.io/chameleoncloud/resource-discovery-ui:latest` + commit SHA (main only)
- **publish-dev** — pushes `:dev` tag (develop only)
