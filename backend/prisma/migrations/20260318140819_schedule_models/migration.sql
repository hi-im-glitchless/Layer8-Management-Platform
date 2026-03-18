-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamMemberId" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "projectColor" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'placeholder',
    "weekStart" DATETIME NOT NULL,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "splitProjectName" TEXT,
    "splitProjectColor" TEXT,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Assignment_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Absence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamMemberId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "type" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Absence_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "isRecurring" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProjectColor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 1,
    "lastUsedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_userId_key" ON "TeamMember"("userId");

-- CreateIndex
CREATE INDEX "TeamMember_status_idx" ON "TeamMember"("status");

-- CreateIndex
CREATE INDEX "TeamMember_displayOrder_idx" ON "TeamMember"("displayOrder");

-- CreateIndex
CREATE INDEX "Assignment_teamMemberId_idx" ON "Assignment"("teamMemberId");

-- CreateIndex
CREATE INDEX "Assignment_weekStart_idx" ON "Assignment"("weekStart");

-- CreateIndex
CREATE INDEX "Assignment_projectName_idx" ON "Assignment"("projectName");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_teamMemberId_weekStart_projectName_key" ON "Assignment"("teamMemberId", "weekStart", "projectName");

-- CreateIndex
CREATE INDEX "Absence_teamMemberId_idx" ON "Absence"("teamMemberId");

-- CreateIndex
CREATE INDEX "Absence_date_idx" ON "Absence"("date");

-- CreateIndex
CREATE INDEX "Absence_type_idx" ON "Absence"("type");

-- CreateIndex
CREATE UNIQUE INDEX "Absence_teamMemberId_date_key" ON "Absence"("teamMemberId", "date");

-- CreateIndex
CREATE INDEX "Holiday_month_day_idx" ON "Holiday"("month", "day");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_name_month_day_key" ON "Holiday"("name", "month", "day");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectColor_name_key" ON "ProjectColor"("name");

-- CreateIndex
CREATE INDEX "ProjectColor_usageCount_idx" ON "ProjectColor"("usageCount");

-- CreateIndex
CREATE INDEX "ProjectColor_lastUsedAt_idx" ON "ProjectColor"("lastUsedAt");
