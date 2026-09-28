import struct
import sys

TAGS = {b'SAVE', b'INFO', b'SHOT', b'CINF', b'META', b'CLST', b'CDVE', b'CDEF', b'CNIX', b'PNIX', b'VERS', b'NOBJ', b'SPWN', b'KILL', b'LEVL', b'LVLS', b'GLOB', b'GOBS', b'LATS', b'SATS', b'DATS', b'PDEF', b'PROP', b'CUST', b'CORA', b'GLAI', b'LVNI'}


def chunk_at(buf, p, end):
    if p + 8 > end or buf[p:p + 4] not in TAGS:
        return None
    ln, = struct.unpack_from('<I', buf, p + 4)
    if p + 8 + ln > end:
        return None
    return buf[p:p + 4].decode('ascii'), p + 8, p + 8 + ln


def fstring(buf, p):
    n, = struct.unpack_from('<i', buf, p)
    p += 4
    if n < 0:
        return buf[p:p - n * 2 - 2].decode('utf-16-le'), p - n * 2
    return buf[p:p + n - 1].decode('utf-8', 'replace') if n else '', p + n


def string_array(buf, p):
    count, = struct.unpack_from('<i', buf, p)
    p += 4
    items = []
    for _ in range(count):
        s, p = fstring(buf, p)
        items.append(s)
    return items, p


def u32_array(buf, p):
    count, = struct.unpack_from('<i', buf, p)
    p += 4
    return list(struct.unpack_from('<%dI' % count, buf, p)), p + 4 * count


def bytes_array(buf, p):
    count, = struct.unpack_from('<i', buf, p)
    p += 4
    return buf[p:p + count], p + count


def value_text(raw):
    if len(raw) >= 5:
        n, = struct.unpack_from('<i', raw, 0)
        if 0 < n <= len(raw) - 4 and raw[3 + n] == 0:
            try:
                return repr(raw[4:3 + n].decode('utf-8'))
            except UnicodeDecodeError:
                pass
    if len(raw) == 4:
        return 'u32 %d' % struct.unpack_from('<I', raw, 0)[0]
    if len(raw) == 1:
        return 'u8 %d' % raw[0]
    if len(raw) == 16:
        return 'guid ' + raw.hex()
    return 'bytes[%d] %s' % (len(raw), raw[:24].hex(' '))


def custom_info(buf, start, end, out, indent):
    names, p = string_array(buf, start)
    offsets, p = u32_array(buf, p)
    data, p = bytes_array(buf, p)
    for i, name in enumerate(names):
        stop = offsets[i + 1] if i + 1 < len(offsets) else len(data)
        text = value_text(data[offsets[i]:stop])
        if name in ('SessionPasswd', 'WorldOwnerId'):
            text = '<%d bytes, not shown>' % (stop - offsets[i])
        out.append('%s  %s = %s' % (indent, name, text))


def walk(buf, start, end, depth, out, counts):
    p = start
    while True:
        chunk = chunk_at(buf, p, end)
        if not chunk:
            return
        tag, body, stop = chunk
        counts[tag] = counts.get(tag, 0) + 1
        indent = '  ' * depth
        if tag in ('LEVL', 'GLOB'):
            name, q = fstring(buf, body)
            out.append('%s%s %r len=%d' % (indent, tag, name, stop - body))
            nested = next((r for r in range(q, min(stop, q + 32)) if chunk_at(buf, r, stop)), None)
            if nested:
                walk(buf, nested, stop, depth + 1, out, counts)
        elif tag == 'INFO':
            out.append('%sINFO len=%d system_version=%d' % (indent, stop - body, struct.unpack_from('<H', buf, body)[0]))
            nested = next((r for r in range(body, stop) if chunk_at(buf, r, stop)), None)
            if nested:
                walk(buf, nested, stop, depth + 1, out, counts)
        elif tag == 'CINF':
            out.append('%sCINF len=%d' % (indent, stop - body))
            custom_info(buf, body, stop, out, indent)
        elif tag in ('CNIX', 'PNIX'):
            items, _ = string_array(buf, body)
            out.append('%s%s %d entries: %s' % (indent, tag, len(items), ', '.join(items[:40])[:600]))
        elif tag == 'VERS':
            out.append('%sVERS %d' % (indent, struct.unpack_from('<I', buf, body)[0]))
        elif tag in ('NOBJ', 'SPWN'):
            if depth <= 3 or counts[tag] <= 5:
                out.append('%s%s len=%d class_id=%d' % (indent, tag, stop - body, struct.unpack_from('<I', buf, body)[0]))
        elif tag in ('META', 'CLST', 'GOBS', 'LATS', 'SATS', 'DATS', 'LVLS', 'SAVE', 'GLAI', 'CDVE'):
            out.append('%s%s len=%d' % (indent, tag, stop - body))
            nested = next((r for r in range(body, min(stop, body + 8)) if chunk_at(buf, r, stop)), None)
            if nested:
                walk(buf, nested, stop, depth + 1, out, counts)
        elif tag == 'CDEF':
            name, _ = fstring(buf, body)
            if counts[tag] <= 40:
                out.append('%sCDEF %s' % (indent, name))
        p = stop


def main():
    for path in sys.argv[1:]:
        buf = open(path, 'rb').read()
        out, counts = [], {}
        walk(buf, 0, len(buf), 0, out, counts)
        print('== %s (%d bytes) ==' % (path, len(buf)))
        for line in out[:120]:
            print(line)
        print('chunk counts:', dict(sorted(counts.items())))


main()
