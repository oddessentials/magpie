package config

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
)

const settingsSection = "/Script/Dominion.DedicatedServerSettings"

type ServerIni struct {
	Path             string
	ServerName       string
	DefaultWorldName string
	PlatformPolicy   string
	SaveFrequencyMin *int
}

func ConfigDirs(serverDir, platform string) []string {
	if platform == "" {
		platform = runtime.GOOS
	}
	platforms := []string{"WindowsServer", "LinuxServer"}
	if platform != "windows" {
		platforms = []string{"LinuxServer", "WindowsServer"}
	}
	var dirs []string
	for _, name := range platforms {
		dirs = append(dirs, filepath.Join(SavedDir(serverDir), "Config", name))
	}
	return dirs
}

func FindServerIni(serverDir, platform string) (*ServerIni, error) {
	var candidates []string
	for _, dir := range ConfigDirs(serverDir, platform) {
		candidates = append(candidates, filepath.Join(dir, "DedicatedServer.ini"))
	}
	for _, candidate := range candidates {
		ini, err := ReadServerIni(candidate)
		if err == nil {
			ini.SaveFrequencyMin = ReadSaveFrequency(filepath.Join(filepath.Dir(candidate), "Engine.ini"))
			return ini, nil
		}
		if !errors.Is(err, os.ErrNotExist) {
			return nil, err
		}
	}
	return nil, fmt.Errorf("no DedicatedServer.ini found (looked in %s); the server writes it on its first start", strings.Join(candidates, ", "))
}

func readSections(path string) (map[string]map[string]string, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	sections := map[string]map[string]string{}
	current := ""
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 64*1024), 4*1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(strings.TrimPrefix(scanner.Text(), string(rune(0xFEFF))))
		if line == "" || strings.HasPrefix(line, ";") || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
			current = strings.TrimSuffix(strings.TrimPrefix(line, "["), "]")
			if sections[current] == nil {
				sections[current] = map[string]string{}
			}
			continue
		}
		key, value, found := strings.Cut(line, "=")
		if !found {
			continue
		}
		if sections[current] == nil {
			sections[current] = map[string]string{}
		}
		sections[current][strings.TrimSpace(key)] = strings.TrimSpace(value)
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	return sections, nil
}

func ReadServerIni(path string) (*ServerIni, error) {
	sections, err := readSections(path)
	if err != nil {
		return nil, err
	}
	values := sections[settingsSection]
	if values == nil {
		return nil, fmt.Errorf("%s: no [%s] section", path, settingsSection)
	}
	return &ServerIni{
		Path:             path,
		ServerName:       values["ServerName"],
		DefaultWorldName: values["DefaultWorldName"],
		PlatformPolicy:   values["PlatformPolicy"],
	}, nil
}

func ReadSaveFrequency(path string) *int {
	sections, err := readSections(path)
	if err != nil {
		return nil
	}
	for _, section := range []string{"SystemSettings", "ConsoleVariables"} {
		if value, ok := sections[section]["dom.StateSaveFrequencyMins"]; ok {
			if minutes, err := strconv.Atoi(strings.TrimSpace(value)); err == nil && minutes >= 0 {
				return &minutes
			}
		}
	}
	return nil
}
