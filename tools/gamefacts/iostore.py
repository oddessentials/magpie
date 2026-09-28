import os
import struct

INVALID = 0xFFFFFFFF
CHUNK_EXPORT_BUNDLE = 1
CHUNK_SCRIPT_OBJECTS = 5
TOC_MAGIC = b'-==--==--==--==-'


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


class Container:
    def __init__(self, paks, name):
        self.name = name
        self.utoc = os.path.join(paks, name + '.utoc')
        self.ucas = os.path.join(paks, name + '.ucas')
        with open(self.utoc, 'rb') as f:
            toc = f.read()
        if toc[:16] != TOC_MAGIC:
            raise ValueError('%s is not an IoStore table of contents' % self.utoc)
        self.version = toc[16]
        (header_size, entry_count, block_count, block_entry_size, method_count, method_len, self.block_size, dir_index_size, partition_count) = struct.unpack_from('<9I', toc, 20)
        self.container_id, = struct.unpack_from('<Q', toc, 56)
        self.flags = toc[80]
        seeds_count, = struct.unpack_from('<I', toc, 84)
        self.partition_size, = struct.unpack_from('<Q', toc, 88)
        no_hash_count, = struct.unpack_from('<I', toc, 96)
        if self.flags & 2:
            raise ValueError('%s is encrypted' % self.utoc)
        pos = header_size
        self.chunk_ids = [toc[pos + i * 12:pos + (i + 1) * 12] for i in range(entry_count)]
        pos += entry_count * 12
        self.offlens = []
        for i in range(entry_count):
            b = toc[pos + i * 10:pos + (i + 1) * 10]
            self.offlens.append((int.from_bytes(b[0:5], 'big'), int.from_bytes(b[5:10], 'big')))
        pos += entry_count * 10
        if self.version >= 4:
            pos += seeds_count * 4
        if self.version >= 5:
            pos += no_hash_count * 4
        self.blocks = []
        for i in range(block_count):
            b = toc[pos + i * 12:pos + (i + 1) * 12]
            boff = int.from_bytes(b[0:8], 'little') & ((1 << 40) - 1)
            csize = (int.from_bytes(b[4:8], 'little') >> 8) & 0xFFFFFF
            usize = int.from_bytes(b[8:12], 'little') & 0xFFFFFF
            self.blocks.append((boff, csize, usize, b[11]))
        pos += block_count * 12
        self.methods = ['None'] + [toc[pos + i * method_len:pos + (i + 1) * method_len].split(b'\0')[0].decode() for i in range(method_count)]
        pos += method_count * method_len
        if self.flags & 4:
            hs, = struct.unpack_from('<i', toc, pos)
            pos += 4 + 2 * hs + block_count * 20
        self.paths = {}
        self.mount = ''
        if self.version >= 2 and (self.flags & 8) and dir_index_size:
            self.read_directory_index(toc[pos:pos + dir_index_size])
        self.by_path = {path: index for index, path in self.paths.items()}
        self.file = None

    def read_directory_index(self, buf):
        p = 0
        self.mount, p = read_fstring(buf, p)
        nd, = struct.unpack_from('<i', buf, p)
        p += 4
        dirs = [struct.unpack_from('<4I', buf, p + i * 16) for i in range(nd)]
        p += nd * 16
        nf, = struct.unpack_from('<i', buf, p)
        p += 4
        files = [struct.unpack_from('<3I', buf, p + i * 12) for i in range(nf)]
        p += nf * 12
        ns, = struct.unpack_from('<i', buf, p)
        p += 4
        strings = []
        for _ in range(ns):
            s, p = read_fstring(buf, p)
            strings.append(s)
        stack = [(0, '')]
        while stack:
            d, prefix = stack.pop()
            name, child, sibling, first_file = dirs[d]
            here = prefix if name == INVALID else prefix + strings[name] + '/'
            fidx = first_file
            while fidx != INVALID:
                fname, nxt, user = files[fidx]
                self.paths[user] = here + strings[fname]
                fidx = nxt
            c = child
            while c != INVALID:
                stack.append((c, here))
                c = dirs[c][2]

    def chunk_type(self, index):
        return self.chunk_ids[index][11]

    def chunks_of_type(self, chunk_type):
        return [index for index, cid in enumerate(self.chunk_ids) if cid[11] == chunk_type]

    def read_chunk(self, index):
        off, ln = self.offlens[index]
        first, last = off // self.block_size, (off + ln - 1) // self.block_size
        data = bytearray()
        if self.file is None:
            self.file = open(self.ucas, 'rb')
        for b in range(first, last + 1):
            boff, csize, usize, method = self.blocks[b]
            if method != 0:
                raise ValueError('block %d of %s uses compression %s' % (b, self.name, self.methods[method] if method < len(self.methods) else method))
            self.file.seek(boff)
            data += self.file.read(csize)
        start = off % self.block_size
        return bytes(data[start:start + ln])

    def read(self, path):
        return self.read_chunk(self.by_path[path])

    def close(self):
        if self.file is not None:
            self.file.close()
            self.file = None


class Store:
    def __init__(self, paks, name):
        self.paks = paks
        self.container = Container(paks, name)
        self.paths = self.container.paths
        self.by_path = self.container.by_path
        self.script = None

    def read(self, path):
        return self.container.read(path)

    def has(self, path):
        return path in self.by_path

    def matching(self, predicate):
        return sorted(path for path in self.paths.values() if predicate(path))

    def script_objects(self):
        if self.script is None:
            container = Container(self.paks, 'global')
            chunks = container.chunks_of_type(CHUNK_SCRIPT_OBJECTS)
            self.script = container.read_chunk(chunks[0]) if chunks else b''
            container.close()
        return self.script

    def close(self):
        self.container.close()
