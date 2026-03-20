# Requirements Document

## Introduction

The Email Notifications feature adds automated email reminders to SubTrack, a subscription tracking web app. Currently, SubTrack generates in-app notifications when subscriptions are about to renew. This feature extends that capability by sending email reminders to users via a Supabase Edge Function that runs on a daily schedule. Users can independently configure how many days in advance they want email reminders (separate from their in-app reminder setting), and the system will send a single formatted summary email per user per day listing all upcoming renewals within that window. Email delivery is handled by the Resend API.

## Glossary

- **Scheduler**: The Supabase Edge Function configured with a cron trigger that runs once per day
- **Notifier**: The logic within the Edge Function responsible for querying subscriptions and dispatching emails
- **Email_Service**: The Resend API (resend.com), the external email delivery provider used to send transactional emails
- **User_Settings**: The `user_settings` table row for a given user, which stores notification preferences
- **Email_Reminder_Window**: The number of days before a renewal date within which an email reminder is sent (configurable: 3, 7, or 14 days); stored in `email_reminder_days`; independent of the in-app reminder setting
- **InApp_Reminder_Window**: The number of days before a renewal date within which an in-app notification is generated (configurable: 3, 7, or 14 days); stored in `reminder_days`; independent of the email reminder setting
- **Renewal_Date**: The next calculated billing date for a subscription based on `start_date` and `billing_cycle`
- **Email_Log**: The `notifications` table, used to record that a daily summary email was sent to a given user
- **Settings_Page**: The existing `notifications.html` page where users configure notification preferences

## Requirements

### Requirement 1: Daily Scheduled Email Check

**User Story:** As a SubTrack user, I want the system to automatically check my upcoming renewals every day, so that I receive timely email reminders without any manual action.

#### Acceptance Criteria

1. THE Scheduler SHALL execute the Notifier once every 24 hours via a cron trigger.
2. WHEN the Scheduler executes, THE Notifier SHALL query all active subscriptions whose calculated Renewal_Date falls within the next 14 days (the maximum possible Email_Reminder_Window).
3. WHEN the Scheduler executes, THE Notifier SHALL retrieve the User_Settings for each subscription owner to determine their configured Email_Reminder_Window and whether email notifications are enabled.
4. IF the Scheduler fails to execute at the scheduled time, THEN THE Scheduler SHALL attempt re-execution on the next scheduled interval.

---

### Requirement 2: Renewal Date Calculation

**User Story:** As a SubTrack user, I want the system to correctly calculate when my subscriptions renew, so that reminders are sent at the right time.

#### Acceptance Criteria

1. WHEN calculating the Renewal_Date for a subscription with `billing_cycle` of `Monthly`, THE Notifier SHALL add one month to the `start_date` repeatedly until the result is in the future.
2. WHEN calculating the Renewal_Date for a subscription with `billing_cycle` of `Yearly`, THE Notifier SHALL add one year to the `start_date` repeatedly until the result is in the future.
3. THE Notifier SHALL calculate Renewal_Date using UTC dates to avoid timezone-related off-by-one errors.
4. IF a subscription has a `billing_cycle` value other than `Monthly` or `Yearly`, THEN THE Notifier SHALL skip that subscription and log a warning.

---

### Requirement 3: User Opt-Out of Email Notifications

**User Story:** As a SubTrack user, I want to be able to disable email notifications entirely, so that I only receive reminders through the channels I choose.

#### Acceptance Criteria

1. THE Settings_Page SHALL display a toggle labelled "Email Notifications" that enables or disables all email reminders independently of in-app notifications.
2. WHEN the user disables the email notifications toggle, THE Notifier SHALL skip sending any emails to that user.
3. WHEN the user enables the email notifications toggle, THE Notifier SHALL resume sending emails to that user according to their Email_Reminder_Window.
4. THE default value of `email_notifications_enabled` SHALL be `true` for all new users.

---

### Requirement 4: Independent Email and In-App Reminder Day Settings

**User Story:** As a SubTrack user, I want to set separate reminder windows for email and in-app notifications, so that I can receive in-app alerts earlier and email summaries closer to the renewal date (or vice versa).

#### Acceptance Criteria

1. THE Settings_Page SHALL display a separate dropdown for the Email_Reminder_Window (3, 7, or 14 days), distinct from the existing in-app reminder days dropdown.
2. THE Settings_Page SHALL display a separate dropdown for the InApp_Reminder_Window (3, 7, or 14 days), distinct from the email reminder days dropdown.
3. WHEN the user saves notification settings, THE Settings_Page SHALL persist `email_reminder_days` and `reminder_days` as independent columns in the `user_settings` table.
4. WHEN the Notifier processes a user's subscriptions, THE Notifier SHALL read only `email_reminder_days` to determine the Email_Reminder_Window; it SHALL NOT use `reminder_days`.
5. IF a user has no `email_reminder_days` value set, THEN THE Notifier SHALL use a default Email_Reminder_Window of 7 days.
6. IF a user has no `reminder_days` value set, THEN THE Settings_Page SHALL default the InApp_Reminder_Window to 7 days.

---

### Requirement 5: Daily Summary Email Per User

**User Story:** As a SubTrack user, I want to receive a single daily email listing all my upcoming renewals, so that I am not flooded with one email per subscription.

#### Acceptance Criteria

1. WHEN one or more of a user's subscriptions have a Renewal_Date within their Email_Reminder_Window, THE Notifier SHALL send exactly one summary email to that user per UTC day containing all qualifying renewals.
2. THE Email_Service SHALL deliver the email to the address associated with the user's Supabase auth account.
3. THE Notifier SHALL include the following for each qualifying subscription in the summary email: subscription name, renewal amount, renewal date, and billing cycle.
4. THE Notifier SHALL format the email as valid HTML with a plain-text fallback.
5. IF the Email_Service returns an error for a given user, THEN THE Notifier SHALL log the error and continue processing remaining users.
6. IF the Email_Service is unavailable, THEN THE Notifier SHALL log the failure and exit without retrying in the same execution.

---

### Requirement 6: Duplicate Email Prevention

**User Story:** As a SubTrack user, I want to receive only one summary email per day, so that I am not sent duplicate emails if the Scheduler runs more than once.

#### Acceptance Criteria

1. BEFORE sending a summary email to a user, THE Notifier SHALL check the Email_Log for an existing record with matching `user_id` and `type` of `email_summary` created within the current UTC day.
2. IF a matching Email_Log record exists for that user and UTC day, THEN THE Notifier SHALL skip sending an email to that user.
3. AFTER successfully sending a summary email, THE Notifier SHALL insert a record into the Email_Log with `type` set to `email_summary`, the `user_id`, and the current UTC date.
4. FOR ALL users processed in a single Scheduler run, the count of summary emails sent per user SHALL be at most 1 (idempotency property).

---

### Requirement 7: Frontend Settings Integration

**User Story:** As a SubTrack user, I want to manage my email notification preferences from the existing notifications settings page, so that I have a single place to control all notification behaviour.

#### Acceptance Criteria

1. THE Settings_Page SHALL display the email notifications toggle (Requirement 3) and the email reminder days dropdown (Requirement 4) grouped together under an "Email Notifications" section.
2. WHEN the user saves settings, THE Settings_Page SHALL write `email_notifications_enabled` and `email_reminder_days` to the `user_settings` table via the Supabase client.
3. WHEN the Settings_Page loads, THE Settings_Page SHALL read the current values of `email_notifications_enabled`, `email_reminder_days`, and `reminder_days` from the `user_settings` table and pre-populate all form fields.
4. IF the Supabase write fails when saving settings, THEN THE Settings_Page SHALL display an error message to the user without navigating away.

---

### Requirement 8: Schema Migration

**User Story:** As a developer, I want the database schema to support email notification preferences, so that user settings can be persisted and queried by the Edge Function.

#### Acceptance Criteria

1. THE database schema SHALL include an `email_notifications_enabled` boolean column on the `user_settings` table with a default value of `true`.
2. THE database schema SHALL include an `email_reminder_days` integer column on the `user_settings` table with a default value of `7`.
3. THE database schema SHALL include a `reminder_days` integer column on the `user_settings` table with a default value of `7`, representing the in-app reminder window independently of `email_reminder_days`.
4. THE database schema SHALL include a `type` column check constraint on the `notifications` table that permits the value `email_summary` in addition to existing types.
5. THE migration SQL SHALL be idempotent, using `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` so it can be run safely on an existing database.
