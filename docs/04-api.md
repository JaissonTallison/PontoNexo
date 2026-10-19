# API

Documentação interativa em `/api/docs` e JSON em `/api/docs/json` (gerada dos schemas Zod). Cópia estática: `docs/openapi.json` (`pnpm --filter @pontonexo/api openapi`).

Autenticação: cookie `pn_session` (HttpOnly) + cabeçalho `x-csrf-token` (valor do cookie `pn_csrf`) em POST/PUT/DELETE. Erros: `{ statusCode, code, message, fields? }`.

| Área | Rotas principais |
|---|---|
| Autenticação | `POST /auth/signup` `login` `logout` `password/forgot` `password/reset` `password/change` · `GET /auth/me` `sessions` |
| Hora | `GET /time` · `GET /time/checks` · `GET /health` `/health/ready` |
| Funcionário | `GET /me/punch-context` · `POST /me/punches` · `GET /me/punches?month` `/me/receipts/:id` `/me/timesheet?month` `/me/corrections` `/me/closings` `/me/data-export` |
| Cadastros | `/employer` `/users` `/employees` `/job-roles` `/contracts/:id/end` `/locations` `/locations/:id/geofences` `/employee-locations/:id/revoke` `/schedules` `/holidays` |
| Registro | `GET /punches` `/punches/:id/receipt` `/punches/integrity` `/alerts` · `POST /alerts/:id/review` · público `GET /receipts/verify/:code` |
| Tratamento | `POST /corrections` `/corrections/:id/decide` `/corrections/:id/cancel` · `GET /timesheets/:employeeId?month` · `/closings` `/closings/:id/reopen` `/closings/:id/snapshot` |
| Governança | `/dashboard` `/audit` `/audit/verify` `/incidents` `/settings/retention` `/integrations` `/data-requests` `/exports/punches.csv` `/exports/timesheet.csv` `/exports/employer.json` |
