-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'NORMAL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustResetPassword" BOOLEAN NOT NULL DEFAULT true,
    "totpSecret" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TrustedDevice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "deviceHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrustedDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "details" TEXT NOT NULL DEFAULT '{}',
    "ipAddress" TEXT NOT NULL,
    "previousHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DenyListTerm" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "term" TEXT NOT NULL,
    "description" TEXT,
    "createdBy" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DenyListTerm_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LlmSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "cliproxyBaseUrl" TEXT NOT NULL DEFAULT 'http://localhost:8317',
    "anthropicApiKey" TEXT,
    "defaultModel" TEXT NOT NULL DEFAULT 'claude-sonnet-4-5-20250929',
    "templateAdapterModel" TEXT NOT NULL DEFAULT 'claude-sonnet-4-5-20250929',
    "executiveReportModel" TEXT NOT NULL DEFAULT 'claude-opus-4-6',
    "fallbackEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TemplateMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateType" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "normalizedSectionText" TEXT NOT NULL,
    "gwField" TEXT NOT NULL,
    "markerType" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 1.0,
    "usageCount" INTEGER NOT NULL DEFAULT 1,
    "zone" TEXT NOT NULL DEFAULT 'unknown',
    "zoneRepetitionCount" INTEGER NOT NULL DEFAULT 1,
    "correctionCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BlueprintPattern" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateType" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "patternType" TEXT NOT NULL,
    "markers" TEXT NOT NULL,
    "anchorStyle" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StyleHint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateType" TEXT NOT NULL,
    "styleName" TEXT NOT NULL,
    "zone" TEXT NOT NULL DEFAULT 'body',
    "mappedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TemplateMappingSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateHash" TEXT NOT NULL,
    "templateType" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "mappingPlanJson" TEXT NOT NULL,
    "entryCount" INTEGER NOT NULL DEFAULT 0,
    "usageCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "TrustedDevice_userId_idx" ON "TrustedDevice"("userId");

-- CreateIndex
CREATE INDEX "TrustedDevice_deviceHash_idx" ON "TrustedDevice"("deviceHash");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "DenyListTerm_isActive_idx" ON "DenyListTerm"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DenyListTerm_term_key" ON "DenyListTerm"("term");

-- CreateIndex
CREATE INDEX "TemplateMapping_templateType_language_idx" ON "TemplateMapping"("templateType", "language");

-- CreateIndex
CREATE INDEX "TemplateMapping_templateType_language_zone_idx" ON "TemplateMapping"("templateType", "language", "zone");

-- CreateIndex
CREATE INDEX "TemplateMapping_usageCount_idx" ON "TemplateMapping"("usageCount");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateMapping_templateType_language_normalizedSectionText_gwField_zone_key" ON "TemplateMapping"("templateType", "language", "normalizedSectionText", "gwField", "zone");

-- CreateIndex
CREATE INDEX "BlueprintPattern_templateType_idx" ON "BlueprintPattern"("templateType");

-- CreateIndex
CREATE UNIQUE INDEX "BlueprintPattern_templateType_zone_patternType_markers_key" ON "BlueprintPattern"("templateType", "zone", "patternType", "markers");

-- CreateIndex
CREATE INDEX "StyleHint_templateType_idx" ON "StyleHint"("templateType");

-- CreateIndex
CREATE UNIQUE INDEX "StyleHint_templateType_styleName_zone_key" ON "StyleHint"("templateType", "styleName", "zone");

-- CreateIndex
CREATE INDEX "TemplateMappingSnapshot_templateType_language_idx" ON "TemplateMappingSnapshot"("templateType", "language");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateMappingSnapshot_templateHash_templateType_language_key" ON "TemplateMappingSnapshot"("templateHash", "templateType", "language");
