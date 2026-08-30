# Where Float runs when there are real patients

**Written 2026-08-29.** Not started. Peter's intent: do it in pieces as time allows, not in one go.

## Why this exists

**Railway will only sign a HIPAA business associate agreement at their $1,000/month committed
spend tier, on a one-year commitment.** That is $12,000 a year, and it is the whole reason this
document exists.

Without that agreement Float cannot legally hold real patient data on Railway. Not "should not" —
a covered entity cannot use a vendor for patient data without one.

Everything else here follows from that. Encryption at rest, which is what started this, turns out
to be the smaller question: Railway's documentation does not say whether volumes are encrypted at
rest (they document it for registry credentials and private networking, not for volumes). On
Cloud SQL it is on by default and documented.

## The deadline

Peter's plan has the patient study opening around December 2026 and running with real patients
December to February. Contracts, migration and verification all take time, so the decision wants
making in October at the latest — not in November.

## The recommendation

**Google Cloud: Cloud Run for the app, Cloud SQL for Postgres.**

Google's BAA is free and self-serve — you accept it in the console. Cloud Run, Cloud SQL, Secret
Manager and Cloud Storage are all covered. No sales call, no spend commitment.

AWS is the reasonable alternative and was weighed properly:

| | |
|---|---|
| **For AWS** | More people know it, which matters once the ops and AI hires land. More of it is written down, so agents produce more reliable AWS configuration. A hospital's procurement team never questions it. |
| **For Google Cloud** | Cloud Run is genuinely simpler for one container. AWS's closest equivalent is App Runner, which is less used and does not scale to zero, or ECS Fargate, which is a lot of setup for a single service. |

Google Cloud wins on the grounds that matter today: one person, one container, one database.
Revisit if someone joins who already knows AWS well.

## What moves

| Today | After |
|---|---|
| Railway app service | **Cloud Run** — the same container, scaling to zero |
| Railway Postgres (volume) | **Cloud SQL for PostgreSQL** — managed, encrypted at rest |
| Railway environment variables | **Secret Manager** |
| Railway push-to-deploy | **GitHub Actions** building and deploying |
| Netlify | **Cloud Storage + CDN**, or stays — see the open question below |

## The pieces, in an order that lets you stop between any two

Each of these is finishable on its own and leaves the system working. That is the point: none of
them commits you to the next one.

**1. Accept Google's BAA.** Minutes, free, commits to nothing. Do it first so the clock starts and
so the rest is not blocked behind paperwork.

**2. Write a Dockerfile.** About an hour. `backend/nixpacks.toml` and `backend/Procfile` describe a
Python 3.12 image installing `requirements.txt` and starting
`uvicorn app.main:app --host 0.0.0.0 --port 8080`. That is the whole image. It can live alongside
the Railway config without changing anything — Railway keeps using nixpacks.

**3. Stand up Cloud SQL with nothing in it.** Half a day, mostly IAM and the Cloud SQL connector.
Costs roughly $30–60/month for the smallest usable instance and can sit idle.

**4. Deploy the app to Cloud Run against that empty database.** Half a day. Nothing points at it;
production is untouched. This is where you find out what is actually hard.

**5. Solve migrations.** The fiddly bit, and worth its own sitting. Railway runs
`alembic upgrade head` as a pre-deploy step (`backend/railway.toml`). Cloud Run has no equivalent,
so it becomes a Cloud Run job or a step in the deploy pipeline. Getting this wrong means a deploy
that serves new code against an old schema.

**6. Move the data.** Trivial at this size — `pg_dump` and restore, 35 patients. Rehearse it
against the empty instance long before it matters.

**7. Cut over.** DNS, environment variables, and a plan for going back.

Steps 1 and 2 are worth doing this week regardless of the decision. Neither costs anything and
neither is wasted if you stay on Railway.

## Money

| | Now | After |
|---|---|---|
| Hosting | Railway usage | Cloud Run, near zero at this traffic |
| Database | Railway usage | Cloud SQL, roughly $30–60/month |
| BAA | **$12,000/year** | free |

## The real cost, which is not money

Railway is one screen. Google Cloud is IAM roles, service accounts, VPC connectors, and a console
you will occasionally fight. That lands on one person, every time something breaks at an
inconvenient moment.

Worth naming plainly, because the migration days are the part everyone estimates and the operating
complexity is the part that actually hurts.

## Open questions

**Netlify only signs a BAA on their Enterprise plan.** The frontend is static files and never
stores patient data — but it serves the code that handles it. A reasonable reading is that Netlify
is not a business associate; a cautious clinic's security review may disagree. Moving the frontend
to Cloud Storage removes the question and is easy, so it probably just gets done.

**Anthropic needs its own BAA regardless of where Float runs.** Clinical text goes to their API on
every extraction and every downward-arrow question. This is independent of this whole document and
should not wait for it.

**Twilio and Resend** both need one too. Twilio offers a BAA; Resend needs checking.

**Is Float a covered entity or a business associate of the clinics?** Still unanswered, still
shapes who owes what. It does not change the hosting decision.

## What this does not decide

Whether to move at all. Paying Railway $12,000 a year is a legitimate answer — it buys back the
operational simplicity, which for a solo developer is worth something real. This document exists so
that choice is made deliberately rather than by running out of time in November.
