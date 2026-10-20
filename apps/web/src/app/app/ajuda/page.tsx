'use client';
import { CalendarDays, CircleHelp, Clock, FileCheck2, MapPin, WifiOff, type LucideIcon } from 'lucide-react';
import { BackBar } from '@/components/ui';

const STEPS: Array<{ icon: LucideIcon; title: string; text: string }> = [
  { icon: Clock, title: 'Marcar o ponto', text: 'Na tela Ponto, toque no bloco colorido que diz “Toque para registrar”. Confira a hora e toque em “Sim, registrar”. Pronto.' },
  { icon: MapPin, title: 'Localização', text: 'O celular pede sua localização só na hora de marcar. Se você estiver fora da casa, escolha o motivo. Isso não é punição.' },
  { icon: WifiOff, title: 'Sem internet', text: 'Pode marcar mesmo assim. O app guarda no celular e envia sozinho quando a internet voltar.' },
  { icon: CircleHelp, title: 'Esqueci de marcar', text: 'Toque em “Esqueci” na barra de baixo, responda as perguntas e envie. Seu empregador analisa e você vê a resposta em “Pedidos”.' },
  { icon: CalendarDays, title: 'Ver meus horários', text: 'Em “Registros” aparecem todos os dias do mês, com as horas trabalhadas.' },
  { icon: FileCheck2, title: 'Comprovante', text: 'Toda marcação gera um comprovante. Toque na marcação para ver, salvar em PDF ou compartilhar.' },
];

export default function Ajuda() {
  return (
    <div>
      <BackBar title="Como usar o app" fallback="/app/conta" />
      <ol className="space-y-3">
        {STEPS.map(({ icon: Icon, title, text }, i) => (
          <li key={title} className="flex gap-3 rounded-[8px] bg-card p-4 shadow-card">
            <Icon size={26} className="mt-0.5 shrink-0 text-marca" aria-hidden />
            <span>
              <span className="block text-md font-bold text-texto">
                {i + 1}. {title}
              </span>
              <span className="mt-0.5 block text-texto-2">{text}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
