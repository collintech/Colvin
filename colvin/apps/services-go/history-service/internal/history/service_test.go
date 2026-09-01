package history

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"colvin/history-service/internal/provider"
)

type fakeReportRepo struct {
	mu           sync.Mutex
	fresh        bool
	freshErr     error
	records      []Record
	checks       []ProviderCheck
	saved        int
	savedCheck   ProviderCheckInput
	reserveAllow bool
	reserveUsed  int
	runtime      ProviderRuntime
	usage        int
	successes    int
	failures     int
}

func (f *fakeReportRepo) Ping(context.Context) error                      { return nil }
func (f *fakeReportRepo) ByVIN(context.Context, string) ([]Record, error) { return f.records, nil }
func (f *fakeReportRepo) ProviderChecksByVIN(context.Context, string) ([]ProviderCheck, error) {
	return f.checks, nil
}
func (f *fakeReportRepo) FreshProviderCheck(context.Context, string, string, string, time.Time, bool) (bool, error) {
	return f.fresh, f.freshErr
}
func (f *fakeReportRepo) SaveProviderResult(_ context.Context, _ string, _ []EvidenceInput, check ProviderCheckInput) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.saved++
	f.savedCheck = check
	return nil
}
func (f *fakeReportRepo) ReserveProviderCall(context.Context, string, time.Time, int) (bool, int, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if !f.reserveAllow {
		return false, f.reserveUsed, nil
	}
	f.reserveUsed++
	f.usage = f.reserveUsed
	return true, f.reserveUsed, nil
}
func (f *fakeReportRepo) ProviderRuntime(context.Context, string) (ProviderRuntime, error) {
	return f.runtime, nil
}
func (f *fakeReportRepo) RecordProviderSuccess(context.Context, string, time.Time) error {
	f.successes++
	return nil
}
func (f *fakeReportRepo) RecordProviderFailure(context.Context, string, time.Time, int, time.Duration) (ProviderRuntime, error) {
	f.failures++
	return f.runtime, nil
}
func (f *fakeReportRepo) ProviderUsageToday(context.Context, string, time.Time) (int, error) {
	return f.usage, nil
}

type fakeChecker struct {
	mu     sync.Mutex
	result provider.Result
	err    error
	calls  int
	delay  time.Duration
}

func (f *fakeChecker) Name() string { return "fake" }
func (f *fakeChecker) Check(ctx context.Context, _ string, gate provider.AttemptGate) (provider.Result, error) {
	if gate != nil {
		if _, err := gate(ctx); err != nil {
			return provider.Result{}, err
		}
	}
	if f.delay > 0 {
		time.Sleep(f.delay)
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	return f.result, f.err
}

func policy() ProviderPolicy {
	return ProviderPolicy{DailyBudget: 10, CircuitFailureThreshold: 3, CircuitOpenDuration: time.Minute}
}

func TestLookupSkipsProviderWhenFresh(t *testing.T) {
	repo := &fakeReportRepo{fresh: true, reserveAllow: true, records: []Record{}, checks: []ProviderCheck{{Provider: "fake", CheckType: "theft", Status: "clear"}}}
	checker := &fakeChecker{}
	report, err := NewService(repo, checker, "hybrid", 24*time.Hour, 15*time.Minute, policy()).Lookup(context.Background(), "1HGCM82633A004352")
	if err != nil {
		t.Fatal(err)
	}
	if checker.calls != 0 {
		t.Fatalf("expected no provider call, got %d", checker.calls)
	}
	if report.Summary.TheftStatus != "clear_in_checked_sources" {
		t.Fatalf("unexpected theft status %q", report.Summary.TheftStatus)
	}
}

func TestLookupPersistsProviderResult(t *testing.T) {
	now := time.Now().UTC()
	repo := &fakeReportRepo{reserveAllow: true}
	checker := &fakeChecker{result: provider.Result{Provider: "fake", CheckType: "theft", Status: "clear", CheckedAt: now, Warnings: []string{"limited coverage"}, Details: map[string]any{"ok": true}, Attempts: 1, LatencyMS: 10}}
	_, err := NewService(repo, checker, "hybrid", 24*time.Hour, 15*time.Minute, policy()).Lookup(context.Background(), "1HGCM82633A004352")
	if err != nil {
		t.Fatal(err)
	}
	if checker.calls != 1 || repo.saved != 1 || repo.successes != 1 {
		t.Fatalf("expected provider call/save/success, calls=%d saved=%d successes=%d", checker.calls, repo.saved, repo.successes)
	}
	if repo.savedCheck.Status != "clear" {
		t.Fatalf("unexpected saved status %q", repo.savedCheck.Status)
	}
}

func TestHybridProviderFailureDegrades(t *testing.T) {
	repo := &fakeReportRepo{reserveAllow: true}
	checker := &fakeChecker{err: errors.New("provider down")}
	report, err := NewService(repo, checker, "hybrid", 24*time.Hour, 15*time.Minute, policy()).Lookup(context.Background(), "1HGCM82633A004352")
	if err != nil {
		t.Fatal(err)
	}
	if repo.saved != 1 || repo.savedCheck.Status != "error" || repo.failures != 1 {
		t.Fatalf("expected degraded provider state, %#v", repo.savedCheck)
	}
	if len(report.Summary.Warnings) == 0 {
		t.Fatal("expected warning")
	}
}

func TestStrictProviderFailureFailsLookup(t *testing.T) {
	repo := &fakeReportRepo{reserveAllow: true}
	checker := &fakeChecker{err: errors.New("provider down")}
	_, err := NewService(repo, checker, "vincario", 24*time.Hour, 15*time.Minute, policy()).Lookup(context.Background(), "1HGCM82633A004352")
	if err == nil {
		t.Fatal("expected strict provider error")
	}
}

func TestDailyBudgetPreventsProviderCall(t *testing.T) {
	repo := &fakeReportRepo{reserveAllow: false, reserveUsed: 10}
	checker := &fakeChecker{}
	report, err := NewService(repo, checker, "hybrid", 24*time.Hour, 15*time.Minute, policy()).Lookup(context.Background(), "1HGCM82633A004352")
	if err != nil {
		t.Fatal(err)
	}
	if checker.calls != 0 {
		t.Fatalf("expected budget guard to prevent provider call, got %d", checker.calls)
	}
	if len(report.Summary.Warnings) == 0 {
		t.Fatal("expected budget warning")
	}
}

func TestOpenCircuitPreventsProviderCall(t *testing.T) {
	until := time.Now().UTC().Add(time.Minute).Format(time.RFC3339)
	repo := &fakeReportRepo{reserveAllow: true, runtime: ProviderRuntime{Provider: "fake", CircuitOpenUntil: &until, ConsecutiveFailures: 3}}
	checker := &fakeChecker{}
	report, err := NewService(repo, checker, "hybrid", 24*time.Hour, 15*time.Minute, policy()).Lookup(context.Background(), "1HGCM82633A004352")
	if err != nil {
		t.Fatal(err)
	}
	if checker.calls != 0 {
		t.Fatalf("expected circuit breaker to prevent provider call, got %d", checker.calls)
	}
	if len(report.Summary.Warnings) == 0 {
		t.Fatal("expected circuit warning")
	}
}

func TestConcurrentLookupsCoalesceProviderCall(t *testing.T) {
	now := time.Now().UTC()
	repo := &fakeReportRepo{reserveAllow: true}
	checker := &fakeChecker{delay: 50 * time.Millisecond, result: provider.Result{Provider: "fake", CheckType: "theft", Status: "clear", CheckedAt: now, Details: map[string]any{}}}
	service := NewService(repo, checker, "hybrid", 24*time.Hour, 15*time.Minute, policy())

	var wg sync.WaitGroup
	for i := 0; i < 5; i++ {
		_ = i
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, _ = service.Lookup(context.Background(), "1HGCM82633A004352")
		}()
	}
	wg.Wait()
	if checker.calls != 1 {
		t.Fatalf("expected one coalesced provider call, got %d", checker.calls)
	}
}

func TestSummaryFlagsConflictingTheftEvidence(t *testing.T) {
	records := []Record{{RecordType: "theft", EvidenceStatus: "reported", SourceName: "source-a"}}
	checks := []ProviderCheck{{Provider: "source-b", CheckType: "theft", Status: "clear"}}
	summary := buildSummary(records, checks, nil, nil)
	if summary.TheftStatus != "reported" {
		t.Fatalf("reported evidence should take precedence, got %q", summary.TheftStatus)
	}
	if len(summary.Conflicts) != 1 || summary.Conflicts[0].Field != "theftStatus" {
		t.Fatalf("expected theft conflict, got %#v", summary.Conflicts)
	}
}
