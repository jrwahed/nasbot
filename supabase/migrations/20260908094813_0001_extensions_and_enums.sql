create extension if not exists pgcrypto;

create type gender_t        as enum ('female', 'male');
create type area_t          as enum ('tagamoa', 'maadi', 'zayed_october', 'heliopolis_nasr', 'downtown_zamalek', 'other');
create type girls_pref_t    as enum ('always', 'sometimes', 'no');
create type activity_t      as enum ('padel', 'running', 'swimming');
create type skill_t         as enum ('first_time', 'beginner', 'intermediate', 'good');
create type social_energy_t as enum ('starter', 'responder', 'listener', 'one_on_one');
create type group_pref_t    as enum ('calm', 'lively', 'depends');
create type persona_t       as enum ('explorer', 'social_captain', 'quiet_observer', 'first_timer', 'energy', 'storyteller');
create type role_t          as enum ('member', 'captain', 'admin');

create type venue_kind_t    as enum ('padel_club', 'kayak', 'cafe', 'restaurant', 'board_games', 'wadi', 'escape_room', 'paintball', 'workshop', 'tour_operator');
create type template_kind_t as enum ('sport', 'nile', 'nature', 'food', 'games', 'work', 'workshop', 'mystery', 'trip');
create type sbota_status_t  as enum ('draft', 'open', 'full', 'locked', 'running', 'done', 'cancelled');

create type booking_status_t   as enum ('pending_payment', 'paid', 'waitlist', 'cancelled_by_user', 'cancelled_by_us', 'no_show', 'attended', 'refunded');
create type refund_kind_t      as enum ('full', 'half', 'credit', 'none');
create type payment_provider_t as enum ('paymob', 'kashier', 'instapay', 'wallet');
create type payment_status_t   as enum ('initiated', 'pending_review', 'succeeded', 'failed', 'refunded', 'partially_refunded');
create type refund_type_t      as enum ('gateway', 'wallet_credit');
create type ledger_reason_t    as enum ('referral_reward', 'refund_credit', 'cancel_credit', 'coupon', 'spend', 'captain_free_sbota');
create type coupon_kind_t      as enum ('percent', 'fixed');

create type room_kind_t     as enum ('sbota_group', 'one_on_one');
create type member_role_t   as enum ('member', 'captain');
create type message_kind_t  as enum ('text', 'system', 'game');
create type report_reason_t as enum ('harassment', 'spam', 'unsafe', 'other');
create type report_status_t as enum ('open', 'reviewing', 'actioned', 'dismissed');
create type report_action_t as enum ('none', 'warn', 'remove_from_room', 'ban');

create type clue_kind_t      as enum ('image', 'audio', 'word');
create type flag_kind_t      as enum ('no_show', 'late_cancel', 'low_conduct', 'report_received', 'verified_id');
create type notify_channel_t as enum ('whatsapp', 'sms', 'email', 'inapp');
create type notify_status_t  as enum ('queued', 'sent', 'failed', 'read');

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function set_updated_at() is 'بيحدّث updated_at تلقائيًا في أي جدول متركب عليه.';;
