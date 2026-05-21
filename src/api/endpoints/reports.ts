import { apiClient } from '@/api/client';

/** MVP-skeleton. POST /api/reports — фото рапорта → OCR (v2). */
export const reportsApi = {
  create: (formData: FormData) =>
    apiClient.request<{ id: string }>('/api/reports', { method: 'POST', formData }),
  byId: (id: string) => apiClient.get<unknown>(`/api/reports/${id}`),
};
