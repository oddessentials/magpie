import struct

MAGIC = 0x30C4
TYPES = ['Byte', 'Bool', 'Int', 'Float', 'Object', 'Name', 'Delegate', 'Double', 'Array', 'Struct', 'Str', 'Text', 'Interface', 'MulticastDelegate', 'WeakObject', 'LazyObject', 'AssetObject', 'SoftObject', 'UInt64', 'UInt32', 'UInt16', 'Int64', 'Int16', 'Int8', 'Map', 'Set', 'Enum', 'FieldPath', 'Optional', 'Utf8Str', 'AnsiStr']


class Cursor:
    def __init__(self, data, p=0):
        self.data = data
        self.p = p

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

    def i64(self):
        value, = struct.unpack_from('<q', self.data, self.p)
        self.p += 8
        return value

    def raw(self, n):
        value = self.data[self.p:self.p + n]
        self.p += n
        return value


def locate_payload(data):
    if struct.unpack_from('<H', data, 0)[0] != MAGIC:
        raise ValueError('not a usmap file')
    version = data[2]
    total = len(data)
    for offset in range(3, 40):
        compressed, decompressed = struct.unpack_from('<II', data, offset)
        if compressed == decompressed and offset + 8 + compressed == total:
            if data[offset - 1] != 0:
                raise ValueError('compressed usmap files are not supported')
            return version, offset + 8
    raise ValueError('could not locate the usmap payload')


class Mappings:
    def __init__(self, data):
        version, start = locate_payload(data)
        self.version = version
        r = Cursor(data, start)
        self.names = []
        for _ in range(r.u32()):
            length = r.u16() if version >= 2 else r.u8()
            self.names.append(r.raw(length).decode('utf-8', 'replace'))
        self.enums = {}
        for _ in range(r.u32()):
            name = self.names[r.u32()]
            count = r.u16() if version >= 3 else r.u8()
            entries = []
            for _ in range(count):
                value = r.i64() if version >= 4 else len(entries)
                entries.append((self.names[r.u32()], value))
            self.enums[name] = entries
        self.structs = {}
        for _ in range(r.u32()):
            name = self.names[r.u32()]
            super_index = r.u32()
            parent = self.names[super_index] if super_index != 0xFFFFFFFF else None
            slots = r.u16()
            fields = []
            for _ in range(r.u16()):
                index = r.u16()
                dim = r.u8()
                field = self.names[r.u32()]
                fields.append((index, field, self.read_type(r), dim))
            self.structs[name] = (parent, slots, fields)
        self.schemas = {}
        self.enum_names = {}

    def read_type(self, r):
        kind = TYPES[r.u8()]
        if kind == 'Enum':
            inner = self.read_type(r)
            return ('Enum', inner, self.names[r.u32()])
        if kind == 'Struct':
            return ('Struct', self.names[r.u32()])
        if kind in ('Array', 'Set', 'Optional'):
            return (kind, self.read_type(r))
        if kind == 'Map':
            key = self.read_type(r)
            return ('Map', key, self.read_type(r))
        if kind == 'Byte':
            return ('Byte', None)
        return (kind,)

    def schema(self, name):
        if name in self.schemas:
            return self.schemas[name]
        slots = []
        current = name
        seen = set()
        while current is not None and current in self.structs and current not in seen:
            seen.add(current)
            parent, count, fields = self.structs[current]
            width = max([count] + [index + dim for index, _, _, dim in fields])
            local = [None] * width
            for index, field, kind, dim in fields:
                for k in range(dim):
                    local[index + k] = (field if dim == 1 else '%s[%d]' % (field, k), kind)
            slots.extend(local)
            current = parent
        self.schemas[name] = slots
        return slots

    def enum_value(self, enum, value):
        table = self.enum_names.get(enum)
        if table is None:
            table = {number: entry for entry, number in self.enums.get(enum, [])}
            self.enum_names[enum] = table
        entry = table.get(value)
        if entry is None:
            return '%s::%d' % (enum, value)
        return '%s::%s' % (enum, entry)


def load(path):
    with open(path, 'rb') as f:
        return Mappings(f.read())
