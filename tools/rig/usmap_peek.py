import struct
import sys

TYPES = ['Byte', 'Bool', 'Int', 'Float', 'Object', 'Name', 'Delegate', 'Double', 'Array', 'Struct', 'Str', 'Text', 'Interface', 'MulticastDelegate', 'WeakObject', 'LazyObject', 'AssetObject', 'SoftObject', 'UInt64', 'UInt32', 'UInt16', 'Int64', 'Int16', 'Int8', 'Map', 'Set', 'Enum', 'FieldPath', 'Optional', 'Utf8Str', 'AnsiStr']


class Reader:
    def __init__(self, data):
        self.data = data
        self.p = 0

    def u8(self):
        value = self.data[self.p]
        self.p += 1
        return value

    def u16(self):
        value, = struct.unpack_from('<H', self.data, self.p)
        self.p += 2
        return value

    def u32(self):
        value, = struct.unpack_from('<I', self.data, self.p)
        self.p += 4
        return value

    def i32(self):
        value, = struct.unpack_from('<i', self.data, self.p)
        self.p += 4
        return value

    def i64(self):
        value, = struct.unpack_from('<q', self.data, self.p)
        self.p += 8
        return value

    def bytes(self, n):
        value = self.data[self.p:self.p + n]
        self.p += n
        return value


def read_header(r):
    magic = r.u16()
    if magic != 0x30C4:
        raise SystemExit('not a usmap file')
    version = r.u8()
    total = len(r.data)
    for offset in range(3, 40):
        compressed, decompressed = struct.unpack_from('<II', r.data, offset)
        if compressed == decompressed and offset + 8 + compressed == total:
            compression = r.data[offset - 1]
            if compression != 0:
                raise SystemExit('compressed usmap (method %d); this reader handles uncompressed files' % compression)
            r.p = offset + 8
            return version, compressed, decompressed
    raise SystemExit('could not locate the payload; the file may be compressed')


def read_names(r, version):
    names = []
    for _ in range(r.u32()):
        length = r.u16() if version >= 2 else r.u8()
        names.append(r.bytes(length).decode('utf-8', 'replace'))
    return names


def read_type(r, names):
    kind = TYPES[r.u8()]
    if kind == 'Enum':
        inner = read_type(r, names)
        return 'Enum<%s of %s>' % (names[r.u32()], inner)
    if kind == 'Struct':
        return 'Struct<%s>' % names[r.u32()]
    if kind in ('Array', 'Set', 'Optional'):
        return '%s<%s>' % (kind, read_type(r, names))
    if kind == 'Map':
        key = read_type(r, names)
        return 'Map<%s, %s>' % (key, read_type(r, names))
    return kind


def main():
    path, wanted = sys.argv[1], sys.argv[2:]
    r = Reader(open(path, 'rb').read())
    version, compressed, decompressed = read_header(r)
    payload = Reader(r.bytes(compressed))
    names = read_names(payload, version)
    enums = {}
    for _ in range(payload.u32()):
        name = names[payload.u32()]
        count = payload.u16() if version >= 3 else payload.u8()
        entries = []
        for _ in range(count):
            value = payload.i64() if version >= 4 else None
            entries.append((names[payload.u32()], value))
        enums[name] = entries
    structs = {}
    order = []
    for _ in range(payload.u32()):
        name = names[payload.u32()]
        super_index = payload.u32()
        parent = names[super_index] if super_index != 0xFFFFFFFF else None
        payload.u16()
        fields = []
        for _ in range(payload.u16()):
            index = payload.u16()
            dim = payload.u8()
            field = names[payload.u32()]
            fields.append((index, field, read_type(payload, names), dim))
        structs[name] = (parent, fields)
        order.append(name)
    print('usmap version %d, %d names, %d enums, %d structs and classes' % (version, len(names), len(enums), len(structs)))
    for name in wanted:
        if name in enums:
            print('\nenum %s: %s' % (name, ', '.join(enums[name])))
            continue
        if name not in structs:
            matches = [n for n in order if name.lower() in n.lower()][:20]
            print('\n%s not found; similar: %s' % (name, ', '.join(matches)))
            continue
        parent, fields = structs[name]
        print('\n%s%s' % (name, ' : ' + parent if parent else ''))
        for index, field, kind, dim in fields:
            print('  [%d] %s: %s%s' % (index, field, kind, '[%d]' % dim if dim > 1 else ''))


main()
