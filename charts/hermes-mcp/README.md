# hermes-mcp Helm chart

Hermes MCP Admin -- the FastAPI admin console plus the FastMCP server of
[woow_hermes_mcp_server](https://github.com/WOOWTECH/woow_hermes_mcp_server) --
on K3s. One release per instance.

The chart reproduces the instance running in namespace `hermes-mcp-admin` on
woow-k3s object for object, and replaces the root `k8s-deploy.yaml` that was
deleted with it: that manifest hardcoded the customer namespace `kasim-odoo`,
put the container on port 9003 while uvicorn listens on 8080 (so its probes and
its Service never had a working endpoint), mounted `/data` as an `emptyDir` --
losing the admin password and the MCP token on every restart -- and granted the
pod `secrets get/list/patch` over that namespace for code that never calls the
Kubernetes API.

## What it renders

| Object | Name | Notes |
| --- | --- | --- |
| Deployment | `hermes-mcp-admin` | one `python:3.12-slim` container, `sh -c` bootstrap, port 8080 |
| Service | `hermes-mcp-admin` | ClusterIP `9003` -> container `8080` |
| PersistentVolumeClaim | `hermes-mcp-admin-data` | `/data/config.json`; `helm.sh/resource-policy: keep` |
| Secret | `hermes-mcp-secrets` | only with `secrets.create=true` |
| Namespace | `namespace.name` | only when it differs from the release namespace |
| Pod (`helm test`) | `<release>-smoke` | read-only `GET /healthz` |

The container runs the stock Python image and installs the application at start
(`apt-get`, `pip install git+...`, `npm run build`, then `uvicorn`). That is how
the running instance works and phase 1 keeps it -- see [Follow-ups](#follow-ups).
First boot therefore takes minutes, which is what the startup probe is for.

## Install

```bash
# clone
git clone https://github.com/WOOWTECH/woow_hermes_mcp_server.git
cd woow_hermes_mcp_server
helm install hermes-mcp-admin ./charts/hermes-mcp \
  -n hermes-mcp-admin --create-namespace \
  -f deploy/woow-k3s/hermes-mcp-admin.yaml

# GitHub tarball (the chart is in a subdirectory, so extract first)
curl -sSL https://github.com/WOOWTECH/woow_hermes_mcp_server/archive/refs/heads/main.tar.gz | tar xz
helm install hermes-mcp-admin woow_hermes_mcp_server-main/charts/hermes-mcp \
  -n hermes-mcp-admin --create-namespace \
  -f woow_hermes_mcp_server-main/deploy/woow-k3s/hermes-mcp-admin.yaml
```

A fresh instance needs its own Secret. Either apply it out of band from
[`examples/secrets.example.yaml`](examples/secrets.example.yaml) (recommended:
the chart then never touches it), or let the chart create it once:

```bash
helm install hermes-mcp-2 ./charts/hermes-mcp -n hermes-mcp-2 --create-namespace \
  --set namespace.name=hermes-mcp-2 \
  --set secrets.create=true \
  --set secrets.adminPassword="$(openssl rand -hex 12)" \
  --set secrets.jwtSecret="$(openssl rand -hex 24)" \
  --set secrets.mcpAuthToken="$(openssl rand -hex 24)" \
  --set secrets.gatewayApiKey=... --set secrets.dashboardPassword=...
```

All five are `required()`; the chart has no default credentials. On a cluster
other than woow-k3s set `persistence.storageClassName` (`longhorn-delete` for
throwaway installs, `local-path` on the laptop cluster).

## First login (read this before exposing the console)

`ADMIN_PASSWORD` is wired into the pod from the Secret, **but the application
never reads it**: `mcp_admin_core/config/store.py` seeds `/data/config.json`
with the literal password `admin`, and only the Settings page ever changes it.
Verified on a fresh install of this chart: a login with the generated
`ADMIN_PASSWORD` is rejected with 401, `admin` succeeds.

So after the very first install: log in with `admin`, change the password in
Settings, and only then route anything to the Service. The Secret key is kept
because the running instance has it and because it becomes the seed the moment
the application is fixed (upstream defect, not a chart defect).

## Key values

| Value | Default | Purpose |
| --- | --- | --- |
| `namespace.create` / `namespace.name` | `true` / `hermes-mcp-admin` | a Namespace equal to the release namespace is never rendered |
| `keepOnUninstall` | `true` | `helm.sh/resource-policy: keep` on Namespace, PVC and chart-created Secret |
| `name` | `hermes-mcp-admin` | object names and the **immutable** pod selector |
| `replicaCount` | `1` | the woow-k3s instance is parked at `0` |
| `strategy` | `{type: Recreate}` | correct for the ReadWriteOnce PVC |
| `image.*` | `python:3.12-slim` | the bootstrap needs a plain Python image |
| `bootstrap.repoUrl` / `.ref` | repo / `""` | `""` installs whatever the default branch holds at pod start; set a tag or commit to pin |
| `bootstrap.scriptOverride` | `""` | replace the generated start script entirely |
| `service.port` / `.targetPort` | `9003` / `8080` | the app always listens on `targetPort` |
| `persistence.*` | `longhorn`, 1Gi, RWO | `/data`; `existingClaim` keeps the PVC out of the release |
| `existingSecret` | `hermes-mcp-secrets` | Secret the env refers to |
| `secrets.create` | `false` | `true` renders the Secret from the five `required()` values |
| `hermes.gateway.url` / `dashboard.url` | Hermes Agent `:8642` / `:9119` | not secret, rendered as plain env |
| `hermes.gateway.apiKey` / `dashboard.password` | `""` | inline plaintext; **empty means `secretKeyRef`**, which is what you want |
| `probes.enabled` | `true` | startup probe covers the slow first boot |
| `commonLabels` | `app.kubernetes.io/*` | object metadata only, never the pod template |
| `podAnnotations` | `{}` | part of the pod template: changing it rolls the Deployment |
| `serviceAccount.automount` | `true` | `false` drops the SA token the app never uses |
| `tests.enabled` | `true` | the `helm test` smoke pod |

## Verify

```bash
kubectl -n hermes-mcp-admin rollout status deploy/hermes-mcp-admin --timeout=15m
helm test hermes-mcp-admin -n hermes-mcp-admin --logs   # GET /healthz through the Service
kubectl -n hermes-mcp-admin port-forward svc/hermes-mcp-admin 9003:9003   # then open /
CONTEXT=woow-k3s scripts/check-drift.sh                 # chart vs release vs cluster
```

## Uninstall (data is kept)

```bash
helm uninstall hermes-mcp-admin -n hermes-mcp-admin
```

The Namespace, the PVC `hermes-mcp-admin-data` and a chart-created
`hermes-mcp-secrets` carry `helm.sh/resource-policy: keep`, so they stay behind
with `/data/config.json` intact -- the admin password, the MCP auth token, the
connection settings and the tool toggles all live there, and a fresh
`/data` silently resets the admin password to the code default `admin`.
Reinstalling the release picks the same PVC back up. To really delete the data:

```bash
kubectl -n hermes-mcp-admin delete pvc hermes-mcp-admin-data
```

## Takeover of the running woow-k3s instance

The instance in `hermes-mcp-admin` was created with `kubectl apply` and then
edited imperatively (the PVC was swapped in and the Deployment scaled to 0), so
its `last-applied-configuration` no longer matches reality -- another
`kubectl apply -f k8s-deploy.yaml` would put `/data` back on an `emptyDir`.
Adopting it into this chart fixes that. It must not restart anything, and it
must stay at **0 replicas**.

`deploy/woow-k3s/hermes-mcp-admin.yaml` renders that instance field for field.
The only two things it cannot carry are the credentials the live pod template
holds inline (`HERMES_GATEWAY_API_KEY`, `HERMES_DASHBOARD_PASSWORD`); they are
read straight out of the live Secret, which already holds the same two values
under those key names:

```bash
NS=hermes-mcp-admin
get() { kubectl --context woow-k3s -n $NS get secret hermes-mcp-secrets -o "jsonpath={.data.$1}" | base64 -d; }

# 1. Dry run: nothing may differ except the Helm ownership metadata
helm --kube-context woow-k3s template hermes-mcp-admin ./charts/hermes-mcp -n $NS \
  -f deploy/woow-k3s/hermes-mcp-admin.yaml --skip-tests \
  --set-string hermes.gateway.apiKey="$(get HERMES_GATEWAY_API_KEY)" \
  --set-string hermes.dashboard.password="$(get HERMES_DASHBOARD_PASSWORD)" \
  | kubectl --context woow-k3s diff -f -

# 2. Adopt
helm --kube-context woow-k3s upgrade --install hermes-mcp-admin ./charts/hermes-mcp -n $NS \
  --take-ownership -f deploy/woow-k3s/hermes-mcp-admin.yaml \
  --set-string hermes.gateway.apiKey="$(get HERMES_GATEWAY_API_KEY)" \
  --set-string hermes.dashboard.password="$(get HERMES_DASHBOARD_PASSWORD)"

# 3. Prove nothing rolled
kubectl --context woow-k3s -n $NS get deploy hermes-mcp-admin \
  -o jsonpath='{.metadata.generation}{"\n"}' # unchanged
kubectl --context woow-k3s -n $NS get rs   # no new ReplicaSet
```

The adoption adds exactly two things to the live objects: Helm's own ownership
metadata (`app.kubernetes.io/managed-by`, `meta.helm.sh/release-*`), and
`helm.sh/resource-policy: keep` on the PVC. Neither is part of a pod template,
so nothing is re-created.

Drop the two `--set-string` flags as soon as a restart is acceptable: the env
then switches to `secretKeyRef` on the same Secret keys and the credentials
leave the pod spec for good. That is a pod-template change, so it will create a
new (still 0-replica) ReplicaSet.

## Follow-ups

Deliberately switched off in `deploy/woow-k3s/hermes-mcp-admin.yaml` because
each one rewrites the live pod template. Turn them on at the next planned
restart of the instance, in this order:

1. `hermes.gateway.apiKey` / `hermes.dashboard.password` left empty -- the two
   credentials move from inline env values to `secretKeyRef`.
2. `probes.enabled=true` -- `/healthz` startup, readiness and liveness probes.
3. `bootstrap.ref=<tag or commit>` -- stop installing an unpinned default branch
   over the network on every start.
4. `strategy.type=Recreate` -- a rolling update cannot work with a RWO volume.
5. `serviceAccount.automount=false` -- the app has no Kubernetes client.
6. `commonLabels` -- the standard `app.kubernetes.io/*` labels on object metadata.

Out of scope for phase 1, tracked elsewhere: building and pinning a real image
(which is what would let `securityContext` drop root and mount the root
filesystem read-only), a NetworkPolicy, and the `ADMIN_PASSWORD` /
`MCP_AUTH_TOKEN` env values that the application code never reads.
