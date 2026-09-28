import struct

from zen import NAME_INDEX_MASK

HISTORY_NONE = -1
HISTORY_BASE = 0
HISTORY_NAMED_FORMAT = 1
HISTORY_ORDERED_FORMAT = 2
HISTORY_ARGUMENT_FORMAT = 3
HISTORY_TRANSFORM = 10
HISTORY_STRING_TABLE = 11
FLAG_ARRAY_INDEX = 1
FLAG_GUID = 2
FLAG_EXTENSIONS = 4
FLAG_BOOL_TRUE = 16
SCALARS = {'Int8': '<b', 'Int16': '<h', 'Int': '<i', 'Int64': '<q', 'UInt16': '<H', 'UInt32': '<I', 'UInt64': '<Q', 'Float': '<f', 'Double': '<d'}
NATIVE = {'Vector': '<3d', 'Vector3f': '<3f', 'Vector2D': '<2d', 'Vector2f': '<2f', 'Vector4': '<4d', 'Vector4f': '<4f', 'Rotator': '<3d', 'Rotator3f': '<3f', 'Quat': '<4d', 'Quat4f': '<4f', 'LinearColor': '<4f', 'Color': '<4B', 'IntPoint': '<2i', 'IntVector': '<3i', 'IntVector4': '<4i', 'DateTime': '<q', 'Timespan': '<q', 'FrameNumber': '<i', 'SimpleCurveKey': '<2f', 'RichCurveKey': '<3B6f', 'Plane': '<4d', 'Plane4f': '<4f', 'Matrix': '<16d', 'Matrix44f': '<16f'}
NATIVE_NAMES = {'RichCurveKey': ('InterpMode', 'TangentMode', 'TangentWeightMode', 'Time', 'Value', 'ArriveTangent', 'ArriveTangentWeight', 'LeaveTangent', 'LeaveTangentWeight'), 'SimpleCurveKey': ('Time', 'Value')}


class Unreadable:
    def __init__(self, kind, reason):
        self.kind = kind
        self.reason = reason

    def __repr__(self):
        return 'Unreadable(%s: %s)' % (self.kind, self.reason)


class Text:
    def __init__(self, source=None, namespace=None, key=None, table=None, invariant=None, kind='base'):
        self.source = source
        self.namespace = namespace
        self.key = key
        self.table = table
        self.invariant = invariant
        self.kind = kind

    def __repr__(self):
        if self.kind == 'table':
            return 'Text(table=%r, key=%r)' % (self.table, self.key)
        if self.kind == 'invariant':
            return 'Text(invariant=%r)' % self.invariant
        if self.kind == 'empty':
            return 'Text()'
        return 'Text(%r, ns=%r, key=%r)' % (self.source, self.namespace, self.key)


class Reader:
    def __init__(self, data, p=0):
        self.data = data
        self.p = p

    def scalar(self, fmt):
        value = struct.unpack_from(fmt, self.data, self.p)
        self.p += struct.calcsize(fmt)
        return value[0] if len(value) == 1 else value

    def u8(self):
        value = self.data[self.p]
        self.p += 1
        return value

    def i8(self):
        return self.scalar('<b')

    def u16(self):
        return self.scalar('<H')

    def i32(self):
        return self.scalar('<i')

    def u32(self):
        return self.scalar('<I')

    def u64(self):
        return self.scalar('<Q')

    def raw(self, n):
        value = self.data[self.p:self.p + n]
        self.p += n
        return value

    def fstring(self):
        n = self.i32()
        if n == 0:
            return ''
        if n < 0:
            text = self.raw(-n * 2).decode('utf-16-le', 'replace')
        else:
            text = self.raw(n).decode('utf-8', 'replace')
        return text.rstrip('\0')


def property_kind(type_name):
    if type_name.endswith('Property'):
        return type_name[:-8]
    return type_name


def normalize(tree):
    name, children = tree
    kind = property_kind(name)
    if kind == 'Struct':
        return ('Struct', children[0][0] if children else None)
    if kind == 'Enum':
        inner = normalize(children[1]) if len(children) > 1 else ('Byte', None)
        return ('Enum', inner, children[0][0] if children else None)
    if kind == 'Byte':
        return ('Byte', children[0][0] if children else None)
    if kind in ('Array', 'Set', 'Optional'):
        return (kind, normalize(children[0]))
    if kind == 'Map':
        return ('Map', normalize(children[0]), normalize(children[1]))
    return (kind,)


def zero_value(kind, mappings):
    head = kind[0]
    if head in SCALARS or head == 'Byte' and kind[1] is None:
        return 0
    if head == 'Bool':
        return False
    if head in ('Str', 'Utf8Str', 'AnsiStr'):
        return ''
    if head == 'Name':
        return 'None'
    if head == 'Enum':
        return mappings.enum_value(kind[2], 0) if mappings is not None else None
    if head == 'Byte':
        return mappings.enum_value(kind[1], 0) if mappings is not None else None
    if head in ('Array', 'Set'):
        return []
    if head == 'Map':
        return {}
    if head == 'Text':
        return Text(kind='empty')
    return None


class Decoder:
    def __init__(self, package, mappings=None):
        self.package = package
        self.mappings = mappings

    def name(self, r):
        index = r.u32()
        number = r.u32()
        name = self.package.names[index & NAME_INDEX_MASK]
        if number:
            return '%s_%d' % (name, number - 1)
        return name

    def type_tree(self, r):
        name = self.name(r)
        count = r.i32()
        return (name, [self.type_tree(r) for _ in range(count)])

    def read_object(self, data, class_name=None):
        r = Reader(data)
        if self.package.unversioned:
            if class_name is None:
                raise ValueError('unversioned packages need the export class')
            props = self.read_unversioned(r, class_name)
        else:
            r.u8()
            props = self.read_tagged(r, len(data))
        return props, r

    def read_tagged(self, r, end):
        props = {}
        while r.p < end:
            name = self.name(r)
            if name == 'None':
                break
            kind = normalize(self.type_tree(r))
            size = r.i32()
            flags = r.u8()
            if flags & FLAG_ARRAY_INDEX:
                name = '%s[%d]' % (name, r.i32())
            if flags & FLAG_GUID:
                r.raw(16)
            if flags & FLAG_EXTENSIONS:
                extension = r.u8()
                if extension & 1:
                    r.raw(2)
            start = r.p
            if kind[0] == 'Bool':
                value = bool(flags & FLAG_BOOL_TRUE)
            else:
                try:
                    value = self.value(r, kind, start + size)
                    if r.p != start + size:
                        value = Unreadable(kind, 'read %d of %d bytes' % (r.p - start, size))
                except (struct.error, IndexError, KeyError, ValueError, UnicodeDecodeError) as error:
                    value = Unreadable(kind, str(error))
            r.p = start + size
            props[name] = value
        return props

    def read_unversioned(self, r, struct_name):
        schema = self.mappings.schema(struct_name)
        if not schema and struct_name not in self.mappings.structs:
            raise KeyError('no mapping for %s' % struct_name)
        fragments = []
        zero_count = 0
        while True:
            packed = r.u16()
            fragment = (packed & 0x7F, bool(packed & 0x80), packed >> 9, bool(packed & 0x100))
            fragments.append(fragment)
            if fragment[1]:
                zero_count += fragment[2]
            if fragment[3]:
                break
        bits = 0
        if zero_count > 0:
            if zero_count <= 8:
                bits = r.u8()
            elif zero_count <= 16:
                bits = r.u16()
            else:
                for word in range((zero_count + 31) // 32):
                    bits |= r.u32() << (32 * word)
        props = {}
        slot = 0
        zero_index = 0
        for skip, has_zeroes, count, _ in fragments:
            slot += skip
            for _ in range(count):
                if slot >= len(schema) or schema[slot] is None:
                    raise KeyError('slot %d is outside the %s schema' % (slot, struct_name))
                field, kind = schema[slot]
                if has_zeroes and (bits >> zero_index) & 1:
                    props[field] = zero_value(kind, self.mappings)
                else:
                    props[field] = self.value(r, kind, None)
                if has_zeroes:
                    zero_index += 1
                slot += 1
        return props

    def value(self, r, kind, end):
        head = kind[0]
        tagged = not self.package.unversioned
        if head in SCALARS:
            return r.scalar(SCALARS[head])
        if head == 'Bool':
            return r.u8() != 0
        if head == 'Byte':
            if kind[1] is None:
                return r.u8()
            if tagged:
                return self.name(r)
            return self.mappings.enum_value(kind[1], r.u8())
        if head == 'Enum':
            if tagged:
                return self.name(r)
            return self.mappings.enum_value(kind[2], self.value(r, kind[1], None))
        if head == 'Name':
            return self.name(r)
        if head in ('Str', 'Utf8Str', 'AnsiStr'):
            return r.fstring()
        if head == 'Text':
            return self.text(r)
        if head in ('Object', 'Class', 'Interface', 'WeakObject'):
            return self.package.reference(r.i32())
        if head in ('SoftObject', 'SoftClass', 'AssetObject'):
            return self.soft(r)
        if head == 'LazyObject':
            return r.raw(16).hex()
        if head == 'Struct':
            return self.struct(r, kind[1], end)
        if head == 'Array':
            return [self.value(r, kind[1], end) for _ in range(r.i32())]
        if head == 'Set':
            for _ in range(r.i32()):
                self.value(r, kind[1], end)
            return [self.value(r, kind[1], end) for _ in range(r.i32())]
        if head == 'Map':
            for _ in range(r.i32()):
                self.value(r, kind[1], end)
            entries = []
            for _ in range(r.i32()):
                key = self.value(r, kind[1], end)
                entries.append((key, self.value(r, kind[2], end)))
            return entries
        if head == 'Optional':
            if r.i32() == 0:
                return None
            return self.value(r, kind[1], end)
        if head == 'Delegate':
            return (self.package.reference(r.i32()), self.name(r))
        if head == 'MulticastInlineDelegate':
            return [(self.package.reference(r.i32()), self.name(r)) for _ in range(r.i32())]
        if head == 'FieldPath':
            path = [self.name(r) for _ in range(r.i32())]
            r.i32()
            return path
        raise ValueError('unsupported property type %s' % (kind,))

    def soft(self, r):
        package = self.name(r)
        asset = self.name(r)
        sub = r.fstring()
        if package == 'None' and asset == 'None' and not sub:
            return None
        return dict(package=package, asset=asset, sub=sub) if sub else dict(package=package, asset=asset)

    def struct(self, r, name, end):
        if name == 'Guid':
            return r.raw(16).hex()
        if name in ('SoftObjectPath', 'SoftClassPath'):
            return self.soft(r)
        if name == 'GameplayTagContainer':
            return [self.name(r) for _ in range(r.i32())]
        if name in NATIVE:
            values = r.scalar(NATIVE[name])
            if name in NATIVE_NAMES:
                return dict(zip(NATIVE_NAMES[name], values))
            return list(values) if isinstance(values, tuple) else values
        if name in ('Box', 'Box2D'):
            width = 3 if name == 'Box' else 2
            low = list(r.scalar('<%dd' % width))
            high = list(r.scalar('<%dd' % width))
            r.u8()
            return dict(min=low, max=high)
        if self.package.unversioned:
            return self.read_unversioned(r, name)
        return self.read_tagged(r, end if end is not None else len(r.data))

    def text(self, r):
        r.u32()
        history = r.i8()
        if history == HISTORY_NONE:
            if r.i32():
                return Text(invariant=r.fstring(), kind='invariant')
            return Text(kind='empty')
        if history == HISTORY_BASE:
            namespace = r.fstring()
            key = r.fstring()
            return Text(source=r.fstring(), namespace=namespace, key=key)
        if history == HISTORY_STRING_TABLE:
            table = self.name(r)
            return Text(table=table, key=r.fstring(), kind='table')
        if history in (HISTORY_NAMED_FORMAT, HISTORY_ORDERED_FORMAT, HISTORY_ARGUMENT_FORMAT):
            pattern = self.text(r)
            arguments = []
            for _ in range(r.i32()):
                label = r.fstring() if history != HISTORY_ORDERED_FORMAT else len(arguments)
                arguments.append((label, self.format_argument(r)))
            return Text(source=pattern, kind='format')
        if history == HISTORY_TRANSFORM:
            inner = self.text(r)
            r.u8()
            return inner
        raise ValueError('text history %d' % history)

    def format_argument(self, r):
        kind = r.i8()
        if kind == 0:
            return r.scalar('<q')
        if kind == 1:
            return r.scalar('<Q')
        if kind == 2:
            return r.scalar('<f')
        if kind == 3:
            return r.scalar('<d')
        if kind == 4:
            return self.text(r)
        if kind == 5:
            return r.u8()
        raise ValueError('format argument %d' % kind)
