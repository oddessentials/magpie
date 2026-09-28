package spud

import (
	"errors"
	"fmt"
)

const (
	flagArrayIndex = 0x01
	flagGUID       = 0x02
	flagExtensions = 0x04
	flagNative     = 0x08
	flagBoolTrue   = 0x10
)

type PropType struct {
	Name   string
	Params []PropType
}

type Tag struct {
	Name  string
	Type  PropType
	Flags uint8
	Value []byte
}

type Entry []Tag

func ParseRecord(data []byte) ([]Entry, error) {
	r := &reader{data: data}
	n := r.count()
	entries := make([]Entry, 0, min(n, 1024))
	for i := 0; i < n; i++ {
		entry, err := parseEntry(r)
		if err != nil {
			return nil, fmt.Errorf("entry %d: %w", i, err)
		}
		entries = append(entries, entry)
	}
	if r.err != nil {
		return nil, r.err
	}
	return entries, nil
}

func parseEntry(r *reader) (Entry, error) {
	var entry Entry
	for {
		name := r.str()
		if r.err != nil {
			return nil, r.err
		}
		if name == "None" {
			return entry, nil
		}
		tag := Tag{Name: name}
		var err error
		if tag.Type, err = parseTypeName(r, 0); err != nil {
			return nil, fmt.Errorf("%s: %w", name, err)
		}
		size := int(r.u32())
		tag.Flags = r.u8()
		if tag.Flags&flagArrayIndex != 0 {
			r.u32()
		}
		if tag.Flags&flagGUID != 0 {
			r.take(16)
		}
		if r.err == nil && tag.Flags&flagExtensions != 0 {
			return nil, fmt.Errorf("%s carries property extensions", name)
		}
		tag.Value = r.take(size)
		if r.err != nil {
			return nil, fmt.Errorf("%s: %w", name, r.err)
		}
		entry = append(entry, tag)
	}
}

func parseTypeName(r *reader, depth int) (PropType, error) {
	if depth > 8 {
		return PropType{}, errors.New("type name nests too deeply")
	}
	t := PropType{Name: r.str()}
	n := r.i32()
	if r.err != nil {
		return t, r.err
	}
	if n < 0 || n > 16 {
		return t, fmt.Errorf("type %s has %d parameters", t.Name, n)
	}
	for i := 0; i < int(n); i++ {
		p, err := parseTypeName(r, depth+1)
		if err != nil {
			return t, err
		}
		t.Params = append(t.Params, p)
	}
	return t, nil
}

func (e Entry) Find(name string) (Tag, bool) {
	for _, t := range e {
		if t.Name == name {
			return t, true
		}
	}
	return Tag{}, false
}

func (e Entry) String(name string) (string, error) {
	t, ok := e.Find(name)
	if !ok {
		return "", fmt.Errorf("no %s", name)
	}
	return t.String()
}

func (e Entry) Float(name string) (float64, error) {
	t, ok := e.Find(name)
	if !ok {
		return 0, fmt.Errorf("no %s", name)
	}
	return t.Float()
}

func (e Entry) Struct(name string) (Entry, error) {
	t, ok := e.Find(name)
	if !ok {
		return nil, fmt.Errorf("no %s", name)
	}
	return t.Struct()
}

func (e Entry) Native(name string) ([]byte, string, error) {
	t, ok := e.Find(name)
	if !ok {
		return nil, "", fmt.Errorf("no %s", name)
	}
	return t.Native()
}

func (t Tag) String() (string, error) {
	if t.Type.Name != "StrProperty" && t.Type.Name != "NameProperty" {
		return "", fmt.Errorf("%s is a %s, not a string", t.Name, t.Type.Name)
	}
	r := &reader{data: t.Value}
	s := r.str()
	if r.err != nil {
		return "", fmt.Errorf("%s: %w", t.Name, r.err)
	}
	return s, nil
}

func (t Tag) Float() (float64, error) {
	r := &reader{data: t.Value}
	switch {
	case t.Type.Name == "FloatProperty" && len(t.Value) == 4:
		return float64(r.f32()), nil
	case t.Type.Name == "DoubleProperty" && len(t.Value) == 8:
		return r.f64(), nil
	}
	return 0, fmt.Errorf("%s is a %s of %d bytes, not a number", t.Name, t.Type.Name, len(t.Value))
}

func (t Tag) Bool() (bool, error) {
	if t.Type.Name != "BoolProperty" {
		return false, fmt.Errorf("%s is a %s, not a bool", t.Name, t.Type.Name)
	}
	return t.Flags&flagBoolTrue != 0, nil
}

func (t Tag) Struct() (Entry, error) {
	if t.Type.Name != "StructProperty" || t.Flags&flagNative != 0 {
		return nil, fmt.Errorf("%s is not a tagged struct", t.Name)
	}
	r := &reader{data: t.Value}
	entry, err := parseEntry(r)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", t.Name, err)
	}
	return entry, nil
}

func (t Tag) Native() ([]byte, string, error) {
	if t.Type.Name != "StructProperty" || t.Flags&flagNative == 0 || len(t.Type.Params) == 0 {
		return nil, "", fmt.Errorf("%s is not a natively serialized struct", t.Name)
	}
	return t.Value, t.Type.Params[0].Name, nil
}
