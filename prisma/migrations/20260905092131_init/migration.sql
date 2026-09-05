-- CreateEnum
CREATE TYPE "RivalryStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('PUSH', 'STAR', 'FORK', 'CREATE_REPO', 'PR', 'MERGE', 'ISSUE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "github_username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "following_count" INTEGER NOT NULL DEFAULT 0,
    "starred_repo_count" INTEGER NOT NULL DEFAULT 0,
    "total_commits" INTEGER NOT NULL DEFAULT 0,
    "current_streak" INTEGER NOT NULL DEFAULT 0,
    "longest_streak" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rivalry" (
    "id" TEXT NOT NULL,
    "user1_id" TEXT NOT NULL,
    "user2_id" TEXT NOT NULL,
    "status" "RivalryStatus" NOT NULL DEFAULT 'PENDING',
    "started_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "rivalry_score" INTEGER NOT NULL DEFAULT 0,
    "user1_score" INTEGER NOT NULL DEFAULT 0,
    "user2_score" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rivalry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Repository" (
    "id" TEXT NOT NULL,
    "github_repo_id" INTEGER NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "description" TEXT,
    "language" TEXT,
    "is_fork" BOOLEAN NOT NULL DEFAULT false,
    "github_url" TEXT NOT NULL,
    "github_created_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Repository_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "repository_id" TEXT,
    "github_event_id" TEXT NOT NULL,
    "metadata" JSONB,
    "points_awarded" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_github_username_key" ON "User"("github_username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Rivalry_user1_id_idx" ON "Rivalry"("user1_id");

-- CreateIndex
CREATE INDEX "Rivalry_user2_id_idx" ON "Rivalry"("user2_id");

-- CreateIndex
CREATE UNIQUE INDEX "Repository_github_repo_id_key" ON "Repository"("github_repo_id");

-- CreateIndex
CREATE INDEX "Repository_user_id_idx" ON "Repository"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "Activity_github_event_id_key" ON "Activity"("github_event_id");

-- CreateIndex
CREATE INDEX "Activity_user_id_type_idx" ON "Activity"("user_id", "type");

-- CreateIndex
CREATE INDEX "Activity_repository_id_idx" ON "Activity"("repository_id");

-- AddForeignKey
ALTER TABLE "Rivalry" ADD CONSTRAINT "Rivalry_user1_id_fkey" FOREIGN KEY ("user1_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rivalry" ADD CONSTRAINT "Rivalry_user2_id_fkey" FOREIGN KEY ("user2_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repository" ADD CONSTRAINT "Repository_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "Repository"("id") ON DELETE SET NULL ON UPDATE CASCADE;
