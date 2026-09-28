import struct

NAME_INDEX_MASK = 0x3FFFFFFF
INDEX_EXPORT = 0
INDEX_SCRIPT = 1
INDEX_PACKAGE = 2
INDEX_NULL = 3
EXPORT_ENTRY = 72
SUMMARY = 60
FLAG_UNVERSIONED = 0x2000


def object_index(value):
    kind = value >> 62
    if kind == INDEX_NULL:
        return INDEX_NULL, None
    return kind, value & ((1 << 62) - 1)


def load_name_batch(data, p):
    count, = struct.unpack_from('<i', data, p)
    p += 4
    if count == 0:
        return [], p
    string_bytes, = struct.unpack_from('<I', data, p)
    p += 4 + 8 + count * 8
    headers = [(data[p + i * 2], data[p + i * 2 + 1]) for i in range(count)]
    p += count * 2
    names = []
    for b0, b1 in headers:
        length = ((b0 & 0x7F) << 8) | b1
        if b0 & 0x80:
            names.append(data[p:p + length * 2].decode('utf-16-le'))
            p += length * 2
        else:
            names.append(data[p:p + length].decode('utf-8', 'replace'))
            p += length
    return names, p


class ScriptObjects:
    def __init__(self, data):
        self.entries = {}
        if not data:
            return
        names, p = load_name_batch(data, 0)
        count, = struct.unpack_from('<i', data, p)
        p += 4
        for i in range(count):
            name_index, name_number, index, outer, cdo = struct.unpack_from('<IIQQQ', data, p + i * 32)
            name = names[name_index & NAME_INDEX_MASK]
            if name_number:
                name = '%s_%d' % (name, name_number - 1)
            self.entries[index] = (name, outer)

    def path(self, index):
        parts = []
        seen = set()
        while index in self.entries and index not in seen:
            seen.add(index)
            name, outer = self.entries[index]
            parts.append(name)
            index = outer
        if not parts:
            return None
        parts.reverse()
        if len(parts) == 1:
            return parts[0]
        return parts[0] + '.' + ':'.join(parts[1:])


class Package:
    def __init__(self, data, script=None):
        self.data = data
        self.script = script
        fields = struct.unpack_from('<IIIIIIiiiiiiiii', data, 0)
        has_versioning, self.header_size, name_index, name_number, self.flags, self.cooked_header_size = fields[:6]
        (self.hashes_offset, self.import_map_offset, self.export_map_offset, self.bundle_offset, self.dependency_headers_offset, self.dependency_entries_offset, self.imported_names_offset, self.cell_import_offset, self.cell_export_offset) = fields[6:15]
        p = SUMMARY
        self.versioning = None
        if has_versioning:
            zen, ue4, ue5, licensee = struct.unpack_from('<Iiii', data, p)
            p += 16
            custom, = struct.unpack_from('<i', data, p)
            p += 4 + custom * 20
            self.versioning = dict(zen=zen, ue4=ue4, ue5=ue5, licensee=licensee)
        self.names, p = load_name_batch(data, p)
        self.name = self.names[name_index & NAME_INDEX_MASK]
        self.unversioned = bool(self.flags & FLAG_UNVERSIONED)
        self.hashes = list(struct.unpack_from('<%dQ' % ((self.import_map_offset - self.hashes_offset) // 8), data, self.hashes_offset))
        self.imports = list(struct.unpack_from('<%dQ' % ((self.export_map_offset - self.import_map_offset) // 8), data, self.import_map_offset))
        self.exports = []
        export_map_end = self.cell_import_offset if self.export_map_offset <= self.cell_import_offset <= self.bundle_offset else self.bundle_offset
        for i in range((export_map_end - self.export_map_offset) // EXPORT_ENTRY):
            e = struct.unpack_from('<QQIIQQQQQIB', data, self.export_map_offset + i * EXPORT_ENTRY)
            self.exports.append(dict(offset=e[0], size=e[1], name=self.mapped_name(e[2], e[3]), outer=e[4], cls=e[5], super=e[6], template=e[7], hash=e[8], flags=e[9]))
        self.bundle = [struct.unpack_from('<II', data, self.bundle_offset + i * 8) for i in range((self.dependency_headers_offset - self.bundle_offset) // 8)]
        self.imported_packages = []
        if 0 < self.imported_names_offset < self.header_size:
            names, q = load_name_batch(data, self.imported_names_offset)
            numbers = struct.unpack_from('<%di' % len(names), data, q) if q + 4 * len(names) <= self.header_size else [0] * len(names)
            self.imported_packages = [name if number == 0 else '%s_%d' % (name, number - 1) for name, number in zip(names, numbers)]

    def mapped_name(self, index, number):
        name = self.names[index & NAME_INDEX_MASK]
        if number:
            return '%s_%d' % (name, number - 1)
        return name

    def export_data(self, index):
        export = self.exports[index]
        start = self.header_size + export['offset']
        return self.data[start:start + export['size']]

    def describe(self, value):
        kind, index = object_index(value)
        if kind == INDEX_NULL:
            return None
        if kind == INDEX_EXPORT:
            return self.name + '.' + self.exports[index]['name'] if index < len(self.exports) else 'export %d' % index
        if kind == INDEX_SCRIPT:
            if self.script is not None:
                return self.script.path(value)
            return 'script %x' % value
        package_index = (index >> 32) & NAME_INDEX_MASK
        hash_index = index & 0xFFFFFFFF
        package = self.imported_packages[package_index] if package_index < len(self.imported_packages) else 'package %d' % package_index
        return dict(package=package, hash=self.hashes[hash_index] if hash_index < len(self.hashes) else None)

    def reference(self, package_index):
        if package_index == 0:
            return None
        if package_index > 0:
            export = self.exports[package_index - 1]
            return dict(export=export['name'], cls=self.describe(export['cls']))
        return self.describe(self.imports[-package_index - 1])

    def export_class(self, index):
        return self.describe(self.exports[index]['cls'])
