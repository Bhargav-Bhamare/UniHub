# UniHub — Product Documentation

## Overview
UniHub is a campus management and collaboration platform that connects students, faculty, coordinators, and administrators. It centralizes assignments, lectures, attendance, events, placements, notifications, and basic student services.

## Problem Statement
1. Fragmented campus workflows: assignments, lectures, attendance and event management are spread across tools and email.
2. No unified notifications hub for cross-role actions (faculty → students/coordinator; coordinator/admin → students).
3. Manual attendance tracking that is error-prone and not tied to scheduled lectures.
4. Hard-to-manage onboarding and testing for multiple roles.

UniHub solves these by providing role-based dashboards, lecture-linked attendance, notification propagation, and admin management tools.

## Key Features
- Role-based dashboards: Student, Faculty, Coordinator, Admin
- Local authentication (email/password) and Google Sign-In (OAuth) for quick registration
- Assignment creation and submissions with notifications
- Lecture scheduling and lecture-based attendance (Present/Absent)
- Coordinator approval flows for events and leaves with notifications
- Admin CRUD for users, CSV export, and seeding utilities for testing
- Notifications persisted in database and queryable via APIs

## Tech Stack
- Node.js (Express) — backend server
- EJS — server-side templates / views
- MongoDB (Mongoose) — data persistence
- Passport.js (passport-google-oauth20) — Google OAuth
- express-session + connect-mongo — session storage
- Tailwind CDN — UI styling
- Render.com — recommended deployment

## Quick Start (Local)
Prerequisites: `node` and `npm`, MongoDB (Atlas or local)

1. Clone the repo
```bash
git clone <repo-url>
cd UniHub
```

2. Install dependencies
```bash
npm install
```

3. Create a `.env` (example values)
```
MONGODB_URI=mongodb://localhost:27017/unihub
SESSION_SECRET=some_long_secret
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
NODE_ENV=development
DEBUG=true
```

4. Start the server
```bash
node app.js
# or
npx nodemon app.js
```

5. Open `http://localhost:3000` and register or sign in with Google.

## Google OAuth Setup Summary
Follow these steps in Google Cloud Console:
- Create/Select a project
- OAuth consent screen: configure app name and add your email as a test user (if testing)
- Create OAuth client ID (Web application)
  - Authorized JavaScript origins: `http://localhost:3000`
  - Authorized redirect URIs: `http://localhost:3000/auth/google/callback`
- Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_CALLBACK_URL` to `.env`

For production (Render) replace `localhost` with your app domain (e.g., `https://your-app.onrender.com`) and add that exact redirect URI in Google Console.

## Deployment Notes (Render.com)
- Set environment vars on Render: `MONGODB_URI`, `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `NODE_ENV=production`, optionally `RENDER=true`.
- Ensure `GOOGLE_CALLBACK_URL` matches the Render app URL + `/auth/google/callback`.
- App sets `trust proxy` and `session.cookie.secure` when `NODE_ENV=production` or `RENDER=true`.

## Important Environment Variables
- `MONGODB_URI` — MongoDB connection string
- `SESSION_SECRET` — session encryption secret
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` — Google OAuth
- `NODE_ENV` — `development` or `production`
- `DEBUG` — set `true` to reveal error details for debugging (development only)

## Data Models (high level)
- `User` — name, email, password (optional for OAuth), googleId, role, department, semester, rollNumber
- `Assignment` — title, description, subject, dueDate, faculty, department, semester
- `Lecture` — title, subject, faculty, department, semester, date, startTime, endTime
- `Attendance` — date, subject, department, semester, records (student + status), lecture reference
- `Event`, `Placement`, `Notification`, `LeaveRequest`, `Fee`, `Result` — domain models for campus operations

## Notable Routes (summary)
- `GET /` — landing page
- `GET /auth/register`, `POST /auth/register` — register (auto-login after register)
- `GET /auth/login`, `POST /auth/login` — local login
- `GET /auth/google` → starts Google OAuth
- `GET /auth/google/callback` → Google OAuth callback
- `GET /faculty/dashboard`, `POST /faculty/assignments/new`, `POST /faculty/lectures/new`
- `GET /faculty/lectures/:id/students`, `POST /faculty/lectures/:id/attendance`
- `GET /student/dashboard`, `POST /api/student/leave`
- `GET /admin/...` — admin CRUD & CSV export endpoints

(Refer to `routes/dashboard.js` for full list and implementation details.)

## User Journey (Process Flow)

1. Visit the landing page (`/`) and choose to Register or Login.
2. Registration options:
   - Local: fill the registration form (name, email, password, role, department, semester). After successful registration the user is auto-logged-in and redirected to their role dashboard.
   - Google: click **Sign in with Google** to use OAuth; new accounts are created automatically and logged in.
3. After login the user lands on their role-based dashboard (`/student/dashboard`, `/faculty/dashboard`, `/coordinator/dashboard`, `/admin/dashboard`).
4. Typical flows by role:
   - Student: view assignments, upcoming lectures, attendance summary, events, placements, fees, results. Can register for events and apply for leaves via `/api/student/leave`.
   - Faculty: create assignments and lectures, open attendance modal for lectures, view submissions, notify students via assignment/lecture creation.
   - Coordinator: manage events, approve/reject leave requests, assign faculty to events, review department-level assignments/lectures.
   - Admin: create/edit users, export user lists to CSV, seed test data, run attendance tests, manage global settings.
5. Notifications are created by actions (assignments, lectures, approvals) and are visible to recipients via dashboard widgets and notification APIs.

## Feature Access by Role

- Students:
  - View personal dashboard with assignments, lectures, attendance, fees, results, and events
  - Register for events and apply for leave
  - Receive notifications from faculty, coordinator, and admin

- Faculty:
  - Create assignments and lectures
  - Mark lecture-based attendance and fetch students for a lecture
  - View and grade submissions
  - Broadcast announcements via notifications

- Coordinator:
  - Approve/reject events and leave requests
  - Assign faculty to events
  - Oversee department-level timetable and announcements

- Admin:
  - Full CRUD on users and domain objects
  - CSV export of users
  - Seed test data and run admin-only tools
  - Configure global site-level settings


## Error Handling & Debugging
- Set `DEBUG=true` in `.env` while debugging to return more details for server errors.
- Health/debug endpoints:
  - `/auth/google/status` — confirms `GOOGLE_CLIENT_ID` and callback are set
  - `/auth/debug/status` — shows DB connection state and env flags
- Common production pitfalls: incorrect redirect URI for Google OAuth, missing env vars on Render, MongoDB access restrictions (IP/network), session store misconfiguration.

## Migration & Cleanup
If you previously had a `username` unique index that allowed `null` values, migration steps are recommended:
1. Run a migration script to set `username` for existing users (e.g., set to their email)
2. Recreate a proper sparse unique index on `username` if desired.

I can provide a migration script if you want to run it against your database.

## Contribution & Development Workflow
- Branch from `main`, open PR with changes, run manual tests for registration, login (local & Google), assignment/lecture flows.
- Seed data via admin seed endpoints (see `routes/dashboard.js`) for quick testing.

## Team
- Bhargav Bhamare
- Palak Bisane

## License
Include your preferred license here (e.g., MIT).

---

If you want, I can also:
- Add a `README.md` summary with the same content at the project root,
- Create a migration script to fix existing users' `username` values,
- Add a `health` endpoint and a `start` script to `package.json` for Render.

Tell me which of these you'd like next.