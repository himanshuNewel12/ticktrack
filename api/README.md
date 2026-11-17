# application-api

NestJS API for the mobile app in [`../application`](../application) (TickTrack). It was split out of [`../backend`](../backend) so the app can be deployed and versioned on its own.

- **Same database**: it reads and writes the same PostgreSQL database as the backend.
- **Same schema, local copy**: `prisma/schema.prisma` is a copy of `NewelPlannerRevamp/backend/prisma/schema.prisma`, because this service lives in its own repo and can't reach the backend at build time. Never run `prisma migrate` here; migrations are still run only from the backend.
- **Same tokens**: `JWT_SECRET` / `REFRESH_TOKEN_SECRET` must match the backend, so a login on either service works on both.
- **Same URL shape**: `/api/v1/...`, so the app only needs a new base URL.
- **No cron jobs**: activity recurrence generation, check-in reminders and timesheet reminders still run in the backend only. Do not add `ScheduleModule` here, or jobs will run twice against the shared DB.

## Endpoints

| Area | Endpoints | Origin |
|---|---|---|
| Auth | `POST /auth/login`, `GET /auth/me` | login copied, `me` moved |
| Users | `GET /users/assignable` | copied (web uses it too) |
| Activities | `GET mine, assigned, :id` · `POST /` · `PATCH :id, :id/postpone, :id/complete, :id/cancel, :id/status, :id/remark` · `GET/POST recurring` · `PATCH recurring/:id, recurring/:id/cancel` | copied (web uses them too) |
| Activities (app-only) | `POST voice`, `GET voice/:file`, `GET informed` (renamed from `watching`), `GET escalations`, `PATCH :id/escalate` | **moved** out of backend |
| Notifications | `GET /user-alerts`, `PATCH /user-alerts/:id/read`, `PATCH /user-alerts/mark-all-read` | copied |
| Notifications (app-only) | `PUT /user-alerts/push-token` | **moved** |
| Attendance | `GET today`, `POST check-in`, `POST check-out` | copied (trimmed) |
| Lists | `GET/POST /lists`, `PATCH/DELETE /lists/:id` | **moved** |
| Files (S3) | `POST /files/upload`, `GET /files/url`, `DELETE /files` | **moved** |
| Crash logs | `POST/GET /app-crash-logs` | **moved** |

"Copied" code is duplicated from the backend because the web app still uses it there. A fix to activities, attendance or notification logic usually needs to be made in **both** places.

## Setup

```bash
cd application-api
cp .env.example .env.development      # fill in; most values must match backend
npm install                           # also runs `prisma generate` against prisma/schema.prisma
npm run start:dev                     # http://localhost:4002/api/v1  (Swagger: /api/docs)
npm run build && npm run start:prod   # production (reads .env.production)
```

After any backend schema change, copy the backend's `prisma/schema.prisma` over `prisma/schema.prisma` here, run `npm run prisma:generate`, and redeploy.

## Voice notes

Voice files are stored on local disk in `<UPLOAD_DIR>/activity-voice`. Notes recorded before the split are in `backend/uploads/activity-voice`. Either point `UPLOAD_DIR` at the backend's `uploads` folder, or copy that folder here before switching the app over.

## Rollout order

1. Deploy `application-api` and confirm `/api/docs` loads.
2. Set `EXPO_PUBLIC_API_URL` in the app (and `DEFAULT_REMOTE_URL` in `application/src/api.ts`) to the new service, then ship the app.
3. Only then deploy the backend with the app-only endpoints removed. Older app builds that still call the backend will lose lists, files, voice notes, informed/escalations, push-token registration and crash logs.

## Naming: informers

The mobile API calls the "watcher" role **informer**: requests send `informerIds`, responses return `informers` / `isInformer`, and the list is `GET /activities/informed`. The database still stores these in the `ActivityWatcher` table (Prisma relation `watchers`), and the main backend's DTOs still accept `watcherIds`.
