export interface Env {
  IDEMPOTENCY_KV: KVNamespace;
  VALIDATION_API_KEYS: string;
  SERVICE_VERSION: string;
}

export interface ValidationRequest {
  type: string;
  content: string;
  options?: Record<string, any>;
  context?: Record<string, string>;
}

export interface GA4ValidationOptions {
  allowPageviewsMissing?: boolean;
  requireSortedByDateAsc?: boolean;
  allowDuplicateDates?: boolean;
  maxRows?: number;
}

export interface ValidationFinding {
  level: 'error' | 'warning';
  code: string;
  message: string;
  pointer?: any;
}

export interface ValidationSuccess {
  ok: true;
  summary: {
    valid: boolean;
    issues: number;
    warnings: number;
    rows: number;
  };
  findings: ValidationFinding[];
  normalized: {
    detectedHeaders: string[];
    dateRange?: {
      start: string;
      end: string;
    };
  };
  idempotency?: {
    key: string;
    replayed: boolean;
  };
}

export interface ValidationError {
  ok: false;
  error: {
    code: string;
    message: string;
  };
  findings?: ValidationFinding[];
  idempotency?: {
    key: string;
    replayed: boolean;
  };
}

export type ValidationResponse = ValidationSuccess | ValidationError;

export interface IdempotencyMetadata {
  key: string;
  fingerprint: string;
  response: ValidationResponse;
  timestamp: number;
}
