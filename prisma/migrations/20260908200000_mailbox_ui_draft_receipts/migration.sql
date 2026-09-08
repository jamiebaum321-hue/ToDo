-- Existing drafts retain the provider API contract; no verification is invented.
ALTER TABLE "Draft" ADD COLUMN "verificationMethod" TEXT NOT NULL DEFAULT 'provider_api';
