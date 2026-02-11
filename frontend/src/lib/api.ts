/**
 * Typed fetch wrapper with CSRF protection and error handling
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export class ApiError extends Error {
  status: number;
  data?: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/**
 * Read CSRF token from cookie
 */
function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|; )__csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Ensure a CSRF cookie exists by calling the token endpoint
 */
let csrfInitPromise: Promise<void> | null = null;

async function ensureCsrfToken(): Promise<void> {
  if (getCsrfToken()) return;

  if (!csrfInitPromise) {
    csrfInitPromise = fetch(`${API_BASE_URL}/api/csrf-token`, {
      credentials: 'include',
    }).then(() => {
      csrfInitPromise = null;
    }).catch(() => {
      csrfInitPromise = null;
    });
  }

  await csrfInitPromise;
}

/**
 * Generic API client with credentials and CSRF support
 */
export async function apiClient<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  // Build headers
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string>),
  };

  // Add Content-Type for JSON payloads
  if (options?.method && ['POST', 'PUT', 'PATCH'].includes(options.method)) {
    headers['Content-Type'] = 'application/json';

    // Ensure CSRF token exists before state-changing requests
    await ensureCsrfToken();

    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include', // Always include cookies
    });

    // Handle 401 - redirect to login (unless already on login page)
    if (response.status === 401) {
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
      throw new ApiError(401, 'Unauthorized');
    }

    // Parse response body
    const contentType = response.headers.get('content-type');
    let data: unknown;

    if (contentType?.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    // Handle error responses
    if (!response.ok) {
      const errorMessage =
        (data && typeof data === 'object' && 'error' in data)
          ? String(data.error)
          : `Request failed with status ${response.status}`;

      throw new ApiError(response.status, errorMessage, data);
    }

    return data as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    // Network error or other fetch failure
    throw new ApiError(0, error instanceof Error ? error.message : 'Network error');
  }
}
