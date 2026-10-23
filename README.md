# Provider Book of Business (Snowflake App Runtime demo)

An interactive reporting app for a home services marketplace, built with Next.js and deployed on **Snowflake App Runtime**. All data is synthetic.

## Features
- **Overview:** live KPIs (requests, GMV, CSAT, completion rate, active pros) that update as you filter.
- **Market Map and Heatmaps:** ZIP-level map and category by month heatmaps.
- **Request Detail:** drill down to individual requests and providers.
- **Provider Notes:** account managers write notes back to a Snowflake table.
- **Ask the data:** a chat drawer backed by a Cortex Agent (semantic view plus Cortex Search over feedback).
- **Deep links:** the URL tracks the filters and tab, e.g. `?metro=Denver&category=HVAC&tab=map`.
- **Caller's rights:** queries run as the signed-in user (`executeAsCaller: true`), so each person sees only what their role allows.

## Prerequisites
- A Snowflake account with App Runtime and Cortex (Agents, Analyst, Search) available.
- [Snowflake CLI](https://docs.snowflake.com/en/developer-guide/snowflake-cli/index) with a default connection configured.
- Node.js 20+.

## Setup
Run these in order. The scripts use `ACCOUNTADMIN`. If another role will own the app, replace it in `sql/setup.sql`.

```bash
# 1. Create DEMO_DB, the BOB_DEMO_WH warehouse and ~250K rows of synthetic data
snow sql -f sql/generate_data.sql

# 2. Create the Cortex Search service, semantic view, Cortex Agent and caller grants
snow sql -f sql/setup.sql

# 3. Build and deploy the app
npm install
npm run build
snow app deploy
```

The deploy prints the app URL. To grant other users access, see the App Runtime docs on sharing applications.

## Objects created
| Object | Purpose |
|---|---|
| `DEMO_DB.APPS.SERVICE_REQUESTS_LARGE` | 250K service requests |
| `DEMO_DB.APPS.DIM_PROVIDER_DEMO` | 470 service providers |
| `DEMO_DB.APPS.DIM_ZIP` | Synthetic ZIP centroids for the map |
| `DEMO_DB.APPS.PROVIDER_NOTES` | Notes written back from the app |
| `DEMO_DB.ANALYTICS.CUSTOMER_FEEDBACK` | Feedback text for search |
| `DEMO_DB.ANALYTICS.FEEDBACK_SEARCH` | Cortex Search service |
| `DEMO_DB.APPS.BOB_SV` | Semantic view with the app's metric definitions |
| `SNOWFLAKE_INTELLIGENCE.AGENTS.BOB_AGENT` | Cortex Agent used by the chat drawer |
| `BOB_DEMO_WH` | Medium warehouse used by the app and agent |
| `DEMO_DB.APPS.BOB_APP` | The App Runtime application (created by `snow app deploy`) |

## Local development
```bash
npm install
npm run dev
```
The app uses your default Snowflake CLI connection. Set `SNOWFLAKE_CONNECTION_NAME=myconn` to use a different one. The chat drawer needs the deployed app's tokens for caller's rights. Locally it falls back to your own connection.

## Operations
```sql
-- Pause / resume
ALTER APPLICATION SERVICE DEMO_DB.APPS.BOB_APP SUSPEND;
ALTER APPLICATION SERVICE DEMO_DB.APPS.BOB_APP RESUME;
-- Roll back to a previous deploy
ALTER APPLICATION SERVICE DEMO_DB.APPS.BOB_APP UPGRADE TO VERSION VERSION$1;
```
Set `auto_suspend_secs` (minimum 300) and `auto_resume` in `app.yml` so they persist across deploys.

## Clean up
```sql
DROP APPLICATION SERVICE IF EXISTS DEMO_DB.APPS.BOB_APP;
DROP AGENT IF EXISTS SNOWFLAKE_INTELLIGENCE.AGENTS.BOB_AGENT;
DROP DATABASE IF EXISTS DEMO_DB;
DROP WAREHOUSE IF EXISTS BOB_DEMO_WH;
```
