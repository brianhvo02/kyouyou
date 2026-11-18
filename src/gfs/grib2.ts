/**
 * Decoder for one GRIB2 message as NOAA publishes GFS 1-degree fields: a regular
 * 360 x 181 latitude/longitude grid (template 3.0), a forecast at one level
 * (template 4.0), simple packing (5.0) or complex packing with spatial
 * differencing (5.3), and no bitmap. Anything else is refused with undefined.
 */

export interface GribField {
  discipline: number;
  category: number;
  parameter: number;
  /** Type of first fixed surface (100 = isobaric, 103 = height above ground) and its value (Pa or m). */
  surfaceType: number;
  surfaceValue: number;
  forecastHours: number;
  /** Reference time, 'YYYY-MM-DDTHH:00'. */
  referenceUtc: string;
  nx: number;
  ny: number;
  /** Row-major, first row at 90°N, first column at 0°E, eastward; length nx * ny. */
  values: Float32Array;
}

const NX = 360;
const NY = 181;
const POINTS = NX * NY;
const MICRO = 1_000_000;

/** A section's bytes; offsets passed to its readers are 1-based octet numbers as in the WMO tables. */
class Section {
  readonly bytes: Uint8Array;
  readonly start: number;
  readonly length: number;

  constructor(bytes: Uint8Array, start: number, length: number) {
    this.bytes = bytes;
    this.start = start;
    this.length = length;
  }

  /** Unsigned big-endian integer of `n` octets starting at octet `octet`; undefined past the section. */
  uint(octet: number, n: number): number | undefined {
    if (octet < 1 || octet + n - 1 > this.length) return undefined;
    let v = 0;
    for (let i = 0; i < n; i++) v = v * 256 + this.bytes[this.start + octet - 1 + i];
    return v;
  }

  /** Sign-magnitude integer (top bit is the sign), as GRIB2 stores signed values. */
  signed(octet: number, n: number): number | undefined {
    const u = this.uint(octet, n);
    if (u === undefined) return undefined;
    const signBit = 2 ** (8 * n - 1);
    return u >= signBit ? -(u - signBit) : u;
  }

  float32(octet: number): number | undefined {
    if (octet < 1 || octet + 3 > this.length) return undefined;
    const view = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.start + octet - 1, 4);
    return view.getFloat32(0);
  }
}

/** Big-endian bit reader over [start, end) of `bytes`; sets `overrun` instead of reading past the end. */
class BitReader {
  private readonly bytes: Uint8Array;
  private readonly end: number;
  private pos: number;
  overrun = false;

  constructor(bytes: Uint8Array, start: number, end: number) {
    this.bytes = bytes;
    this.end = end;
    this.pos = start * 8;
  }

  /** Reads `n` bits (0..32) as an unsigned integer. */
  read(n: number): number {
    if (this.pos + n > this.end * 8) {
      this.overrun = true;
      return 0;
    }
    let v = 0;
    let left = n;
    while (left > 0) {
      const byte = this.bytes[this.pos >>> 3];
      const avail = 8 - (this.pos & 7);
      const take = Math.min(avail, left);
      const bits = (byte >>> (avail - take)) & ((1 << take) - 1);
      v = v * (1 << take) + bits;
      left -= take;
      this.pos += take;
    }
    return v;
  }

  /** Reads `n` bits as a sign-magnitude integer. */
  readSigned(n: number): number {
    if (n === 0) return 0;
    const sign = this.read(1);
    const mag = this.read(n - 1);
    return sign === 1 ? -mag : mag;
  }

  /** Skips to the next whole octet. */
  align(): void {
    this.pos = Math.ceil(this.pos / 8) * 8;
  }
}

/** Decodes one GRIB2 message; undefined for anything it does not fully support. */
export function decodeGrib2(bytes: Uint8Array): GribField | undefined {
  try {
    return decode(bytes);
  } catch {
    // Every read is bounds-checked; this is a last guard so no exception escapes.
    return undefined;
  }
}

function decode(bytes: Uint8Array): GribField | undefined {
  const len = bytes.length;
  if (len < 16 + 4) return undefined;
  if (bytes[0] !== 0x47 || bytes[1] !== 0x52 || bytes[2] !== 0x49 || bytes[3] !== 0x42) return undefined;
  if (bytes[7] !== 2) return undefined;
  const s0 = new Section(bytes, 0, 16);
  if (s0.uint(9, 4) !== 0 || s0.uint(13, 4) !== len) return undefined;
  if (bytes[len - 4] !== 0x37 || bytes[len - 3] !== 0x37 || bytes[len - 2] !== 0x37 || bytes[len - 1] !== 0x37) {
    return undefined;
  }

  const sections = new Map<number, Section>();
  let pos = 16;
  while (pos < len - 4) {
    if (pos + 5 > len - 4) return undefined;
    const head = new Section(bytes, pos, 5);
    const secLen = head.uint(1, 4);
    const num = head.uint(5, 1);
    if (secLen === undefined || num === undefined || secLen < 5 || pos + secLen > len - 4) return undefined;
    if (num < 1 || num > 7 || sections.has(num)) return undefined;
    sections.set(num, new Section(bytes, pos, secLen));
    pos += secLen;
  }
  if (pos !== len - 4) return undefined;

  const s1 = sections.get(1);
  const s3 = sections.get(3);
  const s4 = sections.get(4);
  const s5 = sections.get(5);
  const s6 = sections.get(6);
  const s7 = sections.get(7);
  if (!s1 || !s3 || !s4 || !s5 || !s6 || !s7) return undefined;

  const discipline = bytes[6];
  const referenceUtc = readReferenceTime(s1);
  if (referenceUtc === undefined) return undefined;
  if (!isOneDegreeGrid(s3)) return undefined;
  const product = readProduct(s4);
  if (product === undefined) return undefined;
  if (s6.uint(6, 1) !== 255) return undefined;
  const values = readData(s5, s7);
  if (values === undefined) return undefined;

  return { discipline, ...product, referenceUtc, nx: NX, ny: NY, values };
}

function readReferenceTime(s1: Section): string | undefined {
  const year = s1.uint(13, 2);
  const month = s1.uint(15, 1);
  const day = s1.uint(16, 1);
  const hour = s1.uint(17, 1);
  if (year === undefined || month === undefined || day === undefined || hour === undefined) return undefined;
  const p2 = (n: number): string => String(n).padStart(2, '0');
  return `${String(year).padStart(4, '0')}-${p2(month)}-${p2(day)}T${p2(hour)}:00`;
}

function isOneDegreeGrid(s3: Section): boolean {
  return (
    s3.uint(6, 1) === 0 &&
    s3.uint(7, 4) === POINTS &&
    s3.uint(11, 1) === 0 &&
    s3.uint(13, 2) === 0 &&
    s3.uint(31, 4) === NX &&
    s3.uint(35, 4) === NY &&
    s3.uint(39, 4) === 0 &&
    s3.signed(47, 4) === 90 * MICRO &&
    s3.signed(51, 4) === 0 &&
    s3.signed(56, 4) === -90 * MICRO &&
    s3.signed(60, 4) === 359 * MICRO &&
    s3.uint(72, 1) === 0
  );
}

type Product = Pick<GribField, 'category' | 'parameter' | 'surfaceType' | 'surfaceValue' | 'forecastHours'>;

function readProduct(s4: Section): Product | undefined {
  if (s4.uint(6, 2) !== 0 || s4.uint(8, 2) !== 0) return undefined;
  const category = s4.uint(10, 1);
  const parameter = s4.uint(11, 1);
  const forecastHours = s4.uint(19, 4);
  const surfaceType = s4.uint(23, 1);
  const scale = s4.signed(24, 1);
  const scaled = s4.signed(25, 4);
  if (s4.uint(18, 1) !== 1) return undefined;
  if (
    category === undefined ||
    parameter === undefined ||
    forecastHours === undefined ||
    surfaceType === undefined ||
    scale === undefined ||
    scaled === undefined
  ) {
    return undefined;
  }
  return { category, parameter, surfaceType, surfaceValue: scaled / 10 ** scale, forecastHours };
}

function readData(s5: Section, s7: Section): Float32Array | undefined {
  if (s5.uint(6, 4) !== POINTS) return undefined;
  const template = s5.uint(10, 2);
  const r = s5.float32(12);
  const e = s5.signed(16, 2);
  const d = s5.signed(18, 2);
  const bits = s5.uint(20, 1);
  if (r === undefined || e === undefined || d === undefined || bits === undefined || bits > 32) return undefined;
  if (!Number.isFinite(r)) return undefined;

  let ints: Float64Array | undefined;
  if (template === 0) {
    ints = unpackSimple(s7, bits);
  } else if (template === 3) {
    ints = unpackComplex(s5, s7, bits);
  } else {
    return undefined;
  }
  if (ints === undefined) return undefined;

  const binary = 2 ** e;
  const decimal = 10 ** d;
  const out = new Float32Array(POINTS);
  for (let i = 0; i < POINTS; i++) out[i] = (r + ints[i] * binary) / decimal;
  return out;
}

function unpackSimple(s7: Section, bits: number): Float64Array | undefined {
  const out = new Float64Array(POINTS);
  if (bits === 0) return out;
  const reader = new BitReader(s7.bytes, s7.start + 5, s7.start + s7.length);
  for (let i = 0; i < POINTS; i++) out[i] = reader.read(bits);
  return reader.overrun ? undefined : out;
}

function unpackComplex(s5: Section, s7: Section, refBits: number): Float64Array | undefined {
  const missing = s5.uint(23, 1);
  const ng = s5.uint(32, 4);
  const widthRef = s5.uint(36, 1);
  const widthBits = s5.uint(37, 1);
  const lengthRef = s5.uint(38, 4);
  const lengthInc = s5.uint(42, 1);
  const lastLength = s5.uint(43, 4);
  const lengthBits = s5.uint(47, 1);
  const order = s5.uint(48, 1);
  const extraOctets = s5.uint(49, 1);
  if (
    missing !== 0 ||
    ng === undefined ||
    widthRef === undefined ||
    widthBits === undefined ||
    lengthRef === undefined ||
    lengthInc === undefined ||
    lastLength === undefined ||
    lengthBits === undefined ||
    order === undefined ||
    extraOctets === undefined
  ) {
    return undefined;
  }
  if (order !== 1 && order !== 2) return undefined;
  if (extraOctets < 1 || extraOctets > 4) return undefined;
  if (ng < 1 || ng > POINTS || widthBits > 32 || lengthBits > 32) return undefined;

  const reader = new BitReader(s7.bytes, s7.start + 5, s7.start + s7.length);
  const first: number[] = [];
  for (let i = 0; i < order; i++) first.push(reader.readSigned(extraOctets * 8));
  const minDiff = reader.readSigned(extraOctets * 8);

  const refs = new Float64Array(ng);
  for (let g = 0; g < ng; g++) refs[g] = reader.read(refBits);
  reader.align();
  const widths = new Uint8Array(ng);
  for (let g = 0; g < ng; g++) {
    const w = widthRef + reader.read(widthBits);
    if (w > 32) return undefined;
    widths[g] = w;
  }
  reader.align();
  const lengths = new Uint32Array(ng);
  let total = 0;
  for (let g = 0; g < ng; g++) {
    // Every group has a packed length; the last one's is replaced by its true length.
    const packed = reader.read(lengthBits);
    const l = g === ng - 1 ? lastLength : lengthRef + lengthInc * packed;
    lengths[g] = l;
    total += l;
    if (total > POINTS) return undefined;
  }
  reader.align();
  if (reader.overrun || total !== POINTS) return undefined;

  const x = new Float64Array(POINTS);
  let n = 0;
  for (let g = 0; g < ng; g++) {
    const ref = refs[g];
    const w = widths[g];
    const l = lengths[g];
    if (w === 0) {
      x.fill(ref, n, n + l);
    } else {
      for (let k = 0; k < l; k++) x[n + k] = ref + reader.read(w);
    }
    n += l;
  }
  if (reader.overrun) return undefined;

  if (order === 1) {
    x[0] = first[0];
    for (let i = 1; i < POINTS; i++) x[i] = x[i] + minDiff + x[i - 1];
  } else {
    x[0] = first[0];
    x[1] = first[1];
    for (let i = 2; i < POINTS; i++) x[i] = x[i] + minDiff + 2 * x[i - 1] - x[i - 2];
  }
  return x;
}
