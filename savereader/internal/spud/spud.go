package spud

import (
	"encoding/binary"
	"errors"
	"fmt"
)

const (
	TypeUInt8        = 0
	TypeUInt16       = 1
	TypeUInt32       = 2
	TypeUInt64       = 3
	TypeInt8         = 4
	TypeInt16        = 5
	TypeInt32        = 6
	TypeInt64        = 7
	TypeFloat        = 8
	TypeDouble       = 9
	TypeVector       = 20
	TypeRotator      = 21
	TypeTransform    = 22
	TypeGUID         = 23
	TypeCustomStruct = 29
	TypeString       = 30
	TypeName         = 31
	TypeText         = 32
	TypeRecord       = 64
	TypeArray        = 0x1000
)

const noIndex = 0xFFFFFFFF

var ErrIncomplete = errors.New("incomplete save")

type Save struct {
	SystemVersion uint16
	UE4Version    uint32
	UE5Version    uint32
	Title         string
	Timestamp     string
	Info          CustomInfo
	CurrentLevel  string
	Global        Level
	Levels        []Level
}

type CustomInfo struct {
	Names   []string
	Offsets []uint32
	Data    []byte
}

type Level struct {
	Name    string
	Meta    Meta
	Objects []Object
}

type Meta struct {
	Version uint32
	Classes []string
	Names   []string
	Defs    map[string][]PropDef
}

type PropDef struct {
	Name   string
	Prefix string
	Type   uint16
}

type Object struct {
	Class   string
	Name    string
	Custom  []byte
	defs    []PropDef
	offsets []uint32
	data    []byte
}

type Value struct {
	Type uint16
	Data []byte
}

type chunk struct {
	tag  string
	body []byte
}

func readChunk(data []byte) (chunk, []byte, error) {
	if len(data) < 8 {
		return chunk{}, nil, fmt.Errorf("%d bytes where a chunk header needs 8", len(data))
	}
	tag := string(data[:4])
	for _, c := range tag {
		if c < 'A' || c > 'Z' {
			return chunk{}, nil, fmt.Errorf("%q is not a chunk tag", tag)
		}
	}
	length := int(binary.LittleEndian.Uint32(data[4:8]))
	if length > len(data)-8 {
		return chunk{}, nil, fmt.Errorf("chunk %s needs %d bytes, %d left", tag, length, len(data)-8)
	}
	return chunk{tag, data[8 : 8+length]}, data[8+length:], nil
}

func chunks(data []byte) ([]chunk, error) {
	var out []chunk
	for len(data) > 0 {
		c, rest, err := readChunk(data)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
		data = rest
	}
	return out, nil
}

func Parse(data []byte) (*Save, error) {
	if len(data) < 8 || string(data[:4]) != "SAVE" {
		return nil, errors.New("not a SPUD save")
	}
	length := int(binary.LittleEndian.Uint32(data[4:8]))
	if length > len(data)-8 {
		return nil, fmt.Errorf("%w: the file holds %d of %d bytes, it may still be being written", ErrIncomplete, len(data)-8, length)
	}
	if length < len(data)-8 {
		return nil, fmt.Errorf("%d bytes follow the save", len(data)-8-length)
	}
	top, err := chunks(data[8:])
	if err != nil {
		return nil, err
	}
	if len(top) == 0 || top[0].tag != "INFO" {
		return nil, errors.New("the save does not start with an INFO chunk")
	}
	save := &Save{}
	for _, c := range top {
		switch c.tag {
		case "INFO":
			err = save.parseInfo(c.body)
		case "GLOB":
			err = save.parseGlobal(c.body)
		case "LVLS":
			err = save.parseLevels(c.body)
		}
		if err != nil {
			return nil, fmt.Errorf("%s: %w", c.tag, err)
		}
	}
	return save, nil
}

func (s *Save) parseInfo(body []byte) error {
	r := &reader{data: body}
	s.SystemVersion = r.u16()
	s.UE4Version = r.u32()
	s.UE5Version = r.u32()
	r.u32()
	if history := int8(r.u8()); r.err == nil && history != -1 {
		return fmt.Errorf("title history type %d is not supported", history)
	}
	if r.u32() != 0 {
		s.Title = r.str()
	}
	s.Timestamp = r.str()
	if r.err != nil {
		return r.err
	}
	cs, err := chunks(r.rest())
	if err != nil {
		return err
	}
	for _, c := range cs {
		if c.tag != "CINF" {
			continue
		}
		r := &reader{data: c.body}
		s.Info = CustomInfo{Names: r.strs(), Offsets: r.u32s(), Data: r.bytes()}
		if r.err != nil {
			return fmt.Errorf("CINF: %w", r.err)
		}
	}
	return nil
}

func (s *Save) parseGlobal(body []byte) error {
	r := &reader{data: body}
	s.CurrentLevel = r.str()
	if r.err != nil {
		return r.err
	}
	level, err := parseLevel(s.CurrentLevel, r.rest(), "GOBS")
	if err != nil {
		return err
	}
	s.Global = level
	return nil
}

func (s *Save) parseLevels(body []byte) error {
	cs, err := chunks(body)
	if err != nil {
		return err
	}
	for _, c := range cs {
		if c.tag != "LEVL" {
			continue
		}
		r := &reader{data: c.body}
		name := r.str()
		r.u32()
		r.u32()
		if r.err != nil {
			return fmt.Errorf("LEVL: %w", r.err)
		}
		level, err := parseLevel(name, r.rest(), "LATS")
		if err != nil {
			return fmt.Errorf("LEVL %s: %w", name, err)
		}
		s.Levels = append(s.Levels, level)
	}
	return nil
}

func parseLevel(name string, body []byte, objectList string) (Level, error) {
	level := Level{Name: name}
	cs, err := chunks(body)
	if err != nil {
		return level, err
	}
	for _, c := range cs {
		if c.tag != "META" {
			continue
		}
		if level.Meta, err = parseMeta(c.body); err != nil {
			return level, fmt.Errorf("META: %w", err)
		}
	}
	for _, c := range cs {
		if c.tag != objectList {
			continue
		}
		objects, err := chunks(c.body)
		if err != nil {
			return level, fmt.Errorf("%s: %w", objectList, err)
		}
		for _, o := range objects {
			if o.tag != "NOBJ" {
				continue
			}
			object, err := parseObject(o.body, &level.Meta)
			if err != nil {
				return level, fmt.Errorf("NOBJ: %w", err)
			}
			level.Objects = append(level.Objects, object)
		}
	}
	return level, nil
}

type rawDef struct {
	id     uint32
	prefix uint32
	kind   uint16
}

func parseMeta(body []byte) (Meta, error) {
	meta := Meta{Defs: map[string][]PropDef{}}
	cs, err := chunks(body)
	if err != nil {
		return meta, err
	}
	raw := map[string][]rawDef{}
	for _, c := range cs {
		r := &reader{data: c.body}
		switch c.tag {
		case "VERS":
			meta.Version = r.u32()
		case "CNIX":
			meta.Classes = r.strs()
		case "PNIX":
			meta.Names = r.strs()
		case "CLST":
			if err := parseClasses(c.body, raw); err != nil {
				return meta, fmt.Errorf("CLST: %w", err)
			}
		}
		if r.err != nil {
			return meta, fmt.Errorf("%s: %w", c.tag, r.err)
		}
	}
	for class, defs := range raw {
		resolved := make([]PropDef, 0, len(defs))
		for _, d := range defs {
			name, err := meta.name(d.id)
			if err != nil {
				return meta, fmt.Errorf("class %s: %w", class, err)
			}
			prefix := ""
			if d.prefix != noIndex {
				if prefix, err = meta.name(d.prefix); err != nil {
					return meta, fmt.Errorf("class %s: %w", class, err)
				}
			}
			resolved = append(resolved, PropDef{Name: name, Prefix: prefix, Type: d.kind})
		}
		meta.Defs[class] = resolved
	}
	return meta, nil
}

func (m *Meta) name(id uint32) (string, error) {
	if int(id) >= len(m.Names) {
		return "", fmt.Errorf("property name %d is not in the index of %d", id, len(m.Names))
	}
	return m.Names[id], nil
}

func parseClasses(body []byte, out map[string][]rawDef) error {
	cs, err := chunks(body)
	if err != nil {
		return err
	}
	for _, c := range cs {
		def := c
		if c.tag == "CDVE" {
			if len(c.body) < 1 {
				return errors.New("empty CDVE")
			}
			inner, err := chunks(c.body[1:])
			if err != nil {
				return fmt.Errorf("CDVE: %w", err)
			}
			found := false
			for _, i := range inner {
				if i.tag == "CDEF" {
					def, found = i, true
				}
			}
			if !found {
				continue
			}
		} else if c.tag != "CDEF" {
			continue
		}
		r := &reader{data: def.body}
		name := r.str()
		n := int(r.u16())
		defs := make([]rawDef, 0, n)
		for i := 0; i < n && r.err == nil; i++ {
			defs = append(defs, rawDef{id: r.u32(), prefix: r.u32(), kind: r.u16()})
		}
		if r.err != nil {
			return fmt.Errorf("CDEF: %w", r.err)
		}
		out[name] = defs
	}
	return nil
}

func parseObject(body []byte, meta *Meta) (Object, error) {
	r := &reader{data: body}
	classID := r.u32()
	name := r.str()
	r.u32s()
	r.u32()
	r.u32()
	if r.err != nil {
		return Object{}, r.err
	}
	if int(classID) >= len(meta.Classes) {
		return Object{}, fmt.Errorf("class %d is not in the index of %d", classID, len(meta.Classes))
	}
	object := Object{Class: meta.Classes[classID], Name: name}
	object.defs = meta.Defs[object.Class]
	cs, err := chunks(r.rest())
	if err != nil {
		return Object{}, fmt.Errorf("%s: %w", name, err)
	}
	for _, c := range cs {
		r := &reader{data: c.body}
		switch c.tag {
		case "PROP":
			object.offsets = r.u32s()
			object.data = r.bytes()
		case "CUST":
			object.Custom = r.bytes()
		}
		if r.err != nil {
			return Object{}, fmt.Errorf("%s %s: %w", name, c.tag, r.err)
		}
	}
	return object, nil
}

func (c CustomInfo) Raw(name string) ([]byte, bool) {
	for i, n := range c.Names {
		if n != name || i >= len(c.Offsets) {
			continue
		}
		start, end := int(c.Offsets[i]), len(c.Data)
		if i+1 < len(c.Offsets) {
			end = int(c.Offsets[i+1])
		}
		if start > end || end > len(c.Data) {
			return nil, false
		}
		return c.Data[start:end], true
	}
	return nil, false
}

func (c CustomInfo) String(name string) (string, bool) {
	raw, ok := c.Raw(name)
	if !ok {
		return "", false
	}
	r := &reader{data: raw}
	s := r.str()
	return s, r.done()
}

func (c CustomInfo) Int32(name string) (int32, bool) {
	raw, ok := c.Raw(name)
	if !ok || len(raw) != 4 {
		return 0, false
	}
	return int32(binary.LittleEndian.Uint32(raw)), true
}

func (c CustomInfo) Int64(name string) (int64, bool) {
	raw, ok := c.Raw(name)
	if !ok || len(raw) != 8 {
		return 0, false
	}
	return int64(binary.LittleEndian.Uint64(raw)), true
}

func (c CustomInfo) Bool(name string) (bool, bool) {
	raw, ok := c.Raw(name)
	if !ok || len(raw) != 1 {
		return false, false
	}
	return raw[0] != 0, true
}

func (o *Object) Property(name string) (Value, bool) {
	for i, d := range o.defs {
		if d.Prefix != "" || d.Name != name || i >= len(o.offsets) {
			continue
		}
		start, end := int(o.offsets[i]), len(o.data)
		if i+1 < len(o.offsets) {
			end = int(o.offsets[i+1])
		}
		if start > end || end > len(o.data) {
			return Value{}, false
		}
		return Value{Type: d.Type, Data: o.data[start:end]}, true
	}
	return Value{}, false
}

func (v Value) String() (string, error) {
	if v.Type != TypeString && v.Type != TypeName {
		return "", fmt.Errorf("type %d is not a string", v.Type)
	}
	r := &reader{data: v.Data}
	s := r.str()
	if r.err != nil {
		return "", r.err
	}
	if !r.done() {
		return "", fmt.Errorf("%d bytes follow the string", len(v.Data)-r.pos)
	}
	return s, nil
}

func (v Value) Float32() (float32, error) {
	if v.Type != TypeFloat || len(v.Data) != 4 {
		return 0, fmt.Errorf("type %d with %d bytes is not a float", v.Type, len(v.Data))
	}
	r := &reader{data: v.Data}
	return r.f32(), nil
}

func (v Value) Record() ([]Entry, error) {
	if v.Type != TypeRecord {
		return nil, fmt.Errorf("type %d is not a record", v.Type)
	}
	return ParseRecord(v.Data)
}
