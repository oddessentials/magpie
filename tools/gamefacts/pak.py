import os
import struct

MAGIC = 0x5A6F12E1
SUPPORTED_VERSION = 11
ENTRY_HEADER = 53


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


class Pak:
    def __init__(self, path):
        self.path = path
        self.file = open(path, 'rb')
        self.size = os.path.getsize(path)
        self.read_footer()
        self.read_index()

    def close(self):
        self.file.close()

    def read_at(self, offset, length):
        self.file.seek(offset)
        data = self.file.read(length)
        if len(data) != length:
            raise ValueError('unexpected end of pak at byte %d' % (offset + len(data)))
        return data

    def read_footer(self):
        tail_length = min(1024, self.size)
        tail = self.read_at(self.size - tail_length, tail_length)
        at = -1
        for i in range(len(tail) - 4, 16, -1):
            if struct.unpack_from('<I', tail, i)[0] == MAGIC:
                at = i
                break
        if at == -1:
            raise ValueError('pak footer magic not found')
        self.version, = struct.unpack_from('<I', tail, at + 4)
        if self.version != SUPPORTED_VERSION:
            raise ValueError('pak version %d is not supported' % self.version)
        self.index_offset, self.index_size = struct.unpack_from('<QQ', tail, at + 8)
        p = at + 8 + 16 + 20
        self.methods = ['None']
        for _ in range(5):
            raw = tail[p:p + 32].split(b'\0')[0]
            self.methods.append(raw.decode('latin1'))
            p += 32
        if tail[at - 1] != 0 or any(tail[at - 17:at - 1]):
            raise ValueError('encrypted paks are not supported')

    def read_index(self):
        index = self.read_at(self.index_offset, self.index_size)
        self.mount, p = read_fstring(index, 0)
        entry_count, = struct.unpack_from('<i', index, p)
        p += 4 + 8
        has_hash_index, = struct.unpack_from('<i', index, p)
        p += 4
        if has_hash_index:
            p += 8 + 8 + 20
        has_directory_index, = struct.unpack_from('<i', index, p)
        p += 4
        if not has_directory_index:
            raise ValueError('pak has no full directory index')
        directory_offset, directory_size = struct.unpack_from('<qq', index, p)
        p += 16 + 20
        encoded_size, = struct.unpack_from('<i', index, p)
        p += 4
        self.encoded = index[p:p + encoded_size]
        p += encoded_size
        outside, = struct.unpack_from('<i', index, p)
        if outside != 0:
            raise ValueError('pak entries outside the encoded index are not supported')
        directory = self.read_at(directory_offset, directory_size)
        p = 0
        directory_count, = struct.unpack_from('<i', directory, p)
        p += 4
        mount = self.mount
        while mount.startswith('../'):
            mount = mount[3:]
        self.entries = {}
        for _ in range(directory_count):
            directory_name, p = read_fstring(directory, p)
            file_count, = struct.unpack_from('<i', directory, p)
            p += 4
            for _ in range(file_count):
                file_name, p = read_fstring(directory, p)
                encoded_offset, = struct.unpack_from('<i', directory, p)
                p += 4
                if encoded_offset < 0:
                    raise ValueError('unencoded pak entries are not supported')
                path = (mount + directory_name + file_name).lstrip('/')
                self.entries[path] = encoded_offset
        if len(self.entries) != entry_count:
            raise ValueError('pak index lists %d files, footer says %d' % (len(self.entries), entry_count))
        self.folded = {path.lower(): path for path in self.entries}

    def resolve(self, path):
        if path in self.entries:
            return path
        return self.folded.get(path.lower())

    def paths(self):
        return sorted(self.entries)

    def entry(self, path):
        resolved = self.resolve(path)
        if resolved is None:
            raise KeyError('pak has no file %s' % path)
        return decode_entry(self.encoded, self.entries[resolved], self.methods)

    def read(self, path):
        entry = self.entry(path)
        if entry['encrypted']:
            raise ValueError('%s is encrypted' % path)
        if entry['method'] != 'None':
            raise ValueError('%s uses compression %s' % (path, entry['method']))
        return self.read_at(entry['offset'] + ENTRY_HEADER, entry['size'])


def decode_entry(encoded, offset, methods):
    p = offset
    value, = struct.unpack_from('<I', encoded, p)
    p += 4
    if (value & 0x3F) == 0x3F:
        block_size, = struct.unpack_from('<I', encoded, p)
        p += 4
    else:
        block_size = (value & 0x3F) << 11
    method_index = (value >> 23) & 0x3F
    if value >> 31:
        entry_offset, = struct.unpack_from('<I', encoded, p)
        p += 4
    else:
        entry_offset, = struct.unpack_from('<Q', encoded, p)
        p += 8
    if (value >> 30) & 1:
        uncompressed, = struct.unpack_from('<I', encoded, p)
        p += 4
    else:
        uncompressed, = struct.unpack_from('<Q', encoded, p)
        p += 8
    size = uncompressed
    if method_index != 0:
        if (value >> 29) & 1:
            size, = struct.unpack_from('<I', encoded, p)
            p += 4
        else:
            size, = struct.unpack_from('<Q', encoded, p)
            p += 8
    encrypted = (value >> 22) & 1 == 1
    block_count = (value >> 6) & 0xFFFF
    return dict(offset=entry_offset, size=size, uncompressed=uncompressed, method=methods[method_index], encrypted=encrypted, blocks=block_count, block_size=block_size)
