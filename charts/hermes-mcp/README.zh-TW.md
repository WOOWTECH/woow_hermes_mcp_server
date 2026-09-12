# hermes-mcp Helm chart

在 K3s 上部署 Hermes MCP Admin：
[woow_hermes_mcp_server](https://github.com/WOOWTECH/woow_hermes_mcp_server)
的 FastAPI 管理介面與 FastMCP server。一個 instance 一個 release。

這個 chart 會一比一重現 woow-k3s 上 `hermes-mcp-admin` namespace 既有的部署，
同時取代一併刪除的根目錄 `k8s-deploy.yaml`。舊 manifest 的問題：namespace 寫死成
客戶的 `kasim-odoo`、容器埠寫成 9003（uvicorn 實際監聽 8080，因此 probe 與 Service
都沒有可用的 endpoint）、`/data` 用 `emptyDir`（每次重啟都會遺失管理密碼與 MCP
token），還對該 namespace 授予 `secrets get/list/patch`，而程式碼根本不呼叫
Kubernetes API。

## chart 會建立哪些物件

| 物件 | 名稱 | 說明 |
| --- | --- | --- |
| Deployment | `hermes-mcp-admin` | 單一 `python:3.12-slim` 容器，`sh -c` 開機腳本，埠 8080 |
| Service | `hermes-mcp-admin` | ClusterIP `9003` -> 容器 `8080` |
| PersistentVolumeClaim | `hermes-mcp-admin-data` | `/data/config.json`；帶 `helm.sh/resource-policy: keep` |
| Secret | `hermes-mcp-secrets` | 只有 `secrets.create=true` 才產生 |
| Namespace | `namespace.name` | 只有與 release namespace 不同時才產生 |
| Pod（`helm test`） | `<release>-smoke` | 唯讀 `GET /healthz` |

容器用原版 Python image，在啟動時才安裝應用程式（`apt-get`、
`pip install git+...`、`npm run build`，最後 `uvicorn`）。這是線上 instance 現在
的運作方式，phase 1 刻意維持不變，詳見[後續項目](#後續項目)。也因此第一次開機要
好幾分鐘，startup probe 就是為此而設。

## 安裝

```bash
# clone
git clone https://github.com/WOOWTECH/woow_hermes_mcp_server.git
cd woow_hermes_mcp_server
helm install hermes-mcp-admin ./charts/hermes-mcp \
  -n hermes-mcp-admin --create-namespace \
  -f deploy/woow-k3s/hermes-mcp-admin.yaml

# GitHub tarball（chart 在子目錄，所以要先解開）
curl -sSL https://github.com/WOOWTECH/woow_hermes_mcp_server/archive/refs/heads/main.tar.gz | tar xz
helm install hermes-mcp-admin woow_hermes_mcp_server-main/charts/hermes-mcp \
  -n hermes-mcp-admin --create-namespace \
  -f woow_hermes_mcp_server-main/deploy/woow-k3s/hermes-mcp-admin.yaml
```

新的 instance 需要自己的 Secret。建議照
[`examples/secrets.example.yaml`](examples/secrets.example.yaml) 自行套用（chart
就完全不會碰它），或讓 chart 建立一次：

```bash
helm install hermes-mcp-2 ./charts/hermes-mcp -n hermes-mcp-2 --create-namespace \
  --set namespace.name=hermes-mcp-2 \
  --set secrets.create=true \
  --set secrets.adminPassword="$(openssl rand -hex 12)" \
  --set secrets.jwtSecret="$(openssl rand -hex 24)" \
  --set secrets.mcpAuthToken="$(openssl rand -hex 24)" \
  --set secrets.gatewayApiKey=... --set secrets.dashboardPassword=...
```

五個值都有 `required()` 把關，chart 不附任何預設密碼。在 woow-k3s 以外的叢集要
自行設定 `persistence.storageClassName`（測試用 `longhorn-delete`，筆電叢集用
`local-path`）。

## 第一次登入（在對外開放前務必先看）

`ADMIN_PASSWORD` 會從 Secret 注入 pod，**但程式碼根本不讀它**：
`mcp_admin_core/config/store.py` 會用字面值 `admin` 初始化 `/data/config.json`，
只有 Settings 頁面才會改掉它。用本 chart 全新安裝實測：拿產生的
`ADMIN_PASSWORD` 登入會被 401 拒絕，用 `admin` 才登得進去。

因此第一次安裝完成後：先用 `admin` 登入、到 Settings 改掉密碼，之後才把流量導到
這個 Service。之所以保留這個 Secret key，是因為線上 instance 本來就有它，而且等到
程式修好之後它就會變成真正的初始密碼（這是上游程式的問題，不是 chart 的問題）。

## 主要 values

| Value | 預設 | 用途 |
| --- | --- | --- |
| `namespace.create` / `namespace.name` | `true` / `hermes-mcp-admin` | 與 release namespace 相同時絕不產生 Namespace 物件 |
| `keepOnUninstall` | `true` | 為 Namespace、PVC、chart 建立的 Secret 加上 `helm.sh/resource-policy: keep` |
| `name` | `hermes-mcp-admin` | 物件名稱與**不可變更**的 pod selector |
| `replicaCount` | `1` | woow-k3s 上的 instance 停在 `0` |
| `strategy` | `{type: Recreate}` | ReadWriteOnce PVC 的正確設定 |
| `image.*` | `python:3.12-slim` | 開機腳本需要純 Python image |
| `bootstrap.repoUrl` / `.ref` | 本 repo / `""` | `""` 代表每次開機都裝預設分支當下的程式碼；填 tag 或 commit 即可鎖版 |
| `bootstrap.scriptOverride` | `""` | 整段覆寫開機腳本 |
| `service.port` / `.targetPort` | `9003` / `8080` | 應用程式一律監聽 `targetPort` |
| `persistence.*` | `longhorn`、1Gi、RWO | `/data`；設 `existingClaim` 可讓 PVC 不屬於 release |
| `existingSecret` | `hermes-mcp-secrets` | env 引用的 Secret |
| `secrets.create` | `false` | `true` 時用五個 `required()` 值產生 Secret |
| `hermes.gateway.url` / `dashboard.url` | Hermes Agent `:8642` / `:9119` | 非機密，直接以明文 env 呈現 |
| `hermes.gateway.apiKey` / `dashboard.password` | `""` | 明文內嵌值；**留空就改用 `secretKeyRef`**，這才是建議做法 |
| `probes.enabled` | `true` | startup probe 負責涵蓋緩慢的第一次開機 |
| `commonLabels` | `app.kubernetes.io/*` | 只加在物件 metadata，絕不加進 pod template |
| `podAnnotations` | `{}` | 屬於 pod template：改了就會滾動重啟 |
| `serviceAccount.automount` | `true` | 設 `false` 可移除應用程式用不到的 SA token |
| `tests.enabled` | `true` | `helm test` 煙霧測試 pod |

## 驗證

```bash
kubectl -n hermes-mcp-admin rollout status deploy/hermes-mcp-admin --timeout=15m
helm test hermes-mcp-admin -n hermes-mcp-admin --logs   # 透過 Service 打 /healthz
kubectl -n hermes-mcp-admin port-forward svc/hermes-mcp-admin 9003:9003
CONTEXT=woow-k3s scripts/check-drift.sh                 # chart vs release vs 叢集
```

## 解除安裝（資料保留）

```bash
helm uninstall hermes-mcp-admin -n hermes-mcp-admin
```

Namespace、PVC `hermes-mcp-admin-data`，以及由 chart 建立的 `hermes-mcp-secrets`
都帶 `helm.sh/resource-policy: keep`，因此會留下來，`/data/config.json` 也完整保留
（管理密碼、MCP auth token、連線設定與工具開關全都存在這裡；`/data` 一旦是空的，
管理密碼會悄悄退回程式碼的預設值 `admin`）。重新安裝同一個 release 會接回同一個
PVC。真的要刪資料：

```bash
kubectl -n hermes-mcp-admin delete pvc hermes-mcp-admin-data
```

## 接管 woow-k3s 上既有的 instance

線上這套原本是 `kubectl apply` 建立的，之後又用命令式操作改過（換成 PVC、縮到 0
副本），所以它的 `last-applied-configuration` 已經與實際狀態不符——再 apply 一次
舊的 `k8s-deploy.yaml` 會把 `/data` 換回 `emptyDir`。改由 chart 接管就能解決這件事。
接管過程不可以重啟任何東西，而且必須維持 **0 副本**。

`deploy/woow-k3s/hermes-mcp-admin.yaml` 會逐欄位重現該 instance。唯一無法寫進檔案
的是線上 pod template 內嵌的兩個憑證（`HERMES_GATEWAY_API_KEY`、
`HERMES_DASHBOARD_PASSWORD`）；它們直接從線上 Secret 讀出來，該 Secret 本來就以
相同的 key 名稱存著相同的值：

```bash
NS=hermes-mcp-admin
get() { kubectl --context woow-k3s -n $NS get secret hermes-mcp-secrets -o "jsonpath={.data.$1}" | base64 -d; }

# 1. 先 dry run：除了 Helm 的擁有權 metadata 以外不該有任何差異
helm --kube-context woow-k3s template hermes-mcp-admin ./charts/hermes-mcp -n $NS \
  -f deploy/woow-k3s/hermes-mcp-admin.yaml --skip-tests \
  --set-string hermes.gateway.apiKey="$(get HERMES_GATEWAY_API_KEY)" \
  --set-string hermes.dashboard.password="$(get HERMES_DASHBOARD_PASSWORD)" \
  | kubectl --context woow-k3s diff -f -

# 2. 接管
helm --kube-context woow-k3s upgrade --install hermes-mcp-admin ./charts/hermes-mcp -n $NS \
  --take-ownership -f deploy/woow-k3s/hermes-mcp-admin.yaml \
  --set-string hermes.gateway.apiKey="$(get HERMES_GATEWAY_API_KEY)" \
  --set-string hermes.dashboard.password="$(get HERMES_DASHBOARD_PASSWORD)"

# 3. 證明沒有滾動
kubectl --context woow-k3s -n $NS get deploy hermes-mcp-admin \
  -o jsonpath='{.metadata.generation}{"\n"}' # 不變
kubectl --context woow-k3s -n $NS get rs   # 沒有新的 ReplicaSet
```

接管只會在線上物件多出兩樣東西：Helm 自己的擁有權 metadata
（`app.kubernetes.io/managed-by`、`meta.helm.sh/release-*`），以及 PVC 上的
`helm.sh/resource-policy: keep`。兩者都不屬於 pod template，所以不會重建任何東西。

等到可以接受重啟時，就把那兩個 `--set-string` 拿掉：env 會改成引用同一個 Secret 的
`secretKeyRef`，憑證從此離開 pod spec。這屬於 pod template 變更，會產生一個新的
（仍然是 0 副本的）ReplicaSet。

## 後續項目

以下這些在 `deploy/woow-k3s/hermes-mcp-admin.yaml` 裡刻意關閉，因為每一項都會改寫
線上 pod template。等到下次可以計畫性重啟時，依序打開：

1. `hermes.gateway.apiKey` / `hermes.dashboard.password` 留空——兩個憑證從內嵌
   env 值改為 `secretKeyRef`。
2. `probes.enabled=true`——`/healthz` 的 startup／readiness／liveness probe。
3. `bootstrap.ref=<tag 或 commit>`——不要再每次開機都從網路裝未鎖版的預設分支。
4. `strategy.type=Recreate`——RWO volume 沒辦法做 rolling update。
5. `serviceAccount.automount=false`——應用程式沒有 Kubernetes client。
6. `commonLabels`——在物件 metadata 補上標準 `app.kubernetes.io/*` 標籤。

不屬於 phase 1、另案追蹤：建置並鎖定真正的 image（有了它才談得上讓
`securityContext` 放棄 root 並掛唯讀根檔案系統）、NetworkPolicy，以及程式碼根本不
讀的 `ADMIN_PASSWORD` / `MCP_AUTH_TOKEN` 兩個 env。
