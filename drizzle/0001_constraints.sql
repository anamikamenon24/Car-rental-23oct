-- Custom SQL migration: constraints Drizzle cannot express.
--
-- 1. No two active reservations for the same vehicle may overlap (partial EXCLUDE USING gist).
-- 2. No two maintenance blocks for the same vehicle may overlap (EXCLUDE USING gist).
-- 3. A reservation may not overlap a maintenance block and vice versa (trigger, see below).
--
-- Periods are half-open '[)' so back-to-back rentals (end == next start) are allowed.
--
-- Why a trigger for (3) instead of a shared vehicle_occupancy table:
--   Reservations and maintenance blocks have different lifecycles (reservations change status,
--   only some statuses occupy the car; maintenance blocks are simply present or deleted). Keeping
--   each in its own table with its own native EXCLUDE constraint keeps the common case (booking vs
--   booking) enforced by an index with no extra writes. The cross-table check is a trigger that
--   first takes a row lock on the vehicle (SELECT ... FOR UPDATE) and then looks for a conflict.
--   Because every writer (reservation or maintenance) takes the same vehicle lock inside the
--   trigger, two concurrent transactions are serialised on that row: the second one waits for the
--   first to commit and then (READ COMMITTED takes a fresh snapshot per statement in plpgsql)
--   sees its row, so the race a naive trigger has is closed. Conflicts are raised with SQLSTATE
--   23P01 (exclusion_violation), the same code as the EXCLUDE constraints, so the application maps
--   every overlap to a single VEHICLE_UNAVAILABLE error.
--
-- Expired PENDING holds: an exclusion constraint cannot reference now(), so a PENDING row keeps
-- blocking until its status changes. The release job flips stale holds to EXPIRED, and the
-- reservation / maintenance services expire stale holds for the vehicle inside their own
-- transaction before inserting.

CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_no_overlap"
  EXCLUDE USING gist ("vehicle_id" WITH =, "period" WITH &&)
  WHERE ("status" IN ('PENDING', 'CONFIRMED', 'PICKED_UP'));
--> statement-breakpoint
ALTER TABLE "maintenance_blocks"
  ADD CONSTRAINT "maintenance_blocks_no_overlap"
  EXCLUDE USING gist ("vehicle_id" WITH =, "period" WITH &&);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION driveeasy_reservation_maintenance_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  conflict_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'reservations' THEN
    IF NEW.status NOT IN ('PENDING', 'CONFIRMED', 'PICKED_UP') THEN
      RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE'
       AND OLD.status IN ('PENDING', 'CONFIRMED', 'PICKED_UP')
       AND OLD.vehicle_id = NEW.vehicle_id
       AND OLD.pickup_at = NEW.pickup_at
       AND OLD.return_at = NEW.return_at THEN
      RETURN NEW; -- e.g. PENDING -> CONFIRMED: occupancy unchanged
    END IF;
    PERFORM 1 FROM vehicles WHERE id = NEW.vehicle_id FOR UPDATE;
    SELECT m.id INTO conflict_id
      FROM maintenance_blocks m
     WHERE m.vehicle_id = NEW.vehicle_id
       AND m.period && tstzrange(NEW.pickup_at, NEW.return_at, '[)')
     LIMIT 1;
    IF conflict_id IS NOT NULL THEN
      RAISE EXCEPTION 'Reservation overlaps maintenance block %', conflict_id
        USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'reservations_no_maintenance_overlap',
              TABLE = 'reservations';
    END IF;
  ELSE
    IF TG_OP = 'UPDATE'
       AND OLD.vehicle_id = NEW.vehicle_id
       AND OLD.starts_at = NEW.starts_at
       AND OLD.ends_at = NEW.ends_at THEN
      RETURN NEW;
    END IF;
    PERFORM 1 FROM vehicles WHERE id = NEW.vehicle_id FOR UPDATE;
    SELECT r.id INTO conflict_id
      FROM reservations r
     WHERE r.vehicle_id = NEW.vehicle_id
       AND r.status IN ('PENDING', 'CONFIRMED', 'PICKED_UP')
       AND r.period && tstzrange(NEW.starts_at, NEW.ends_at, '[)')
     LIMIT 1;
    IF conflict_id IS NOT NULL THEN
      RAISE EXCEPTION 'Maintenance block overlaps reservation %', conflict_id
        USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'maintenance_blocks_no_reservation_overlap',
              TABLE = 'maintenance_blocks';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER reservations_maintenance_guard
  BEFORE INSERT OR UPDATE OF vehicle_id, pickup_at, return_at, status ON reservations
  FOR EACH ROW EXECUTE FUNCTION driveeasy_reservation_maintenance_guard();
--> statement-breakpoint
CREATE TRIGGER maintenance_blocks_reservation_guard
  BEFORE INSERT OR UPDATE OF vehicle_id, starts_at, ends_at ON maintenance_blocks
  FOR EACH ROW EXECUTE FUNCTION driveeasy_reservation_maintenance_guard();
