{{/*
Helper templates for the hermes-mcp chart.
Object names, the selector and the pod label are fixed (.Values.name), not
derived from the release name: the selector is immutable and the Cloudflare
route points at the Service by name, so one release per instance is installed
with a values file, never by renaming the release.
*/}}

{{- define "hermes-mcp.name" -}}
{{ .Values.name }}
{{- end -}}

{{- define "hermes-mcp.ns" -}}
{{ default .Release.Namespace .Values.namespace.name }}
{{- end -}}

{{/* Immutable selector / pod-template label. Never add to this. */}}
{{- define "hermes-mcp.selectorLabels" -}}
app: {{ include "hermes-mcp.name" . }}
{{- end -}}

{{/* Object metadata labels (never applied to the pod template). */}}
{{- define "hermes-mcp.labels" -}}
{{- with .Values.commonLabels -}}
{{ toYaml . }}
{{- end -}}
{{- end -}}

{{/* `annotations:` block with the keep policy, or nothing. */}}
{{- define "hermes-mcp.keepAnnotations" -}}
{{- if .Values.keepOnUninstall -}}
annotations:
  helm.sh/resource-policy: keep
{{- end -}}
{{- end -}}

{{- define "hermes-mcp.pvcName" -}}
{{ default .Values.persistence.claimName .Values.persistence.existingClaim }}
{{- end -}}

{{/*
Container start script. Reproduces the running instance verbatim: install the
package from git, build the SPA, then run uvicorn. bootstrap.ref pins a tag or
commit; empty (the live setting) tracks the default branch on every restart.
*/}}
{{- define "hermes-mcp.startScript" -}}
{{- if .Values.bootstrap.scriptOverride -}}
{{ .Values.bootstrap.scriptOverride }}
{{- else -}}
{{- $ref := .Values.bootstrap.ref -}}
{{- $pip := printf "git+%s" .Values.bootstrap.repoUrl -}}
{{- $clone := "" -}}
{{- if $ref -}}
{{- $pip = printf "git+%s@%s" .Values.bootstrap.repoUrl $ref -}}
{{- $clone = printf "--branch %s " $ref -}}
{{- end -}}
apt-get update -qq && apt-get install -y -qq git curl nodejs npm 2>/dev/null && pip install -q {{ $pip }} 2>&1 | tail -3 && cd /tmp && git clone --depth 1 {{ $clone }}{{ .Values.bootstrap.repoUrl }} repo 2>/dev/null && cd repo/frontend && npm install --production=false 2>/dev/null && npm run build 2>/dev/null && mkdir -p /app/static && cp -r dist/* /app/static/ && rm -rf /tmp/repo && cd /app && python -m uvicorn hermes_mcp_admin.main:app --host 0.0.0.0 --port {{ .Values.service.targetPort }}
{{- end -}}
{{- end -}}

{{/*
One env entry: inline plaintext when a value is given, otherwise a
secretKeyRef into the existing Secret. Argument: (list $ name inlineValue key).
*/}}
{{- define "hermes-mcp.secretEnv" -}}
{{- $ctx := index . 0 -}}
{{- $name := index . 1 -}}
{{- $inline := index . 2 -}}
{{- $key := index . 3 -}}
- name: {{ $name }}
{{- if $inline }}
  value: {{ $inline | quote }}
{{- else }}
  valueFrom:
    secretKeyRef:
      name: {{ $ctx.Values.existingSecret }}
      key: {{ $key }}
{{- end }}
{{- end -}}

{{- define "hermes-mcp.healthUrl" -}}
http://{{ include "hermes-mcp.name" . }}.{{ include "hermes-mcp.ns" . }}.svc.cluster.local:{{ .Values.service.port }}/healthz
{{- end -}}
