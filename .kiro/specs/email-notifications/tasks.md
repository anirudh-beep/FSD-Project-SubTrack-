# Implementation Plan: Email Notifications

## Overview

Implement automated daily email reminders for SubTrack using a Supabase Edge Function (Deno/TypeScript), Resend API, a database migration, and frontend settings UI changes.

## Tasks

- [x] 1. Database migration — extend `user_settings` and `notifications` schema
  - Add `email_notifications_enabled`, `email_reminder_days`, and `reminder_days` columns to `user_settings` using `ADD COLUMN IF NOT EXISTS`
  - Drop and recreate the `notifications_type_check` constraint to include `'email_summary'`
  - Append migration SQL to `supabase_schema.sql`
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 2. Implement Edge Function core logic
  - [x] 2.1 Scaffold `supabase/functions/send-renewal-emails/index.ts`
    - Create the Deno entry point with `serve()` handler
    - Read `RESEND_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` from environment
    - Initialise Supabase client with service role key
    - _Requirements: 1.1_

  - [x] 2.2 Implement `calculateNextRenewal(startDate, billingCycle)`
    - Force UTC via `start_date + 'T00:00:00Z'`
    - Loop monthly/yearly increments until result is in the future
    - Return `null` for unsupported billing cycles and log a warning
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ]* 2.3 Write property test for `calculateNextRenewal`
    - **Property 1: Renewal date is always in the future**
    - **Validates: Requirements 2.1, 2.2**
    - **Property 2: Unsupported billing cycle yields null**
    - **Validates: Requirements 2.4**
    - Use `fast-check` arbitraries: random past dates × `['Monthly', 'Yearly']` for P1; random strings excluding those values for P2
    - File: `supabase/functions/send-renewal-emails/index.test.ts`

  - [x] 2.4 Implement subscription query (14-day window)
    - Query `subscriptions` joined with `user_settings` where renewal falls within 14 days
    - Group results by `user_id`; apply per-user `email_reminder_days` filter (default 7 if null)
    - _Requirements: 1.2, 1.3, 4.4, 4.5_

  - [ ]* 2.5 Write property test for query window and per-user filter
    - **Property 4: Query window is bounded to 14 days**
    - **Validates: Requirements 1.2**
    - **Property 5: Per-user filter uses only `email_reminder_days`**
    - **Validates: Requirements 4.4, 4.5**
    - File: `supabase/functions/send-renewal-emails/index.test.ts`

- [x] 3. Implement deduplication and email dispatch
  - [x] 3.1 Implement dedup check against `notifications` table
    - Before sending, query for an `email_summary` row with matching `user_id` created on the current UTC day
    - Skip user if record exists
    - _Requirements: 6.1, 6.2_

  - [ ]* 3.2 Write property test for idempotency
    - **Property 8: At most one email per user per UTC day**
    - **Validates: Requirements 5.1, 6.1, 6.2, 6.4**
    - Simulate multiple notifier runs within the same UTC day using a mock DB
    - File: `supabase/functions/send-renewal-emails/index.test.ts`

  - [x] 3.3 Implement email HTML/text builder
    - Build HTML table with subscription name, amount, renewal date, billing cycle
    - Build plain-text fallback with the same fields
    - _Requirements: 5.3, 5.4_

  - [ ]* 3.4 Write property test for email content completeness
    - **Property 6: Email content contains all required fields**
    - **Validates: Requirements 5.3, 5.4**
    - Use `fast-check` to generate random subscription arrays and assert all fields appear in both `html` and `text` outputs
    - File: `supabase/functions/send-renewal-emails/index.test.ts`

  - [x] 3.5 Implement Resend API call and per-user error isolation
    - POST to `https://api.resend.com/emails` with Bearer auth
    - On 4xx/5xx for a user: log error with `user_id` and status, continue to next user
    - On network failure: log and exit without retrying
    - _Requirements: 5.2, 5.5, 5.6_

  - [ ]* 3.6 Write property test for per-user error isolation
    - **Property 7: Per-user error isolation**
    - **Validates: Requirements 5.5**
    - Inject failures at random positions in a user batch; assert all other users are still processed
    - File: `supabase/functions/send-renewal-emails/index.test.ts`

  - [x] 3.7 Implement post-send log insert into `notifications`
    - After a successful Resend call, insert `{ type: 'email_summary', user_id, title, message }` into `notifications`
    - _Requirements: 6.3_

  - [ ]* 3.8 Write property test for log record after successful send
    - **Property 9: Log record written after successful send**
    - **Validates: Requirements 6.3**
    - File: `supabase/functions/send-renewal-emails/index.test.ts`

  - [ ]* 3.9 Write property test for opt-out/opt-in behaviour
    - **Property 3: Opt-out prevents email; opt-in allows email**
    - **Validates: Requirements 3.2, 3.3**
    - File: `supabase/functions/send-renewal-emails/index.test.ts`

- [ ] 4. Checkpoint — Edge Function tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Frontend — add email settings UI to `notifications.html`
  - Add an "Email Notifications" section below the existing settings card
  - Add `#emailNotificationsEnabled` checkbox toggle
  - Add `#emailReminderDays` dropdown (3 / 7 / 14 days)
  - Relabel existing `#reminderDays` dropdown to "In-app reminder days"
  - _Requirements: 3.1, 4.1, 4.2, 7.1_

- [x] 6. Frontend — update `js/notifications.js` settings save/load
  - [x] 6.1 Update `loadNotificationSettings()` to read `email_notifications_enabled`, `email_reminder_days`, and `reminder_days` from `user_settings` via Supabase and pre-populate all form fields
    - _Requirements: 7.3_

  - [x] 6.2 Update `saveNotificationSettings()` to upsert `email_notifications_enabled`, `email_reminder_days`, and `reminder_days` to `user_settings` via Supabase; display inline error on write failure without navigating away
    - _Requirements: 7.2, 7.4_

  - [ ]* 6.3 Write property test for settings round-trip
    - **Property 10: Settings save/load round-trip**
    - **Validates: Requirements 7.2, 7.3**
    - **Property 11: `email_reminder_days` and `reminder_days` are independent**
    - **Validates: Requirements 4.3**
    - Mock Supabase client; assert upsert payload matches form values and that updating one column does not affect the other
    - File: `js/notifications.test.js`

  - [ ]* 6.4 Write unit tests for settings save/load
    - Test that a Supabase write failure shows an error message and does not navigate away
    - Test that missing `user_settings` row causes form to use defaults (`email_notifications_enabled = true`, `email_reminder_days = 7`, `reminder_days = 7`)
    - _Requirements: 7.4, 4.5, 4.6_
    - File: `js/notifications.test.js`

- [ ] 7. Final checkpoint — all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Property tests use `fast-check` (Deno-compatible) with a minimum of 100 iterations each
- Each property test is tagged `// Feature: email-notifications, Property N: <text>`
- The pg_cron schedule (`0 8 * * *`) and Resend API key secret must be configured manually in the Supabase dashboard after the Edge Function is deployed
