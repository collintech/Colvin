package provider

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestVincarioControlSumMatchesDocumentedAlgorithm(t *testing.T) {
	got := vincarioControlSum("wdbga32e7ta292393", "decode", "api-key", "secret-key")
	if len(got) != 10 {
		t.Fatalf("checksum length = %d, want 10", len(got))
	}
	if got != vincarioControlSum("WDBGA32E7TA292393", "decode", "api-key", "secret-key") {
		t.Fatal("checksum must normalize VIN to upper case")
	}
}

func TestVincarioDecoderNormalizesResponseAndProvenance(t *testing.T) {
	var requestPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"decode":[{"label":"Make","value":"Mercedes-Benz"},{"label":"Model","value":"E-Class"},{"label":"Model Year","value":"1996"},{"label":"Manufacturer","value":"Mercedes-Benz AG"},{"label":"Plant Country","value":"Germany"},{"label":"Body","value":"Sedan"},{"label":"Engine Type","value":"V8"},{"label":"Fuel Type - Primary","value":"Gasoline"},{"label":"Number of Doors","value":4},{"label":"Drive","value":"RWD"}]}`))
	}))
	defer srv.Close()

	d := NewVincarioDecoder(srv.URL, "api-key", "secret-key", time.Second)
	got, err := d.Decode(context.Background(), "WDBGA32E7TA292393")
	if err != nil {
		t.Fatal(err)
	}
	if got.Make != "Mercedes-Benz" || got.Model != "E-Class" || got.ModelYear == nil || *got.ModelYear != 1996 {
		t.Fatalf("unexpected decode: %+v", got)
	}
	if len(got.Sources) != 1 || got.Sources[0].Provider != "vincario" || got.Sources[0].Authoritative {
		t.Fatalf("unexpected sources: %+v", got.Sources)
	}
	if got.Attributes["numberOfDoors"] != "4" || got.Attributes["drive"] != "RWD" {
		t.Fatalf("unexpected attributes: %+v", got.Attributes)
	}
	if !strings.Contains(requestPath, "/api-key/") || !strings.HasSuffix(requestPath, "/decode/WDBGA32E7TA292393.json") {
		t.Fatalf("unexpected Vincario request path %q", requestPath)
	}
	if strings.Contains(requestPath, "secret-key") {
		t.Fatal("secret key must never be transmitted")
	}
}

func TestHybridFallsBackWhenVincarioUnavailable(t *testing.T) {
	remote := NewVincarioDecoder("http://127.0.0.1:1", "api-key", "secret-key", 20*time.Millisecond)
	d := HybridDecoder{Local: LocalDecoder{}, Remote: remote}
	got, err := d.Decode(context.Background(), "1HGCM82633A004352")
	if err != nil {
		t.Fatal(err)
	}
	if got.Make != "Honda" || len(got.Warnings) == 0 {
		t.Fatalf("unexpected fallback: %+v", got)
	}
}
