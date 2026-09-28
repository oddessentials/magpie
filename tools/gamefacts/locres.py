import struct

MAGIC = bytes.fromhex('0e147475674a03fc4a15909dc3377f1b')
VERSION_COMPACT = 1
VERSION_OPTIMIZED = 2
VERSION_UTF16 = 3


def read_fstring(buf, p):
    n, = struct.unpack_from('<i', buf, p)
    p += 4
    if n < 0:
        s = buf[p:p - n * 2].decode('utf-16-le')
        p += -n * 2
    else:
        s = buf[p:p + n].decode('utf-8', 'replace')
        p += n
    return s.rstrip('\0'), p


def read(data):
    if data[:16] != MAGIC:
        raise ValueError('not a LocRes file')
    version = data[16]
    p = 17
    strings = []
    if version >= VERSION_COMPACT:
        strings_offset, = struct.unpack_from('<q', data, p)
        p += 8
        if strings_offset >= 0:
            q = strings_offset
            count, = struct.unpack_from('<i', data, q)
            q += 4
            for _ in range(count):
                text, q = read_fstring(data, q)
                if version >= VERSION_UTF16:
                    q += 4
                strings.append(text)
    if version >= VERSION_OPTIMIZED:
        p += 4
    namespace_count, = struct.unpack_from('<I', data, p)
    p += 4
    table = {}
    for _ in range(namespace_count):
        if version >= VERSION_OPTIMIZED:
            p += 4
        namespace, p = read_fstring(data, p)
        key_count, = struct.unpack_from('<I', data, p)
        p += 4
        entries = {}
        for _ in range(key_count):
            if version >= VERSION_OPTIMIZED:
                p += 4
            key, p = read_fstring(data, p)
            p += 4
            if version >= VERSION_COMPACT:
                index, = struct.unpack_from('<i', data, p)
                p += 4
                entries[key] = strings[index] if 0 <= index < len(strings) else None
            else:
                entries[key], p = read_fstring(data, p)
        table[namespace] = entries
    return table
