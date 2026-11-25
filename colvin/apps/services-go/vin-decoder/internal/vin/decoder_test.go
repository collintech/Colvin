package vin

import "testing"

func TestDecodeValidVIN(t *testing.T) {
	got, err := Decode("1HGCM82633A004352")
	if err != nil {
		t.Fatalf("Decode returned error: %v", err)
	}
	if got.VIN != "1HGCM82633A004352" {
		t.Fatalf("VIN = %q", got.VIN)
	}
	if got.Make != "Honda" {
		t.Fatalf("Make = %q, want Honda", got.Make)
	}
	if !got.ValidCheckDigit {
		t.Fatal("expected valid check digit")
	}
}

func TestDecodeNormalizesInput(t *testing.T) {
	got, err := Decode("  jhmcm56557c404453  ")
	if err != nil {
		t.Fatalf("Decode returned error: %v", err)
	}
	if got.VIN != "JHMCM56557C404453" {
		t.Fatalf("VIN = %q", got.VIN)
	}
}

func TestDecodeRejectsInvalidVINs(t *testing.T) {
	tests := []string{
		"SHORT",
		"1HGCM82633A00435I",
		"1HGCM82633A00435O",
		"1HGCM82633A00435Q",
	}
	for _, input := range tests {
		t.Run(input, func(t *testing.T) {
			if _, err := Decode(input); err == nil {
				t.Fatalf("Decode(%q) expected error", input)
			}
		})
	}
}

func TestUKToyotaPrefixReturnsOnlyManufacturerDetails(t *testing.T) {
	got, err := Decode("SB1AA00A00A000001")
	if err != nil {
		t.Fatal(err)
	}
	if got.Make != "Toyota" || got.Manufacturer != "Toyota Motor Manufacturing UK Ltd" || got.Country != "United Kingdom" {
		t.Fatalf("unexpected manufacturer details: %+v", got)
	}
	if got.Model != "" || got.ModelYear != nil || got.BodyClass != "" {
		t.Fatalf("prefix alone must not infer model details: %+v", got)
	}
}
