# MVP Orchestrator

Microservicio backend que integra Slack como interfaz de orquestación para gestión de proyectos. Permite crear proyectos mediante slash commands, interactuar con modales y recibir notificaciones, todo dentro de Slack.

## ¿Para qué sirve?

Actúa como puente entre Slack y la lógica de negocio del MVP. Los usuarios de un workspace de Slack pueden:

- **Crear proyectos** usando el comando `/create-project`, que abre un modal interactivo.
- **Recibir confirmaciones** por DM y en un canal de log cuando se crea un proyecto.
- **Verificar la autenticidad** de cada request de Slack mediante validación de firma HMAC-SHA256.

## Stack

- **Runtime:** Node.js (ESM)
- **Lenguaje:** TypeScript (strict)
- **Framework:** Express 5
- **Slack SDK:** Llamadas directas a la Web API (`fetch`)
- **Env:** dotenv

## Arquitectura

El proyecto está organizado en dos capas principales:

```
src/
├── index.ts                        # Entry point
├── http/
│   ├── HttpServer.ts               # Clase que encapsula Express, middleware y registro de módulos
│   └── types.ts                    # Interfaz HttpModule (contrato para cada módulo)
└── modules/
    └── slack/
        ├── SlackModule.ts          # Implementa HttpModule: rutas, handlers y lógica de proyectos
        ├── SlackClient.ts          # Wrapper tipado de la Slack Web API
        └── SlackSignature.ts       # Verificación de firma HMAC-SHA256
```

- **`http/`** — Configuración y construcción del servidor web. No conoce lógica de negocio.
- **`modules/`** — Cada módulo implementa `HttpModule` y registra sus propias rutas. Hoy solo existe `slack`.

## Endpoints

| Método | Ruta                  | Descripción                                                        |
|--------|-----------------------|--------------------------------------------------------------------|
| GET    | `/health`             | Health check. Retorna `200 ok`.                                    |
| POST   | `/slack/commands`     | Recibe slash commands de Slack (`/create-project`). Abre un modal. |
| POST   | `/slack/interactions` | Recibe submissions de modales y otras interacciones de Slack.      |

## Flujo principal

```
Usuario en Slack
  │
  ├─ /create-project ──▶ POST /slack/commands
  │                          └─ Abre modal (views.open)
  │
  └─ Completa modal ──▶ POST /slack/interactions
                             ├─ Crea proyecto en memoria (PRJ-001, PRJ-002…)
                             ├─ Envía DM de confirmación al usuario
                             └─ Publica anuncio en canal de log
```

## Variables de entorno

Crear un archivo `.env` en la raíz del proyecto (ya incluido en `.gitignore`):

```env
PORT=3000
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_PROJECTS_CHANNEL=#mvp-log
```

| Variable                  | Requerida | Descripción                                              |
|---------------------------|-----------|----------------------------------------------------------|
| `PORT`                    | No        | Puerto del servidor. Default: `3000`.                    |
| `SLACK_BOT_TOKEN`         | Sí        | Token del bot de Slack (`xoxb-...`).                     |
| `SLACK_SIGNING_SECRET`    | Sí        | Signing secret de la app de Slack para validar requests.  |
| `SLACK_PROJECTS_CHANNEL`  | No        | Canal donde se publican los proyectos creados. Default: `#mvp-log`. |

## Setup

```bash
npm install
cp .env.example .env   # completar con valores reales
npm run dev            # desarrollo con hot-reload (tsx)
npm run build          # compilar a dist/
npm start              # ejecutar build compilado
```

## Configuración en Slack

1. Crear una Slack App en [api.slack.com/apps](https://api.slack.com/apps).
2. Habilitar **Slash Commands** y registrar `/create-project` apuntando a `https://<host>/slack/commands`.
3. Habilitar **Interactivity** con Request URL `https://<host>/slack/interactions`.
4. En **OAuth & Permissions**, agregar los scopes: `chat:write`, `commands`, `im:write`.
5. Instalar la app en el workspace y copiar el Bot Token y Signing Secret al `.env`.

## Notas

- Los proyectos se almacenan **en memoria** (se pierden al reiniciar). Es intencional para esta etapa MVP.
- Cada request de Slack se valida con firma HMAC-SHA256 y protección contra replay attacks (ventana de 5 min).