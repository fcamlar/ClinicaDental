# Infraestructura — Castellar MVP (free tier)

> Objetivo: coste mensual = **0 €** durante el MVP y la fase piloto.
> Aceptamos las limitaciones del free tier; planificamos la migración a planes
> de pago antes del Sprint 8 (clínica piloto en producción real).

## Mapa de servicios

| Servicio          | Proveedor             | Tier     | Región           | Notas |
| ----------------- | --------------------- | -------- | ---------------- | ----- |
| Frontend          | Cloudflare Pages      | Free     | Global edge      | Ilimitado. Adapter `@cloudflare/next-on-pages` para Next 15. |
| API (NestJS)      | Render Web Service    | Free     | Frankfurt        | Duerme tras 15 min ociosa. Cold start ~30 s. |
| Worker (BullMQ)   | Render Background     | Free     | Frankfurt        | Comparte 750 h/mes con la API. |
| Postgres          | Supabase              | Free     | eu-west-2        | 500 MB. Pausa tras 7 días sin actividad. |
| Auth              | Supabase Auth         | Free     | eu-west-2        | 50 k MAU, TOTP incluido. |
| Object storage    | Cloudflare R2         | Free     | Global           | 10 GB + 10M Class A ops/mes. Sin egress. |
| Redis / colas     | Upstash               | Free     | eu-west-1        | 10 000 cmd/día. Plan: 1 cola única `scan-file`. |
| Email             | Resend                | Free     | UE               | 3 000 emails/mes, 100/día. |
| Errores           | Sentry                | Free     | UE               | 5 k errores/mes. |
| DNS / CDN / WAF   | Cloudflare            | Free     | Global           | Dominio `castellar.app` (pendiente). |

## Setup paso a paso

### 1. Supabase

```
1. Crear proyecto "castellar-eu" en https://supabase.com — región eu-west-2.
2. Settings → Database → conexión:
     DATABASE_URL          = postgres://castellar_app:<pwd>@.../postgres   (rol no-superuser)
     DATABASE_MIGRATE_URL  = postgres://postgres:<pwd>@.../postgres        (superuser)
3. SQL Editor → ejecutar infra/docker/postgres/init/01-init.sql adaptado
   (crear rol castellar_app y permisos).
4. pnpm db:migrate:deploy  ←  aplica las migraciones del repo.
5. Auth → Hooks → Custom Access Token → public.castellar_access_token_hook
6. Auth → Providers → Email → habilitar.
7. Auth → MFA → habilitar TOTP.
```

### 2. Cloudflare R2

```
1. Cloudflare Dashboard → R2 → Create bucket "castellar-prod".
2. Manage R2 API Tokens → Create API token con permisos Object Read & Write
   sobre castellar-prod.
3. Guardar S3_ENDPOINT (https://<account>.r2.cloudflarestorage.com),
   S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET="castellar-prod".
4. CORS: permitir PUT desde https://app.castellar.app.
```

### 3. Upstash Redis

```
1. https://console.upstash.com → Create Database → Region eu-west-1 → TLS on.
2. Copiar REDIS_URL (formato rediss://default:<pwd>@<host>:6379).
```

### 4. Render

```
1. Conectar el repo a Render.
2. Render detecta render.yaml y crea castellar-api (web) + castellar-worker.
3. Configurar secretos en el dashboard:
     DATABASE_URL, DATABASE_MIGRATE_URL, REDIS_URL,
     SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_JWT_SECRET,
     S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET,
     RESEND_API_KEY, SENTRY_DSN, APP_URL.
4. Deploy → la API queda en https://castellar-api.onrender.com.
```

### 5. Cloudflare Pages

```
1. Cloudflare Dashboard → Pages → Create with Git → seleccionar el repo.
2. Framework preset: Next.js. Build command:
     pnpm install --frozen-lockfile && pnpm --filter @castellar/web build
3. Output directory: apps/web/.vercel/output/static
4. Variables públicas:
     NEXT_PUBLIC_SUPABASE_URL
     NEXT_PUBLIC_SUPABASE_ANON_KEY
     NEXT_PUBLIC_API_URL    = https://castellar-api.onrender.com
5. Dominio personalizado: app.castellar.app.
```

### 6. Resend

```
1. https://resend.com → Add domain castellar.app, configurar DNS DKIM/SPF.
2. Crear API key → guardar como RESEND_API_KEY en Render.
3. Sender por defecto: no-reply@castellar.app.
```

### 7. Sentry

```
1. https://sentry.io → New project (Node + Next.js, región UE).
2. Copiar DSN → SENTRY_DSN en Render y Cloudflare Pages.
```

## Variables de entorno por servicio

Ver `.env.example` para la lista completa con descripciones.

| Variable                   | API | Worker | Web Public |
| -------------------------- | --- | ------ | ---------- |
| DATABASE_URL               | ✓   | ✓      |            |
| DATABASE_MIGRATE_URL       | ✓   |        |            |
| REDIS_URL                  | ✓   | ✓      |            |
| SUPABASE_URL               | ✓   |        |            |
| SUPABASE_JWT_SECRET        | ✓   |        |            |
| NEXT_PUBLIC_SUPABASE_URL   |     |        | ✓          |
| NEXT_PUBLIC_SUPABASE_ANON_KEY |  |        | ✓          |
| NEXT_PUBLIC_API_URL        |     |        | ✓          |
| S3_*                       | ✓   | ✓      |            |
| RESEND_API_KEY             | ✓   | ✓      |            |
| SENTRY_DSN                 | ✓   | ✓      | ✓          |
| APP_URL                    | ✓   |        |            |

## Limitaciones aceptadas (MVP)

1. **Cold start de Render free**: ~30 s tras 15 min ociosa. Aceptable mientras
   solo haya una clínica piloto en uso intermitente. Para producción, plan
   Starter ($7/mes/servicio).
2. **Pausa de Supabase free** tras 7 días sin actividad: el primer login
   despierta la BD (~10 s). Mitigado con un cron weekly ping desde Render.
3. **Upstash 10 k cmd/día**: suficiente si solo encolamos scan-file (1 cmd
   por upload + reintentos). Monitorizar.
4. **Resend 100 emails/día**: cubre recordatorios de una clínica pequeña
   (típicamente <50 emails/día). Alerta a partir del 70%.
