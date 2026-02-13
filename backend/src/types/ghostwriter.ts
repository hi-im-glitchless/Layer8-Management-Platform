/**
 * TypeScript interfaces for Ghostwriter GraphQL API data.
 * Matches the Hasura-based schema returned by the GW v1/graphql endpoint.
 */

export interface GWReport {
  id: number;
  title: string;
  creation: string;
  lastUpdate: string;
  project: GWProject;
  findings: GWFinding[];
}

export interface GWProject {
  id: number;
  codename: string;
  startDate: string;
  endDate: string;
  client: GWClient;
  scopes: GWScope[];
  assignments: GWAssignment[];
}

export interface GWClient {
  id: number;
  name: string;
  shortName: string;
}

export interface GWFinding {
  id: number;
  title: string;
  position: number;
  severity: { severity: string; color: string; weight: number };
  findingType: { findingType: string };
  cvssScore: number;
  cvssVector: string;
  affectedEntities: string;
  description: string;
  impact: string;
  mitigation: string;
  replicationSteps: string;
  references: string;
}

export interface GWScope {
  id: number;
  scope: string;
  name: string;
}

export interface GWAssignment {
  user: { username: string; email: string; name: string };
  projectRole: { projectRole: string };
}
