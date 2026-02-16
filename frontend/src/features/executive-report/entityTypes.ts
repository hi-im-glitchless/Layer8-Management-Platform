/**
 * Shared entity type constants for the executive report sanitization pipeline.
 * Used by EntityMappingTable and EntityPopover for consistent type options.
 */

export interface EntityTypeOption {
  value: string
  label: string
}

export const ENTITY_TYPES: EntityTypeOption[] = [
  { value: 'PERSON', label: 'Person' },
  { value: 'ORGANIZATION', label: 'Organization' },
  { value: 'LOCATION', label: 'Location' },
  { value: 'PROJECT_CODE', label: 'Project Code' },
  { value: 'EMAIL_ADDRESS', label: 'Email Address' },
  { value: 'PHONE_NUMBER', label: 'Phone Number' },
  { value: 'IP_ADDRESS', label: 'IP Address' },
  { value: 'URL', label: 'URL' },
  { value: 'DATE_TIME', label: 'Date/Time' },
  { value: 'CREDIT_CARD', label: 'Credit Card' },
  { value: 'HOSTNAME', label: 'Hostname' },
  { value: 'DOMAIN', label: 'Domain' },
  { value: 'MAC_ADDRESS', label: 'MAC Address' },
  { value: 'CVE_ID', label: 'CVE ID' },
  { value: 'NETWORK_RANGE', label: 'Network Range' },
  { value: 'CUSTOM', label: 'Custom' },
]

/** Default entity type for new manual mappings. */
export const DEFAULT_ENTITY_TYPE = 'PERSON'

/** Get the label for an entity type value. */
export function getEntityTypeLabel(value: string): string {
  const found = ENTITY_TYPES.find((t) => t.value === value)
  return found?.label ?? value
}
