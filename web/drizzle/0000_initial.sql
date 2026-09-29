CREATE TABLE "admin_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backups" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"file" text NOT NULL,
	"size_bytes" double precision DEFAULT 0 NOT NULL,
	"ok" boolean NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "character_saves" (
	"character_guid" text PRIMARY KEY NOT NULL,
	"saved_at" timestamp with time zone NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"playtime_s" double precision,
	"health" double precision,
	"max_health" double precision,
	"skills" jsonb NOT NULL,
	"quests" jsonb NOT NULL,
	"journal_unlocked" integer,
	"journal_unread" integer,
	"spells" integer,
	"regions_revealed" integer,
	"gone_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"player_id" integer,
	"name" text NOT NULL,
	"channel" text NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collector_runs" (
	"run_id" uuid PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"last_seq" integer DEFAULT 0 NOT NULL,
	"stopped_at" timestamp with time zone,
	"lost_at" timestamp with time zone,
	"collector_name" text,
	"collector_version" text,
	"os" text,
	"arch" text,
	"layers" jsonb,
	"server_version" text,
	"server_name" text,
	"world_guid" text,
	"settings" jsonb,
	"heartbeat" jsonb,
	"heartbeat_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "deaths" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"player_id" integer NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"x" double precision,
	"y" double precision,
	"z" double precision,
	"source" text NOT NULL,
	"cause" text,
	"killer" text,
	"merged_event_id" uuid
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"type" text NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data" jsonb NOT NULL,
	"source" text DEFAULT 'collector' NOT NULL,
	"invalid" text,
	"player_id" integer,
	"quiet" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feats" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"player_id" integer NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"subject" text NOT NULL,
	"detail" text
);
--> statement-breakpoint
CREATE TABLE "ingest_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" integer NOT NULL,
	"accepted" integer DEFAULT 0 NOT NULL,
	"duplicates" integer DEFAULT 0 NOT NULL,
	"invalid" integer DEFAULT 0 NOT NULL,
	"events" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"progress" double precision,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"player_id" integer NOT NULL,
	"entry" text NOT NULL,
	"event_id" uuid NOT NULL,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "journal_entries_player_id_entry_pk" PRIMARY KEY("player_id","entry")
);
--> statement-breakpoint
CREATE TABLE "level_ups" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"player_id" integer NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"skill" text NOT NULL,
	"level" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"character_guid" text,
	"platform" text NOT NULL,
	"name" text NOT NULL,
	"name_override" text,
	"hidden" boolean DEFAULT false NOT NULL,
	"first_seen" timestamp with time zone NOT NULL,
	"last_seen" timestamp with time zone NOT NULL,
	"online" boolean DEFAULT false NOT NULL,
	"current_session_id" integer,
	"dead" boolean DEFAULT false NOT NULL,
	"playtime_s" double precision DEFAULT 0 NOT NULL,
	"sessions" integer DEFAULT 0 NOT NULL,
	"deaths" integer DEFAULT 0 NOT NULL,
	"chat_messages" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_metrics" (
	"ts" timestamp with time zone PRIMARY KEY NOT NULL,
	"memory_mb" double precision NOT NULL,
	"uptime_s" double precision NOT NULL,
	"players" integer NOT NULL,
	"max_players" integer,
	"cpu_percent" double precision
);
--> statement-breakpoint
CREATE TABLE "server_state" (
	"id" integer PRIMARY KEY NOT NULL,
	"online" boolean DEFAULT false NOT NULL,
	"online_since" timestamp with time zone,
	"offline_since" timestamp with time zone,
	"stopping_at" timestamp with time zone,
	"server_name" text,
	"server_version" text,
	"server_build" text,
	"world_name" text,
	"world_guid" text,
	"max_players" integer,
	"presence_at" timestamp with time zone,
	"memory_mb" double precision,
	"uptime_s" double precision,
	"cpu_percent" double precision,
	"metrics_at" timestamp with time zone,
	"save_at" timestamp with time zone,
	"save_day" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"run_id" uuid NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	"left_at" timestamp with time zone,
	"duration_s" double precision,
	"end_reason" text,
	"source" text NOT NULL,
	"join_event_id" uuid,
	"left_event_id" uuid,
	"deaths" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "status_samples" (
	"ts" timestamp with time zone PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"players" integer NOT NULL,
	"memory_mb" double precision
);
--> statement-breakpoint
CREATE TABLE "world_saves" (
	"saved_at" timestamp with time zone PRIMARY KEY NOT NULL,
	"world_guid" text NOT NULL,
	"world_name" text,
	"day" integer,
	"time_of_day" double precision,
	"weather" jsonb NOT NULL,
	"events" jsonb NOT NULL,
	"hardcore" boolean,
	"friendly_fire" boolean,
	"difficulty" text,
	"size_bytes" integer
);
--> statement-breakpoint
CREATE INDEX "character_saves_user_idx" ON "character_saves" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_messages_event_idx" ON "chat_messages" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "chat_messages_at_idx" ON "chat_messages" USING btree ("at");--> statement-breakpoint
CREATE INDEX "collector_runs_started_idx" ON "collector_runs" USING btree ("started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "deaths_event_idx" ON "deaths" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "deaths_player_at_idx" ON "deaths" USING btree ("player_id","at");--> statement-breakpoint
CREATE INDEX "deaths_at_idx" ON "deaths" USING btree ("at");--> statement-breakpoint
CREATE INDEX "events_ts_seq_idx" ON "events" USING btree ("ts","seq");--> statement-breakpoint
CREATE INDEX "events_type_ts_idx" ON "events" USING btree ("type","ts");--> statement-breakpoint
CREATE INDEX "events_run_seq_idx" ON "events" USING btree ("run_id","seq");--> statement-breakpoint
CREATE INDEX "events_player_ts_idx" ON "events" USING btree ("player_id","ts");--> statement-breakpoint
CREATE UNIQUE INDEX "feats_event_idx" ON "feats" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "feats_player_kind_idx" ON "feats" USING btree ("player_id","kind");--> statement-breakpoint
CREATE INDEX "feats_at_idx" ON "feats" USING btree ("at");--> statement-breakpoint
CREATE INDEX "ingest_batches_received_idx" ON "ingest_batches" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "journal_entries_at_idx" ON "journal_entries" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "level_ups_event_idx" ON "level_ups" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "level_ups_player_at_idx" ON "level_ups" USING btree ("player_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "players_user_id_idx" ON "players" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "players_character_guid_idx" ON "players" USING btree ("character_guid");--> statement-breakpoint
CREATE INDEX "players_last_seen_idx" ON "players" USING btree ("last_seen");--> statement-breakpoint
CREATE INDEX "sessions_player_joined_idx" ON "sessions" USING btree ("player_id","joined_at");--> statement-breakpoint
CREATE INDEX "sessions_open_idx" ON "sessions" USING btree ("left_at");