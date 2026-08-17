package vin

import (
	"errors"
	"strings"
)

type Result struct {
	VIN             string `json:"vin"`
	Make            string `json:"make,omitempty"`
	Model           string `json:"model,omitempty"`
	ModelYear       *int   `json:"modelYear,omitempty"`
	Manufacturer    string `json:"manufacturer,omitempty"`
	Country         string `json:"country,omitempty"`
	BodyClass       string `json:"bodyClass,omitempty"`
	Engine          string `json:"engine,omitempty"`
	WMI             string `json:"wmi"`
	ValidCheckDigit bool   `json:"validCheckDigit"`
}

var transliteration = map[byte]int{'A': 1, 'B': 2, 'C': 3, 'D': 4, 'E': 5, 'F': 6, 'G': 7, 'H': 8, 'J': 1, 'K': 2, 'L': 3, 'M': 4, 'N': 5, 'P': 7, 'R': 9, 'S': 2, 'T': 3, 'U': 4, 'V': 5, 'W': 6, 'X': 7, 'Y': 8, 'Z': 9}
var weights = []int{8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2}
var manufacturers = map[string]struct{ make, manufacturer, country string }{"1HG": {"Honda", "Honda", "United States"}, "1FT": {"Ford", "Ford Motor Company", "United States"}, "1G1": {"Chevrolet", "General Motors", "United States"}, "JTD": {"Toyota", "Toyota Motor Corporation", "Japan"}, "JHM": {"Honda", "Honda", "Japan"}, "WVW": {"Volkswagen", "Volkswagen AG", "Germany"}, "WBA": {"BMW", "BMW AG", "Germany"}, "SAL": {"Land Rover", "Jaguar Land Rover", "United Kingdom"}, "KMH": {"Hyundai", "Hyundai Motor Company", "South Korea"}}

func Decode(raw string) (Result, error) {
	v := strings.ToUpper(strings.TrimSpace(raw))
	if len(v) != 17 {
		return Result{}, errors.New("VIN must contain exactly 17 characters")
	}
	for i := 0; i < len(v); i++ {
		c := v[i]
		if c == 'I' || c == 'O' || c == 'Q' || !((c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')) {
			return Result{}, errors.New("VIN contains invalid characters")
		}
	}
	meta := manufacturers[v[:3]]
	r := Result{VIN: v, WMI: v[:3], Make: meta.make, Manufacturer: meta.manufacturer, Country: meta.country, ValidCheckDigit: validCheckDigit(v)}
	return r, nil
}
func validCheckDigit(v string) bool {
	sum := 0
	for i := 0; i < 17; i++ {
		c := v[i]
		value := 0
		if c >= '0' && c <= '9' {
			value = int(c - '0')
		} else {
			value = transliteration[c]
		}
		sum += value * weights[i]
	}
	rem := sum % 11
	expected := byte('0' + rem)
	if rem == 10 {
		expected = 'X'
	}
	return v[8] == expected
}
