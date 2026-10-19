'use client';
import { AccountPanel } from '@/components/conta';

export default function Conta() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-marca">Conta</h1>
      <AccountPanel />
    </div>
  );
}
