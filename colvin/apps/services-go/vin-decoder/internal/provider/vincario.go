package provider

import (
	"context"
	"crypto/sha1" // #nosec G505 -- Vincario API 3.2 requires SHA-1 for its 10-char control sum.
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"colvin/vin-decoder/internal/vin"
)

const vincarioDecodeID = "decode"

type VincarioDecoder struct {
	BaseURL   string
	APIKey    string
	SecretKey string
	Client    *http.Client
}

type vincarioField struct {
	Label string `json:"label"`
	Value any    `json:"value"`
}

type vincarioResponse struct {
	Decode  []vincarioField `json:"decode"`
	Success *bool           `json:"success,omitempty"`
	Error   any             `json:"error,omitempty"`
}

func NewVincarioDecoder(baseURL, apiKey, secretKey string, timeout time.Duration) *VincarioDecoder {
	if strings.TrimSpace(baseURL) == "" {
		baseURL = "https://api.vincario.com/3.2"
	}
	return &VincarioDecoder{
		BaseURL:   strings.TrimRight(baseURL, "/"),
		APIKey:    strings.TrimSpace(apiKey),
		SecretKey: strings.TrimSpace(secretKey),
		Client:    &http.Client{Timeout: timeout},
	}
}

func (d *VincarioDecoder) Decode(ctx context.Context, raw string) (Result, error) {
	local, err := vin.Decode(raw)
	if err != nil {
		return Result{}, err
	}
	if d.APIKey == "" || d.SecretKey == "" {
		return Result{}, fmt.Errorf("vincario credentials are not configured")
	}

	checksum := vincarioControlSum(local.VIN, vincarioDecodeID, d.APIKey, d.SecretKey)
	endpoint := fmt.Sprintf("%s/%s/%s/%s/%s.json",
		d.BaseURL,
		url.PathEscape(d.APIKey),
		checksum,
		vincarioDecodeID,
		url.PathEscape(local.VIN),
	)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return Result{}, fmt.Errorf("vincario request construction failed: %w", err)
	}
	req.Header.Set("Accept", "application/json")

	res, err := d.Client.Do(req)
	if err != nil {
		return Result{}, fmt.Errorf("vincario request failed: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return Result{}, fmt.Errorf("vincario returned HTTP %d", res.StatusCode)
	}

	var payload vincarioResponse
	decoder := json.NewDecoder(io.LimitReader(res.Body, 2<<20))
	if err := decoder.Decode(&payload); err != nil {
		return Result{}, fmt.Errorf("vincario response decode failed: %w", err)
	}
	if payload.Success != nil && !*payload.Success {
		return Result{}, fmt.Errorf("vincario rejected the VIN decode request")
	}
	if len(payload.Decode) == 0 {
		return Result{}, fmt.Errorf("vincario returned no decode fields")
	}

	values := make(map[string]string, len(payload.Decode))
	attributes := make(map[string]any)
	for _, item := range payload.Decode {
		label := strings.TrimSpace(item.Label)
		if label == "" || item.Value == nil {
			continue
		}
		value := strings.TrimSpace(fmt.Sprint(item.Value))
		if value == "" || value == "<nil>" {
			continue
		}
		values[label] = value
	}

	out := Result{Result: local, Attributes: attributes}
	fields := []string{}
	set := func(field, label string, dst *string) {
		if value := values[label]; value != "" {
			*dst = value
			fields = append(fields, field)
		}
	}
	set("make", "Make", &out.Make)
	set("model", "Model", &out.Model)
	set("manufacturer", "Manufacturer", &out.Manufacturer)
	set("country", "Plant Country", &out.Country)
	set("bodyClass", "Body", &out.BodyClass)
	if year := values["Model Year"]; year != "" {
		if parsed, parseErr := strconv.Atoi(year); parseErr == nil {
			out.ModelYear = &parsed
			fields = append(fields, "modelYear")
		}
	}

	engineParts := nonEmpty(values["Engine Manufacturer"], values["Engine Type"], values["Fuel Type - Primary"])
	if len(engineParts) > 0 {
		out.Engine = strings.Join(engineParts, " · ")
		fields = append(fields, "engine")
	}

	copyAttribute(attributes, "vehicleId", values["Vehicle ID"])
	copyAttribute(attributes, "productType", values["Product Type"])
	copyAttribute(attributes, "series", values["Series"])
	copyAttribute(attributes, "drive", values["Drive"])
	copyAttribute(attributes, "fuelTypePrimary", values["Fuel Type - Primary"])
	copyAttribute(attributes, "numberOfGears", values["Number of Gears"])
	copyAttribute(attributes, "emissionStandard", values["Emission Standard"])
	copyAttribute(attributes, "numberOfDoors", values["Number of Doors"])
	copyAttribute(attributes, "numberOfSeats", values["Number of Seats"])
	copyAttribute(attributes, "numberOfWheels", values["Number Wheels"])
	copyAttribute(attributes, "numberOfAxles", values["Number of Axles"])
	copyAttribute(attributes, "wheelbaseMm", values["Wheelbase (mm)"])
	copyAttribute(attributes, "heightMm", values["Height (mm)"])
	copyAttribute(attributes, "lengthMm", values["Length (mm)"])
	copyAttribute(attributes, "widthMm", values["Width (mm)"])
	copyAttribute(attributes, "weightEmptyKg", values["Weight Empty (kg)"])
	copyAttribute(attributes, "maxWeightKg", values["Max Weight (kg)"])
	copyAttribute(attributes, "maxSpeedKmh", values["Max Speed (km/h)"])
	copyAttribute(attributes, "averageCO2Gkm", values["Average CO2 Emission (g/km)"])
	copyAttribute(attributes, "version", values["Version"])
	copyAttribute(attributes, "variant", values["Variant"])

	out.Sources = []Source{{
		Provider:      "vincario",
		Kind:          "commercial-enriched",
		Authoritative: false,
		Fields:        fields,
	}}
	if len(attributes) == 0 {
		out.Attributes = nil
	}
	return out, nil
}

func vincarioControlSum(vinValue, id, apiKey, secretKey string) string {
	input := strings.ToUpper(vinValue) + "|" + id + "|" + apiKey + "|" + secretKey
	sum := sha1.Sum([]byte(input)) // #nosec G401 -- protocol-required request control sum, not security storage.
	return hex.EncodeToString(sum[:])[:10]
}

func nonEmpty(values ...string) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		if value = strings.TrimSpace(value); value != "" {
			out = append(out, value)
		}
	}
	return out
}

func copyAttribute(dst map[string]any, key, value string) {
	if value = strings.TrimSpace(value); value != "" {
		dst[key] = value
	}
}
