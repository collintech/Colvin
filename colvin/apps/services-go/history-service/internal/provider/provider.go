package provider

import (
	"context"
	"time"
)

type Finding struct {
	RecordType      string
	OccurredAt      *time.Time
	Jurisdiction    *string
	Summary         string
	Details         map[string]any
	SourceReference *string
	Confidence      float64
	EvidenceStatus  string
	ProviderEventID *string
}

type Result struct {
	Provider  string
	CheckType string
	Status    string
	CheckedAt time.Time
	Findings  []Finding
	Warnings  []string
	Details   map[string]any
}

type Checker interface {
	Name() string
	Check(context.Context, string) (Result, error)
}

type Disabled struct{}

func (Disabled) Name() string { return "disabled" }
func (Disabled) Check(_ context.Context, _ string) (Result, error) {
	return Result{Provider: "disabled", CheckType: "none", Status: "unknown", CheckedAt: time.Now().UTC()}, nil
}
