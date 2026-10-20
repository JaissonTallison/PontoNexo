'use client';
import { RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ListenButton, useGuide } from '@/components/guia';
import { SECAO, type Secao } from '@/components/secoes';
import { Button, PageHeader } from '@/components/ui';

const ROTA: Partial<Record<keyof typeof SECAO, string>> = {
  inicio: '/painel',
  funcionarios: '/painel/funcionarios',
  novoFuncionario: '/painel/funcionarios/novo',
  marcacoes: '/painel/marcacoes',
  revisar: '/painel/revisar',
  fechamento: '/painel/fechamento',
  espelho: '/painel/espelho',
  locais: '/painel/locais',
  escalas: '/painel/escalas',
  configuracoes: '/painel/configuracoes',
  auditoria: '/painel/auditoria',
  incidentes: '/painel/incidentes',
  privacidade: '/painel/privacidade',
  conta: '/painel/conta',
};

const GRUPOS: Array<{ title: string; keys: Array<keyof typeof SECAO> }> = [
  { title: 'Dia a dia', keys: ['inicio', 'funcionarios', 'novoFuncionario', 'funcionario', 'marcacoes', 'revisar'] },
  { title: 'Fim do mês', keys: ['fechamento', 'espelho'] },
  { title: 'Configurar', keys: ['locais', 'escalas', 'configuracoes', 'conta'] },
  { title: 'Mais opções', keys: ['auditoria', 'incidentes', 'privacidade'] },
];

function Item({ s, href }: { s: Secao; href?: string }) {
  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-md font-bold text-marca">{href ? <Link href={href} className="hover:underline">{s.helpTitle}</Link> : s.helpTitle}</h3>
        <ListenButton text={`${s.helpTitle}. ${s.help}`} />
      </div>
      <p className="mt-1 max-w-3xl text-texto-2">{s.help}</p>
    </li>
  );
}

/** Todas as explicações do painel num lugar só, com leitura em voz alta e a opção de rever as dicas. */
export default function Ajuda() {
  const guide = useGuide();
  const router = useRouter();
  return (
    <div>
      <PageHeader
        title="Ajuda e explicações"
        description="Como funciona cada tela do painel."
        back={{ href: '/painel', label: 'Início' }}
        actions={
          guide ? (
            <Button
              variant="secondary"
              onClick={() => {
                guide.restart();
                router.push('/painel');
              }}
            >
              <RotateCcw size={18} aria-hidden /> Rever as dicas desde o começo
            </Button>
          ) : null
        }
      />
      <div className="grid gap-4 xl:grid-cols-2">
        {GRUPOS.map((g) => (
          <section key={g.title} className="cartao-3d rounded-[8px] bg-card p-4">
            <h2 className="mb-3 text-xs font-bold tracking-wide text-texto-3 uppercase">{g.title}</h2>
            <ul className="divide-y divide-borda">
              {g.keys.map((k) => (
                <Item key={k} s={SECAO[k]} href={ROTA[k]} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
