-- DropIndex
DROP INDEX IF EXISTS "TemplateMapping_templateType_language_normalizedSectionText_gwField_key";

-- CreateIndex
CREATE UNIQUE INDEX "TemplateMapping_templateType_language_normalizedSectionText_gwField_zone_key" ON "TemplateMapping"("templateType", "language", "normalizedSectionText", "gwField", "zone");
