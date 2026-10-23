-- Synthetic data for the Provider Book of Business demo.
-- Creates ~250K service requests, ~470 providers, ZIP centroids and sample customer feedback.
-- All names, IDs, ZIPs and coordinates are synthetic. Run this first, then setup.sql.

CREATE DATABASE IF NOT EXISTS DEMO_DB;
CREATE SCHEMA IF NOT EXISTS DEMO_DB.APPS;
CREATE WAREHOUSE IF NOT EXISTS BOB_DEMO_WH WAREHOUSE_SIZE = MEDIUM AUTO_SUSPEND = 60 AUTO_RESUME = TRUE;
USE WAREHOUSE BOB_DEMO_WH;
USE SCHEMA DEMO_DB.APPS;

-- Metros with centroid coordinates
CREATE OR REPLACE TEMPORARY TABLE METROS (METRO STRING, STATE STRING, LAT FLOAT, LON FLOAT, ZIP_BASE INT, WEIGHT INT) AS
SELECT * FROM VALUES
  ('Atlanta','GA',33.749,-84.388,30301,10), ('Austin','TX',30.267,-97.743,78701,8),
  ('Charlotte','NC',35.227,-80.843,28201,6), ('Chicago','IL',41.878,-87.630,60601,12),
  ('Columbus','OH',39.961,-82.999,43201,5),  ('Dallas','TX',32.777,-96.797,75201,11),
  ('Denver','CO',39.739,-104.990,80201,7),   ('Indianapolis','IN',39.768,-86.158,46201,5),
  ('Minneapolis','MN',44.978,-93.265,55401,6),('Nashville','TN',36.163,-86.781,37201,6),
  ('Phoenix','AZ',33.448,-112.074,85001,9),  ('Seattle','WA',47.606,-122.332,98101,8),
  ('Tampa','FL',27.951,-82.457,33601,7);

CREATE OR REPLACE TEMPORARY TABLE CATEGORIES (CATEGORY STRING, BASE_COST FLOAT, IDX INT) AS
SELECT * FROM VALUES
  ('Plumbing',450,0),('Electrical',380,1),('HVAC',900,2),('Roofing',2200,3),('Remodeling',3500,4),
  ('Painting',800,5),('Landscaping',300,6),('House Cleaning',180,7),('Handyman',220,8),('Pest Control',160,9);

-- 18 synthetic ZIPs per metro, scattered around the centroid
CREATE OR REPLACE TABLE DIM_ZIP AS
SELECT m.METRO, m.STATE, z.IDX AS ZIP_IDX, TO_VARCHAR(m.ZIP_BASE + z.IDX) AS ZIP,
       m.LAT::NUMBER(5,3) AS METRO_LAT, m.LON::NUMBER(6,3) AS METRO_LON,
       m.LAT + 0.12 * SIN(z.IDX * 1.7) * (0.4 + MOD(z.IDX, 5) / 5) AS LAT,
       m.LON + 0.15 * COS(z.IDX * 1.7) * (0.4 + MOD(z.IDX, 5) / 5) AS LON
FROM METROS m, (SELECT SEQ4() AS IDX FROM TABLE(GENERATOR(ROWCOUNT => 18))) z;

-- Providers
CREATE OR REPLACE TABLE DIM_PROVIDER_DEMO AS
WITH p AS (
  SELECT SEQ4() + 1 AS N, UNIFORM(0, 9, RANDOM()) AS CAT_IDX, UNIFORM(1, 100, RANDOM()) AS MPICK
  FROM TABLE(GENERATOR(ROWCOUNT => 470))
), m AS (
  SELECT *, SUM(WEIGHT) OVER (ORDER BY METRO) AS CUM, SUM(WEIGHT) OVER () AS TOT FROM METROS
)
SELECT 'PROV-' || LPAD(p.N, 5, '0') AS PROVIDER_ID,
       ARRAY_CONSTRUCT('Summit','Blue Ridge','Ace','Prime','Northside','Golden','Reliable','Metro','Elite','Cornerstone',
                       'Evergreen','Lakeside','Pioneer','Heritage','Swift')[MOD(p.N, 15)]::STRING || ' ' ||
         c.CATEGORY || ' ' || ARRAY_CONSTRUCT('Co.','Pros','Services','Group','LLC')[MOD(p.N, 5)]::STRING AS BUSINESS_NAME,
       c.CATEGORY AS SERVICE_CATEGORY, m.METRO AS CITY, m.STATE, m.METRO,
       ROUND(UNIFORM(32, 50, RANDOM()) / 10, 1)::FLOAT AS AVG_RATING,
       ROUND(UNIFORM(5, 480, RANDOM()) / 10, 1)::FLOAT AS RESPONSE_TIME_HRS,
       UNIFORM(1, 25, RANDOM())::NUMBER(20,0) AS YEARS_IN_BUSINESS,
       UNIFORM(0, 9, RANDOM()) < 7 AS IS_VERIFIED,
       DATEADD(day, -UNIFORM(30, 3650, RANDOM()), '2025-12-31'::DATE) AS ONBOARDED_DATE,
       NULL::VARCHAR(8) AS TENURE_BAND
FROM p
JOIN CATEGORIES c ON c.IDX = p.CAT_IDX
JOIN m ON p.MPICK * m.TOT / 100.0 <= m.CUM AND p.MPICK * m.TOT / 100.0 > m.CUM - m.WEIGHT;

UPDATE DIM_PROVIDER_DEMO SET TENURE_BAND = CASE
  WHEN DATEDIFF(year, ONBOARDED_DATE, '2025-12-31') >= 10 THEN '10+ yrs'
  WHEN DATEDIFF(year, ONBOARDED_DATE, '2025-12-31') >= 4 THEN '4-10 yrs' ELSE '0-3 yrs' END;

-- Service requests (250K), each matched to a provider in the same metro
CREATE OR REPLACE TABLE SERVICE_REQUESTS_LARGE AS
WITH r AS (
  SELECT SEQ4() AS N, UNIFORM(1, 470, RANDOM()) AS PNUM, UNIFORM(0, 17, RANDOM()) AS ZIP_IDX,
         UNIFORM(0, 1063, RANDOM()) AS DAY_OFF, UNIFORM(1, 100, RANDOM()) AS S, UNIFORM(1, 100, RANDOM()) AS CH,
         UNIFORM(0, 2313, RANDOM()) AS CUST
  FROM TABLE(GENERATOR(ROWCOUNT => 250000))
)
SELECT 'SR-' || LPAD(r.N, 7, '0') || '-0' AS REQUEST_ID,
       'CUST-' || LPAD(r.CUST, 6, '0') AS CUSTOMER_ID,
       p.PROVIDER_ID, p.SERVICE_CATEGORY,
       CASE WHEN r.CH <= 30 THEN 'Paid Search' WHEN r.CH <= 50 THEN 'SEO' WHEN r.CH <= 65 THEN 'Referral'
            WHEN r.CH <= 78 THEN 'Paid Social' WHEN r.CH <= 90 THEN 'Email' ELSE 'TV' END::VARCHAR(11) AS ACQUISITION_CHANNEL,
       p.METRO, p.STATE,
       DATEADD(day, r.DAY_OFF, '2023-01-31'::DATE) AS REQUEST_DATE,
       CASE WHEN r.S <= 72 THEN 'COMPLETED' WHEN r.S <= 82 THEN 'CANCELLED' WHEN r.S <= 86 THEN 'DISPUTED'
            WHEN r.S <= 92 THEN 'SCHEDULED' WHEN r.S <= 96 THEN 'IN_PROGRESS' ELSE 'PENDING' END::VARCHAR(11) AS STATUS,
       ROUND(c.BASE_COST * (0.4 + UNIFORM(0, 1600, RANDOM()) / 1000), 2)::FLOAT AS JOB_COST,
       GREATEST(1, LEAST(5, ROUND(p.AVG_RATING + NORMAL(0, 0.9, RANDOM()))))::FLOAT AS SATISFACTION_SCORE,
       z.ZIP
FROM r
JOIN DIM_PROVIDER_DEMO p ON p.PROVIDER_ID = 'PROV-' || LPAD(r.PNUM, 5, '0')
JOIN CATEGORIES c ON c.CATEGORY = p.SERVICE_CATEGORY
JOIN DIM_ZIP z ON z.METRO = p.METRO AND z.ZIP_IDX = r.ZIP_IDX;

-- Account manager notes (written back by the app; seed a few)
CREATE TABLE IF NOT EXISTS PROVIDER_NOTES (
  NOTE_ID STRING DEFAULT UUID_STRING(), PROVIDER_ID STRING, STATUS STRING, NOTE STRING,
  CREATED_BY STRING, CREATED_AT TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP());
INSERT INTO PROVIDER_NOTES (PROVIDER_ID, STATUS, NOTE, CREATED_BY)
SELECT PROVIDER_ID, 'Follow up', 'Seed note: review response times with this pro.', 'SEED'
FROM DIM_PROVIDER_DEMO SAMPLE (10 ROWS);

-- Customer feedback text for the optional Cortex Search tool
CREATE SCHEMA IF NOT EXISTS DEMO_DB.ANALYTICS;
CREATE OR REPLACE TABLE DEMO_DB.ANALYTICS.CUSTOMER_FEEDBACK AS
SELECT 'FB-' || LPAD(SEQ4(), 6, '0') AS DOC_ID,
       ARRAY_CONSTRUCT('Review','Support ticket','Survey')[UNIFORM(0, 2, RANDOM())]::STRING AS SOURCE_TYPE,
       r.SERVICE_CATEGORY, r.METRO, r.SATISFACTION_SCORE,
       CASE WHEN r.SATISFACTION_SCORE >= 4 THEN
              ARRAY_CONSTRUCT('Pro arrived on time and was very professional.', 'Fair price and clean work, would hire again.',
                              'Quick response and clear communication throughout.')[UNIFORM(0, 2, RANDOM())]::STRING
            ELSE
              ARRAY_CONSTRUCT('Pro was late and did not call ahead.', 'Final price was higher than the quote.',
                              'Job took much longer than expected and left a mess.',
                              'Hard to reach the pro after the job was booked.')[UNIFORM(0, 3, RANDOM())]::STRING
       END || ' (' || r.SERVICE_CATEGORY || ', ' || r.METRO || ')' AS FEEDBACK_TEXT
FROM DEMO_DB.APPS.SERVICE_REQUESTS_LARGE r SAMPLE (2000 ROWS);

SELECT (SELECT COUNT(*) FROM DEMO_DB.APPS.SERVICE_REQUESTS_LARGE) AS REQUESTS,
       (SELECT COUNT(*) FROM DEMO_DB.APPS.DIM_PROVIDER_DEMO) AS PROVIDERS,
       (SELECT COUNT(*) FROM DEMO_DB.APPS.DIM_ZIP) AS ZIPS,
       (SELECT COUNT(*) FROM DEMO_DB.ANALYTICS.CUSTOMER_FEEDBACK) AS FEEDBACK;
