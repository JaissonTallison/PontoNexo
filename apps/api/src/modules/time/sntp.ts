import { createSocket } from 'node:dgram';

const NTP_EPOCH_OFFSET_S = 2_208_988_800; // 1900 → 1970

function readTimestamp(buf: Buffer, offset: number): number {
  const seconds = buf.readUInt32BE(offset);
  const fraction = buf.readUInt32BE(offset + 4);
  return (seconds - NTP_EPOCH_OFFSET_S) * 1000 + (fraction * 1000) / 2 ** 32;
}

function writeTimestamp(buf: Buffer, offset: number, ms: number) {
  const seconds = Math.floor(ms / 1000) + NTP_EPOCH_OFFSET_S;
  const fraction = Math.floor(((ms % 1000) / 1000) * 2 ** 32);
  buf.writeUInt32BE(seconds >>> 0, offset);
  buf.writeUInt32BE(fraction >>> 0, offset + 4);
}

export interface SntpResult {
  /** relógio do servidor NTP − relógio local (ms); positivo = relógio local atrasado */
  offsetMs: number;
  roundTripMs: number;
  stratum: number;
}

/** Consulta SNTP (RFC 4330) com validação do carimbo de origem. */
export function sntpQuery(host: string, port = 123, timeoutMs = 3000, now: () => number = Date.now): Promise<SntpResult> {
  return new Promise((resolve, reject) => {
    const socket = createSocket('udp4');
    const packet = Buffer.alloc(48);
    packet[0] = 0x23; // LI=0, VN=4, Mode=3 (cliente)
    const t1 = now();
    writeTimestamp(packet, 40, t1);
    const originHi = packet.readUInt32BE(40);
    const originLo = packet.readUInt32BE(44);

    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`Tempo esgotado consultando ${host}`));
    }, timeoutMs);

    socket.once('error', (err) => {
      clearTimeout(timer);
      socket.close();
      reject(err);
    });
    socket.once('message', (msg) => {
      const t4 = now();
      clearTimeout(timer);
      socket.close();
      if (msg.length < 48) return reject(new Error('Resposta NTP curta'));
      const mode = msg[0]! & 0x07;
      const stratum = msg[1]!;
      if (mode !== 4 || stratum === 0 || stratum > 15) return reject(new Error(`Resposta NTP inválida (modo ${mode}, estrato ${stratum})`));
      if (msg.readUInt32BE(24) !== originHi || msg.readUInt32BE(28) !== originLo) return reject(new Error('Carimbo de origem não confere'));
      const t2 = readTimestamp(msg, 32);
      const t3 = readTimestamp(msg, 40);
      resolve({ offsetMs: Math.round((t2 - t1 + (t3 - t4)) / 2), roundTripMs: Math.round(t4 - t1 - (t3 - t2)), stratum });
    });
    socket.send(packet, port, host);
  });
}
