CREATE TYPE "public"."damage_severity" AS ENUM('MINOR', 'MODERATE', 'MAJOR');--> statement-breakpoint
CREATE TYPE "public"."damage_stage" AS ENUM('PICKUP', 'RETURN', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."damage_status" AS ENUM('OPEN', 'REPAIRED', 'WAIVED');--> statement-breakpoint
CREATE TYPE "public"."deposit_status" AS ENUM('PENDING', 'HELD', 'RELEASED', 'CAPTURED', 'FAILED', 'CANCELED');--> statement-breakpoint
CREATE TYPE "public"."extra_charge_type" AS ENUM('PER_DAY', 'PER_RENTAL');--> statement-breakpoint
CREATE TYPE "public"."fuel_type" AS ENUM('PETROL', 'DIESEL', 'HYBRID', 'ELECTRIC');--> statement-breakpoint
CREATE TYPE "public"."payment_kind" AS ENUM('RENTAL', 'ADDITIONAL_CHARGES');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'PARTIALLY_REFUNDED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('PENDING', 'CONFIRMED', 'PICKED_UP', 'RETURNED', 'CANCELLED', 'EXPIRED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."transmission" AS ENUM('AUTOMATIC', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('CUSTOMER', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."vehicle_status" AS ENUM('AVAILABLE', 'RESERVED', 'ON_RENT', 'MAINTENANCE', 'RETIRED');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"actor_type" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_logs_actor_type" CHECK ("audit_logs"."actor_type" in ('USER', 'SYSTEM', 'WEBHOOK'))
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"address" text NOT NULL,
	"phone" text,
	"email" text,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"time_zone" text DEFAULT 'Asia/Dubai' NOT NULL,
	"opening_hours" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_airport" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branches_code_format" CHECK ("branches"."code" ~ '^[A-Z0-9]{2,10}$'),
	CONSTRAINT "branches_slug_format" CHECK ("branches"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "branches_time_zone_format" CHECK ("branches"."time_zone" ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+)+$' or "branches"."time_zone" = 'UTC'),
	CONSTRAINT "branches_latitude_range" CHECK ("branches"."latitude" between -90 and 90),
	CONSTRAINT "branches_longitude_range" CHECK ("branches"."longitude" between -180 and 180)
);
--> statement-breakpoint
CREATE TABLE "damage_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"reservation_id" uuid,
	"reported_by" uuid,
	"stage" "damage_stage" DEFAULT 'OTHER' NOT NULL,
	"severity" "damage_severity" NOT NULL,
	"status" "damage_status" DEFAULT 'OPEN' NOT NULL,
	"location" text NOT NULL,
	"description" text NOT NULL,
	"estimated_cost_fils" integer DEFAULT 0 NOT NULL,
	"charged_fils" integer DEFAULT 0 NOT NULL,
	"image_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "damage_reports_money_nonneg" CHECK ("damage_reports"."estimated_cost_fils" >= 0 and "damage_reports"."charged_fils" >= 0)
);
--> statement-breakpoint
CREATE TABLE "deposits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"provider" text NOT NULL,
	"provider_deposit_id" text,
	"idempotency_key" text NOT NULL,
	"amount_fils" integer NOT NULL,
	"captured_fils" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'AED' NOT NULL,
	"status" "deposit_status" DEFAULT 'PENDING' NOT NULL,
	"failure_reason" text,
	"last_event_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deposits_amount_positive" CHECK ("deposits"."amount_fils" > 0),
	CONSTRAINT "deposits_capture_range" CHECK ("deposits"."captured_fils" >= 0 and "deposits"."captured_fils" <= "deposits"."amount_fils"),
	CONSTRAINT "deposits_attempt_positive" CHECK ("deposits"."attempt" >= 1),
	CONSTRAINT "deposits_currency" CHECK ("deposits"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "driver_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"date_of_birth" date NOT NULL,
	"phone" text NOT NULL,
	"nationality" text,
	"licence_number" text NOT NULL,
	"licence_country" text NOT NULL,
	"licence_issued_on" date,
	"licence_expires_on" date NOT NULL,
	"licence_front_key" text,
	"licence_back_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "driver_profiles_licence_after_birth" CHECK ("driver_profiles"."licence_expires_on" > "driver_profiles"."date_of_birth"),
	CONSTRAINT "driver_profiles_country_code" CHECK ("driver_profiles"."licence_country" ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
CREATE TABLE "extras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"charge_type" "extra_charge_type" NOT NULL,
	"price_fils" integer NOT NULL,
	"max_charge_fils" integer,
	"max_quantity" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "extras_price_nonneg" CHECK ("extras"."price_fils" >= 0),
	CONSTRAINT "extras_cap_nonneg" CHECK ("extras"."max_charge_fils" is null or "extras"."max_charge_fils" >= 0),
	CONSTRAINT "extras_max_quantity" CHECK ("extras"."max_quantity" between 1 and 10)
);
--> statement-breakpoint
CREATE TABLE "maintenance_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"period" "tstzrange" GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED NOT NULL,
	"reason" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maintenance_blocks_period_valid" CHECK ("maintenance_blocks"."ends_at" > "maintenance_blocks"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "payment_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"event_created_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"outcome" text
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"kind" "payment_kind" DEFAULT 'RENTAL' NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"provider" text NOT NULL,
	"provider_payment_id" text,
	"idempotency_key" text NOT NULL,
	"amount_fils" integer NOT NULL,
	"refunded_fils" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'AED' NOT NULL,
	"status" "payment_status" DEFAULT 'PENDING' NOT NULL,
	"failure_reason" text,
	"last_event_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount_fils" > 0),
	CONSTRAINT "payments_refund_range" CHECK ("payments"."refunded_fils" >= 0 and "payments"."refunded_fils" <= "payments"."amount_fils"),
	CONSTRAINT "payments_attempt_positive" CHECK ("payments"."attempt" >= 1),
	CONSTRAINT "payments_currency" CHECK ("payments"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "pricing_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category_id" uuid NOT NULL,
	"branch_id" uuid,
	"daily_rate_fils" integer NOT NULL,
	"min_days" integer DEFAULT 1 NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"priority" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pricing_rules_rate_positive" CHECK ("pricing_rules"."daily_rate_fils" > 0),
	CONSTRAINT "pricing_rules_min_days" CHECK ("pricing_rules"."min_days" >= 1),
	CONSTRAINT "pricing_rules_dates" CHECK ("pricing_rules"."valid_to" is null or "pricing_rules"."valid_from" is null or "pricing_rules"."valid_to" >= "pricing_rules"."valid_from")
);
--> statement-breakpoint
CREATE TABLE "rental_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"agreement_number" text NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"checked_out_at" timestamp with time zone NOT NULL,
	"checked_out_by" uuid,
	"pickup_mileage_km" integer NOT NULL,
	"pickup_fuel_eighths" integer NOT NULL,
	"pickup_notes" text,
	"checked_in_at" timestamp with time zone,
	"checked_in_by" uuid,
	"return_branch_id" uuid,
	"return_mileage_km" integer,
	"return_fuel_eighths" integer,
	"return_notes" text,
	"late_minutes" integer DEFAULT 0 NOT NULL,
	"late_fee_fils" integer DEFAULT 0 NOT NULL,
	"fuel_charge_fils" integer DEFAULT 0 NOT NULL,
	"damage_charge_fils" integer DEFAULT 0 NOT NULL,
	"additional_vat_fils" integer DEFAULT 0 NOT NULL,
	"additional_total_fils" integer DEFAULT 0 NOT NULL,
	"deposit_captured_fils" integer DEFAULT 0 NOT NULL,
	"balance_due_fils" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rental_agreements_pickup_mileage" CHECK ("rental_agreements"."pickup_mileage_km" >= 0),
	CONSTRAINT "rental_agreements_pickup_fuel" CHECK ("rental_agreements"."pickup_fuel_eighths" between 0 and 8),
	CONSTRAINT "rental_agreements_return_fuel" CHECK ("rental_agreements"."return_fuel_eighths" is null or "rental_agreements"."return_fuel_eighths" between 0 and 8),
	CONSTRAINT "rental_agreements_return_mileage" CHECK ("rental_agreements"."return_mileage_km" is null or "rental_agreements"."return_mileage_km" >= "rental_agreements"."pickup_mileage_km"),
	CONSTRAINT "rental_agreements_return_complete" CHECK (("rental_agreements"."checked_in_at" is null) = ("rental_agreements"."return_mileage_km" is null) and ("rental_agreements"."checked_in_at" is null) = ("rental_agreements"."return_fuel_eighths" is null)),
	CONSTRAINT "rental_agreements_return_after_pickup" CHECK ("rental_agreements"."checked_in_at" is null or "rental_agreements"."checked_in_at" >= "rental_agreements"."checked_out_at"),
	CONSTRAINT "rental_agreements_money_nonneg" CHECK ("rental_agreements"."late_minutes" >= 0 and "rental_agreements"."late_fee_fils" >= 0 and "rental_agreements"."fuel_charge_fils" >= 0 and "rental_agreements"."damage_charge_fils" >= 0
          and "rental_agreements"."additional_vat_fils" >= 0 and "rental_agreements"."additional_total_fils" >= 0 and "rental_agreements"."deposit_captured_fils" >= 0
          and "rental_agreements"."balance_due_fils" >= 0)
);
--> statement-breakpoint
CREATE TABLE "reservation_extras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"extra_id" uuid NOT NULL,
	"name" text NOT NULL,
	"charge_type" "extra_charge_type" NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_fils" integer NOT NULL,
	"total_fils" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservation_extras_quantity" CHECK ("reservation_extras"."quantity" between 1 and 10),
	CONSTRAINT "reservation_extras_money_nonneg" CHECK ("reservation_extras"."unit_price_fils" >= 0 and "reservation_extras"."total_fils" >= 0)
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"user_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"pickup_branch_id" uuid NOT NULL,
	"return_branch_id" uuid NOT NULL,
	"pickup_at" timestamp with time zone NOT NULL,
	"return_at" timestamp with time zone NOT NULL,
	"period" "tstzrange" GENERATED ALWAYS AS (tstzrange(pickup_at, return_at, '[)')) STORED NOT NULL,
	"status" "reservation_status" DEFAULT 'PENDING' NOT NULL,
	"hold_expires_at" timestamp with time zone,
	"idempotency_key" text NOT NULL,
	"currency" text DEFAULT 'AED' NOT NULL,
	"rental_days" integer NOT NULL,
	"daily_rate_fils" integer NOT NULL,
	"base_fils" integer NOT NULL,
	"extras_fils" integer DEFAULT 0 NOT NULL,
	"one_way_fee_fils" integer DEFAULT 0 NOT NULL,
	"subtotal_fils" integer NOT NULL,
	"vat_fils" integer NOT NULL,
	"total_fils" integer NOT NULL,
	"deposit_fils" integer NOT NULL,
	"pricing_rule_id" uuid,
	"price_breakdown" jsonb NOT NULL,
	"notes" text,
	"confirmed_at" timestamp with time zone,
	"picked_up_at" timestamp with time zone,
	"returned_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"expired_at" timestamp with time zone,
	"cancellation_reason" text,
	"refund_fils" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservations_period_valid" CHECK ("reservations"."return_at" > "reservations"."pickup_at"),
	CONSTRAINT "reservations_pending_has_hold" CHECK ("reservations"."status" <> 'PENDING' or "reservations"."hold_expires_at" is not null),
	CONSTRAINT "reservations_currency" CHECK ("reservations"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "reservations_days_positive" CHECK ("reservations"."rental_days" >= 1),
	CONSTRAINT "reservations_money_nonneg" CHECK ("reservations"."daily_rate_fils" >= 0 and "reservations"."base_fils" >= 0 and "reservations"."extras_fils" >= 0 and "reservations"."one_way_fee_fils" >= 0
          and "reservations"."subtotal_fils" >= 0 and "reservations"."vat_fils" >= 0 and "reservations"."total_fils" >= 0 and "reservations"."deposit_fils" >= 0
          and "reservations"."refund_fils" >= 0),
	CONSTRAINT "reservations_total_consistent" CHECK ("reservations"."total_fils" = "reservations"."subtotal_fils" + "reservations"."vat_fils"),
	CONSTRAINT "reservations_refund_le_total" CHECK ("reservations"."refund_fils" <= "reservations"."total_fils")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "user_role" DEFAULT 'CUSTOMER' NOT NULL,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_lowercase" CHECK ("users"."email" = lower("users"."email")),
	CONSTRAINT "users_name_not_blank" CHECK (length(trim("users"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "vehicle_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"deposit_fils" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_categories_deposit_nonneg" CHECK ("vehicle_categories"."deposit_fils" >= 0)
);
--> statement-breakpoint
CREATE TABLE "vehicle_feature_map" (
	"vehicle_id" uuid NOT NULL,
	"feature_id" uuid NOT NULL,
	CONSTRAINT "vehicle_feature_map_pkey" PRIMARY KEY("vehicle_id","feature_id")
);
--> statement-breakpoint
CREATE TABLE "vehicle_features" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"year" integer NOT NULL,
	"plate" text NOT NULL,
	"vin" text NOT NULL,
	"color" text NOT NULL,
	"transmission" "transmission" NOT NULL,
	"fuel_type" "fuel_type" NOT NULL,
	"seats" integer NOT NULL,
	"doors" integer DEFAULT 4 NOT NULL,
	"luggage" integer DEFAULT 2 NOT NULL,
	"mileage_km" integer DEFAULT 0 NOT NULL,
	"status" "vehicle_status" DEFAULT 'AVAILABLE' NOT NULL,
	"image_url" text,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicles_year_range" CHECK ("vehicles"."year" between 1990 and 2100),
	CONSTRAINT "vehicles_vin_format" CHECK ("vehicles"."vin" ~ '^[A-HJ-NPR-Z0-9]{17}$'),
	CONSTRAINT "vehicles_seats_range" CHECK ("vehicles"."seats" between 1 and 15),
	CONSTRAINT "vehicles_doors_range" CHECK ("vehicles"."doors" between 2 and 6),
	CONSTRAINT "vehicles_luggage_range" CHECK ("vehicles"."luggage" between 0 and 10),
	CONSTRAINT "vehicles_mileage_nonneg" CHECK ("vehicles"."mileage_km" >= 0)
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_reports" ADD CONSTRAINT "damage_reports_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_reports" ADD CONSTRAINT "damage_reports_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_reports" ADD CONSTRAINT "damage_reports_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_profiles" ADD CONSTRAINT "driver_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_blocks" ADD CONSTRAINT "maintenance_blocks_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_blocks" ADD CONSTRAINT "maintenance_blocks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_category_id_vehicle_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."vehicle_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_agreements" ADD CONSTRAINT "rental_agreements_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_agreements" ADD CONSTRAINT "rental_agreements_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_agreements" ADD CONSTRAINT "rental_agreements_checked_out_by_users_id_fk" FOREIGN KEY ("checked_out_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_agreements" ADD CONSTRAINT "rental_agreements_checked_in_by_users_id_fk" FOREIGN KEY ("checked_in_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_agreements" ADD CONSTRAINT "rental_agreements_return_branch_id_branches_id_fk" FOREIGN KEY ("return_branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_extras" ADD CONSTRAINT "reservation_extras_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_extras" ADD CONSTRAINT "reservation_extras_extra_id_extras_id_fk" FOREIGN KEY ("extra_id") REFERENCES "public"."extras"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_pickup_branch_id_branches_id_fk" FOREIGN KEY ("pickup_branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_return_branch_id_branches_id_fk" FOREIGN KEY ("return_branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_pricing_rule_id_pricing_rules_id_fk" FOREIGN KEY ("pricing_rule_id") REFERENCES "public"."pricing_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_feature_map" ADD CONSTRAINT "vehicle_feature_map_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_feature_map" ADD CONSTRAINT "vehicle_feature_map_feature_id_vehicle_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."vehicle_features"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_category_id_vehicle_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."vehicle_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_account_key" ON "accounts" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "branches_code_key" ON "branches" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "branches_slug_key" ON "branches" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "damage_reports_vehicle_id_idx" ON "damage_reports" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "damage_reports_reservation_id_idx" ON "damage_reports" USING btree ("reservation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deposits_idempotency_key_key" ON "deposits" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "deposits_provider_deposit_id_key" ON "deposits" USING btree ("provider","provider_deposit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deposits_reservation_attempt_key" ON "deposits" USING btree ("reservation_id","attempt");--> statement-breakpoint
CREATE INDEX "deposits_status_idx" ON "deposits" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "driver_profiles_user_id_key" ON "driver_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "extras_code_key" ON "extras" USING btree ("code");--> statement-breakpoint
CREATE INDEX "maintenance_blocks_vehicle_id_idx" ON "maintenance_blocks" USING btree ("vehicle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_webhook_events_provider_event_key" ON "payment_webhook_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE INDEX "payment_webhook_events_received_at_idx" ON "payment_webhook_events" USING btree ("received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_payment_id_key" ON "payments" USING btree ("provider","provider_payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_reservation_kind_attempt_key" ON "payments" USING btree ("reservation_id","kind","attempt");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pricing_rules_category_id_idx" ON "pricing_rules" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "pricing_rules_branch_id_idx" ON "pricing_rules" USING btree ("branch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rental_agreements_reservation_id_key" ON "rental_agreements" USING btree ("reservation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rental_agreements_agreement_number_key" ON "rental_agreements" USING btree ("agreement_number");--> statement-breakpoint
CREATE INDEX "rental_agreements_vehicle_id_idx" ON "rental_agreements" USING btree ("vehicle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_extras_reservation_extra_key" ON "reservation_extras" USING btree ("reservation_id","extra_id");--> statement-breakpoint
CREATE INDEX "reservation_extras_extra_id_idx" ON "reservation_extras" USING btree ("extra_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_reference_key" ON "reservations" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_idempotency_key_key" ON "reservations" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "reservations_user_id_idx" ON "reservations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reservations_vehicle_id_idx" ON "reservations" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "reservations_status_idx" ON "reservations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reservations_pickup_branch_pickup_at_idx" ON "reservations" USING btree ("pickup_branch_id","pickup_at");--> statement-breakpoint
CREATE INDEX "reservations_return_branch_id_idx" ON "reservations" USING btree ("return_branch_id");--> statement-breakpoint
CREATE INDEX "reservations_pending_hold_idx" ON "reservations" USING btree ("hold_expires_at") WHERE status = 'PENDING';--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_categories_code_key" ON "vehicle_categories" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_categories_slug_key" ON "vehicle_categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "vehicle_feature_map_feature_id_idx" ON "vehicle_feature_map" USING btree ("feature_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_features_code_key" ON "vehicle_features" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_plate_key" ON "vehicles" USING btree ("plate");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_vin_key" ON "vehicles" USING btree ("vin");--> statement-breakpoint
CREATE INDEX "vehicles_category_id_idx" ON "vehicles" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "vehicles_branch_id_idx" ON "vehicles" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "vehicles_status_idx" ON "vehicles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");