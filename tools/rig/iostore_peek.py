import collections
import os
import struct
import sys

PAKS = os.environ.get('DRAGONWILDS_PAKS', r'D:\SteamLibrary\steamapps\common\RSDragonwilds\RSDragonwilds\Content\Paks')
INVALID = 0xFFFFFFFF
CHUNK_TYPES = {0: 'Invalid', 1: 'ExportBundleData', 2: 'BulkData', 3: 'OptionalBulkData', 4: 'MemoryMappedBulkData', 5: 'ScriptObjects', 6: 'ContainerHeader', 7: 'ExternalFile', 8: 'ShaderCodeLibrary', 9: 'ShaderCode', 10: 'PackageStoreEntry', 11: 'DerivedData', 12: 'EditorDerivedData', 13: 'PackageResource'}


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
    def __init__(self, name):
        self.name = name
        self.utoc = os.path.join(PAKS, name + '.utoc')
        self.ucas = os.path.join(PAKS, name + '.ucas')
        with open(self.utoc, 'rb') as f:
            toc = f.read()
        if toc[:16] != b'-==--==--==--==-':
            raise SystemExit('bad utoc magic')
        self.version = toc[16]
        (header_size, entry_count, block_count, block_entry_size, method_count, method_len, self.block_size, dir_index_size, partition_count) = struct.unpack_from('<9I', toc, 20)
        self.container_id, = struct.unpack_from('<Q', toc, 56)
        self.key_guid = toc[64:80]
        self.flags = toc[80]
        seeds_count, = struct.unpack_from('<I', toc, 84)
        self.partition_size, = struct.unpack_from('<Q', toc, 88)
        no_hash_count, = struct.unpack_from('<I', toc, 96)
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
        self.summary = dict(version=self.version, chunks=entry_count, blocks=block_count, block_size=self.block_size, methods=self.methods, flags=self.flags, encrypted=bool(self.flags & 2), compressed=bool(self.flags & 1), signed=bool(self.flags & 4), indexed=bool(self.flags & 8), key_guid_zero=self.key_guid == b'\0' * 16, partitions=partition_count, files_in_index=len(self.paths))

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

    def read_chunk(self, idx):
        off, ln = self.offlens[idx]
        first, last = off // self.block_size, (off + ln - 1) // self.block_size
        data = bytearray()
        with open(self.ucas, 'rb') as f:
            for b in range(first, last + 1):
                boff, csize, usize, method = self.blocks[b]
                if method != 0:
                    raise RuntimeError('block %d uses compression method %s' % (b, self.methods[method] if method < len(self.methods) else method))
                f.seek(boff)
                data += f.read(csize)
        start = off % self.block_size
        return bytes(data[start:start + ln])


def zen_summary(data):
    fields = struct.unpack_from('<IIIIIIiiiiiii', data, 0)
    has_ver, header_size, name_idx, name_num, pkg_flags, cooked_header_size = fields[:6]
    p = 60
    versioning = None
    if has_ver:
        zen_ver, ue4, ue5, licensee = struct.unpack_from('<Iiii', data, p)
        p += 16
        ncv, = struct.unpack_from('<i', data, p)
        p += 4 + ncv * 20
        versioning = dict(zen=zen_ver, ue4=ue4, ue5=ue5, licensee=licensee, custom_versions=ncv)
    name_count, num_string_bytes = struct.unpack_from('<ii', data, p)
    p += 8
    names = []
    if name_count:
        p += 8 + name_count * 8
        headers = [(data[p + i * 2], data[p + i * 2 + 1]) for i in range(name_count)]
        p += name_count * 2
        for b0, b1 in headers:
            ln = ((b0 & 0x7F) << 8) | b1
            if b0 & 0x80:
                names.append(data[p:p + ln * 2].decode('utf-16-le'))
                p += ln * 2
            else:
                names.append(data[p:p + ln].decode('utf-8', 'replace'))
                p += ln
    exports = []
    exp_off, bundle_off = fields[8], fields[9]
    n_exports = max(0, (bundle_off - exp_off) // 72)
    for i in range(n_exports):
        e = struct.unpack_from('<QQIIQQQQQIB', data, exp_off + i * 72)
        exports.append(dict(name=names[e[2] & 0x3FFFFFFF] if e[2] & 0x3FFFFFFF < len(names) else e[2], serial_size=e[1]))
    return dict(has_versioning_info=bool(has_ver), versioning=versioning, header_size=header_size, package_name=names[name_idx & 0x3FFFFFFF] if names else None, package_flags=hex(pkg_flags), unversioned_properties=bool(pkg_flags & 0x2000), filter_editor_only=bool(pkg_flags & 0x80000000), cooked_header_size=cooked_header_size, name_count=name_count, first_names=names[:10], exports=exports[:8])


def main():
    out = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] != '-' else None
    for name in sys.argv[2:] or ['global', 'RSDragonwilds-Windows']:
        c = Container(name)
        print('== %s ==' % name)
        print(c.summary)
        types = collections.Counter(CHUNK_TYPES.get(cid[11], cid[11]) for cid in c.chunk_ids)
        print('chunk types:', dict(types))
        if not c.paths:
            continue
        print('mount point:', repr(c.mount))
        exts = collections.Counter(os.path.splitext(p)[1] for p in c.paths.values())
        print('extensions:', exts.most_common(12))
        tops = collections.Counter('/'.join(p.split('/')[:3]) for p in c.paths.values())
        print('top folders:', tops.most_common(25))
        dts = sorted(p for p in c.paths.values() if os.path.basename(p).startswith('DT_') and p.endswith('.uasset'))
        print('DT_ assets:', len(dts))
        umaps = [p for p in c.paths.values() if p.endswith('.umap')]
        print('umaps:', len(umaps), umaps[:15])
        if out:
            with open(out, 'w', encoding='utf-8') as f:
                for idx, p in sorted(c.paths.items(), key=lambda kv: kv[1]):
                    f.write('%s\t%d\t%d\n' % (p, idx, c.offlens[idx][1]))
            print('wrote', out)
        by_path = {p: i for i, p in c.paths.items()}
        picks = [p for p in dts if 'DataTable' in p or 'Data' in p][:2] + dts[:1]
        for p in picks:
            idx = by_path[p]
            data = c.read_chunk(idx)
            print('\n--- %s (chunk %d, %d bytes) ---' % (p, idx, len(data)))
            try:
                print(zen_summary(data))
            except Exception as e:
                print('summary failed:', e, data[:64].hex())


main()
