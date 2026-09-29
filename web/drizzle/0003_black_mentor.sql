CREATE TABLE "character_skill_samples" (
	"character_guid" text NOT NULL,
	"saved_at" timestamp with time zone NOT NULL,
	"skills" jsonb NOT NULL,
	CONSTRAINT "character_skill_samples_character_guid_saved_at_pk" PRIMARY KEY("character_guid","saved_at")
);
--> statement-breakpoint
CREATE TABLE "character_unlocks" (
	"character_guid" text NOT NULL,
	"kind" text NOT NULL,
	"id" text NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	CONSTRAINT "character_unlocks_character_guid_kind_id_pk" PRIMARY KEY("character_guid","kind","id")
);
--> statement-breakpoint
ALTER TABLE "character_saves" ADD COLUMN "inventory" jsonb;--> statement-breakpoint
ALTER TABLE "character_saves" ADD COLUMN "loadout" jsonb;--> statement-breakpoint
ALTER TABLE "character_saves" ADD COLUMN "x" double precision;--> statement-breakpoint
ALTER TABLE "character_saves" ADD COLUMN "y" double precision;--> statement-breakpoint
ALTER TABLE "character_saves" ADD COLUMN "z" double precision;--> statement-breakpoint
ALTER TABLE "world_saves" ADD COLUMN "bases" jsonb;--> statement-breakpoint
ALTER TABLE "world_saves" ADD COLUMN "requirements" jsonb;--> statement-breakpoint
CREATE INDEX "character_unlocks_kind_idx" ON "character_unlocks" USING btree ("kind","id");