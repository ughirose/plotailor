import os
import struct

def encode_u32(val: int) -> bytes:
    res = bytearray()
    while True:
        b = val & 0x7F
        val >>= 7
        if val != 0:
            res.append(b | 0x80)
        else:
            res.append(b)
            break
    return bytes(res)

def encode_i32(val: int) -> bytes:
    res = bytearray()
    while True:
        b = val & 0x7F
        val >>= 7
        sign_bit = (b & 0x40) != 0
        if (val == 0 and not sign_bit) or (val == -1 and sign_bit):
            res.append(b)
            break
        else:
            res.append(b | 0x80)
    return bytes(res)

def encode_string(s: str) -> bytes:
    encoded = s.encode('utf-8')
    return encode_u32(len(encoded)) + encoded

def make_sec(sec_id: int, payload: bytes) -> bytes:
    return bytes([sec_id]) + encode_u32(len(payload)) + payload

def build_tokenizer_wasm() -> bytes:
    """
    Build WebAssembly binary with SIMD128 for scanning Japanese text:
    - TokenKind:
        Newline = 1         (\\n: 0x0A)
        InlinePipeAscii = 2 (|: 0x7C)
        RubyOpen = 3        (《: 0xE3 0x80 0x8A)
        RubyClose = 4       (》: 0xE3 0x80 0x8B)
        InlinePipeWide = 5  (｜: 0xEF 0xBD 0x9C)
    
    Exports:
    - memory
    - malloc(size: i32) -> i32
    - free(ptr: i32) -> void
    - scan_tokens_simd(ptr: i32, len: i32, base_utf8: i32, out_buf: i32, max_tokens: i32) -> i32
    """
    wasm = bytearray(b'\x00asm\x01\x00\x00\x00')

    # Types:
    # 0: (i32) -> i32                 [malloc]
    # 1: (i32) -> ()                  [free]
    # 2: (i32, i32, i32, i32, i32) -> i32 [scan_tokens_simd]
    types = [
        bytes([0x60]) + encode_u32(1) + bytes([0x7F]) + encode_u32(1) + bytes([0x7F]),
        bytes([0x60]) + encode_u32(1) + bytes([0x7F]) + encode_u32(0),
        bytes([0x60]) + encode_u32(5) + bytes([0x7F, 0x7F, 0x7F, 0x7F, 0x7F]) + encode_u32(1) + bytes([0x7F]),
    ]
    type_sec = encode_u32(len(types)) + b''.join(types)
    wasm += make_sec(1, type_sec)

    # Function declarations:
    func_types = [0, 1, 2]
    func_sec = encode_u32(len(func_types)) + bytes(func_types)
    wasm += make_sec(3, func_sec)

    # Memory: 1 memory, initial=32 pages (2MB), max=256 pages (16MB)
    mem_sec = encode_u32(1) + bytes([0x01]) + encode_u32(32) + encode_u32(256)
    wasm += make_sec(5, mem_sec)

    # Globals:
    # Global 0: mut i32 (bump allocator pointer, init: 131072 = 128KB)
    glob_init0 = bytes([0x41]) + encode_i32(131072) + bytes([0x0B])
    glob_sec = encode_u32(1) + bytes([0x7F, 0x01]) + glob_init0
    wasm += make_sec(6, glob_sec)

    # Exports:
    exports = [
        encode_string("memory") + bytes([0x02, 0x00]),
        encode_string("malloc") + bytes([0x00, 0x00]),
        encode_string("free") + bytes([0x00, 0x01]),
        encode_string("scan_tokens_simd") + bytes([0x00, 0x02]),
    ]
    export_sec = encode_u32(len(exports)) + b''.join(exports)
    wasm += make_sec(7, export_sec)

    codes = []

    # ----------------------------------------------------
    # Func 0: malloc(size: i32) -> i32
    # ----------------------------------------------------
    code0 = bytearray()
    code0 += encode_u32(1) + encode_u32(1) + bytes([0x7F]) # 1 local: old_ptr
    code0 += bytes([0x23, 0x00, 0x21, 0x01])               # global.get 0, local.set 1
    code0 += bytes([0x20, 0x01, 0x20, 0x00])               # local.get 1, local.get 0 (size)
    code0 += bytes([0x41, 0x0F, 0x6A])                     # i32.const 15, i32.add
    code0 += bytes([0x41]) + encode_i32(-16) + bytes([0x71, 0x6A]) # i32.const -16, i32.and, i32.add
    code0 += bytes([0x24, 0x00])                           # global.set 0
    code0 += bytes([0x20, 0x01])                           # local.get 1
    code0 += bytes([0x0B])                                 # end
    codes.append(encode_u32(len(code0)) + code0)

    # ----------------------------------------------------
    # Func 1: free(ptr: i32) -> void
    # ----------------------------------------------------
    code1 = bytearray()
    code1 += bytes([0x00])                                 # 0 locals
    code1 += bytes([0x01, 0x0B])                           # nop, end
    codes.append(encode_u32(len(code1)) + code1)

    # ----------------------------------------------------
    # Func 2: scan_tokens_simd(ptr: i32, len: i32, base_utf8: i32, out_buf: i32, max_tokens: i32) -> i32
    # ----------------------------------------------------
    code2 = bytearray()
    code2 += encode_u32(3)
    code2 += encode_u32(2) + bytes([0x7F])                 # 5: offset, 6: token_count
    code2 += encode_u32(1) + bytes([0x7B])                 # 7: chunk (v128)
    code2 += encode_u32(7) + bytes([0x7F])                 # 8..14: mask, idx, pos, b0, b1, b2, out_pos

    # offset = 0, token_count = 0
    code2 += bytes([0x41, 0x00, 0x21, 0x05])               # local.set 5
    code2 += bytes([0x41, 0x00, 0x21, 0x06])               # local.set 6

    def emit_token_write(kind_val: int):
        w = bytearray()
        # out_pos = out_buf + (token_count * 8)
        w += bytes([0x20, 0x03, 0x20, 0x06, 0x41, 0x03, 0x74, 0x6A, 0x21, 0x0E]) # local.set 14
        # store kind at out_pos + 0
        w += bytes([0x20, 0x0E, 0x41]) + encode_i32(kind_val) + bytes([0x36, 0x02, 0x00])
        # store base_utf8 + pos at out_pos + 4
        w += bytes([0x20, 0x0E, 0x20, 0x02, 0x20, 0x0A, 0x6A, 0x36, 0x02, 0x04])
        # token_count += 1
        w += bytes([0x20, 0x06, 0x41, 0x01, 0x6A, 0x21, 0x06])
        return bytes(w)

    def emit_byte_check():
        c = bytearray()
        # b0 == 0x0A -> Newline (1)
        c += bytes([0x20, 0x0B, 0x41, 0x0A, 0x46, 0x04, 0x40])
        c += emit_token_write(1)
        c += bytes([0x05]) # else

        # b0 == 0x7C -> InlinePipeAscii (2)
        c += bytes([0x20, 0x0B, 0x41]) + encode_i32(0x7C) + bytes([0x46, 0x04, 0x40])
        c += emit_token_write(2)
        c += bytes([0x05]) # else

        # b0 == 0xE3 and pos + 2 < len
        c += bytes([0x20, 0x0B, 0x41]) + encode_i32(0xE3) + bytes([0x46])
        c += bytes([0x20, 0x0A, 0x41, 0x02, 0x6A, 0x20, 0x01, 0x49, 0x71, 0x04, 0x40])
        c += bytes([0x20, 0x00, 0x20, 0x0A, 0x6A, 0x2D, 0x00, 0x01, 0x21, 0x0C]) # b1 = ptr[pos + 1]
        c += bytes([0x20, 0x00, 0x20, 0x0A, 0x6A, 0x2D, 0x00, 0x02, 0x21, 0x0D]) # b2 = ptr[pos + 2]
        c += bytes([0x20, 0x0C, 0x41]) + encode_i32(0x80) + bytes([0x46])
        c += bytes([0x20, 0x0D, 0x41]) + encode_i32(0x8A) + bytes([0x46])
        c += bytes([0x71, 0x04, 0x40])
        c += emit_token_write(3) # RubyOpen (3)
        c += bytes([0x05])       # else
        c += bytes([0x20, 0x0C, 0x41]) + encode_i32(0x80) + bytes([0x46])
        c += bytes([0x20, 0x0D, 0x41]) + encode_i32(0x8B) + bytes([0x46])
        c += bytes([0x71, 0x04, 0x40])
        c += emit_token_write(4) # RubyClose (4)
        c += bytes([0x0B, 0x0B, 0x05]) # end RubyClose, end RubyOpen, else

        # b0 == 0xEF and pos + 2 < len
        c += bytes([0x20, 0x0B, 0x41]) + encode_i32(0xEF) + bytes([0x46])
        c += bytes([0x20, 0x0A, 0x41, 0x02, 0x6A, 0x20, 0x01, 0x49, 0x71, 0x04, 0x40])
        c += bytes([0x20, 0x00, 0x20, 0x0A, 0x6A, 0x2D, 0x00, 0x01, 0x21, 0x0C]) # b1
        c += bytes([0x20, 0x00, 0x20, 0x0A, 0x6A, 0x2D, 0x00, 0x02, 0x21, 0x0D]) # b2
        c += bytes([0x20, 0x0C, 0x41]) + encode_i32(0xBD) + bytes([0x46])
        c += bytes([0x20, 0x0D, 0x41]) + encode_i32(0x9C) + bytes([0x46])
        c += bytes([0x71, 0x04, 0x40])
        c += emit_token_write(5) # InlinePipeWide (5)
        c += bytes([0x0B, 0x0B, 0x0B, 0x0B, 0x0B]) # close 5 ifs
        return bytes(c)

    # ----------------------------------------------------
    # SIMD Loop: 16-byte chunks
    # ----------------------------------------------------
    code2 += bytes([0x02, 0x40])                           # block (simd_break)
    code2 += bytes([0x03, 0x40])                           # loop (simd_loop)

    # offset + 16 > len -> break
    code2 += bytes([0x20, 0x05, 0x41, 0x10, 0x6A])         # offset + 16
    code2 += bytes([0x20, 0x01, 0x4F])                     # > len (i32.gt_u)
    code2 += bytes([0x0D, 0x01])                           # br_if 1

    # token_count >= max_tokens -> break
    code2 += bytes([0x20, 0x06, 0x20, 0x04, 0x4E])
    code2 += bytes([0x0D, 0x01])

    # chunk = v128.load(ptr + offset)
    code2 += bytes([0x20, 0x00, 0x20, 0x05, 0x6A])
    code2 += bytes([0xFD, 0x00, 0x00, 0x00])
    code2 += bytes([0x21, 0x07])

    # mask = i8x16.bitmask((chunk == 0x0A) | (chunk == 0x7C) | (chunk == 0xE3) | (chunk == 0xEF))
    code2 += bytes([0x20, 0x07, 0x41, 0x0A, 0xFD, 0x0F, 0xFD, 0x23]) # == 0x0A
    code2 += bytes([0x20, 0x07, 0x41]) + encode_i32(0x7C) + bytes([0xFD, 0x0F, 0xFD, 0x23]) # == 0x7C
    code2 += bytes([0xFD, 0x50]) # or
    code2 += bytes([0x20, 0x07, 0x41]) + encode_i32(0xE3) + bytes([0xFD, 0x0F, 0xFD, 0x23]) # == 0xE3
    code2 += bytes([0xFD, 0x50]) # or
    code2 += bytes([0x20, 0x07, 0x41]) + encode_i32(0xEF) + bytes([0xFD, 0x0F, 0xFD, 0x23]) # == 0xEF
    code2 += bytes([0xFD, 0x50]) # or
    code2 += bytes([0xFD, 0x64]) # i8x16.bitmask
    code2 += bytes([0x21, 0x08]) # local.set 8 (mask)

    # mask loop
    code2 += bytes([0x02, 0x40])                           # block (mask_break)
    code2 += bytes([0x03, 0x40])                           # loop (mask_loop)

    code2 += bytes([0x20, 0x08, 0x45, 0x0D, 0x01])         # mask == 0 -> break
    code2 += bytes([0x20, 0x06, 0x20, 0x04, 0x4E, 0x0D, 0x01]) # token_count >= max_tokens -> break

    # idx = i32.ctz(mask) (0x68)
    code2 += bytes([0x20, 0x08, 0x68, 0x21, 0x09])

    # pos = offset + idx
    code2 += bytes([0x20, 0x05, 0x20, 0x09, 0x6A, 0x21, 0x0A])

    # b0 = i32.load8_u(ptr + pos)
    code2 += bytes([0x20, 0x00, 0x20, 0x0A, 0x6A, 0x2D, 0x00, 0x00, 0x21, 0x0B])

    # check and emit
    code2 += emit_byte_check()

    # mask &= mask - 1
    code2 += bytes([0x20, 0x08, 0x20, 0x08, 0x41, 0x01, 0x6B, 0x71, 0x21, 0x08])

    code2 += bytes([0x0C, 0x00])                           # br 0
    code2 += bytes([0x0B, 0x0B])                           # end mask_loop, end mask_break

    # offset += 16
    code2 += bytes([0x20, 0x05, 0x41, 0x10, 0x6A, 0x21, 0x05])
    code2 += bytes([0x0C, 0x00])                           # br 0
    code2 += bytes([0x0B, 0x0B])                           # end simd_loop, end simd_break

    # ----------------------------------------------------
    # Tail Loop: remaining bytes (pos from offset to len - 1)
    # ----------------------------------------------------
    code2 += bytes([0x02, 0x40])                           # block (tail_break)
    code2 += bytes([0x03, 0x40])                           # loop (tail_loop)

    code2 += bytes([0x20, 0x05, 0x20, 0x01, 0x4E, 0x0D, 0x01]) # offset >= len -> break
    code2 += bytes([0x20, 0x06, 0x20, 0x04, 0x4E, 0x0D, 0x01]) # token_count >= max_tokens -> break

    code2 += bytes([0x20, 0x05, 0x21, 0x0A])               # pos = offset
    code2 += bytes([0x20, 0x00, 0x20, 0x0A, 0x6A, 0x2D, 0x00, 0x00, 0x21, 0x0B]) # b0 = ptr[pos]

    code2 += emit_byte_check()

    # offset += 1
    code2 += bytes([0x20, 0x05, 0x41, 0x01, 0x6A, 0x21, 0x05])
    code2 += bytes([0x0C, 0x00])                           # br 0
    code2 += bytes([0x0B, 0x0B])                           # end tail_loop, end tail_break

    # return token_count
    code2 += bytes([0x20, 0x06, 0x0B])
    codes.append(encode_u32(len(code2)) + code2)

    code_sec = encode_u32(len(codes)) + b''.join(codes)
    wasm += make_sec(10, code_sec)

    return bytes(wasm)

if __name__ == '__main__':
    wasm_bytes = build_tokenizer_wasm()
    out_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src", "core", "editor", "wasm"))
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "simd_tokenizer.wasm")
    with open(out_path, "wb") as f:
        f.write(wasm_bytes)
    print(f"SIMD Tokenizer WASM built: {out_path} ({len(wasm_bytes)} bytes)")
