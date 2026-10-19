'use client';
import { AccountPanel } from '@/components/conta';
import { PageHeader } from '@/components/ui';

export default function Conta() {
  return (
    <div className="max-w-[720px]">
      <PageHeader title="Minha conta" />
      <AccountPanel />
    </div>
  );
}
