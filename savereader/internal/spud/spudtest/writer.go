package spudtest

import (
	"bytes"
	"encoding/binary"
	"encoding/hex"
	"math"
	"strings"
	"unicode/utf16"
)

type Buffer struct {
	bytes.Buffer
}

func (b *Buffer) U8(v byte) *Buffer {
	b.WriteByte(v)
	return b
}

func (b *Buffer) U16(v uint16) *Buffer {
	binary.Write(&b.Buffer, binary.LittleEndian, v)
	return b
}

func (b *Buffer) U32(v uint32) *Buffer {
	binary.Write(&b.Buffer, binary.LittleEndian, v)
	return b
}

func (b *Buffer) I32(v int32) *Buffer {
	binary.Write(&b.Buffer, binary.LittleEndian, v)
	return b
}

func (b *Buffer) I64(v int64) *Buffer {
	binary.Write(&b.Buffer, binary.LittleEndian, v)
	return b
}

func (b *Buffer) F32(v float32) *Buffer {
	return b.U32(math.Float32bits(v))
}

func (b *Buffer) F64(v float64) *Buffer {
	binary.Write(&b.Buffer, binary.LittleEndian, math.Float64bits(v))
	return b
}

func (b *Buffer) Raw(data []byte) *Buffer {
	b.Write(data)
	return b
}

func (b *Buffer) GUID(text string) *Buffer {
	padded := text + strings.Repeat("0", 32-len(text))
	for i := range 4 {
		raw, err := hex.DecodeString(padded[i*8 : i*8+8])
		if err != nil {
			panic(err)
		}
		b.U32(binary.BigEndian.Uint32(raw))
	}
	return b
}

func (b *Buffer) String(s string) *Buffer {
	if s == "" {
		return b.I32(0)
	}
	ascii := true
	for _, r := range s {
		if r > 0x7e {
			ascii = false
		}
	}
	if ascii {
		b.I32(int32(len(s) + 1))
		b.WriteString(s)
		return b.U8(0)
	}
	units := utf16.Encode([]rune(s))
	b.I32(-int32(len(units) + 1))
	for _, unit := range units {
		b.U16(unit)
	}
	return b.U16(0)
}

func (b *Buffer) Strings(list []string) *Buffer {
	b.I32(int32(len(list)))
	for _, s := range list {
		b.String(s)
	}
	return b
}

func (b *Buffer) U32s(list []uint32) *Buffer {
	b.I32(int32(len(list)))
	for _, v := range list {
		b.U32(v)
	}
	return b
}

func (b *Buffer) Array(data []byte) *Buffer {
	b.I32(int32(len(data)))
	return b.Raw(data)
}

func (b *Buffer) Chunk(tag string, body []byte) *Buffer {
	b.WriteString(tag)
	b.U32(uint32(len(body)))
	return b.Raw(body)
}

func (b *Buffer) Bytes() []byte {
	return b.Buffer.Bytes()
}

func String(s string) []byte {
	return new(Buffer).String(s).Bytes()
}

func GUIDBytes(text string) []byte {
	return new(Buffer).GUID(text).Bytes()
}

func Chunk(tag string, body []byte) []byte {
	return new(Buffer).Chunk(tag, body).Bytes()
}

type Prop struct {
	Name   string
	Prefix string
	Type   uint16
}

type Class struct {
	Name  string
	Props []Prop
}

type Object struct {
	Class      string
	Name       string
	Values     [][]byte
	Components []uint32
	Core       []byte
	Custom     []byte
}

type Level struct {
	Name    string
	Classes []Class
	Objects []Object
}

type Field struct {
	Name string
	Data []byte
}

type Save struct {
	SystemVersion uint16
	Timestamp     string
	Fields        []Field
	CurrentLevel  string
	Global        Level
	Levels        []Level
}

const (
	ue4Version = 522
	ue5Version = 1017
)

func (s Save) Bytes() []byte {
	var info Buffer
	info.U16(s.SystemVersion).U32(ue4Version).U32(ue5Version).U32(0).U8(0xFF).U32(0).String(s.Timestamp)
	if len(s.Fields) > 0 {
		var names []string
		var offsets []uint32
		var data Buffer
		for _, f := range s.Fields {
			names = append(names, f.Name)
			offsets = append(offsets, uint32(data.Len()))
			data.Raw(f.Data)
		}
		info.Chunk("CINF", new(Buffer).Strings(names).U32s(offsets).Array(data.Bytes()).Bytes())
	}
	var global Buffer
	global.String(s.CurrentLevel).Raw(s.Global.body("GOBS"))
	global.Chunk("GLAI", Chunk("LVNI", new(Buffer).Strings(nil).Bytes()))
	var levels Buffer
	for _, l := range s.Levels {
		var level Buffer
		level.String(l.Name).U32(ue4Version).U32(ue5Version).Raw(l.body("LATS")).Chunk("SATS", nil).Chunk("DATS", nil)
		levels.Chunk("LEVL", level.Bytes())
	}
	var save Buffer
	save.Chunk("INFO", info.Bytes()).Chunk("GLOB", global.Bytes()).Chunk("LVLS", levels.Bytes())
	return Chunk("SAVE", save.Bytes())
}

func (l Level) body(objectList string) []byte {
	var classNames, propNames []string
	nameIndex := map[string]uint32{}
	index := func(name string) uint32 {
		if name == "" {
			return 0xFFFFFFFF
		}
		if id, ok := nameIndex[name]; ok {
			return id
		}
		nameIndex[name] = uint32(len(propNames))
		propNames = append(propNames, name)
		return nameIndex[name]
	}
	var classList Buffer
	classIndex := map[string]uint32{}
	for _, c := range l.Classes {
		classIndex[c.Name] = uint32(len(classNames))
		classNames = append(classNames, c.Name)
		var def Buffer
		def.String(c.Name).U16(uint16(len(c.Props)))
		for _, p := range c.Props {
			def.U32(index(p.Name)).U32(index(p.Prefix)).U16(p.Type)
		}
		classList.Chunk("CDVE", new(Buffer).U8(0).Chunk("CDEF", def.Bytes()).Bytes())
	}
	var meta Buffer
	meta.Chunk("VERS", new(Buffer).U32(5).Bytes())
	meta.Chunk("CNIX", new(Buffer).Strings(classNames).Bytes())
	meta.Chunk("CLST", classList.Bytes())
	meta.Chunk("PNIX", new(Buffer).Strings(propNames).Bytes())
	var objects Buffer
	for _, o := range l.Objects {
		var object Buffer
		object.U32(classIndex[o.Class]).String(o.Name).U32s(o.Components).U32(ue4Version).U32(ue5Version)
		if o.Core != nil {
			object.Chunk("CORA", new(Buffer).Array(o.Core).Bytes())
		}
		var offsets []uint32
		var data Buffer
		for _, v := range o.Values {
			offsets = append(offsets, uint32(data.Len()))
			data.Raw(v)
		}
		object.Chunk("PROP", new(Buffer).U32s(offsets).Array(data.Bytes()).Bytes())
		if o.Custom != nil {
			object.Chunk("CUST", new(Buffer).Array(o.Custom).Bytes())
		}
		objects.Chunk("NOBJ", object.Bytes())
	}
	return new(Buffer).Chunk("META", meta.Bytes()).Chunk(objectList, objects.Bytes()).Bytes()
}

func TypeName(name string, params ...[]byte) []byte {
	var b Buffer
	b.String(name).I32(int32(len(params)))
	for _, p := range params {
		b.Raw(p)
	}
	return b.Bytes()
}

func Tag(name string, typeName []byte, flags uint8, value []byte) []byte {
	var b Buffer
	b.String(name).Raw(typeName).U32(uint32(len(value))).U8(flags).Raw(value)
	return b.Bytes()
}

func Entry(tags ...[]byte) []byte {
	var b Buffer
	for _, t := range tags {
		b.Raw(t)
	}
	return b.String("None").Bytes()
}

func Record(entries ...[]byte) []byte {
	var b Buffer
	b.I32(int32(len(entries)))
	for _, e := range entries {
		b.Raw(e)
	}
	return b.Bytes()
}

func Str(name, value string) []byte {
	return Tag(name, TypeName("StrProperty"), 0, String(value))
}

func Float(name string, value float32) []byte {
	return Tag(name, TypeName("FloatProperty"), 0, new(Buffer).F32(value).Bytes())
}

func Bool(name string, value bool) []byte {
	var flags uint8
	if value {
		flags = 0x10
	}
	return Tag(name, TypeName("BoolProperty"), flags, nil)
}

func Struct(name, structName, pkg string, fields ...[]byte) []byte {
	return Tag(name, TypeName("StructProperty", TypeName(structName, TypeName(pkg))), 0, Entry(fields...))
}

func Native(name, structName, pkg string, data []byte) []byte {
	return Tag(name, TypeName("StructProperty", TypeName(structName, TypeName(pkg))), 0x08, data)
}

func CharacterGUID(name, guid string) []byte {
	return Struct(name, "DomCharacterGuid", "/Script/Dominion", Native("InnerGuid", "Guid", "/Script/CoreUObject", GUIDBytes(guid)))
}

func Transform(name string, x, y, z float64) []byte {
	rotation := new(Buffer).F64(0).F64(0).F64(0).F64(1).Bytes()
	translation := new(Buffer).F64(x).F64(y).F64(z).Bytes()
	scale := new(Buffer).F64(1).F64(1).F64(1).Bytes()
	return Struct(name, "Transform", "/Script/CoreUObject",
		Native("Rotation", "Quat", "/Script/CoreUObject", rotation),
		Native("Translation", "Vector", "/Script/CoreUObject", translation),
		Native("Scale3D", "Vector", "/Script/CoreUObject", scale))
}
