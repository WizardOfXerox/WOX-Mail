# WoxMail — Contributing Guide

## Project Structure

```
H:\Ideas\Mail\
├── server/           # Express.js backend
│   ├── server.js     # Entry point
│   ├── migrations/   # SQL migrations (run in order)
│   ├── views/        # EJS templates (server-rendered pages)
│   ├── templates/    # System email HTML templates
│   ├── jobs/         # Background job files
│   └── src/
│       ├── config/   # Database, Redis, Socket.IO, constants
│       ├── middleware/  # Auth, CSRF, rate limit, validation
│       ├── routes/   # API route handlers
│       ├── services/ # Business logic layer
│       └── utils/    # Pure utility functions
├── client/           # React frontend (complex pages only)
│   ├── vite.config.js
│   └── src/
│       ├── dashboard/  # 3-pane inbox app
│       ├── settings/   # Settings page app
│       ├── admin/      # Admin panel app
│       └── shared/     # Shared hooks, API wrappers, CSS
├── public/           # Static assets (served directly)
│   ├── css/          # Stylesheets
│   ├── js/           # Vanilla JS (simple pages)
│   ├── dist/         # Vite build output (React bundles)
│   └── assets/       # Favicon, icons
└── docs/             # Documentation
```

## Code Style

### JavaScript
- **ES Modules** (`import`/`export`) everywhere
- **Async/await** over callbacks and `.then()`
- **Destructuring** for cleaner parameter extraction
- **Template literals** for string interpolation
- **Semicolons**: required
- **Quotes**: single quotes for strings
- **Indentation**: 2 spaces

### Naming Conventions
- **Files**: `kebab-case.js` (e.g., `email-sanitizer.js`)
- **Variables/functions**: `camelCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **Database columns**: `snake_case`
- **API request body**: `camelCase`
- **CSS classes**: `kebab-case`
- **React components**: `PascalCase`

### Database
- **Raw SQL** via `node-pg` (no ORM)
- **Parameterized queries** always (`$1, $2, ...` — never string concat)
- **Migrations** are numbered files (`001_...`, `002_...`) with `up()` and `down()` exports
- **Indexes**: create for any column used in WHERE/ORDER BY with high cardinality

### API Routes
- All API routes under `/api/`
- **RESTful conventions**: GET (list/read), POST (create), PUT (update), DELETE (remove)
- **Response format**: `{ data, pagination }` for lists, `{ item }` for single, `{ error }` for errors
- **Status codes**: 200 (ok), 201 (created), 400 (bad input), 401 (unauthorized), 403 (forbidden), 404 (not found), 429 (rate limited), 500 (server error)

### React Components
- **Functional components** with hooks (no class components)
- **State management**: React `useState`/`useReducer` — no Redux/Zustand
- **Data fetching**: custom `useApi` hook with `fetch()` — no React Query
- **Styling**: CSS classes from `globals.css` — no CSS-in-JS or Tailwind
- **Inline styles**: only for dynamic values, not for layout
- **Component files**: one component per file in `components/` subdirectory

### Security
- **Always hash passwords** with Argon2id
- **Always use parameterized SQL** — never build queries with string concatenation
- **CSRF protection** on all mutating endpoints (POST/PUT/DELETE)
- **Rate limiting** on auth endpoints (stricter) and general API (looser)
- **Input validation** via middleware before any business logic
- **Sanitize HTML** before rendering in email viewer (DOMPurify)
- **Never log sensitive data** (passwords, tokens, secrets)

## Adding a New Feature

1. **Migration**: Add a new migration file if database changes needed
2. **Service**: Create a service in `server/src/services/` for business logic
3. **Route**: Add API endpoints in `server/src/routes/`
4. **Tests**: Write test scenarios in the verification checklist
5. **React**: Add component in the appropriate app (`dashboard/`, `settings/`, `admin/`)
6. **CSS**: Add styles to `client/src/shared/styles/globals.css`
7. **Docs**: Update `docs/API.md` with new endpoints

## Running the Project

```bash
# Start database + cache
docker-compose up -d

# Install dependencies
npm install

# Run migrations
node server/migrations/run.js

# Build React client
cd client && npx vite build && cd ..

# Start development server
npm run dev --workspace=server
```

## Git Workflow

- **main**: production-ready code
- **dev**: active development
- **feature/xxx**: feature branches (merge into dev)
- Commit messages: `type: description` (e.g., `feat: add calendar CRUD`, `fix: OTP validation window`)
