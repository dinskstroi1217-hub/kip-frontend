/**
 * Mock-обработчики API. Возвращают Response-объекты так же, как реальный сервер.
 *
 * Соответствуют контракту /api/* из ТЗ. Когда бэк оживёт — выключаем mock-режим,
 * фронт-код не меняется ни строкой.
 */

import type { AuthResponse } from '@/types/api';
import type { Shift, ShiftStatus } from '@/types/shift';
import type { WorkDay } from '@/types/workDay';
import type { Expense } from '@/types/expense';
import type { Incident } from '@/types/incident';
import { newId } from '@/lib/uuid';
import {
  MOCK_PIN_DRIVER,
  MOCK_PIN_OPERATOR,
  MOCK_OPERATOR_PHONE,
  mockDrivers,
  mockShifts,
  mockEquipment,
  mockSites,
  mockLegalEntities,
  mockWorkDays,
  mockExpenses,
  mockIncidents,
} from './fixtures';

interface RouteContext {
  url: URL;
  method: string;
  request: Request;
  auth: { token: string | null; userId: string | null; role: 'driver' | 'operator' | null };
}

type Handler = (ctx: RouteContext) => Promise<Response> | Response;

interface Route {
  method: string;
  pattern: RegExp;
  handler: Handler;
}

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

function err(status: number, message: string): Response {
  return json({ message, code: `mock_${status}` }, { status });
}

/**
 * Тестовый JWT-подобный токен: mock.{userId}.{role}.{exp}
 * Не валиден как настоящий JWT — для mock-уровня этого достаточно.
 */
function mintToken(userId: string, role: 'driver' | 'operator'): string {
  const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
  return `mock.${userId}.${role}.${exp}`;
}

function decodeToken(token: string | null): RouteContext['auth'] {
  if (!token) return { token: null, userId: null, role: null };
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'mock') {
    return { token, userId: null, role: null };
  }
  const exp = Number(parts[3]);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) {
    return { token, userId: null, role: null };
  }
  return {
    token,
    userId: parts[1] ?? null,
    role: parts[2] === 'operator' ? 'operator' : 'driver',
  };
}

const routes: Route[] = [
  {
    method: 'GET',
    pattern: /^\/health$/,
    handler: () => json({ status: 'ok', mode: 'mock', timestamp: new Date().toISOString() }),
  },

  // Список водителей — публичный (для экрана входа)
  {
    method: 'GET',
    pattern: /^\/api\/drivers$/,
    handler: () => json(mockDrivers),
  },

  // Логин водителя
  {
    method: 'POST',
    pattern: /^\/api\/auth\/driver\/login$/,
    handler: async ({ request }) => {
      const body = (await request.json().catch(() => ({}))) as {
        phone?: string;
        pin?: string;
      };
      const driver = mockDrivers.find((d) => d.phone === body.phone);
      if (!driver) return err(404, 'Водитель не найден');
      if (body.pin !== MOCK_PIN_DRIVER) return err(401, 'Неверный PIN');
      const resp: AuthResponse = {
        token: mintToken(String(driver.id), 'driver'),
        user: {
          id: driver.id,
          role: 'driver',
          fullName: driver.fullName,
          phone: driver.phone,
        },
        expiresIn: 7 * 24 * 60 * 60,
      };
      return json(resp);
    },
  },

  // Логин оператора
  {
    method: 'POST',
    pattern: /^\/api\/auth\/operator\/login$/,
    handler: async ({ request }) => {
      const body = (await request.json().catch(() => ({}))) as {
        phone?: string;
        pin?: string;
      };
      if (body.phone !== MOCK_OPERATOR_PHONE) return err(404, 'Оператор не найден');
      if (body.pin !== MOCK_PIN_OPERATOR) return err(401, 'Неверный PIN');
      const resp: AuthResponse = {
        token: mintToken('op-1', 'operator'),
        user: {
          id: 'op-1',
          role: 'operator',
          fullName: 'Тестовый Оператор',
          phone: MOCK_OPERATOR_PHONE,
        },
        expiresIn: 7 * 24 * 60 * 60,
      };
      return json(resp);
    },
  },

  // Мои вахты (водитель)
  {
    method: 'GET',
    pattern: /^\/api\/shifts\/my$/,
    handler: ({ auth }) => {
      if (!auth.userId) return err(401, 'Не авторизован');
      const mine = mockShifts.filter((s) => s.driverId === auth.userId);
      return json(mine);
    },
  },

  // Все вахты (оператор)
  {
    method: 'GET',
    pattern: /^\/api\/shifts$/,
    handler: ({ auth }) => {
      if (!auth.userId) return err(401, 'Не авторизован');
      if (auth.role !== 'operator') return err(403, 'Только для оператора');
      return json(mockShifts);
    },
  },

  // вахта по id
  {
    method: 'GET',
    pattern: /^\/api\/shifts\/([^/]+)$/,
    handler: ({ url, auth }) => {
      if (!auth.userId) return err(401, 'Не авторизован');
      const id = url.pathname.split('/').pop();
      const shift = mockShifts.find((s) => s.id === id);
      if (!shift) return err(404, 'Вахта не найдена');
      return json(shift);
    },
  },

  // Техника — отдельный mock с реальными данными
  {
    method: 'GET',
    pattern: /^\/api\/equipment$/,
    handler: () => json(mockEquipment),
  },

  // Объекты (assumption: маршрут не описан в исходном ТЗ — см. types/site.ts)
  {
    method: 'GET',
    pattern: /^\/api\/sites$/,
    handler: () => json(mockSites),
  },

  // Юрлица (assumption: см. выше)
  {
    method: 'GET',
    pattern: /^\/api\/legal-entities$/,
    handler: () => json(mockLegalEntities),
  },

  // GET /api/work-days — фильтр по shift_id (query)
  {
    method: 'GET',
    pattern: /^\/api\/work-days/,
    handler: ({ url }) => {
      const shiftId = url.searchParams.get('shift_id') ?? url.searchParams.get('shiftId');
      const list = shiftId ? mockWorkDays.filter((w) => w.shiftId === shiftId) : mockWorkDays;
      return json(list);
    },
  },

  // GET /api/expenses
  {
    method: 'GET',
    pattern: /^\/api\/expenses/,
    handler: ({ url }) => {
      const shiftId = url.searchParams.get('shift_id') ?? url.searchParams.get('shiftId');
      const list = shiftId ? mockExpenses.filter((e) => e.shiftId === shiftId) : mockExpenses;
      return json(list);
    },
  },

  // GET /api/incidents
  {
    method: 'GET',
    pattern: /^\/api\/incidents/,
    handler: ({ url }) => {
      const shiftId = url.searchParams.get('shift_id') ?? url.searchParams.get('shiftId');
      const list = shiftId ? mockIncidents.filter((i) => i.shiftId === shiftId) : mockIncidents;
      return json(list);
    },
  },

  // POST /api/shifts — создаём вахту в pending_acceptance, сохраняем в state
  {
    method: 'POST',
    pattern: /^\/api\/shifts$/,
    handler: async ({ request, auth }) => {
      if (!auth.userId) return err(401, 'Не авторизован');
      const body = (await request.json().catch(() => ({}))) as Partial<Shift>;
      const shift: Shift = {
        id: `sh-${Date.now()}`,
        driverId: auth.userId,
        equipmentId: body.equipmentId ?? null,
        siteId: body.siteId ?? null,
        legalEntityId: body.legalEntityId ?? null,
        status: 'pending_acceptance',
        startDate: body.startDate ?? new Date().toISOString().slice(0, 10),
        endDatePlanned: body.endDatePlanned ?? null,
        endDateActual: null,
        odometerStart: body.odometerStart ?? null,
        odometerEnd: null,
        fuelLevelStart: body.fuelLevelStart ?? null,
        fuelLevelEnd: null,
        motohoursStart: body.motohoursStart ?? null,
        motohoursEnd: null,
      };
      mockShifts.push(shift);
      return json(shift, { status: 201 });
    },
  },

  // POST /api/shifts/:id/activate — переводим в active
  {
    method: 'POST',
    pattern: /^\/api\/shifts\/([^/]+)\/activate$/,
    handler: ({ url, auth }) => {
      if (!auth.userId) return err(401, 'Не авторизован');
      const id = url.pathname.split('/')[3];
      const shift = mockShifts.find((s) => s.id === id);
      if (!shift) return err(404, 'Вахта не найдена');
      shift.status = 'active';
      return json(shift);
    },
  },

  // POST /api/shifts/:id/complete — переводим в pending_verification
  {
    method: 'POST',
    pattern: /^\/api\/shifts\/([^/]+)\/complete$/,
    handler: ({ url, auth }) => {
      if (!auth.userId) return err(401, 'Не авторизован');
      const id = url.pathname.split('/')[3];
      const shift = mockShifts.find((s) => s.id === id);
      if (!shift) return err(404, 'Вахта не найдена');
      shift.status = 'pending_verification' as ShiftStatus;
      shift.endDateActual = new Date().toISOString().slice(0, 10);
      return json(shift);
    },
  },

  // POST /api/acceptance — акт приёмки (multipart с фото или JSON без)
  {
    method: 'POST',
    pattern: /^\/api\/acceptance$/,
    handler: async ({ request }) => {
      // Поддерживаем оба формата — multipart и JSON
      const ct = request.headers.get('content-type') ?? '';
      let id = `acc-${Date.now()}`;
      if (ct.includes('multipart/form-data')) {
        // не парсим detail, просто подтверждаем приём
      } else {
        const body = (await request.json().catch(() => ({}))) as { id?: string };
        if (body.id) id = body.id;
      }
      return json({ id, status: 'created' }, { status: 201 });
    },
  },

  // POST /api/acceptance/:id/sign — подпись водителя (или представителя)
  {
    method: 'POST',
    pattern: /^\/api\/acceptance\/([^/]+)\/sign$/,
    handler: () => json({ status: 'signed', signedAt: new Date().toISOString() }),
  },

  // POST /api/acceptance/:id/return — акт сдачи (multipart с метриками + фото)
  // assumption: на ShiftEndPage в URL передаём shiftId — это тот же id для
  // мока, поэтому пишем метрики сразу в вахту (чтобы оператор увидел в
  // verification queue).
  {
    method: 'POST',
    pattern: /^\/api\/acceptance\/([^/]+)\/return$/,
    handler: async ({ url, request }) => {
      const id = url.pathname.split('/')[3];
      const ct = request.headers.get('content-type') ?? '';
      let payload: {
        shiftId?: string;
        odometerEnd?: number;
        fuelEndLiters?: number;
        motohoursEnd?: number;
      } = {};
      if (ct.includes('multipart/form-data')) {
        const fd = await request.formData();
        const j = fd.get('payload');
        if (typeof j === 'string') {
          try {
            payload = JSON.parse(j);
          } catch {
            // ignore — оставляем дефолт
          }
        }
      } else {
        payload = (await request.json().catch(() => ({}))) as typeof payload;
      }
      // Применяем метрики к вахте (id в URL = shiftId на ShiftEndPage)
      const shiftId = payload.shiftId ?? id;
      const shift = mockShifts.find((s) => s.id === shiftId);
      if (shift) {
        if (typeof payload.odometerEnd === 'number') shift.odometerEnd = payload.odometerEnd;
        if (typeof payload.fuelEndLiters === 'number') shift.fuelLevelEnd = payload.fuelEndLiters;
        if (typeof payload.motohoursEnd === 'number') shift.motohoursEnd = payload.motohoursEnd;
      }
      return json({ id: `ret-${Date.now()}`, status: 'created' }, { status: 201 });
    },
  },

  // POST /api/acceptance/:id/return/sign — подпись акта сдачи
  // Принимает { signature, role?: 'driver'|'representative', representativeFullName?, representativePosition? }
  {
    method: 'POST',
    pattern: /^\/api\/acceptance\/([^/]+)\/return\/sign$/,
    handler: async ({ request }) => {
      // Не парсим detail — просто подтверждаем приём (mock).
      try {
        await request.json();
      } catch {
        // ignore
      }
      return json({ status: 'signed', signedAt: new Date().toISOString() });
    },
  },

  // POST /api/work-days — создаём день
  {
    method: 'POST',
    pattern: /^\/api\/work-days$/,
    handler: async ({ request }) => {
      const ct = request.headers.get('content-type') ?? '';
      let body: Partial<WorkDay> = {};
      if (ct.includes('application/json')) {
        body = (await request.json().catch(() => ({}))) as Partial<WorkDay>;
      }
      const day: WorkDay = {
        id: `wd-${newId().slice(0, 8)}`,
        shiftId: body.shiftId ?? '',
        date: body.date ?? new Date().toISOString().slice(0, 10),
        type: body.type ?? 'work',
        hours: body.hours ?? 0,
        comment: body.comment,
        idleReason: body.idleReason,
        status: 'submitted',
      };
      mockWorkDays.push(day);
      return json(day, { status: 201 });
    },
  },

  // POST /api/expenses — создаём расход (multipart с фото чека или JSON)
  {
    method: 'POST',
    pattern: /^\/api\/expenses$/,
    handler: async ({ request }) => {
      const ct = request.headers.get('content-type') ?? '';
      let payload: Partial<Expense> = {};
      if (ct.includes('multipart/form-data')) {
        const fd = await request.formData();
        const j = fd.get('payload');
        if (typeof j === 'string') payload = JSON.parse(j) as Partial<Expense>;
      } else {
        payload = (await request.json().catch(() => ({}))) as Partial<Expense>;
      }
      const exp: Expense = {
        id: `exp-${newId().slice(0, 8)}`,
        shiftId: payload.shiftId ?? null,
        date: payload.date ?? new Date().toISOString().slice(0, 10),
        amount: payload.amount ?? 0,
        category: payload.category ?? 'other',
        paymentMethod: payload.paymentMethod,
        comment: payload.comment,
        receiptPhotoId: payload.receiptPhotoId,
        status: 'submitted',
      };
      mockExpenses.push(exp);
      return json(exp, { status: 201 });
    },
  },

  // POST /api/incidents — ремонт / поломка / повреждение
  {
    method: 'POST',
    pattern: /^\/api\/incidents$/,
    handler: async ({ request }) => {
      const ct = request.headers.get('content-type') ?? '';
      let payload: Partial<Incident> = {};
      if (ct.includes('multipart/form-data')) {
        const fd = await request.formData();
        const j = fd.get('payload');
        if (typeof j === 'string') payload = JSON.parse(j) as Partial<Incident>;
      } else {
        payload = (await request.json().catch(() => ({}))) as Partial<Incident>;
      }
      const inc: Incident = {
        id: `inc-${newId().slice(0, 8)}`,
        shiftId: payload.shiftId ?? '',
        type: payload.type ?? 'repair',
        description: payload.description ?? '',
        status: 'open',
        reportedAt: new Date().toISOString(),
        photoIds: payload.photoIds,
      };
      mockIncidents.push(inc);
      // Если ремонт/простой — также переводим вахту в issue_*
      const shift = mockShifts.find((s) => s.id === inc.shiftId);
      if (shift && shift.status === 'active') {
        shift.status = (inc.type === 'repair' ? 'issue_repair' : 'issue_idle') as ShiftStatus;
      }
      return json(inc, { status: 201 });
    },
  },

  // POST /api/reports — фото рапорта → OCR. MVP: echo.
  {
    method: 'POST',
    pattern: /^\/api\/reports$/,
    handler: () => json({ id: `rep-${Date.now()}` }, { status: 201 }),
  },

  // POST work-day actions
  {
    method: 'POST',
    pattern: /^\/api\/work-days\/([^/]+)\/(submit|approve|reject)$/,
    handler: async ({ url }) => {
      const parts = url.pathname.split('/');
      const id = parts[3];
      const action = parts[4];
      const day = mockWorkDays.find((w) => w.id === id);
      if (!day) return err(404, 'Day not found');
      if (action === 'submit') day.status = 'submitted';
      if (action === 'approve') day.status = 'approved';
      if (action === 'reject') day.status = 'rejected';
      return json(day);
    },
  },

  // Заглушка для PATCH
  {
    method: 'PATCH',
    pattern: /^\/api\/.+/,
    handler: async ({ request }) => {
      const body = await request.json().catch(() => ({}));
      return json(body);
    },
  },
];

async function dispatch(request: Request): Promise<Response | null> {
  const url = new URL(request.url, 'http://mock.local');
  const auth = decodeToken(request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? null);

  for (const r of routes) {
    if (r.method === request.method && r.pattern.test(url.pathname)) {
      return await r.handler({ url, method: request.method, request, auth });
    }
  }
  return null;
}

export async function mockFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = input instanceof Request ? input : new Request(input, init);
  const url = new URL(request.url, window.location.origin);

  // Перехватываем только обращения к /api/* и /health
  if (!url.pathname.startsWith('/api/') && url.pathname !== '/health') {
    return realFetch(input, init);
  }

  // Имитация реальной задержки сети (200-400ms)
  await new Promise((resolve) => setTimeout(resolve, 200 + Math.random() * 200));

  const response = await dispatch(request);
  if (response) return response;
  return new Response(JSON.stringify({ message: 'Mock-маршрут не найден' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
}

let realFetch: typeof fetch = fetch;
export function captureRealFetch(): void {
  realFetch = window.fetch.bind(window);
}
