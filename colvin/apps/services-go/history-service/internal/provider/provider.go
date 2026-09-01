package provider

import (
	"context"
	"errors"
	"time"
)

var ErrBudgetExhausted = errors.New("provider daily request budget exhausted")

type AttemptGate func(context.Context) (int, error)

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
	Attempts  int
	LatencyMS int64
}

type Checker interface {
	Name() string
	Check(context.Context, string, AttemptGate) (Result, error)
}

type Disabled struct{}

func (Disabled) Name() string { return "disabled" }
func (Disabled) Check(_ context.Context, _ string, _ AttemptGate) (Result, error) {
	return Result{Provider: "disabled", CheckType: "none", Status: "unknown", CheckedAt: time.Now().UTC()}, nil
}
