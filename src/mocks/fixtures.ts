/**
 * Mock-данные для разработки без бэкенда.
 *
 * НЕ для прода. Подключается только когда `VITE_USE_MOCKS=true`.
 */

import type { Driver } from '@/types/user';
import type { Shift } from '@/types/shift';
import type { Equipment } from '@/types/equipment';
import type { Site, LegalEntity } from '@/types/site';
import type { WorkDay } from '@/types/workDay';
import type { Expense } from '@/types/expense';
import type { Incident } from '@/types/incident';

export const MOCK_PIN_DRIVER = '1111';
export const MOCK_PIN_OPERATOR = '1234';
export const MOCK_OPERATOR_PHONE = '+79001000001';

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};
const daysAhead = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export const mockDrivers: Driver[] = [
  {
    id: 'drv-1',
    role: 'driver',
    fullName: 'Иванов Иван Иванович',
    phone: '+79001111111',
    hourlyRate: 450,
    available: true,
  },
  {
    id: 'drv-2',
    role: 'driver',
    fullName: 'Петров Пётр Петрович',
    phone: '+79002222222',
    hourlyRate: 470,
    available: true,
  },
  {
    id: 'drv-3',
    role: 'driver',
    fullName: 'Сидоров Сидор Сидорович',
    phone: '+79003333333',
    hourlyRate: 460,
    available: true,
  },
  {
    id: 'drv-4',
    role: 'driver',
    fullName: 'Кузнецов Алексей Михайлович',
    phone: '+79004444444',
    hourlyRate: 480,
    available: true,
  },
  {
    id: 'drv-5',
    role: 'driver',
    fullName: 'Соколов Дмитрий Сергеевич',
    phone: '+79005555555',
    hourlyRate: 450,
    available: true,
  },
  {
    id: 'drv-6',
    role: 'driver',
    fullName: 'Морозов Андрей Викторович',
    phone: '+79006666666',
    hourlyRate: 500,
    available: true,
  },
  {
    id: 'drv-7',
    role: 'driver',
    fullName: 'Волков Николай Александрович',
    phone: '+79007777777',
    hourlyRate: 460,
    available: false,
  },
  {
    id: 'drv-8',
    role: 'driver',
    fullName: 'Лебедев Сергей Юрьевич',
    phone: '+79008888888',
    hourlyRate: 470,
    available: true,
  },
];

export const mockEquipment: Equipment[] = [
  { id: 'eq-1', regNumber: 'А123БВ23', name: 'CAT 320D', type: 'excavator', status: 'in_use' },
  { id: 'eq-2', regNumber: 'В456ГД23', name: 'Liebherr LTM 1060', type: 'crane', status: 'available' },
  { id: 'eq-3', regNumber: 'Е789ЖЗ23', name: 'КамАЗ-65115', type: 'dump_truck', status: 'in_use' },
  { id: 'eq-4', regNumber: 'И012КЛ23', name: 'JCB 3CX', type: 'loader', status: 'maintenance' },
  { id: 'eq-5', regNumber: 'К345МН23', name: 'Komatsu PC210', type: 'excavator', status: 'available' },
  { id: 'eq-6', regNumber: 'О567ПР23', name: 'МАЗ-6516', type: 'dump_truck', status: 'available' },
];

export const mockSites: Site[] = [
  {
    id: 'site-1',
    name: 'Карьер «Северный»',
    address: 'Краснодарский край, Динской район, п. Северный',
    customer: 'ООО «СтройРесурс»',
    legalEntityId: 'le-1',
  },
  {
    id: 'site-2',
    name: 'ЖК «Солнечный»',
    address: 'г. Краснодар, ул. Северная, 320',
    customer: 'ООО «Кубань-Девелопмент»',
    legalEntityId: 'le-1',
  },
  {
    id: 'site-3',
    name: 'Объездная М-4 (км 1320)',
    address: 'Краснодарский край, трасса М-4 «Дон»',
    customer: 'Автодор',
    legalEntityId: 'le-2',
  },
  {
    id: 'site-4',
    name: 'Карьер «Восточный»',
    address: 'Динской район, ст. Старокорсунская',
    customer: 'ООО «КарьерГрупп»',
    legalEntityId: 'le-2',
  },
];

export const mockLegalEntities: LegalEntity[] = [
  { id: 'le-1', name: 'ДКБИ-Сервис ООО', inn: '2301999777' },
  { id: 'le-2', name: 'ДКБИ-Транс ООО', inn: '2301888666' },
];

/**
 * Журналы — пустые на старте, заполняются по мере POST.
 * Хендлеры мутируют эти массивы.
 */
export const mockWorkDays: WorkDay[] = [
  // Подсыпаем пару дней для активной вахты sh-001 (тестовый водитель drv-1)
  {
    id: 'wd-001',
    shiftId: 'sh-001',
    date: daysAgo(2),
    type: 'work',
    hours: 10,
    status: 'approved',
  },
  {
    id: 'wd-002',
    shiftId: 'sh-001',
    date: daysAgo(1),
    type: 'work',
    hours: 9,
    status: 'submitted',
  },
];

export const mockExpenses: Expense[] = [
  {
    id: 'exp-001',
    shiftId: 'sh-001',
    date: daysAgo(2),
    amount: 1850,
    category: 'fuel',
    paymentMethod: 'cash',
    comment: '45 л ДТ · АЗС Лукойл',
    status: 'submitted',
  },
];

export const mockIncidents: Incident[] = [];

/**
 * Мутабельный массив вахт — handlers могут менять состояние
 * при логине / создании. На каждый перезапуск dev-сервера сбрасывается.
 */
export const mockShifts: Shift[] = [
  // Активная вахта водителя drv-1 (тестовый логин)
  {
    id: 'sh-001',
    driverId: 'drv-1',
    equipmentId: 'eq-1',
    siteId: 'site-1',
    legalEntityId: 'le-1',
    status: 'active',
    startDate: daysAgo(3),
    endDatePlanned: daysAhead(7),
    endDateActual: null,
    odometerStart: 145320,
    odometerEnd: null,
    fuelLevelStart: 280,
    fuelLevelEnd: null,
    motohoursStart: 8420,
    motohoursEnd: null,
  },
  // Pending_acceptance — водитель ещё не принял машину
  {
    id: 'sh-002',
    driverId: 'drv-2',
    equipmentId: 'eq-2',
    siteId: 'site-2',
    legalEntityId: 'le-1',
    status: 'pending_acceptance',
    startDate: today(),
    endDatePlanned: daysAhead(15),
    endDateActual: null,
    odometerStart: null,
    odometerEnd: null,
    fuelLevelStart: null,
    fuelLevelEnd: null,
    motohoursStart: null,
    motohoursEnd: null,
  },
  // Простой
  {
    id: 'sh-003',
    driverId: 'drv-3',
    equipmentId: 'eq-3',
    siteId: 'site-1',
    legalEntityId: 'le-2',
    status: 'issue_idle',
    startDate: daysAgo(5),
    endDatePlanned: daysAhead(5),
    endDateActual: null,
    odometerStart: 89450,
    odometerEnd: null,
    fuelLevelStart: 180,
    fuelLevelEnd: null,
    motohoursStart: 5230,
    motohoursEnd: null,
  },
  // На верификации
  {
    id: 'sh-004',
    driverId: 'drv-4',
    equipmentId: 'eq-4',
    siteId: 'site-3',
    legalEntityId: 'le-1',
    status: 'pending_verification',
    startDate: daysAgo(20),
    endDatePlanned: daysAgo(5),
    endDateActual: daysAgo(4),
    odometerStart: 56210,
    odometerEnd: 58840,
    fuelLevelStart: 220,
    fuelLevelEnd: 95,
    motohoursStart: 3120,
    motohoursEnd: 3328,
  },
  // Ремонт
  {
    id: 'sh-005',
    driverId: 'drv-5',
    equipmentId: 'eq-2',
    siteId: 'site-2',
    legalEntityId: 'le-2',
    status: 'issue_repair',
    startDate: daysAgo(2),
    endDatePlanned: daysAhead(12),
    endDateActual: null,
    odometerStart: 145200,
    odometerEnd: null,
    fuelLevelStart: 300,
    fuelLevelEnd: null,
    motohoursStart: 8100,
    motohoursEnd: null,
  },
];
