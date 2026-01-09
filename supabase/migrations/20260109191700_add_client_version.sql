-- Add client_version column to computers table
-- This stores the reported version of the FleetCtrl client running on each computer

ALTER TABLE "public"."computers" ADD COLUMN "client_version" text;

COMMENT ON COLUMN "public"."computers"."client_version" IS 'Version of the FleetCtrl client installed on this computer';
