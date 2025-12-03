-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "isPublicProfile" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "socialLinks" JSONB;

-- CreateTable
CREATE TABLE "Network" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" TEXT NOT NULL,
    "themes" TEXT[],
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Network_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NetworkMembership" (
    "id" TEXT NOT NULL,
    "networkId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "status" TEXT NOT NULL DEFAULT 'active',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NetworkMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NetworkInvitation" (
    "id" TEXT NOT NULL,
    "networkId" TEXT NOT NULL,
    "invitedUserId" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NetworkInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NetworkApplication" (
    "id" TEXT NOT NULL,
    "networkId" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NetworkApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NetworkMembership_networkId_userId_key" ON "NetworkMembership"("networkId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "NetworkInvitation_networkId_invitedUserId_key" ON "NetworkInvitation"("networkId", "invitedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "NetworkApplication_networkId_applicantId_key" ON "NetworkApplication"("networkId", "applicantId");

-- AddForeignKey
ALTER TABLE "Network" ADD CONSTRAINT "Network_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkMembership" ADD CONSTRAINT "NetworkMembership_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "Network"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkMembership" ADD CONSTRAINT "NetworkMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkInvitation" ADD CONSTRAINT "NetworkInvitation_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "Network"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkInvitation" ADD CONSTRAINT "NetworkInvitation_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkInvitation" ADD CONSTRAINT "NetworkInvitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkApplication" ADD CONSTRAINT "NetworkApplication_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "Network"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkApplication" ADD CONSTRAINT "NetworkApplication_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
