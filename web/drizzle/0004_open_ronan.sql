ALTER TABLE "world_saves" ADD COLUMN "clock_seconds" double precision;--> statement-breakpoint
ALTER TABLE "server_state" DROP COLUMN "save_day";--> statement-breakpoint
UPDATE "world_saves" SET "clock_seconds" = "day" * 1440 + "time_of_day" * 60 WHERE "day" IS NOT NULL AND "time_of_day" IS NOT NULL;
