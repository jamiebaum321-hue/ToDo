-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "scopes" TEXT NOT NULL DEFAULT 'tasks:read,tasks:write,notify',
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "userId" TEXT NOT NULL,
    "rollingWindowDays" INTEGER NOT NULL DEFAULT 14,
    "digestTime" TEXT NOT NULL DEFAULT '07:00',
    "digestEnabled" BOOLEAN NOT NULL DEFAULT true,
    "urgentPushEnabled" BOOLEAN NOT NULL DEFAULT true,
    "remindersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT true,
    "quietHoursStart" TEXT NOT NULL DEFAULT '21:30',
    "quietHoursEnd" TEXT NOT NULL DEFAULT '06:30',
    "linkPreference" TEXT NOT NULL DEFAULT 'auto',
    "showDrafts" BOOLEAN NOT NULL DEFAULT true,
    "requestDrafts" BOOLEAN NOT NULL DEFAULT true,
    "showReasons" BOOLEAN NOT NULL DEFAULT true,
    "autoArchiveDays" INTEGER NOT NULL DEFAULT 7,
    "theme" TEXT NOT NULL DEFAULT 'system',
    "defaultView" TEXT NOT NULL DEFAULT 'focus',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "bucket" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "origin" TEXT NOT NULL DEFAULT 'agent',
    "sourceKey" TEXT,
    "sourceProvider" TEXT,
    "sourceType" TEXT,
    "sourceExternalId" TEXT,
    "sourceAccount" TEXT,
    "sourceFrom" TEXT,
    "sourceSubject" TEXT,
    "sourceSnippet" TEXT,
    "sourceReceivedAt" TIMESTAMP(3),
    "reason" TEXT,
    "confidence" DOUBLE PRECISION DEFAULT 0.8,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "dueAt" TIMESTAMP(3),
    "snoozedUntil" TIMESTAMP(3),
    "estimateMinutes" INTEGER,
    "delegateTo" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "lastRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskLink" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'source',
    "label" TEXT NOT NULL,
    "provider" TEXT,
    "webUrl" TEXT,
    "desktopUrl" TEXT,
    "mobileUrl" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TaskLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Draft" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'reply',
    "subject" TEXT,
    "body" TEXT,
    "externalId" TEXT,
    "webUrl" TEXT,
    "desktopUrl" TEXT,
    "mobileUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suppression" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "note" TEXT,
    "taskTitle" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Suppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT,
    "type" TEXT NOT NULL,
    "actor" TEXT NOT NULL DEFAULT 'user',
    "payload" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'scheduled',
    "client" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "windowDays" INTEGER NOT NULL DEFAULT 14,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "unchangedCount" INTEGER NOT NULL DEFAULT 0,
    "removedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedDetail" TEXT,
    "summary" TEXT,
    "error" TEXT,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "platform" TEXT,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failureCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PushDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "url" TEXT,
    "taskId" TEXT,
    "delivered" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApiToken_tokenHash_key" ON "ApiToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ApiToken_userId_idx" ON "ApiToken"("userId");

-- CreateIndex
CREATE INDEX "Task_userId_status_bucket_idx" ON "Task"("userId", "status", "bucket");

-- CreateIndex
CREATE INDEX "Task_userId_dueAt_idx" ON "Task"("userId", "dueAt");

-- CreateIndex
CREATE INDEX "Task_userId_lastRunId_idx" ON "Task"("userId", "lastRunId");

-- CreateIndex
CREATE INDEX "Task_userId_snoozedUntil_idx" ON "Task"("userId", "snoozedUntil");

-- CreateIndex
CREATE UNIQUE INDEX "Task_userId_sourceKey_key" ON "Task"("userId", "sourceKey");

-- CreateIndex
CREATE INDEX "TaskLink_taskId_idx" ON "TaskLink"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "Draft_taskId_key" ON "Draft"("taskId");

-- CreateIndex
CREATE INDEX "Suppression_userId_createdAt_idx" ON "Suppression"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Suppression_userId_expiresAt_idx" ON "Suppression"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Suppression_userId_sourceKey_key" ON "Suppression"("userId", "sourceKey");

-- CreateIndex
CREATE INDEX "TaskEvent_userId_createdAt_idx" ON "TaskEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskEvent_taskId_idx" ON "TaskEvent"("taskId");

-- CreateIndex
CREATE INDEX "AgentRun_userId_startedAt_idx" ON "AgentRun"("userId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushDevice_endpoint_key" ON "PushDevice"("endpoint");

-- CreateIndex
CREATE INDEX "PushDevice_userId_idx" ON "PushDevice"("userId");

-- CreateIndex
CREATE INDEX "NotificationLog_userId_sentAt_idx" ON "NotificationLog"("userId", "sentAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settings" ADD CONSTRAINT "Settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskLink" ADD CONSTRAINT "TaskLink_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suppression" ADD CONSTRAINT "Suppression_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskEvent" ADD CONSTRAINT "TaskEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskEvent" ADD CONSTRAINT "TaskEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "ApiToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushDevice" ADD CONSTRAINT "PushDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

