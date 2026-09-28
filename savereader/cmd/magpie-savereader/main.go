package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/oddessentials/magpie/savereader/internal/dragonwilds"
)

const format = 1

var version = "dev"

const usage = `magpie-savereader %s

Usage:
  magpie-savereader read <world save>
  magpie-savereader version

Reads a RuneScape: Dragonwilds world save (Saved/SaveGames/<world>.sav on the dedicated server) and
prints the world header, weather, world events and cached characters as JSON for the Magpie
collector. It only reads; it never changes a save.
`

type output struct {
	Format int `json:"format"`
	*dragonwilds.World
}

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}

func run(args []string, stdout, stderr io.Writer) int {
	if len(args) == 1 && args[0] == "version" {
		fmt.Fprintln(stdout, version)
		return 0
	}
	if len(args) != 2 || args[0] != "read" {
		fmt.Fprintf(stderr, usage, version)
		return 2
	}
	world, err := dragonwilds.ReadFile(args[1])
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	encoder := json.NewEncoder(stdout)
	if err := encoder.Encode(output{Format: format, World: world}); err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	return 0
}
