package history

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"colvin/history-service/internal/provider"
)

type reportRepository interface {
	Ping(context.Context) error
	ByVIN(context.Context, string) ([]Record, error)
	ProviderChecksByVIN(context.Context, string) ([]ProviderCheck, error)
	FreshProviderCheck(context.Context, string, string, string, time.Time) (bool, error)
	SaveProviderResult(context.Context, string, []EvidenceInput, ProviderCheckInput) error
}

type Service struct {
	repo       reportRepository
	checker    provider.Checker
	mode       string
	refreshTTL time.Duration
	errorTTL   time.Duration
}

type Summary struct {
	TotalRecords   int             `json:"totalRecords"`
	Counts         map[string]int  `json:"counts"`
	TheftStatus    string          `json:"theftStatus"`
	Warnings       []string        `json:"warnings"`
	ProviderChecks []ProviderCheck `json:"providerChecks"`
}

type Report struct {
	Records []Record `json:"records"`
	Summary Summary  `json:"summary"`
}

func NewService(repo reportRepository, checker provider.Checker, mode string, refreshTTL, errorTTL time.Duration) *Service {
	return &Service{repo: repo, checker: checker, mode: strings.ToLower(strings.TrimSpace(mode)), refreshTTL: refreshTTL, errorTTL: errorTTL}
}

func (s *Service) Ping(ctx context.Context) error { return s.repo.Ping(ctx) }

func (s *Service) Lookup(ctx context.Context, vin string) (Report, error) {
	warnings := []string{}
	if s.mode != "local" && s.checker != nil {
		fresh, err := s.repo.FreshProviderCheck(ctx, vin, s.checker.Name(), "theft", time.Now().UTC())
		if err != nil {
			return Report{}, err
		}
		if !fresh {
			result, checkErr := s.checker.Check(ctx, vin)
			if checkErr != nil {
				if s.mode == "vincario" {
					return Report{}, checkErr
				}
				warning := "Vehicle-history provider is temporarily unavailable; stored evidence is shown instead."
				warnings = append(warnings, warning)
				checkedAt := time.Now().UTC()
				_ = s.repo.SaveProviderResult(ctx, vin, nil, ProviderCheckInput{
					Provider: s.checker.Name(), CheckType: "theft", Status: "error", CheckedAt: checkedAt,
					ValidUntil: checkedAt.Add(s.errorTTL), Warning: &warning, Details: map[string]any{"degraded": true},
				})
			} else {
				evidence := make([]EvidenceInput, 0, len(result.Findings))
				for _, finding := range result.Findings {
					evidence = append(evidence, EvidenceInput{
						RecordType: finding.RecordType, OccurredAt: finding.OccurredAt, Jurisdiction: finding.Jurisdiction,
						Summary: finding.Summary, Details: finding.Details, SourceName: result.Provider,
						SourceReference: finding.SourceReference, Confidence: finding.Confidence, EvidenceStatus: finding.EvidenceStatus,
						ProviderEventID: finding.ProviderEventID, Fingerprint: evidenceFingerprint(vin, result.Provider, finding), CheckedAt: result.CheckedAt,
					})
				}
				var warning *string
				if len(result.Warnings) > 0 {
					joined := strings.Join(result.Warnings, " ")
					warning = &joined
					warnings = append(warnings, result.Warnings...)
				}
				if err := s.repo.SaveProviderResult(ctx, vin, evidence, ProviderCheckInput{
					Provider: result.Provider, CheckType: result.CheckType, Status: result.Status, CheckedAt: result.CheckedAt,
					ValidUntil: result.CheckedAt.Add(s.refreshTTL), Warning: warning, Details: result.Details,
				}); err != nil {
					return Report{}, err
				}
			}
		}
	}

	records, err := s.repo.ByVIN(ctx, vin)
	if err != nil {
		return Report{}, err
	}
	checks, err := s.repo.ProviderChecksByVIN(ctx, vin)
	if err != nil {
		return Report{}, err
	}
	for _, check := range checks {
		if check.Warning != nil && *check.Warning != "" {
			warnings = appendUnique(warnings, *check.Warning)
		}
	}
	return Report{Records: records, Summary: buildSummary(records, checks, warnings)}, nil
}

func buildSummary(records []Record, checks []ProviderCheck, warnings []string) Summary {
	counts := map[string]int{}
	theftStatus := "unknown"
	for _, record := range records {
		counts[record.RecordType]++
		if record.RecordType == "theft" && (record.EvidenceStatus == "reported" || record.EvidenceStatus == "confirmed") {
			theftStatus = "reported"
		}
	}
	if theftStatus != "reported" {
		for _, check := range checks {
			if check.CheckType == "theft" && check.Status == "clear" {
				theftStatus = "clear_in_checked_sources"
				break
			}
		}
	}
	return Summary{TotalRecords: len(records), Counts: counts, TheftStatus: theftStatus, Warnings: warnings, ProviderChecks: checks}
}

func evidenceFingerprint(vinValue, providerName string, finding provider.Finding) string {
	payload, _ := json.Marshal(map[string]any{"vin": vinValue, "provider": providerName, "type": finding.RecordType, "occurredAt": finding.OccurredAt, "jurisdiction": finding.Jurisdiction, "providerEventId": finding.ProviderEventID, "summary": finding.Summary, "details": finding.Details})
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])
}

func appendUnique(values []string, value string) []string {
	for _, existing := range values {
		if existing == value {
			return values
		}
	}
	return append(values, value)
}

func ParseMode(value string) (string, error) {
	mode := strings.ToLower(strings.TrimSpace(value))
	if mode == "" {
		mode = "local"
	}
	switch mode {
	case "local", "hybrid", "vincario":
		return mode, nil
	default:
		return "", fmt.Errorf("unsupported HISTORY_PROVIDER_MODE %q", value)
	}
}
