ALTER TABLE "TaskLink" ADD COLUMN "externalId" TEXT,
  ADD COLUMN "threadId" TEXT,
  ADD COLUMN "account" TEXT;

ALTER TABLE "Draft" ADD COLUMN "verifiedAt" TIMESTAMP(3),
  ADD COLUMN "threadId" TEXT,
  ADD COLUMN "account" TEXT,
  ADD COLUMN "replyToId" TEXT,
  ADD COLUMN "to" TEXT;
