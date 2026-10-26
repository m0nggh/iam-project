/** A group as returned by GET /groups with our $select. */
export interface GraphGroup {
  id: string;
  displayName: string;
  description: string | null;
  createdDateTime: string | null;
  securityEnabled: boolean;
  mailEnabled: boolean;
  /** Empty for a plain security group; contains "DynamicMembership" for dynamic groups. */
  groupTypes: string[];
  membershipRule?: string | null;
}

/** Graph's paged collection envelope. */
export interface GraphCollection<T> {
  value: T[];
  '@odata.nextLink'?: string;
}

/** Graph's error envelope, e.g. { error: { code: "Authorization_RequestDenied", message: "..." } }. */
export interface GraphErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
}

/** What the rest of the app needs from Graph – implemented by the live and the mock backend alike. */
export interface GraphClient {
  listSecurityGroups(): Promise<GraphGroup[]>;
}
