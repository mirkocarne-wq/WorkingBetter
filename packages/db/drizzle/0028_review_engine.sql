ALTER TABLE "app_instances" ALTER COLUMN "app_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "app_instance_id" uuid;