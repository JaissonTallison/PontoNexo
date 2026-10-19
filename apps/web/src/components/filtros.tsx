'use client';
import type { Page } from '@pontonexo/shared';
import { useResource } from '@/lib/hooks';
import { Select } from './ui';

export function EmployeeSelect({ value, onChange, allowAll = false, label = 'Funcionário' }: { value: string; onChange: (id: string) => void; allowAll?: boolean; label?: string }) {
  const { data } = useResource<Page<{ id: string; fullName: string }>>('/employees?status=all&pageSize=100');
  return (
    <Select label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {allowAll ? <option value="">Todos</option> : <option value="">Escolha…</option>}
      {(data?.items ?? []).map((e) => (
        <option key={e.id} value={e.id}>
          {e.fullName}
        </option>
      ))}
    </Select>
  );
}
