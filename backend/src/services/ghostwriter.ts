import https from 'https';
import { config } from '@/config.js';
import type {
  GWReport,
  GWProject,
  GWClient,
  GWFinding,
  GWScope,
  GWAssignment,
} from '@/types/ghostwriter.js';

/**
 * Custom HTTPS agent that accepts self-signed certificates.
 * Used only for Ghostwriter fetch calls in development.
 */
const tlsAgent = new https.Agent({ rejectUnauthorized: false });

/** GraphQL query to fetch full report data from Ghostwriter. */
const REPORT_QUERY = `
query GetReportData($id: bigint!) {
  report_by_pk(id: $id) {
    id
    title
    creation
    last_update
    project {
      id
      codename
      startDate
      endDate
      client {
        id
        name
        shortName
      }
      scopes {
        id
        scope
        name
      }
      assignments {
        user {
          username
          email
          name
        }
        projectRole {
          projectRole
        }
      }
    }
    findings(order_by: {position: asc}) {
      id
      title
      position
      severity {
        severity
        color
        weight
      }
      findingType {
        findingType
      }
      cvssScore
      cvssVector
      affectedEntities
      description
      impact
      mitigation
      replication_steps
      references
    }
  }
}`;

/** GraphQL query for health/whoami check. */
const WHOAMI_QUERY = `
query Whoami {
  user(limit: 1) {
    username
  }
}`;

/**
 * Ensures Ghostwriter env vars are configured.
 * Throws with a clear message when they are missing.
 */
function requireGhostwriterConfig(): { url: string; token: string } {
  if (!config.GHOSTWRITER_URL || !config.GHOSTWRITER_API_TOKEN) {
    throw new Error('Ghostwriter not configured');
  }
  return {
    url: config.GHOSTWRITER_URL,
    token: config.GHOSTWRITER_API_TOKEN,
  };
}

/**
 * Sends a GraphQL request to the Ghostwriter Hasura endpoint.
 */
async function graphqlRequest<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const { url, token } = requireGhostwriterConfig();
  const endpoint = `${url}/v1/graphql`;

  // Use dispatcher option for custom TLS handling with self-signed certs
  const fetchOptions: RequestInit & { dispatcher?: unknown } = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  };

  // For HTTPS with self-signed certs, use the Node.js https agent
  if (endpoint.startsWith('https://')) {
    // Node 18+ fetch supports the undici dispatcher, but for broader
    // compat we use the agent approach via globalThis override or
    // a direct https request. We use process-level env for simplicity.
    (fetchOptions as any).agent = tlsAgent;
  }

  let response: Response;
  try {
    // Node.js fetch does not natively support the `agent` option.
    // Use a dynamic import of node's http module or set env var.
    // Simplest approach: set NODE_TLS_REJECT_UNAUTHORIZED for the call.
    const prevTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    if (endpoint.startsWith('https://')) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ query, variables }),
      });
    } finally {
      // Restore previous value
      if (prevTls === undefined) {
        delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      } else {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevTls;
      }
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed') || msg.includes('UNABLE_TO_VERIFY')) {
      throw new Error('Ghostwriter service unavailable');
    }
    throw new Error(`Ghostwriter connection error: ${msg}`);
  }

  // Handle HTTP-level errors
  if (response.status === 401 || response.status === 403) {
    throw new Error('Ghostwriter authentication failed');
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Ghostwriter request failed (${response.status}): ${text}`);
  }

  const json = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };

  if (json.errors && json.errors.length > 0) {
    const messages = json.errors.map((e) => e.message).join('; ');
    throw new Error(`Ghostwriter GraphQL error: ${messages}`);
  }

  if (!json.data) {
    throw new Error('Ghostwriter returned empty data');
  }

  return json.data;
}

/**
 * Transforms a snake_case GW finding from the raw GraphQL response
 * into our camelCase GWFinding interface.
 */
function mapRawFinding(raw: Record<string, unknown>): GWFinding {
  // Debug: log raw finding fields to diagnose empty content
  const contentFields = ['description', 'impact', 'mitigation', 'replication_steps', 'replicationSteps'];
  const fieldSummary = contentFields.reduce((acc, f) => {
    const val = raw[f];
    acc[f] = val ? `${String(val).length} chars` : (val === null ? 'null' : val === undefined ? 'undefined' : 'empty');
    return acc;
  }, {} as Record<string, string>);
  console.log(`[ghostwriter] Finding "${raw.title}" raw content:`, fieldSummary);

  return {
    id: raw.id as number,
    title: raw.title as string,
    position: raw.position as number,
    severity: raw.severity as GWFinding['severity'],
    findingType: raw.findingType as GWFinding['findingType'],
    cvssScore: raw.cvssScore as number,
    cvssVector: (raw.cvssVector as string) || '',
    affectedEntities: (raw.affectedEntities as string) || '',
    description: (raw.description as string) || '',
    impact: (raw.impact as string) || '',
    mitigation: (raw.mitigation as string) || '',
    replicationSteps: (raw.replication_steps as string) || '',
    references: (raw.references as string) || '',
  };
}

/**
 * Transforms raw GW GraphQL response into our typed GWReport.
 */
function mapRawReport(raw: Record<string, unknown>): GWReport {
  const rawProject = raw.project as Record<string, unknown>;
  const rawClient = rawProject.client as Record<string, unknown>;
  const rawScopes = (rawProject.scopes || []) as Array<Record<string, unknown>>;
  const rawAssignments = (rawProject.assignments || []) as Array<Record<string, unknown>>;
  const rawFindings = (raw.findings || []) as Array<Record<string, unknown>>;

  const client: GWClient = {
    id: rawClient.id as number,
    name: rawClient.name as string,
    shortName: (rawClient.shortName as string) || '',
  };

  const scopes: GWScope[] = rawScopes.map((s) => ({
    id: s.id as number,
    scope: s.scope as string,
    name: (s.name as string) || '',
  }));

  const assignments: GWAssignment[] = rawAssignments.map((a) => ({
    user: a.user as GWAssignment['user'],
    projectRole: a.projectRole as GWAssignment['projectRole'],
  }));

  const project: GWProject = {
    id: rawProject.id as number,
    codename: rawProject.codename as string,
    startDate: rawProject.startDate as string,
    endDate: rawProject.endDate as string,
    client,
    scopes,
    assignments,
  };

  return {
    id: raw.id as number,
    title: raw.title as string,
    creation: raw.creation as string,
    lastUpdate: (raw.last_update as string) || '',
    project,
    findings: rawFindings.map(mapRawFinding),
  };
}

/**
 * Fetches full report data from Ghostwriter GraphQL API.
 * @param reportId - The Ghostwriter report ID to fetch.
 * @returns Parsed GWReport with all nested data.
 */
export async function fetchReportData(reportId: number): Promise<GWReport> {
  const data = await graphqlRequest<{ report_by_pk: Record<string, unknown> | null }>(
    REPORT_QUERY,
    { id: reportId },
  );

  if (!data.report_by_pk) {
    throw new Error(`Report ${reportId} not found in Ghostwriter`);
  }

  return mapRawReport(data.report_by_pk);
}

/**
 * Checks Ghostwriter API connectivity and authentication.
 * @returns Object with availability status and authenticated username.
 */
export async function checkGhostwriterHealth(): Promise<{
  available: boolean;
  username?: string;
}> {
  try {
    requireGhostwriterConfig();
  } catch {
    return { available: false };
  }

  try {
    const data = await graphqlRequest<{ user: Array<{ username: string }> }>(WHOAMI_QUERY);
    const username = data.user?.[0]?.username;
    return { available: true, username };
  } catch {
    return { available: false };
  }
}
