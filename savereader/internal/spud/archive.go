package spud

import "fmt"

type Archive struct{ reader }

func NewArchive(data []byte) *Archive    { return &Archive{reader{data: data}} }
func (a *Archive) Take(n int) []byte     { return a.take(n) }
func (a *Archive) Uint8() uint8          { return a.u8() }
func (a *Archive) Uint32() uint32        { return a.u32() }
func (a *Archive) Float32() float32      { return a.f32() }
func (a *Archive) Float64() float64      { return a.f64() }
func (a *Archive) String() string        { return a.str() }
func (a *Archive) Count() int            { return a.count() }
func (a *Archive) Remaining() int        { return len(a.data) - a.pos }
func (a *Archive) Error() error          { return a.err }
func (a *Archive) Entry() (Entry, error) { return parseEntry(&a.reader) }
func (a *Archive) Finish() error {
	if a.err != nil {
		return a.err
	}
	if !a.done() {
		return fmt.Errorf("%d unconsumed archive bytes", a.Remaining())
	}
	return nil
}
