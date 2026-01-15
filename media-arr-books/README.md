## Notes - Secrets

- qBittorrent credentials are injected via a Secret named `qbittorrent-credentials`.
- Expected keys: `WEBUI_USERNAME` and `WEBUI_PASSWORD`.
- Create it in the `media` namespace (example):

```bash
kubectl -n media create secret generic qbittorrent-credentials \
  --from-literal=WEBUI_USERNAME=admin \
  --from-literal=WEBUI_PASSWORD=tu_pass
```

- If the image ignores these env vars, set the username/password in the Web UI;
  it will persist in `/config`.
