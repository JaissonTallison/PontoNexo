import { redirect } from 'next/navigation';

/** Endereço antigo: agora faz parte de "Para revisar". */
export default function Page() {
  redirect('/painel/revisar?aba=ocorrencias');
}
