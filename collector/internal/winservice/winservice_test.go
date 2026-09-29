package winservice

import "testing"

func TestOutsideTheServiceManagerTheCollectorIsNoService(t *testing.T) {
	if IsService() {
		t.Fatal("a test process reported itself as a Windows service")
	}
	if DisplayName("") != "Magpie collector" || DisplayName("Isles") != "Magpie collector (Isles)" {
		t.Fatalf("display names %q %q", DisplayName(""), DisplayName("Isles"))
	}
}
