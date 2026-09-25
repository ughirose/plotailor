/**
 * RFC 8949 CBOR (Concise Binary Object Representation) Encoder and Decoder
 * Lightweight, zero-dependency implementation for PoP Certificate binary serialization.
 */

export class CBOR {
  private static textEncoder = new TextEncoder();
  private static textDecoder = new TextDecoder('utf-8');

  /**
   * Encodes a JavaScript value into CBOR Uint8Array format.
   */
  static encode(value: unknown): Uint8Array {
    const buffers: Uint8Array[] = [];

    function pushHeader(majorType: number, val: number | bigint): void {
      const typeBits = (majorType & 0x07) << 5;
      if (typeof val === 'bigint') {
        const b = new Uint8Array(9);
        b[0] = typeBits | 27;
        const view = new DataView(b.buffer);
        view.setBigUint64(1, val, false);
        buffers.push(b);
      } else if (val < 24) {
        buffers.push(new Uint8Array([typeBits | val]));
      } else if (val <= 0xff) {
        buffers.push(new Uint8Array([typeBits | 24, val]));
      } else if (val <= 0xffff) {
        const b = new Uint8Array(3);
        b[0] = typeBits | 25;
        b[1] = (val >> 8) & 0xff;
        b[2] = val & 0xff;
        buffers.push(b);
      } else if (val <= 0xffffffff) {
        const b = new Uint8Array(5);
        b[0] = typeBits | 26;
        const view = new DataView(b.buffer);
        view.setUint32(1, val, false);
        buffers.push(b);
      } else {
        const b = new Uint8Array(9);
        b[0] = typeBits | 27;
        const view = new DataView(b.buffer);
        view.setBigUint64(1, BigInt(Math.floor(val)), false);
        buffers.push(b);
      }
    }

    function encodeVal(val: unknown): void {
      if (val === null) {
        buffers.push(new Uint8Array([0xf6])); // Major 7, 22
      } else if (val === undefined) {
        buffers.push(new Uint8Array([0xf7])); // Major 7, 23
      } else if (typeof val === 'boolean') {
        buffers.push(new Uint8Array([val ? 0xf5 : 0xf4]));
      } else if (typeof val === 'number') {
        if (Number.isInteger(val) && val >= 0) {
          pushHeader(0, val);
        } else if (Number.isInteger(val) && val < 0) {
          pushHeader(1, -1 - val);
        } else {
          // Float64
          const b = new Uint8Array(9);
          b[0] = (7 << 5) | 27; // 0xfb
          const view = new DataView(b.buffer);
          view.setFloat64(1, val, false);
          buffers.push(b);
        }
      } else if (typeof val === 'bigint') {
        if (val >= 0n) {
          pushHeader(0, val);
        } else {
          pushHeader(1, -1n - val);
        }
      } else if (typeof val === 'string') {
        const utf8 = CBOR.textEncoder.encode(val);
        pushHeader(3, utf8.byteLength);
        buffers.push(utf8);
      } else if (val instanceof Uint8Array) {
        pushHeader(2, val.byteLength);
        buffers.push(val);
      } else if (Array.isArray(val)) {
        pushHeader(4, val.length);
        for (const item of val) {
          encodeVal(item);
        }
      } else if (typeof val === 'object') {
        const entries = Object.entries(val as Record<string, unknown>).filter(
          ([, v]) => v !== undefined
        );
        pushHeader(5, entries.length);
        for (const [k, v] of entries) {
          encodeVal(k);
          encodeVal(v);
        }
      } else {
        throw new Error(`CBOR encoding unsupported for type: ${typeof val}`);
      }
    }

    encodeVal(value);

    // Concatenate buffers
    const totalLen = buffers.reduce((acc, b) => acc + b.byteLength, 0);
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const b of buffers) {
      result.set(b, offset);
      offset += b.byteLength;
    }
    return result;
  }

  /**
   * Decodes a CBOR Uint8Array into a JavaScript value.
   */
  static decode<T = unknown>(buffer: Uint8Array): T {
    let offset = 0;
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

    function readHeader(): { majorType: number; additionalInfo: number; value: unknown } {
      if (offset >= buffer.byteLength) {
        throw new Error('CBOR decode error: unexpected end of buffer');
      }
      const initialByte = buffer[offset++];
      const majorType = (initialByte >> 5) & 0x07;
      const additionalInfo = initialByte & 0x1f;

      if (additionalInfo < 24) {
        return { majorType, additionalInfo, value: additionalInfo };
      } else if (additionalInfo === 24) {
        const val = buffer[offset++];
        return { majorType, additionalInfo, value: val };
      } else if (additionalInfo === 25) {
        const val = view.getUint16(offset, false);
        offset += 2;
        return { majorType, additionalInfo, value: val };
      } else if (additionalInfo === 26) {
        const val = view.getUint32(offset, false);
        offset += 4;
        return { majorType, additionalInfo, value: val };
      } else if (additionalInfo === 27) {
        if (majorType === 7) {
          const val = view.getFloat64(offset, false);
          offset += 8;
          return { majorType, additionalInfo, value: val };
        } else {
          const val = view.getBigUint64(offset, false);
          offset += 8;
          return { majorType, additionalInfo, value: val };
        }
      } else {
        return { majorType, additionalInfo, value: additionalInfo };
      }
    }

    function decodeVal(): unknown {
      const { majorType, additionalInfo, value } = readHeader();

      switch (majorType) {
        case 0: // Unsigned Integer
          return typeof value === 'bigint' ? Number(value) : value;

        case 1: // Negative Integer
          return typeof value === 'bigint' ? Number(-1n - value) : -1 - (value as number);

        case 2: { // Byte String
          const len = typeof value === 'bigint' ? Number(value) : (value as number);
          const data = buffer.slice(offset, offset + len);
          offset += len;
          return data;
        }

        case 3: { // Text String
          const len = typeof value === 'bigint' ? Number(value) : (value as number);
          const data = buffer.slice(offset, offset + len);
          offset += len;
          return CBOR.textDecoder.decode(data);
        }

        case 4: { // Array
          const len = typeof value === 'bigint' ? Number(value) : (value as number);
          const arr: unknown[] = new Array(len);
          for (let i = 0; i < len; i++) {
            arr[i] = decodeVal();
          }
          return arr;
        }

        case 5: { // Map / Object
          const len = typeof value === 'bigint' ? Number(value) : (value as number);
          const obj: Record<string, unknown> = {};
          for (let i = 0; i < len; i++) {
            const key = String(decodeVal());
            const val = decodeVal();
            obj[key] = val;
          }
          return obj;
        }

        case 7: { // Simple types / floats
          if (additionalInfo === 20) return false;
          if (additionalInfo === 21) return true;
          if (additionalInfo === 22) return null;
          if (additionalInfo === 23) return undefined;
          if (additionalInfo === 27) return value;
          return value;
        }

        default:
          throw new Error(`CBOR decode error: unsupported major type ${majorType}`);
      }
    }

    return decodeVal() as T;
  }
}
