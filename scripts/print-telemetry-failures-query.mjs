#!/usr/bin/env node
/**
 * Prints a PostHog HogQL query for top media failure signatures.
 *
 * Usage:
 *   npm run telemetry:failures:query -- [days] [limit]
 * Example:
 *   npm run telemetry:failures:query -- 7 20
 */

const days = Number(process.argv[2] ?? 7)
const limit = Number(process.argv[3] ?? 15)

const safeDays = Number.isFinite(days) && days > 0 ? Math.floor(days) : 7
const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 15

const query = `
/* Top media failure signatures (last ${safeDays} days) */
WITH failures AS (
  SELECT
    timestamp,
    event,
    properties.browser_engine AS browser_engine,
    properties.requested_format AS requested_format,
    properties.output_format AS output_format,
    properties.source_kind AS source_kind,
    properties.source_format AS source_format,
    properties.source_sniffed_container AS source_sniffed_container,
    properties.source_video_sample_entry AS source_video_sample_entry,
    properties.source_webm_codec AS source_webm_codec,
    properties.source_duration_bucket AS source_duration_bucket,
    properties.source_dimension_bucket AS source_dimension_bucket,
    properties.reason AS reason,
    properties.media_error_code AS media_error_code
  FROM events
  WHERE
    timestamp >= now() - INTERVAL ${safeDays} DAY
    AND event IN ('media_export_failed', 'media_error', 'media_stalled')
)
SELECT
  event,
  coalesce(browser_engine, 'unknown') AS browser_engine,
  coalesce(requested_format, 'n/a') AS requested_format,
  coalesce(source_format, 'unknown') AS source_format,
  coalesce(source_sniffed_container, 'unknown') AS source_sniffed_container,
  coalesce(source_video_sample_entry, source_webm_codec, 'unknown') AS codec_hint,
  coalesce(source_duration_bucket, 'unknown') AS duration_bucket,
  coalesce(source_dimension_bucket, 'unknown') AS dimension_bucket,
  coalesce(reason, concat('media_error_code=', toString(media_error_code)), 'unknown') AS reason_signature,
  count() AS failures,
  uniq(distinct_id) AS affected_users,
  min(timestamp) AS first_seen,
  max(timestamp) AS last_seen
FROM failures
GROUP BY
  event,
  browser_engine,
  requested_format,
  source_format,
  source_sniffed_container,
  codec_hint,
  duration_bucket,
  dimension_bucket,
  reason_signature
ORDER BY failures DESC
LIMIT ${safeLimit}
`

console.log(query.trim())
