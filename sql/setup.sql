-- Provider Book of Business: Snowflake objects for the app.
-- Run AFTER sql/generate_data.sql. Replace ACCOUNTADMIN below with the role that deploys/owns the app if different.

USE WAREHOUSE BOB_DEMO_WH;
USE SCHEMA DEMO_DB.APPS;

-- 1. Cortex Search service over customer feedback (used by the chat agent)
CREATE OR REPLACE CORTEX SEARCH SERVICE DEMO_DB.ANALYTICS.FEEDBACK_SEARCH
  ON FEEDBACK_TEXT
  ATTRIBUTES SOURCE_TYPE, SERVICE_CATEGORY, METRO
  WAREHOUSE = BOB_DEMO_WH
  TARGET_LAG = '1 day'
  AS SELECT DOC_ID, SOURCE_TYPE, SERVICE_CATEGORY, METRO, FEEDBACK_TEXT FROM DEMO_DB.ANALYTICS.CUSTOMER_FEEDBACK;

-- 2. Semantic view (metric definitions match the app)
CREATE OR REPLACE SEMANTIC VIEW DEMO_DB.APPS.BOB_SV
  TABLES (
    REQUESTS AS DEMO_DB.APPS.SERVICE_REQUESTS_LARGE PRIMARY KEY (REQUEST_ID)
      COMMENT = 'One row per home service request (250K rows, homeowner job requests matched to pros).',
    PROVIDERS AS DEMO_DB.APPS.DIM_PROVIDER_DEMO PRIMARY KEY (PROVIDER_ID)
      WITH SYNONYMS = ('pros','service providers','contractors') COMMENT = 'Service provider (pro) dimension.',
    NOTES AS DEMO_DB.APPS.PROVIDER_NOTES PRIMARY KEY (NOTE_ID)
      COMMENT = 'Account manager notes written about pros from the Book of Business app.'
  )
  RELATIONSHIPS (
    REQUESTS_TO_PROVIDERS AS REQUESTS(PROVIDER_ID) REFERENCES PROVIDERS(PROVIDER_ID),
    NOTES_TO_PROVIDERS AS NOTES(PROVIDER_ID) REFERENCES PROVIDERS(PROVIDER_ID)
  )
  FACTS (
    REQUESTS.JOB_COST AS JOB_COST COMMENT = 'Job value in USD.',
    REQUESTS.SATISFACTION_SCORE AS SATISFACTION_SCORE COMMENT = 'Customer satisfaction 1-5.',
    REQUESTS.IS_COMPLETED AS IFF(STATUS = 'COMPLETED', 1, 0),
    REQUESTS.IS_CANCEL_DISPUTE AS IFF(STATUS IN ('CANCELLED','DISPUTED'), 1, 0),
    REQUESTS.IS_HAPPY AS IFF(SATISFACTION_SCORE >= 4, 1, 0)
  )
  DIMENSIONS (
    REQUESTS.REQUEST_ID AS REQUEST_ID,
    REQUESTS.CUSTOMER_ID AS CUSTOMER_ID,
    REQUESTS.SERVICE_CATEGORY AS SERVICE_CATEGORY WITH SYNONYMS = ('category','service type')
      COMMENT = 'Service category of the request, e.g. Plumbing, Roofing.',
    REQUESTS.ACQUISITION_CHANNEL AS ACQUISITION_CHANNEL WITH SYNONYMS = ('channel','marketing channel'),
    REQUESTS.METRO AS METRO WITH SYNONYMS = ('market','city','region') COMMENT = 'Metro area of the request.',
    REQUESTS.STATE AS STATE,
    REQUESTS.ZIP AS ZIP WITH SYNONYMS = ('zip code','postal code'),
    REQUESTS.REQUEST_DATE AS REQUEST_DATE COMMENT = 'Date the request was created.',
    REQUESTS.REQUEST_MONTH AS DATE_TRUNC('month', REQUEST_DATE),
    REQUESTS.REQUEST_YEAR AS YEAR(REQUEST_DATE),
    REQUESTS.STATUS AS STATUS COMMENT = 'Request status: COMPLETED, CANCELLED, DISPUTED, IN_PROGRESS, SCHEDULED, PENDING.',
    PROVIDERS.PROVIDER_ID AS PROVIDER_ID,
    PROVIDERS.BUSINESS_NAME AS BUSINESS_NAME WITH SYNONYMS = ('pro name','provider name','company'),
    PROVIDERS.PROVIDER_CATEGORY AS SERVICE_CATEGORY COMMENT = 'Primary category of the pro.',
    PROVIDERS.PROVIDER_CITY AS CITY,
    PROVIDERS.PROVIDER_STATE AS STATE,
    PROVIDERS.PROVIDER_METRO AS METRO,
    PROVIDERS.IS_VERIFIED AS IS_VERIFIED COMMENT = 'Whether the pro is verified.',
    PROVIDERS.TENURE_BAND AS TENURE_BAND,
    PROVIDERS.ONBOARDED_DATE AS ONBOARDED_DATE,
    NOTES.NOTE_STATUS AS STATUS COMMENT = 'Note status set by the account manager (e.g. At risk, Follow up).',
    NOTES.NOTE_TEXT AS NOTE,
    NOTES.CREATED_BY AS CREATED_BY,
    NOTES.CREATED_AT AS CREATED_AT
  )
  METRICS (
    REQUESTS.SERVICE_REQUESTS AS COUNT(requests.request_id) WITH SYNONYMS = ('requests','jobs','volume'),
    REQUESTS.GMV AS SUM(requests.job_cost) WITH SYNONYMS = ('gross merchandise value','revenue','job value total')
      COMMENT = 'Sum of JOB_COST in USD.',
    REQUESTS.AVG_JOB_VALUE AS AVG(requests.job_cost) WITH SYNONYMS = ('average job cost','AOV'),
    REQUESTS.CSAT AS AVG(requests.satisfaction_score) WITH SYNONYMS = ('satisfaction','customer satisfaction')
      COMMENT = 'Average satisfaction score (1-5).',
    REQUESTS.COMPLETION_PCT AS 100 * AVG(requests.is_completed) WITH SYNONYMS = ('completion rate')
      COMMENT = 'Percent of requests with STATUS = COMPLETED.',
    REQUESTS.CANCEL_DISPUTE_PCT AS 100 * AVG(requests.is_cancel_dispute) WITH SYNONYMS = ('cancellation rate','dispute rate')
      COMMENT = 'Percent of requests CANCELLED or DISPUTED.',
    REQUESTS.HAPPY_CUSTOMER_PCT AS 100 * AVG(requests.is_happy) WITH SYNONYMS = ('promoter pct','happy customers')
      COMMENT = 'Percent of requests rated 4 or 5 stars.',
    REQUESTS.ACTIVE_PROS AS COUNT(DISTINCT requests.provider_id) WITH SYNONYMS = ('active providers'),
    REQUESTS.UNIQUE_CUSTOMERS AS COUNT(DISTINCT requests.customer_id),
    NOTES.NOTE_COUNT AS COUNT(notes.note_id)
  )
  COMMENT = 'Book of Business: service requests, pros and account manager notes. Metric definitions match the app.'
  AI_SQL_GENERATION 'Round currency to whole dollars, CSAT to 2 decimals and percentages to 1 decimal. Dates span the REQUEST_DATE range in the data; for "last year" use the latest year present.'
  AI_VERIFIED_QUERIES (
    GMV_BY_METRO AS (
      QUESTION 'What is GMV and CSAT by metro?'
      SQL 'SELECT METRO, COUNT(*) AS REQUESTS, ROUND(SUM(JOB_COST)) AS GMV, ROUND(AVG(SATISFACTION_SCORE),2) AS CSAT FROM DEMO_DB.APPS.SERVICE_REQUESTS_LARGE GROUP BY 1 ORDER BY GMV DESC'),
    TOP_PROS AS (
      QUESTION 'Who are the top 10 pros by GMV?'
      SQL 'SELECT p.BUSINESS_NAME, p.METRO, COUNT(*) AS REQUESTS, ROUND(SUM(r.JOB_COST)) AS GMV, ROUND(AVG(r.SATISFACTION_SCORE),2) AS CSAT, ROUND(100*AVG(IFF(r.STATUS=''COMPLETED'',1,0)),1) AS COMPLETION_PCT FROM DEMO_DB.APPS.SERVICE_REQUESTS_LARGE r JOIN DEMO_DB.APPS.DIM_PROVIDER_DEMO p ON r.PROVIDER_ID=p.PROVIDER_ID GROUP BY 1,2 ORDER BY GMV DESC LIMIT 10'),
    MONTHLY_TREND AS (
      QUESTION 'Show monthly requests and GMV trend'
      SQL 'SELECT DATE_TRUNC(''month'',REQUEST_DATE) AS MONTH, COUNT(*) AS REQUESTS, ROUND(SUM(JOB_COST)) AS GMV FROM DEMO_DB.APPS.SERVICE_REQUESTS_LARGE GROUP BY 1 ORDER BY 1'),
    CANCEL_BY_CATEGORY AS (
      QUESTION 'Which service categories have the highest cancel or dispute rate?'
      SQL 'SELECT SERVICE_CATEGORY, COUNT(*) AS REQUESTS, ROUND(100*AVG(IFF(STATUS IN (''CANCELLED'',''DISPUTED''),1,0)),1) AS CANCEL_DISPUTE_PCT FROM DEMO_DB.APPS.SERVICE_REQUESTS_LARGE GROUP BY 1 ORDER BY 3 DESC')
  );

-- 3. Cortex Agent used by the "Ask the data" chat drawer
-- If your account does not have SNOWFLAKE_INTELLIGENCE.AGENTS yet, uncomment these two lines:
-- CREATE DATABASE IF NOT EXISTS SNOWFLAKE_INTELLIGENCE;
-- CREATE SCHEMA IF NOT EXISTS SNOWFLAKE_INTELLIGENCE.AGENTS;
CREATE OR REPLACE AGENT SNOWFLAKE_INTELLIGENCE.AGENTS.BOB_AGENT
  COMMENT = 'Book of Business assistant (service requests, pros, AM notes, customer feedback)'
  PROFILE = '{"display_name":"Book of Business"}'
  FROM SPECIFICATION
$$
models:
  orchestration: auto
instructions:
  response: "You are the Book of Business assistant for marketplace leaders and account managers. Be concise: lead with the answer, then 2-4 bullets. Format money as $1.2M, CSAT to 2 decimals, rates to 1 decimal percent. If the user message includes a [Context] block with app filters, apply those filters unless the user asks otherwise and say which filters you applied."
  orchestration: "Use book_of_business for any numbers: requests, GMV, CSAT, completion, cancel/dispute, happy customer %, active pros, top pros, trends, and account manager notes. Use customer_feedback for qualitative questions about what customers say, complaints or themes. For 'why' questions combine both."
  sample_questions:
    - question: "Which metros have the lowest CSAT and highest cancel/dispute rate?"
    - question: "Who are the top 10 pros by GMV and how is their completion rate?"
    - question: "What are customers complaining about in Plumbing?"
tools:
  - tool_spec:
      type: cortex_analyst_text_to_sql
      name: book_of_business
      description: "Structured marketplace data: 250K service requests with GMV, CSAT, status, channel, metro, category and dates; pro (provider) attributes; account manager notes on pros."
  - tool_spec:
      type: cortex_search
      name: customer_feedback
      description: "Free-text customer reviews and feedback about pros and jobs."
tool_resources:
  book_of_business:
    semantic_view: DEMO_DB.APPS.BOB_SV
    execution_environment:
      type: warehouse
      warehouse: BOB_DEMO_WH
  customer_feedback:
    name: DEMO_DB.ANALYTICS.FEEDBACK_SEARCH
    max_results: 5
    id_column: DOC_ID
    title_column: SOURCE_TYPE
$$;

-- 4. Caller's rights grants. The app runs queries as the signed-in user (executeAsCaller: true),
--    so the app owner role needs CALLER grants on everything the app or agent touches.
GRANT CALLER USAGE ON WAREHOUSE BOB_DEMO_WH TO ROLE ACCOUNTADMIN;
GRANT CALLER USAGE ON DATABASE DEMO_DB TO ROLE ACCOUNTADMIN;
GRANT CALLER USAGE ON SCHEMA DEMO_DB.APPS TO ROLE ACCOUNTADMIN;
GRANT CALLER USAGE ON SCHEMA DEMO_DB.ANALYTICS TO ROLE ACCOUNTADMIN;
GRANT CALLER SELECT ON TABLE DEMO_DB.APPS.SERVICE_REQUESTS_LARGE TO ROLE ACCOUNTADMIN;
GRANT CALLER SELECT ON TABLE DEMO_DB.APPS.DIM_PROVIDER_DEMO TO ROLE ACCOUNTADMIN;
GRANT CALLER SELECT ON TABLE DEMO_DB.APPS.DIM_ZIP TO ROLE ACCOUNTADMIN;
GRANT CALLER SELECT, INSERT ON TABLE DEMO_DB.APPS.PROVIDER_NOTES TO ROLE ACCOUNTADMIN;
GRANT CALLER SELECT, REFERENCES ON SEMANTIC VIEW DEMO_DB.APPS.BOB_SV TO ROLE ACCOUNTADMIN;
GRANT CALLER USAGE ON CORTEX SEARCH SERVICE DEMO_DB.ANALYTICS.FEEDBACK_SEARCH TO ROLE ACCOUNTADMIN;
GRANT CALLER USAGE ON DATABASE SNOWFLAKE_INTELLIGENCE TO ROLE ACCOUNTADMIN;
GRANT CALLER USAGE ON SCHEMA SNOWFLAKE_INTELLIGENCE.AGENTS TO ROLE ACCOUNTADMIN;
GRANT CALLER USAGE ON AGENT SNOWFLAKE_INTELLIGENCE.AGENTS.BOB_AGENT TO ROLE ACCOUNTADMIN;
