ALTER TABLE "User"
  ADD COLUMN "github_refresh_token" TEXT,
  ADD COLUMN "github_token_expires_at" TIMESTAMP(3),
  ADD COLUMN "github_refresh_token_expires_at" TIMESTAMP(3);
ALTER TABLE "Repository"
  ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "default_branch" TEXT,
  ADD COLUMN "pushed_at" TIMESTAMP(3);

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "activity_id" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT NOT NULL DEFAULT '/notifications',
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Notification_user_id_activity_id_key" ON "Notification"("user_id", "activity_id");
CREATE INDEX "Notification_user_id_created_at_idx" ON "Notification"("user_id", "created_at");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Repository" ADD COLUMN "is_contributor" BOOLEAN NOT NULL DEFAULT false;
DROP INDEX IF EXISTS "Repository_github_repo_id_key";
CREATE UNIQUE INDEX "Repository_github_repo_id_user_id_key" ON "Repository"("github_repo_id", "user_id");
