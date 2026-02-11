/**
 * Profile API client functions
 */

import { apiClient, apiUpload } from '@/lib/api';
import type { User } from '@/features/auth/types';

/**
 * Update user profile (display name)
 */
export async function updateProfile(data: { displayName?: string }): Promise<User> {
  return apiClient<User>('/api/profile', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/**
 * Upload avatar image
 */
export async function uploadAvatar(formData: FormData): Promise<{ avatarUrl: string }> {
  return apiUpload<{ avatarUrl: string }>('/api/profile/avatar', formData);
}

/**
 * Delete avatar image
 */
export async function deleteAvatar(): Promise<{ success: boolean }> {
  return apiClient<{ success: boolean }>('/api/profile/avatar', {
    method: 'DELETE',
  });
}
