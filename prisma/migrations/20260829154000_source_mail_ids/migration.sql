-- The ids that make mail links repairable. URLs alone cannot say which ids
-- built them, and the Gmail app scheme resolves ONLY a real thread id.
ALTER TABLE "Task" ADD COLUMN "sourceMessageId" TEXT;
ALTER TABLE "Task" ADD COLUMN "sourceThreadId" TEXT;
