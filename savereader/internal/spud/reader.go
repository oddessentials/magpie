package spud

import (
	"encoding/binary"
	"fmt"
	"math"
	"unicode/utf16"
)

type reader struct {
	data []byte
	pos  int
	err  error
}

func (r *reader) fail(format string, args ...any) {
	if r.err == nil {
		r.err = fmt.Errorf(format, args...)
	}
}

func (r *reader) take(n int) []byte {
	if r.err != nil {
		return nil
	}
	if n < 0 || n > len(r.data)-r.pos {
		r.fail("%d bytes needed at offset %d, %d left", n, r.pos, len(r.data)-r.pos)
		return nil
	}
	out := r.data[r.pos : r.pos+n]
	r.pos += n
	return out
}

func (r *reader) rest() []byte {
	if r.err != nil {
		return nil
	}
	out := r.data[r.pos:]
	r.pos = len(r.data)
	return out
}

func (r *reader) done() bool {
	return r.err == nil && r.pos == len(r.data)
}

func (r *reader) u8() uint8 {
	if b := r.take(1); b != nil {
		return b[0]
	}
	return 0
}

func (r *reader) u16() uint16 {
	if b := r.take(2); b != nil {
		return binary.LittleEndian.Uint16(b)
	}
	return 0
}

func (r *reader) u32() uint32 {
	if b := r.take(4); b != nil {
		return binary.LittleEndian.Uint32(b)
	}
	return 0
}

func (r *reader) u64() uint64 {
	if b := r.take(8); b != nil {
		return binary.LittleEndian.Uint64(b)
	}
	return 0
}

func (r *reader) i32() int32 {
	return int32(r.u32())
}

func (r *reader) i64() int64 {
	return int64(r.u64())
}

func (r *reader) f32() float32 {
	return math.Float32frombits(r.u32())
}

func (r *reader) f64() float64 {
	return math.Float64frombits(r.u64())
}

func (r *reader) count() int {
	n := r.i32()
	if r.err == nil && (n < 0 || int(n) > len(r.data)-r.pos) {
		r.fail("count %d at offset %d does not fit in %d bytes", n, r.pos-4, len(r.data)-r.pos)
		return 0
	}
	return int(n)
}

func (r *reader) str() string {
	start := r.pos
	n := r.i32()
	switch {
	case r.err != nil || n == 0:
		return ""
	case n > 0:
		b := r.take(int(n))
		if b == nil {
			return ""
		}
		if b[n-1] != 0 {
			r.fail("string at offset %d is not null terminated", start)
			return ""
		}
		return string(b[:n-1])
	case n == math.MinInt32:
		r.fail("string at offset %d has an impossible length", start)
		return ""
	}
	units := int(-n)
	b := r.take(units * 2)
	if b == nil {
		return ""
	}
	if b[units*2-2] != 0 || b[units*2-1] != 0 {
		r.fail("string at offset %d is not null terminated", start)
		return ""
	}
	decoded := make([]uint16, units-1)
	for i := range decoded {
		decoded[i] = binary.LittleEndian.Uint16(b[i*2:])
	}
	return string(utf16.Decode(decoded))
}

func (r *reader) strs() []string {
	n := r.count()
	out := make([]string, 0, min(n, 1024))
	for i := 0; i < n && r.err == nil; i++ {
		out = append(out, r.str())
	}
	return out
}

func (r *reader) u32s() []uint32 {
	n := r.count()
	b := r.take(n * 4)
	if b == nil {
		return nil
	}
	out := make([]uint32, n)
	for i := range out {
		out[i] = binary.LittleEndian.Uint32(b[i*4:])
	}
	return out
}

func (r *reader) bytes() []byte {
	n := r.count()
	return r.take(n)
}

func (r *reader) guid() string {
	b := r.take(16)
	if b == nil {
		return ""
	}
	return GUID(b)
}

func GUID(b []byte) string {
	return fmt.Sprintf("%08X%08X%08X%08X", binary.LittleEndian.Uint32(b[0:]), binary.LittleEndian.Uint32(b[4:]), binary.LittleEndian.Uint32(b[8:]), binary.LittleEndian.Uint32(b[12:]))
}
