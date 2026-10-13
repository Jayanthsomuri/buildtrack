# BuildTrack

BuildTrack is a small app for a home builder. It keeps track of two things:

- **Projects**: the houses being built (address, lot, home type, deadline, status).
- **Crews**: the workers (name, trade, role) and which project each worker is on.

You use it through a website. Behind the website there are two small services. Each one has its own database, and they send each other messages through Kafka.

This project is mainly for **learning how microservices work**. It is not set up for production use.

---

## The big picture

```
            Browser
               │
               ▼
   ┌───────────────────────┐
   │  web  (Next.js)       │   http://localhost:3000
   │  the website          │
   └──────────┬────────────┘
              │ calls (server side only)
      ┌───────┴────────┐
      ▼                ▼
┌──────────────┐   ┌──────────────┐
│ project-     │◄──│ crew-        │   crew-service asks "does this
│ service      │   │ service      │   project exist?" before assigning
│ port 3001    │   │ port 3002    │
└──────┬───────┘   └──────┬───────┘
       │                  │
       ▼                  ▼
  projects_db         crews_db          (one PostgreSQL server,
                                         one database per service)
       │                  │
       └──► Kafka ◄───────┘             (the "bulletin board" for events)
            Kafka UI: http://localhost:8080
```

### What each part does

| Part | What it does |
|------|--------------|
| **web** | The website. Your browser only talks to this app. It calls the two services for you, so the browser never sees the services directly. |
| **project-service** | Owns **projects**. You can create, list, update, and delete projects, change a deadline, and see overdue projects. |
| **crew-service** | Owns **workers** and **assignments** (which worker is on which project). |
| **postgres** | The database server. It has two separate databases, `projects_db` and `crews_db`. Each service can only open its own database. |
| **kafka** | A message board. When something important happens, a service posts an "event" here and other services react to it. |
| **kafka-ui** | A web page where you can look at the events in Kafka. |

---

## How the services talk to each other

The services don't share a database. They keep in sync in two ways.

**1. A direct call (HTTP).**
Before crew-service assigns a worker to a project, it asks project-service: *"Does this project exist?"* It needs the answer right away, so it makes a direct call.

**2. Events (Kafka).**
For everything else, the services post events and don't wait for an answer.

| Event | Sent by | What happens next |
|-------|---------|-------------------|
| `ProjectUpdated` | project-service | crew-service updates its saved copy of the project name. |
| `ProjectDeleted` | project-service | crew-service removes all assignments for that project. |
| `WorkerAssigned` | crew-service | project-service adds the worker to its copy of the project's crew. |
| `AssignmentEnded` / `AssignmentRemoved` | crew-service | project-service removes the worker from its copy of the crew. |
| `WorkerUpdated` | crew-service | project-service updates the worker's name and trade in its copy. |

A few rules the code follows:

- **The change and the event happen together.** If an event can't be sent, the database change is cancelled and the API returns `503`. This way the database and the events always match.
- **Events can safely arrive twice.** Kafka may deliver the same event more than once, so the services handle repeats without creating duplicates.
- **No loops.** A service never sends an event *because of* another service's event. That prevents two services from triggering each other forever.
- **Catching up.** If a service is down for a while, it picks up from the last event it read once it comes back.

---

## How to run it

### What you need

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (it includes Docker Compose)

You don't need Node.js or PostgreSQL on your computer. Everything runs inside Docker.

### Start everything

From the project folder, run:

```bash
docker compose up -d --build
```

The first start takes a few minutes. When it's done, open:

- **Website:** http://localhost:3000
- **Kafka UI (see the events):** http://localhost:8080

### Stop it

```bash
docker compose down        # stops everything and keeps your data
docker compose down -v     # stops everything and DELETES all data
```

### See the logs

```bash
docker compose logs -f project-service crew-service
```

The logs show lines like `Published WorkerAssigned ...`, so you can watch events go from one service to the other.

---

## Using the website

- **Projects** (`/projects`): list, add, edit, and delete projects. Open a project to see who is working on it, assign a worker, or take a worker off.
- **Workers** (`/workers`): list, add, edit, and delete workers. Open a worker to see their assignments.

---

## Trying the APIs directly

The file `requests.http` has ready-made requests for both services. To use it:

1. Install the **REST Client** extension in VS Code.
2. Open `requests.http`.
3. Click **Send Request** above any block.
4. After you create a project or worker, copy its `id` into the variables at the top of the file.

### Project service (port 3001)

| Method | URL | What it does |
|--------|-----|--------------|
| GET | `/health` | Checks that the service is running |
| POST | `/projects` | Creates a project |
| GET | `/projects` | Lists projects (filters: `homeType`, `status`, `city`) |
| GET | `/projects/overdue` | Lists projects past their deadline that aren't completed |
| GET | `/projects/:id` | Gets one project |
| PUT | `/projects/:id` | Updates a project (send all fields) |
| PATCH | `/projects/:id/deadline` | Changes only the deadline |
| GET | `/projects/:id/crew` | Shows who is on the project (from this service's own copy) |
| DELETE | `/projects/:id` | Deletes a project |

### Crew service (port 3002)

| Method | URL | What it does |
|--------|-----|--------------|
| GET | `/health` | Checks that the service is running |
| POST | `/workers` | Adds a worker |
| GET | `/workers` | Lists workers (filters: `trade`, `active`) |
| GET | `/workers/:id` | Gets one worker and their assignments |
| PUT | `/workers/:id` | Updates a worker (send all fields) |
| DELETE | `/workers/:id` | Deletes a worker and their assignments |
| POST | `/assignments` | Assigns a worker to a project |
| PATCH | `/assignments/:id/end` | Takes a worker off a project (end date defaults to today) |
| GET | `/projects/:projectId/workers` | Lists the people on a project right now |
| GET | `/projects/:projectId/headcount` | Counts the people on a project, grouped by trade |

### Allowed values

- **Home type:** `single-family`, `two-story`, `ranch`, `townhome`, `condo`
- **Project status:** `planning`, `in-progress`, `completed`, `on-hold`
- **Trade:** `framing`, `concrete`, `electrical`, `plumbing`, `roofing`, `drywall`
- **Role:** `lead`, `worker`, `apprentice`
- **Dates:** always `YYYY-MM-DD` (for example `2027-03-31`)

---

## Folder layout

```
buildtrack/
├── docker-compose.yml      Starts every part together
├── requests.http           Sample API requests (VS Code REST Client)
├── db/init/                SQL that creates the two databases on first start
├── project-service/        Node.js + Express service for projects
│   └── src/
│       ├── index.js        API routes
│       ├── db.js           Database connection and tables
│       └── events.js       Sends and receives Kafka events
├── crew-service/           Node.js + Express service for workers and assignments
│   └── src/                (same layout as project-service)
└── web/                    Next.js website
    ├── app/                Pages, plus actions.js (handles form submissions)
    ├── components/         Shared forms, buttons, and badges
    └── lib/                api.js (calls the services), constants, formatting helpers
```

---

## Tech used

- **Node.js 24** with **Express 5** for the two services
- **Next.js 16** and **React 19** for the website
- **PostgreSQL 17** for the databases
- **Apache Kafka 3.9** (single server, no ZooKeeper) for events
- **Docker Compose** to run everything together

---

## Good to know

- **Passwords are for local use only.** The database logins in `docker-compose.yml` and `db/init/` (for example `admin` / `admin_pass`) are only meant for running on your own computer.
- **Tables are created automatically.** Each service creates its tables when it starts, so there's no separate setup step.
- **Some data is copied on purpose.** project-service keeps its own copy of each project's crew. Right after a change, that copy can be a moment behind crew-service.
- **If you change the dropdown lists**, update them in three places: `project-service/src/index.js`, `crew-service/src/index.js`, and `web/lib/constants.js`.
