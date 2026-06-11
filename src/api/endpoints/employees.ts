import { apiClient } from '@/api/client';

/**
 * Сотрудники (новая модель auth) — берутся из 1С-выгрузки.
 *
 * Бэк-эндпоинты:
 *   GET   /api/employees/loginable   — без auth, для LoginPage (только те у кого role!=NULL)
 *   GET   /api/employees             — operator, для админ-UI
 *   PATCH /api/employees/:id         — operator, смена роли
 */

export type EmployeeRole = 'driver' | 'dispatcher' | null;

export interface EmployeeLoginable {
  id: number;
  fullName: string;
  role: 'driver' | 'dispatcher';
}

export interface Employee {
  id: number;
  fullName: string;
  birthDate: string | null;  // YYYY-MM-DD
  jobTitle: string | null;
  role: EmployeeRole;
  /** 'manual' — оператор поставил вручную (импорт не перетирает),
   *  'auto'   — импорт распознал по должности.
   *  null     — у этого сотрудника никогда не было роли. */
  roleSource: 'manual' | 'auto' | null;
  isActive: boolean;
  /** Дата, когда сотрудник пропал из выгрузки 1С (= увольнение).
   *  При повторном появлении в 1С сбрасывается в null. */
  deactivatedAt: string | null;
  source: string;
  updatedAt: string;
}

interface RawLoginable {
  id: number;
  full_name: string;
  role: 'driver' | 'dispatcher';
}

interface RawEmployee {
  id: number;
  full_name: string;
  birth_date: string | null;
  job_title?: string | null;
  role: EmployeeRole;
  role_source?: 'manual' | 'auto' | null;
  is_active: number | boolean;
  deactivated_at?: string | null;
  source: string;
  updated_at: string;
}

function unwrap<T>(raw: T | { data: T }): T {
  return (raw as { data?: T }).data ?? (raw as T);
}

function normalizeLoginable(r: RawLoginable): EmployeeLoginable {
  return { id: r.id, fullName: r.full_name, role: r.role };
}

function normalizeEmployee(r: RawEmployee): Employee {
  return {
    id: r.id,
    fullName: r.full_name,
    birthDate: r.birth_date,
    jobTitle: r.job_title ?? null,
    role: r.role,
    roleSource: r.role_source ?? null,
    isActive: !!r.is_active,
    deactivatedAt: r.deactivated_at ?? null,
    source: r.source,
    updatedAt: r.updated_at,
  };
}

export const employeesApi = {
  loginable: async (): Promise<EmployeeLoginable[]> => {
    const raw = await apiClient.get<{ data: RawLoginable[] } | RawLoginable[]>(
      '/api/employees/loginable',
    );
    const arr = Array.isArray(raw) ? raw : (raw.data ?? []);
    return arr.map(normalizeLoginable);
  },

  list: async (): Promise<Employee[]> => {
    const raw = await apiClient.get<{ data: RawEmployee[] } | RawEmployee[]>(
      '/api/employees',
    );
    const arr = Array.isArray(raw) ? raw : (raw.data ?? []);
    return arr.map(normalizeEmployee);
  },

  updateRole: async (id: number, role: EmployeeRole): Promise<{ id: number; role: EmployeeRole }> => {
    const raw = await apiClient.patch<{ data: { id: number; role: EmployeeRole } } | { id: number; role: EmployeeRole }>(
      `/api/employees/${id}`,
      { role },
    );
    return unwrap(raw);
  },
};
