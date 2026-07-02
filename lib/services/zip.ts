// ZIP mínimo sin dependencias (método "store", sin compresión). Suficiente porque
// las fotos ya vienen comprimidas (webp/jpg): comprimir de nuevo no ahorra nada.
// Evita añadir una librería (jszip/archiver) al build del VPS.

let CRC_TABLE: Uint32Array | null = null;
function crcTable(): Uint32Array {
  if (CRC_TABLE) return CRC_TABLE;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  CRC_TABLE = t;
  return t;
}

function crc32(buf: Buffer): number {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export type ZipEntry = { name: string; data: Buffer };

// Construye un ZIP (store) con las entradas dadas. Los nombres pueden llevar
// subcarpetas con "/" (ej. "BC-1133/01.jpg"); los extractores crean la carpeta.
export function buildZip(files: ZipEntry[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf = Buffer.from(f.name, "utf8");
    const crc = crc32(f.data);
    const size = f.data.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // firma local file header
    local.writeUInt16LE(20, 4); // versión necesaria
    local.writeUInt16LE(0x0800, 6); // flag: nombre en UTF-8
    local.writeUInt16LE(0, 8); // método: store
    local.writeUInt16LE(0, 10); // hora
    local.writeUInt16LE(0, 12); // fecha
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18); // comprimido
    local.writeUInt32LE(size, 22); // sin comprimir
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra length
    parts.push(local, nameBuf, f.data);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); // firma central directory
    cd.writeUInt16LE(20, 4); // versión creada por
    cd.writeUInt16LE(20, 6); // versión necesaria
    cd.writeUInt16LE(0x0800, 8); // flag UTF-8
    cd.writeUInt16LE(0, 10); // método
    cd.writeUInt16LE(0, 12); // hora
    cd.writeUInt16LE(0, 14); // fecha
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(size, 20);
    cd.writeUInt32LE(size, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30); // extra
    cd.writeUInt16LE(0, 32); // comentario
    cd.writeUInt16LE(0, 34); // disco
    cd.writeUInt16LE(0, 36); // attrs internos
    cd.writeUInt32LE(0, 38); // attrs externos
    cd.writeUInt32LE(offset, 42); // offset del local header
    central.push(Buffer.concat([cd, nameBuf]));

    offset += local.length + nameBuf.length + size;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // firma end of central directory
  end.writeUInt16LE(0, 4); // disco
  end.writeUInt16LE(0, 6); // disco del CD
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // comentario

  return Buffer.concat([...parts, centralBuf, end]);
}
