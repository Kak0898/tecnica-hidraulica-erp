export type MachineStatus = 'operativa' | 'mantencion' | 'fuera_servicio' | 'vendida';
export type AuditStatus = 'pendiente' | 'en_proceso' | 'completada' | 'observada';

export interface Machine {
  id?: string;
  code: string;
  name: string;
  brand?: string;
  model?: string;
  serial_number?: string;
  category?: string;
  location?: string;
  status: MachineStatus;
  last_maintenance?: string;
  next_maintenance?: string;
  purchase_value?: number;
  notes?: string;
  created_at?: string;
}

export interface SparePart {
  id?: string;
  code: string;
  name: string;
  category?: string;
  compatible_machine?: string;
  stock: number;
  min_stock: number;
  unit_cost?: number;
  supplier?: string;
  location?: string;
  created_at?: string;
}

export interface Audit {
  id?: string;
  title: string;
  audit_type: 'inventario' | 'mantencion' | 'seguridad' | 'general';
  status: AuditStatus;
  responsible?: string;
  scheduled_date?: string;
  completed_date?: string;
  notes?: string;
  created_at?: string;
}
