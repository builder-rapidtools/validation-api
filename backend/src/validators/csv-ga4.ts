import { GA4ValidationOptions, ValidationFinding, ValidationSuccess } from '../types';

interface ParsedRow {
  rowIndex: number;
  date: string;
  sessions: string;
  users: string;
  pageviews?: string;
}

const DEFAULT_MAX_ROWS = 100000;

/**
 * Decode content from base64: or text: prefix
 */
function decodeContent(content: string): string {
  if (content.startsWith('base64:')) {
    const base64Data = content.substring(7);
    // Decode base64 to string
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } else if (content.startsWith('text:')) {
    return content.substring(5);
  } else {
    throw new Error('Content must be prefixed with "base64:" or "text:"');
  }
}

/**
 * Parse CSV content into rows
 */
function parseCSV(csvText: string): string[][] {
  const lines = csvText.trim().split('\n');
  return lines.map(line => {
    // Simple CSV parsing (doesn't handle quoted commas, but sufficient for this use case)
    return line.split(',').map(cell => cell.trim());
  });
}

/**
 * Validate date format (YYYY-MM-DD)
 */
function isValidDate(dateStr: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;

  const date = new Date(dateStr);
  return date.toISOString().startsWith(dateStr);
}

/**
 * Validate non-negative integer
 */
function isNonNegativeInteger(value: string): boolean {
  const regex = /^\d+$/;
  if (!regex.test(value)) return false;

  const num = parseInt(value, 10);
  return num >= 0 && num.toString() === value;
}

/**
 * Validate CSV timeseries GA4 data
 */
export function validateGA4CSV(
  content: string,
  options: GA4ValidationOptions = {}
): ValidationSuccess {
  const findings: ValidationFinding[] = [];
  const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS;

  // Decode content
  let csvText: string;
  try {
    csvText = decodeContent(content);
  } catch (error) {
    findings.push({
      level: 'error',
      code: 'INVALID_CONTENT_ENCODING',
      message: `Content must be prefixed with "base64:" or "text:"`,
    });

    return buildErrorResponse(findings, 0);
  }

  // Parse CSV
  const rows = parseCSV(csvText);

  if (rows.length === 0) {
    findings.push({
      level: 'error',
      code: 'EMPTY_CSV',
      message: 'CSV file is empty',
    });

    return buildErrorResponse(findings, 0);
  }

  // Validate headers
  const headers = rows[0];
  const requiredHeaders = ['date', 'sessions', 'users'];
  const optionalHeaders = ['pageviews'];

  const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
  if (missingHeaders.length > 0) {
    findings.push({
      level: 'error',
      code: 'MISSING_REQUIRED_HEADERS',
      message: `Missing required headers: ${missingHeaders.join(', ')}`,
      pointer: { missing: missingHeaders },
    });

    return buildErrorResponse(findings, 0);
  }

  const hasPageviews = headers.includes('pageviews');
  if (!hasPageviews && !options.allowPageviewsMissing) {
    findings.push({
      level: 'warning',
      code: 'MISSING_OPTIONAL_HEADER',
      message: 'Optional header "pageviews" is missing',
    });
  }

  // Get column indices
  const dateIdx = headers.indexOf('date');
  const sessionsIdx = headers.indexOf('sessions');
  const usersIdx = headers.indexOf('users');
  const pageviewsIdx = headers.indexOf('pageviews');

  // Validate data rows
  const dataRows = rows.slice(1);
  const rowCount = dataRows.length;

  if (rowCount > maxRows) {
    findings.push({
      level: 'error',
      code: 'MAX_ROWS_EXCEEDED',
      message: `CSV has ${rowCount} rows, exceeding maximum of ${maxRows}`,
      pointer: { maxRows, actualRows: rowCount },
    });

    return buildErrorResponse(findings, rowCount);
  }

  const dates: string[] = [];
  const seenDates = new Set<string>();

  dataRows.forEach((row, idx) => {
    const rowIndex = idx + 2; // +2 because of header and 0-indexing

    // Validate row has enough columns
    if (row.length < requiredHeaders.length) {
      findings.push({
        level: 'error',
        code: 'INVALID_ROW_FORMAT',
        message: `Row ${rowIndex} has insufficient columns`,
        pointer: { row: rowIndex },
      });
      return;
    }

    // Validate date
    const date = row[dateIdx];
    if (!isValidDate(date)) {
      findings.push({
        level: 'error',
        code: 'INVALID_DATE_FORMAT',
        message: `Row ${rowIndex}: Invalid date format "${date}". Expected YYYY-MM-DD`,
        pointer: { row: rowIndex, value: date },
      });
    } else {
      dates.push(date);

      // Check for duplicate dates
      if (seenDates.has(date)) {
        if (!options.allowDuplicateDates) {
          findings.push({
            level: 'error',
            code: 'DUPLICATE_DATE',
            message: `Row ${rowIndex}: Duplicate date "${date}"`,
            pointer: { row: rowIndex, date },
          });
        }
      } else {
        seenDates.add(date);
      }
    }

    // Validate sessions
    const sessions = row[sessionsIdx];
    if (!isNonNegativeInteger(sessions)) {
      findings.push({
        level: 'error',
        code: 'INVALID_SESSIONS_VALUE',
        message: `Row ${rowIndex}: "sessions" must be a non-negative integer, got "${sessions}"`,
        pointer: { row: rowIndex, value: sessions },
      });
    }

    // Validate users
    const users = row[usersIdx];
    if (!isNonNegativeInteger(users)) {
      findings.push({
        level: 'error',
        code: 'INVALID_USERS_VALUE',
        message: `Row ${rowIndex}: "users" must be a non-negative integer, got "${users}"`,
        pointer: { row: rowIndex, value: users },
      });
    }

    // Validate pageviews if present
    if (pageviewsIdx >= 0 && row[pageviewsIdx] !== undefined && row[pageviewsIdx] !== '') {
      const pageviews = row[pageviewsIdx];
      if (!isNonNegativeInteger(pageviews)) {
        findings.push({
          level: 'error',
          code: 'INVALID_PAGEVIEWS_VALUE',
          message: `Row ${rowIndex}: "pageviews" must be a non-negative integer, got "${pageviews}"`,
          pointer: { row: rowIndex, value: pageviews },
        });
      }
    }
  });

  // Validate sorted by date ascending if required
  if (options.requireSortedByDateAsc && dates.length > 0) {
    const sortedDates = [...dates].sort();
    const isNotSorted = dates.some((date, idx) => date !== sortedDates[idx]);

    if (isNotSorted) {
      findings.push({
        level: 'error',
        code: 'NOT_SORTED_BY_DATE',
        message: 'Dates are not sorted in ascending order',
      });
    }
  }

  // Build response
  const errorFindings = findings.filter(f => f.level === 'error');
  const warningFindings = findings.filter(f => f.level === 'warning');

  const dateRange = dates.length > 0
    ? {
        start: dates[0],
        end: dates[dates.length - 1],
      }
    : undefined;

  return {
    ok: true,
    summary: {
      valid: errorFindings.length === 0,
      issues: errorFindings.length,
      warnings: warningFindings.length,
      rows: rowCount,
    },
    findings,
    normalized: {
      detectedHeaders: headers,
      dateRange,
    },
  };
}

function buildErrorResponse(findings: ValidationFinding[], rowCount: number): ValidationSuccess {
  const errorFindings = findings.filter(f => f.level === 'error');
  const warningFindings = findings.filter(f => f.level === 'warning');

  return {
    ok: true,
    summary: {
      valid: false,
      issues: errorFindings.length,
      warnings: warningFindings.length,
      rows: rowCount,
    },
    findings,
    normalized: {
      detectedHeaders: [],
    },
  };
}
