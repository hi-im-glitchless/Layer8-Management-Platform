/**
 * Template injection scanner
 * Defense-in-depth pattern matching for Jinja2 injection
 */

export interface ScanFinding {
  pattern: string;
  line: number;
  severity: 'high' | 'medium' | 'low';
  context: string;
}

export interface ScanResult {
  safe: boolean;
  findings: ScanFinding[];
}

/**
 * Dangerous Jinja2 patterns that could indicate template injection
 */
const DANGEROUS_PATTERNS = [
  // Python introspection patterns (high severity)
  { pattern: /__class__/i, severity: 'high' as const, description: 'Python class introspection' },
  { pattern: /__mro__/i, severity: 'high' as const, description: 'Method resolution order access' },
  { pattern: /__subclasses__/i, severity: 'high' as const, description: 'Subclass enumeration' },
  { pattern: /__globals__/i, severity: 'high' as const, description: 'Global scope access' },
  { pattern: /__builtins__/i, severity: 'high' as const, description: 'Builtins access' },
  { pattern: /__import__/i, severity: 'high' as const, description: 'Import function access' },
  { pattern: /\bconfig\b/i, severity: 'high' as const, description: 'Config object access' },
  { pattern: /self\._/i, severity: 'high' as const, description: 'Private attribute access' },

  // Jinja2 built-in objects (medium severity)
  { pattern: /\blipsum\b/i, severity: 'medium' as const, description: 'Lipsum generator object' },
  { pattern: /\bcycler\b/i, severity: 'medium' as const, description: 'Cycler object' },
  { pattern: /\bjoiner\b/i, severity: 'medium' as const, description: 'Joiner object' },
  { pattern: /\bnamespace\b/i, severity: 'medium' as const, description: 'Namespace object' },

  // Dangerous tags (high severity)
  { pattern: /{%\s*import\s+/i, severity: 'high' as const, description: 'Import statement' },
  { pattern: /{%\s*include\s+[^}]*\{\{/i, severity: 'high' as const, description: 'Include with variable path' },
  { pattern: /{%\s*extends\s+[^}]*\{\{/i, severity: 'high' as const, description: 'Extends with variable path' },

  // Direct Python execution patterns (high severity)
  { pattern: /\bos\.popen\b/i, severity: 'high' as const, description: 'OS command execution' },
  { pattern: /\bsubprocess\b/i, severity: 'high' as const, description: 'Subprocess module' },
  { pattern: /\bexec\s*\(/i, severity: 'high' as const, description: 'Exec function' },
  { pattern: /\beval\s*\(/i, severity: 'high' as const, description: 'Eval function' },
];

/**
 * Scan template content for Jinja2 injection patterns
 * @param content - Template content to scan
 * @returns Scan result with findings
 */
export function scanForInjection(content: string): ScanResult {
  const findings: ScanFinding[] = [];
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    DANGEROUS_PATTERNS.forEach((dangerousPattern) => {
      if (dangerousPattern.pattern.test(line)) {
        findings.push({
          pattern: dangerousPattern.description,
          line: index + 1,
          severity: dangerousPattern.severity,
          context: line.trim().substring(0, 100), // First 100 chars of line
        });
      }
    });
  });

  return {
    safe: findings.length === 0,
    findings,
  };
}
