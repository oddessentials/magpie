package dragonwilds

import (
	"regexp"
	"strings"
)

var (
	passwordOption = regexp.MustCompile(`\?p=[^?\s]*`)
	worldPassword  = regexp.MustCompile(`(WorldPassword: ).*$`)
	passwordField  = regexp.MustCompile(`(Password\[)[^\]]*(\])`)
	joinCodeField  = regexp.MustCompile(`(\["JoinCode"\] written with key\[[a-z]+\] value\[)[^\]]*(\])`)
	joinCodeShape  = regexp.MustCompile(`\b[A-Z0-9]{4}-[A-Z0-9]{4}\b`)
	hexID          = regexp.MustCompile(`\b[0-9a-fA-F]{32}\b`)
	ipv4Address    = regexp.MustCompile(`\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?\b`)
	ipv6Address    = regexp.MustCompile(`\[[0-9a-fA-F]*:[0-9a-fA-F:.]+\](?::\d{1,5})?`)
)

func Secrets(text string) string {
	text = passwordOption.ReplaceAllString(text, "?p=[password]")
	text = worldPassword.ReplaceAllString(text, "${1}[password]")
	text = passwordField.ReplaceAllString(text, "${1}[password]${2}")
	text = joinCodeField.ReplaceAllString(text, "${1}[join code]${2}")
	return joinCodeShape.ReplaceAllString(text, "[join code]")
}

func Addresses(text string) string {
	text = ipv4Address.ReplaceAllString(text, "[address]")
	return ipv6Address.ReplaceAllString(text, "[address]")
}

func Identifiers(text string) string {
	return hexID.ReplaceAllString(text, "[id]")
}

func Line(text string) string {
	return strings.TrimSpace(Identifiers(Addresses(Secrets(text))))
}
