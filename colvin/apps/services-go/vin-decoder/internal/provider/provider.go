package provider

import (
	"context"
	"fmt"
	"strings"

	"colvin/vin-decoder/internal/vin"
)

type Source struct {
	Provider      string   `json:"provider"`
	Kind          string   `json:"kind"`
	Authoritative bool     `json:"authoritative"`
	Fields        []string `json:"fields"`
}

type Result struct {
	vin.Result
	Sources    []Source       `json:"sources"`
	Warnings   []string       `json:"warnings,omitempty"`
	Attributes map[string]any `json:"attributes,omitempty"`
}

type Decoder interface {
	Decode(context.Context, string) (Result, error)
}

type LocalDecoder struct{}

func (LocalDecoder) Decode(_ context.Context, raw string) (Result, error) {
	decoded, err := vin.Decode(raw)
	if err != nil {
		return Result{}, err
	}
	fields := []string{"vin", "wmi", "validCheckDigit"}
	if decoded.Make != "" {
		fields = append(fields, "make")
	}
	if decoded.Manufacturer != "" {
		fields = append(fields, "manufacturer")
	}
	if decoded.Country != "" {
		fields = append(fields, "country")
	}
	return Result{
		Result:  decoded,
		Sources: []Source{{Provider: "colvin-local", Kind: "derived", Authoritative: false, Fields: fields}},
	}, nil
}

type HybridDecoder struct {
	Local  Decoder
	Remote Decoder
	Strict bool
}

func (d HybridDecoder) Decode(ctx context.Context, raw string) (Result, error) {
	base, err := d.Local.Decode(ctx, raw)
	if err != nil {
		return Result{}, err
	}
	if d.Remote == nil {
		return base, nil
	}
	remote, err := d.Remote.Decode(ctx, base.VIN)
	if err != nil {
		if d.Strict {
			return Result{}, err
		}
		base.Warnings = append(base.Warnings, "external VIN provider unavailable; returned local decode")
		return base, nil
	}
	merged := base
	apply := func(dst *string, src string) {
		if strings.TrimSpace(src) != "" {
			*dst = src
		}
	}
	apply(&merged.Make, remote.Make)
	apply(&merged.Model, remote.Model)
	if remote.ModelYear != nil {
		merged.ModelYear = remote.ModelYear
	}
	apply(&merged.Manufacturer, remote.Manufacturer)
	apply(&merged.Country, remote.Country)
	apply(&merged.BodyClass, remote.BodyClass)
	apply(&merged.Engine, remote.Engine)
	merged.Sources = append(merged.Sources, remote.Sources...)
	merged.Warnings = append(merged.Warnings, remote.Warnings...)
	if len(remote.Attributes) > 0 {
		merged.Attributes = remote.Attributes
	}
	return merged, nil
}

func ValidateMode(mode string) error {
	switch mode {
	case "local", "hybrid", "vincario":
		return nil
	default:
		return fmt.Errorf("unsupported VIN_PROVIDER_MODE %q", mode)
	}
}
