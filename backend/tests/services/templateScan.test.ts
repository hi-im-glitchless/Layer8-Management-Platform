import { describe, it, expect } from 'vitest';
import { scanForInjection } from '../../src/services/templateScan.js';

describe('templateScan', () => {
  describe('scanForInjection', () => {
    it('should pass safe Jinja2 templates', () => {
      const safeTemplate = `
        Hello {{ client_name }},

        {% for finding in findings %}
          - {{ finding.title }}: {{ finding.severity }}
        {% endfor %}

        {% if executive_summary %}
          Summary: {{ executive_summary }}
        {% endif %}
      `;

      const result = scanForInjection(safeTemplate);

      expect(result.safe).toBe(true);
      expect(result.findings).toHaveLength(0);
    });

    it('should detect __class__ introspection', () => {
      const dangerousTemplate = `{{ ''.__class__.__mro__ }}`;

      const result = scanForInjection(dangerousTemplate);

      expect(result.safe).toBe(false);
      expect(result.findings).toHaveLength(2); // __class__ and __mro__
      expect(result.findings[0].severity).toBe('high');
      expect(result.findings[0].pattern).toContain('class introspection');
    });

    it('should detect __subclasses__ enumeration', () => {
      const dangerousTemplate = `{{ ''.__class__.__bases__[0].__subclasses__() }}`;

      const result = scanForInjection(dangerousTemplate);

      expect(result.safe).toBe(false);
      expect(result.findings.some(f => f.pattern.includes('Subclass enumeration'))).toBe(true);
      expect(result.findings.some(f => f.severity === 'high')).toBe(true);
    });

    it('should detect import statements', () => {
      const dangerousTemplate = `{% import 'os' %}`;

      const result = scanForInjection(dangerousTemplate);

      expect(result.safe).toBe(false);
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].pattern).toContain('Import statement');
      expect(result.findings[0].severity).toBe('high');
    });

    it('should detect variable path includes', () => {
      const dangerousTemplate = `{% include {{ user_input }} %}`;

      const result = scanForInjection(dangerousTemplate);

      expect(result.safe).toBe(false);
      expect(result.findings.some(f => f.pattern.includes('Include with variable path'))).toBe(true);
    });

    it('should detect os.popen attempts', () => {
      const dangerousTemplate = `{{ ''.__class__.__mro__[1].__subclasses__()[400]('os.popen("whoami").read()') }}`;

      const result = scanForInjection(dangerousTemplate);

      expect(result.safe).toBe(false);
      expect(result.findings.some(f => f.pattern.includes('OS command execution'))).toBe(true);
    });

    it('should detect exec and eval patterns', () => {
      const dangerousTemplate = `{{ exec('malicious code') }}`;

      const result = scanForInjection(dangerousTemplate);

      expect(result.safe).toBe(false);
      expect(result.findings.some(f => f.pattern.includes('Exec function'))).toBe(true);
    });

    it('should report correct line numbers', () => {
      const template = `
Line 1 safe
Line 2 {{ client_name }}
Line 3 {{ ''.__class__ }}
Line 4 safe
      `.trim();

      const result = scanForInjection(template);

      expect(result.safe).toBe(false);
      expect(result.findings[0].line).toBe(3);
    });

    it('should detect multiple issues in the same template', () => {
      const dangerousTemplate = `
        {{ ''.__class__ }}
        {% import 'os' %}
        {{ config }}
        {{ exec('code') }}
      `;

      const result = scanForInjection(dangerousTemplate);

      expect(result.safe).toBe(false);
      expect(result.findings.length).toBeGreaterThan(3);
    });

    it('should handle empty templates', () => {
      const result = scanForInjection('');

      expect(result.safe).toBe(true);
      expect(result.findings).toHaveLength(0);
    });
  });
});
