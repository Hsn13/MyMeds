# MyMeds

MyMeds is an Express and MongoDB application for patients to track medications, record daily intake, and report side effects. Clinicians can view the records of patients who select them during signup. The application is hosted at [mymeds-kmzz.onrender.com](https://mymeds-kmzz.onrender.com).

This project is licensed under the ISC License; see [LICENSE](LICENSE).

## Requirements

- Node.js 22.12 or later (Node 24 is selected by `.nvmrc`)
- MongoDB database and a database user with access to the application database

## Local development

```sh
npm ci
cp .env.example .env
```

Set `MONGODB_URI` to the MongoDB connection string and replace `SESSION_SECRET` with a random secret of at least 32 characters. One way to generate it is:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Start the server and run the test suite:

```sh
npm start
npm test
```

The app listens on port 3000 by default. `PORT` can override it.

## Main areas

| Area | Routes | Purpose |
| --- | --- | --- |
| Account | `/auth/sign-up`, `/auth/sign-in`, `/auth/profile` | Registration, sessions, and profile management |
| Medication | `/medications` | Organize records with personal labels and date-derived scheduled/active/ended status |
| Intake | `/intake` | Record one intake status per medication per day |
| Side effects | `/side-effects` | Record and review side effects |
| Patient overview | `/` | A today-focused snapshot of manually recorded information |
| Patient dashboard | `/dashboard` | Filter intake and side-effect summaries by 7/30/90 days, custom dates, or medication |
| Clinician | `/clinician/patients` | Review assigned patient records and send messages, feedback, or non-urgent review requests |
| Messages | `/messages` | Private in-app coordination between patients and their assigned clinician |
| Health check | `/healthz` | Render readiness check; returns no user or configuration data |

The shared navigation includes a system-aware light/dark theme preference. Patient-defined medication categories are organizational labels only; the app does not recommend medicines or treatments. Messages and review requests are not monitored in real time and must not be used for emergencies.

The branded loading overlay appears during navigation within the running app. It cannot replace Render's platform loading page when a Free web service has spun down: Render serves that page before the MyMeds server is available. The Render Blueprint now specifies the paid Starter compute plan to avoid free-service spin-downs. Sync the Blueprint in Render to apply the plan; Render applies compute-plan changes on the first successful deploy after the update, and paid compute charges may apply.

## Production deployment on Render

`render.yaml` describes a Node web service, installs from the lockfile with `npm ci`, and uses `/healthz` for readiness checks. Set `MONGODB_URI` in the Render dashboard as a secret environment variable. Render can generate `SESSION_SECRET` from the Blueprint configuration, or it can be set manually to a high-entropy random value. Do not put production credentials in this repository.

Production sessions are stored in MongoDB, not process memory. The session cookie is HTTP-only, secure in production, SameSite=Lax, and expires after seven days. A session token protects state-changing forms. The app also applies security headers, a nonce-based content security policy, login/signup rate limits, and avoids writing request query strings or error details to logs. The default rate-limit store is per process; configure a shared store before running multiple web instances. Signing in again after deployment is expected because the session store changed from memory to MongoDB.

The Render host is suitable for an ordinary small web application operationally, but that alone does not establish suitability for protected health information (PHI). Before storing real identifiable health data, confirm the applicable Render plan, signed business associate agreement (BAA), and security/compliance configuration directly with Render and qualified counsel. The live data and BAA status have not been confirmed. Do not use production with real PHI until that review is complete.

## Privacy and access model

- `.env` and `.env.*` are ignored; `.env.example` contains placeholders only. Never commit a populated environment file, database export, or real patient data.
- Public registration intentionally allows both patient and clinician roles. Patients can choose an active clinician from the signup list; assigned clinicians can view those patients' medication, intake, and side-effect records and exchange in-app messages.
- Clinician registration does not verify professional credentials, and the app has no administrator approval workflow or MFA. A person may create a clinician account and be selected by a patient. This is an explicit product policy, not verified provider identity; do not treat the app as a trusted clinical system until clinician verification and appropriate access governance are added.
- Account deactivation prevents future sign-in. Restoring a deactivated account currently requires a database administrator; there is no in-app admin console.
- Use synthetic records for demos and testing.

## Tests and checks

`npm test` checks EJS compilation, view includes/render targets, representative page rendering, date-derived medication status, dashboard ownership/range filters, clinician messaging authorization, and authentication behavior. The suite does not create or modify production records. `npm audit --omit=dev` checks installed production dependencies against the npm advisory database.
