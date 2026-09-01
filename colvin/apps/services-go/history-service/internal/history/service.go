package history

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"colvin/history-service/internal/provider"
)

type reportRepository interface {
	Ping(context.Context) error
	ByVIN(context.Context, string) ([]Record, error)
	ProviderChecksByVIN(context.Context, string) ([]ProviderCheck, error)
	FreshProviderCheck(context.Context, string, string, string, time.Time, bool) (bool, error)
	SaveProviderResult(context.Context, string, []EvidenceInput, ProviderCheckInput) error
	ReserveProviderCall(context.Context, string, time.Time, int) (bool, int, error)
	ProviderRuntime(context.Context, string) (ProviderRuntime, error)
	RecordProviderSuccess(context.Context, string, time.Time) error
	RecordProviderFailure(context.Context, string, time.Time, int, time.Duration) (ProviderRuntime, error)
	ProviderUsageToday(context.Context, string, time.Time) (int, error)
}

type ProviderPolicy struct {
	DailyBudget             int
	CircuitFailureThreshold int
	CircuitOpenDuration     time.Duration
}

type Service struct {
	repo       reportRepository
	checker    provider.Checker
	mode       string
	refreshTTL time.Duration
	errorTTL   time.Duration
	policy     ProviderPolicy
	flights    flightGroup
}

type ProviderHealth struct {
	Provider            string  `json:"provider"`
	DailyUsed           int     `json:"dailyUsed"`
	DailyBudget         int     `json:"dailyBudget"`
	ConsecutiveFailures int     `json:"consecutiveFailures"`
	CircuitOpen         bool    `json:"circuitOpen"`
	CircuitOpenUntil    *string `json:"circuitOpenUntil"`
	LastSuccessAt       *string `json:"lastSuccessAt"`
	LastFailureAt       *string `json:"lastFailureAt"`
	TotalSuccesses      int64   `json:"totalSuccesses"`
	TotalFailures       int64   `json:"totalFailures"`
}

type EvidenceConflict struct {
	Field   string   `json:"field"`
	Status  string   `json:"status"`
	Sources []string `json:"sources"`
	Message string   `json:"message"`
}

type Summary struct {
	TotalRecords   int                `json:"totalRecords"`
	Counts         map[string]int     `json:"counts"`
	TheftStatus    string             `json:"theftStatus"`
	Warnings       []string           `json:"warnings"`
	ProviderChecks []ProviderCheck    `json:"providerChecks"`
	ProviderHealth []ProviderHealth   `json:"providerHealth"`
	Conflicts      []EvidenceConflict `json:"conflicts"`
}

type Report struct {
	Records []Record `json:"records"`
	Summary Summary  `json:"summary"`
}

func NewService(repo reportRepository, checker provider.Checker, mode string, refreshTTL, errorTTL time.Duration, policy ProviderPolicy) *Service {
	if policy.DailyBudget <= 0 {
		policy.DailyBudget = 100
	}
	if policy.CircuitFailureThreshold <= 0 {
		policy.CircuitFailureThreshold = 3
	}
	if policy.CircuitOpenDuration <= 0 {
		policy.CircuitOpenDuration = 5 * time.Minute
	}
	return &Service{repo: repo, checker: checker, mode: strings.ToLower(strings.TrimSpace(mode)), refreshTTL: refreshTTL, errorTTL: errorTTL, policy: policy}
}

func (s *Service) Ping(ctx context.Context) error { return s.repo.Ping(ctx) }

func (s *Service) Lookup(ctx context.Context, vin string) (Report, error) {
	warnings := []string{}
	if s.mode != "local" && s.checker != nil {
		fresh, err := s.repo.FreshProviderCheck(ctx, vin, s.checker.Name(), "theft", time.Now().UTC(), s.mode != "vincario")
		if err != nil {
			return Report{}, err
		}
		if !fresh {
			value, err := s.flights.Do(s.checker.Name()+"|"+vin, func() (any, error) {
				return s.refreshProvider(ctx, vin)
			})
			if err != nil {
				if s.mode == "vincario" {
					return Report{}, err
				}
				warnings = appendUnique(warnings, err.Error())
			} else if refreshWarnings, ok := value.([]string); ok {
				for _, warning := range refreshWarnings {
					warnings = appendUnique(warnings, warning)
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

	health := []ProviderHealth{}
	if s.mode != "local" && s.checker != nil {
		item, err := s.providerHealth(ctx, s.checker.Name(), time.Now().UTC())
		if err != nil {
			return Report{}, err
		}
		health = append(health, item)
	}
	return Report{Records: records, Summary: buildSummary(records, checks, warnings, health)}, nil
}

func (s *Service) refreshProvider(ctx context.Context, vin string) ([]string, error) {
	now := time.Now().UTC()
	fresh, err := s.repo.FreshProviderCheck(ctx, vin, s.checker.Name(), "theft", now, s.mode != "vincario")
	if err != nil {
		return nil, err
	}
	if fresh {
		return nil, nil
	}

	runtime, err := s.repo.ProviderRuntime(ctx, s.checker.Name())
	if err != nil {
		return nil, err
	}
	if isCircuitOpen(runtime, now) {
		warning := "Vehicle-history provider circuit is open after repeated failures; stored evidence is shown instead."
		s.saveOperationalDegradation(ctx, vin, now, warning, "circuit_open")
		return []string{warning}, fmt.Errorf("%s", warning)
	}

	used := 0
	gate := func(attemptCtx context.Context) (int, error) {
		allowed, current, reserveErr := s.repo.ReserveProviderCall(attemptCtx, s.checker.Name(), time.Now().UTC(), s.policy.DailyBudget)
		used = current
		if reserveErr != nil {
			return current, reserveErr
		}
		if !allowed {
			return current, provider.ErrBudgetExhausted
		}
		return current, nil
	}

	result, checkErr := s.checker.Check(ctx, vin, gate)
	if checkErr != nil {
		if errors.Is(checkErr, provider.ErrBudgetExhausted) {
			warning := "Vehicle-history provider daily request budget is exhausted; stored evidence is shown instead."
			s.saveOperationalDegradation(ctx, vin, now, warning, "budget_exhausted")
			return []string{warning}, fmt.Errorf("%s", warning)
		}
		_, stateErr := s.repo.RecordProviderFailure(ctx, s.checker.Name(), now, s.policy.CircuitFailureThreshold, s.policy.CircuitOpenDuration)
		if stateErr != nil {
			return nil, stateErr
		}
		warning := "Vehicle-history provider is temporarily unavailable; stored evidence is shown instead."
		details := map[string]any{"degraded": true, "reason": "provider_error", "dailyUsed": used}
		_ = s.repo.SaveProviderResult(ctx, vin, nil, ProviderCheckInput{
			Provider: s.checker.Name(), CheckType: "theft", Status: "error", CheckedAt: now,
			ValidUntil: now.Add(s.errorTTL), Warning: &warning, Details: details,
		})
		return []string{warning}, fmt.Errorf("%s", warning)
	}

	if err := s.repo.RecordProviderSuccess(ctx, result.Provider, result.CheckedAt); err != nil {
		return nil, err
	}

	evidence := make([]EvidenceInput, 0, len(result.Findings))
	for _, finding := range result.Findings {
		evidence = append(evidence, EvidenceInput{
			RecordType: finding.RecordType, OccurredAt: finding.OccurredAt, Jurisdiction: finding.Jurisdiction,
			Summary: finding.Summary, Details: finding.Details, SourceName: result.Provider,
			SourceReference: finding.SourceReference, Confidence: finding.Confidence, EvidenceStatus: finding.EvidenceStatus,
			ProviderEventID: finding.ProviderEventID, Fingerprint: evidenceFingerprint(vin, result.Provider, finding), CheckedAt: result.CheckedAt,
		})
	}
	warnings := append([]string{}, result.Warnings...)
	var warning *string
	if len(warnings) > 0 {
		joined := strings.Join(warnings, " ")
		warning = &joined
	}
	details := cloneMap(result.Details)
	details["attempts"] = result.Attempts
	details["latencyMs"] = result.LatencyMS
	details["dailyUsed"] = used
	details["dailyBudget"] = s.policy.DailyBudget
	if err := s.repo.SaveProviderResult(ctx, vin, evidence, ProviderCheckInput{
		Provider: result.Provider, CheckType: result.CheckType, Status: result.Status, CheckedAt: result.CheckedAt,
		ValidUntil: result.CheckedAt.Add(s.refreshTTL), Warning: warning, Details: details,
	}); err != nil {
		return nil, err
	}
	return warnings, nil
}

func (s *Service) saveOperationalDegradation(ctx context.Context, vin string, now time.Time, warning, reason string) {
	_ = s.repo.SaveProviderResult(ctx, vin, nil, ProviderCheckInput{
		Provider: s.checker.Name(), CheckType: "theft", Status: "error", CheckedAt: now,
		ValidUntil: now.Add(s.errorTTL), Warning: &warning, Details: map[string]any{"degraded": true, "reason": reason},
	})
}

func (s *Service) providerHealth(ctx context.Context, name string, now time.Time) (ProviderHealth, error) {
	runtime, err := s.repo.ProviderRuntime(ctx, name)
	if err != nil {
		return ProviderHealth{}, err
	}
	used, err := s.repo.ProviderUsageToday(ctx, name, now)
	if err != nil {
		return ProviderHealth{}, err
	}
	return ProviderHealth{
		Provider: name, DailyUsed: used, DailyBudget: s.policy.DailyBudget,
		ConsecutiveFailures: runtime.ConsecutiveFailures, CircuitOpen: isCircuitOpen(runtime, now),
		CircuitOpenUntil: runtime.CircuitOpenUntil, LastSuccessAt: runtime.LastSuccessAt,
		LastFailureAt: runtime.LastFailureAt, TotalSuccesses: runtime.TotalSuccesses, TotalFailures: runtime.TotalFailures,
	}, nil
}

func buildSummary(records []Record, checks []ProviderCheck, warnings []string, health []ProviderHealth) Summary {
	counts := map[string]int{}
	theftStatus := "unknown"
	reportedSources := []string{}
	clearSources := []string{}
	for _, record := range records {
		counts[record.RecordType]++
		if record.RecordType == "theft" && (record.EvidenceStatus == "reported" || record.EvidenceStatus == "confirmed") {
			theftStatus = "reported"
			reportedSources = appendUnique(reportedSources, record.SourceName)
		}
	}
	for _, check := range checks {
		if check.CheckType == "theft" && check.Status == "clear" {
			clearSources = appendUnique(clearSources, check.Provider)
			if theftStatus != "reported" {
				theftStatus = "clear_in_checked_sources"
			}
		}
	}
	conflicts := []EvidenceConflict{}
	if len(reportedSources) > 0 && len(clearSources) > 0 {
		sources := append([]string{}, reportedSources...)
		for _, source := range clearSources {
			sources = appendUnique(sources, source)
		}
		conflicts = append(conflicts, EvidenceConflict{
			Field: "theftStatus", Status: "conflicting_evidence", Sources: sources,
			Message: "At least one source reports theft evidence while another provider check is clear; reported evidence takes precedence pending review.",
		})
	}
	return Summary{TotalRecords: len(records), Counts: counts, TheftStatus: theftStatus, Warnings: warnings, ProviderChecks: checks, ProviderHealth: health, Conflicts: conflicts}
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

func cloneMap(input map[string]any) map[string]any {
	out := map[string]any{}
	for key, value := range input {
		out[key] = value
	}
	return out
}

func isCircuitOpen(runtime ProviderRuntime, now time.Time) bool {
	if runtime.CircuitOpenUntil == nil {
		return false
	}
	until, err := time.Parse(time.RFC3339, *runtime.CircuitOpenUntil)
	return err == nil && until.After(now)
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

type flightCall struct {
	done chan struct{}
	val  any
	err  error
}

type flightGroup struct {
	mu sync.Mutex
	m  map[string]*flightCall
}

func (g *flightGroup) Do(key string, fn func() (any, error)) (any, error) {
	g.mu.Lock()
	if g.m == nil {
		g.m = map[string]*flightCall{}
	}
	if existing, ok := g.m[key]; ok {
		g.mu.Unlock()
		<-existing.done
		return existing.val, existing.err
	}
	call := &flightCall{done: make(chan struct{})}
	g.m[key] = call
	g.mu.Unlock()

	call.val, call.err = fn()
	close(call.done)
	g.mu.Lock()
	delete(g.m, key)
	g.mu.Unlock()
	return call.val, call.err
}
