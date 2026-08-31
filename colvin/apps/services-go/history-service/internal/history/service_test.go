package history

import (
	"context"
	"errors"
	"testing"
	"time"

	"colvin/history-service/internal/provider"
)

type fakeReportRepo struct {
	fresh      bool
	freshErr   error
	records    []Record
	checks     []ProviderCheck
	saved      int
	savedCheck ProviderCheckInput
}

func (f *fakeReportRepo) Ping(context.Context) error                      { return nil }
func (f *fakeReportRepo) ByVIN(context.Context, string) ([]Record, error) { return f.records, nil }
func (f *fakeReportRepo) ProviderChecksByVIN(context.Context, string) ([]ProviderCheck, error) {
	return f.checks, nil
}
func (f *fakeReportRepo) FreshProviderCheck(context.Context, string, string, string, time.Time) (bool, error) {
	return f.fresh, f.freshErr
}
func (f *fakeReportRepo) SaveProviderResult(_ context.Context, _ string, _ []EvidenceInput, check ProviderCheckInput) error {
	f.saved++
	f.savedCheck = check
	return nil
}

type fakeChecker struct {
	result provider.Result
	err    error
	calls  int
}

func (f *fakeChecker) Name() string { return "fake" }
func (f *fakeChecker) Check(context.Context, string) (provider.Result, error) {
	f.calls++
	return f.result, f.err
}

func TestLookupSkipsProviderWhenFresh(t *testing.T) {
	repo := &fakeReportRepo{fresh: true, records: []Record{}, checks: []ProviderCheck{{Provider: "fake", CheckType: "theft", Status: "clear"}}}
	checker := &fakeChecker{}
	report, err := NewService(repo, checker, "hybrid", 24*time.Hour, 15*time.Minute).Lookup(context.Background(), "1HGCM82633A004352")
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
	repo := &fakeReportRepo{}
	checker := &fakeChecker{result: provider.Result{Provider: "fake", CheckType: "theft", Status: "clear", CheckedAt: now, Warnings: []string{"limited coverage"}, Details: map[string]any{"ok": true}}}
	_, err := NewService(repo, checker, "hybrid", 24*time.Hour, 15*time.Minute).Lookup(context.Background(), "1HGCM82633A004352")
	if err != nil {
		t.Fatal(err)
	}
	if checker.calls != 1 || repo.saved != 1 {
		t.Fatalf("expected provider call and save, calls=%d saved=%d", checker.calls, repo.saved)
	}
	if repo.savedCheck.Status != "clear" {
		t.Fatalf("unexpected saved status %q", repo.savedCheck.Status)
	}
}
func TestHybridProviderFailureDegrades(t *testing.T) {
	repo := &fakeReportRepo{}
	checker := &fakeChecker{err: errors.New("provider down")}
	report, err := NewService(repo, checker, "hybrid", 24*time.Hour, 15*time.Minute).Lookup(context.Background(), "1HGCM82633A004352")
	if err != nil {
		t.Fatal(err)
	}
	if repo.saved != 1 || repo.savedCheck.Status != "error" {
		t.Fatalf("expected degraded provider state, %#v", repo.savedCheck)
	}
	if len(report.Summary.Warnings) == 0 {
		t.Fatal("expected warning")
	}
}
func TestStrictProviderFailureFailsLookup(t *testing.T) {
	repo := &fakeReportRepo{}
	checker := &fakeChecker{err: errors.New("provider down")}
	_, err := NewService(repo, checker, "vincario", 24*time.Hour, 15*time.Minute).Lookup(context.Background(), "1HGCM82633A004352")
	if err == nil {
		t.Fatal("expected strict provider error")
	}
}
