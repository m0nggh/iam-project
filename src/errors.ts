interface AppErrorOptions {
  status?: number;
  code?: string;
  details?: Record<string, unknown>;
  cause?: unknown;
}

/**
 * An error that is safe to show to API clients. `status` is the HTTP status we respond with,
 * `code` is a stable machine-readable identifier clients can branch on.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, { status = 500, code = 'INTERNAL_ERROR', details, cause }: AppErrorOptions = {}) {
    super(message, { cause });
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface GraphApiErrorOptions {
  status?: number;
  code?: string;
  graphStatus?: number;
  graphCode?: string;
  graphRequestId?: string;
  cause?: unknown;
}

/**
 * A failure talking to Microsoft Graph. Keeps Graph's own status, error code and request-id
 * so a failed call can be traced in Microsoft's logs or quoted in a support ticket.
 */
export class GraphApiError extends AppError {
  constructor(
    message: string,
    { status = 502, code = 'GRAPH_ERROR', graphStatus, graphCode, graphRequestId, cause }: GraphApiErrorOptions = {},
  ) {
    // Only failures that got an HTTP response from Graph have Graph diagnostics to report.
    const details = graphStatus === undefined ? undefined : { graphStatus, graphCode, graphRequestId };
    super(message, { status, code, cause, details });
  }
}
