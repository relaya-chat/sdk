# Checking the Live Server Version

The Relaya SaaS backend (`api.relaya.chat`) is always current. If you need to confirm
which server version is running — for example, to validate SDK/server compatibility
before a release — use the public version endpoint. No authentication or API key required.

## Endpoint

```
GET https://api.relaya.chat/api/public/version
```

**Response:**

```json
{ "version": "1.2.0" }
```

The `version` field is a semver string that matches the server release tag published on GitHub.

## curl example

```sh
curl https://api.relaya.chat/api/public/version
```

## Health endpoint (also includes version)

The `/health` endpoint is used by uptime monitors and also exposes the version:

```sh
curl https://api.relaya.chat/health
```

```json
{ "status": "ok", "version": "1.2.0", "timestamp": "2026-06-17T19:33:00.000Z" }
```

## SDK compatibility

Cross-reference the live version against the compatibility table in the
[server repo](https://github.com/batsonjay/relaya/blob/main/docs/reference/compatibility.md)
to confirm which SDK package versions require which minimum server version.

Each SDK package README also lists the minimum server version it requires under
**Server Compatibility**.
