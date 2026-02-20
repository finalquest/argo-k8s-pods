-- Drop existing unique constraint on email
DROP INDEX IF EXISTS "User_email_key";

-- Add username column (allowing NOT NULL since table is empty at this stage)
ALTER TABLE "User"
    ADD COLUMN "username" TEXT NOT NULL;

-- Make email optional
ALTER TABLE "User"
    ALTER COLUMN "email" DROP NOT NULL;

-- Add unique index for username
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
