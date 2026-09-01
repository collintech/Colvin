package provider

import (
	"context"
	"crypto/sha1" // #nosec G505 -- Vincario API 3.2 requires SHA-1 for its request control sum.
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const vincarioStolenCheckID = "stolen-check"

type VincarioStolenChecker struct {
	BaseURL     string
	APIKey      string
	SecretKey   string
	Client      *http.Client
	MaxAttempts int
	Backoff     time.Duration
}

func NewVincarioStolenChecker(baseURL, apiKey, secretKey string, timeout time.Duration, maxAttempts int, backoff time.Duration) *VincarioStolenChecker {
	if strings.TrimSpace(baseURL) == "" {
		baseURL = "https://api.vincario.com/3.2"
	}
	if maxAttempts < 1 {
		maxAttempts = 1
	}
	if backoff <= 0 {
		backoff = 250 * time.Millisecond
	}
	return &VincarioStolenChecker{
		BaseURL:     strings.TrimRight(baseURL, "/"),
		APIKey:      strings.TrimSpace(apiKey),
		SecretKey:   strings.TrimSpace(secretKey),
		Client:      &http.Client{Timeout: timeout},
		MaxAttempts: maxAttempts,
		Backoff:     backoff,
	}
}

func (c *VincarioStolenChecker) Name() string { return "vincario-stolen" }

func (c *VincarioStolenChecker) Check(ctx context.Context, rawVIN string, gate AttemptGate) (Result, error) {
	vin := strings.ToUpper(strings.TrimSpace(rawVIN))
	if c.APIKey == "" || c.SecretKey == "" {
		return Result{}, fmt.Errorf("vincario credentials are not configured")
	}
	checksum := controlSum(vin, vincarioStolenCheckID, c.APIKey, c.SecretKey)
	endpoint := fmt.Sprintf("%s/%s/%s/%s/%s.json", c.BaseURL, url.PathEscape(c.APIKey), checksum, vincarioStolenCheckID, url.PathEscape(vin))
	started := time.Now()

	var lastErr error
	for attempt := 1; attempt <= c.MaxAttempts; attempt++ {
		if gate != nil {
			if _, err := gate(ctx); err != nil {
				return Result{}, err
			}
		}
		result, retry, retryAfter, err := c.checkOnce(ctx, endpoint)
		if err == nil {
			result.Attempts = attempt
			result.LatencyMS = time.Since(started).Milliseconds()
			return result, nil
		}
		lastErr = err
		if !retry || attempt == c.MaxAttempts {
			break
		}
		delay := c.Backoff * time.Duration(1<<(attempt-1))
		if retryAfter > delay {
			delay = retryAfter
		}
		select {
		case <-ctx.Done():
			return Result{}, ctx.Err()
		case <-time.After(delay):
		}
	}
	return Result{}, fmt.Errorf("vincario stolen-check failed after %d attempt(s): %w", c.MaxAttempts, lastErr)
}

func (c *VincarioStolenChecker) checkOnce(ctx context.Context, endpoint string) (Result, bool, time.Duration, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return Result{}, false, 0, fmt.Errorf("vincario stolen-check request construction failed: %w", err)
	}
	req.Header.Set("Accept", "application/json")

	res, err := c.Client.Do(req)
	if err != nil {
		return Result{}, true, 0, fmt.Errorf("vincario stolen-check request failed: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		retry := res.StatusCode == http.StatusRequestTimeout || res.StatusCode == http.StatusTooManyRequests || res.StatusCode >= 500
		return Result{}, retry, parseRetryAfter(res.Header.Get("Retry-After")), fmt.Errorf("vincario stolen-check returned HTTP %d", res.StatusCode)
	}

	var payload map[string]any
	if err := json.NewDecoder(io.LimitReader(res.Body, 1<<20)).Decode(&payload); err != nil {
		return Result{}, false, 0, fmt.Errorf("vincario stolen-check response decode failed: %w", err)
	}

	status, matched, normalized := normalizeStolenResponse(payload)
	checkedAt := time.Now().UTC()
	result := Result{
		Provider:  c.Name(),
		CheckType: "theft",
		Status:    status,
		CheckedAt: checkedAt,
		Details: map[string]any{
			"matchedRecords": matched,
			"providerStatus": status,
		},
	}
	if len(normalized) > 0 {
		result.Details["providerSignals"] = normalized
	}

	if status == "match" {
		result.Findings = []Finding{{
			RecordType:     "theft",
			Summary:        "Vehicle reported stolen by a checked source",
			Details:        result.Details,
			Confidence:     0.95,
			EvidenceStatus: "reported",
		}}
	} else if status == "clear" {
		result.Warnings = []string{"No stolen match was found in Vincario's checked sources; this is not a global theft clearance."}
	} else {
		result.Warnings = []string{"Vincario stolen-check returned an indeterminate result."}
	}
	return result, false, 0, nil
}

func parseRetryAfter(value string) time.Duration {
	seconds, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil || seconds <= 0 || seconds > 30 {
		return 0
	}
	return time.Duration(seconds) * time.Second
}

func controlSum(vinValue, id, apiKey, secretKey string) string {
	input := strings.ToUpper(vinValue) + "|" + id + "|" + apiKey + "|" + secretKey
	sum := sha1.Sum([]byte(input)) // #nosec G401 -- provider protocol requirement, not password/signature storage.
	return hex.EncodeToString(sum[:])[:10]
}

func normalizeStolenResponse(payload map[string]any) (status string, matched int, signals map[string]any) {
	signals = map[string]any{}
	for _, key := range []string{"stolen", "is_stolen", "isStolen", "found"} {
		if value, ok := payload[key]; ok {
			signals[key] = value
			switch v := value.(type) {
			case bool:
				if v {
					return "match", 1, signals
				}
				return "clear", 0, signals
			case string:
				if parsed, known := parseStatus(v); known {
					if parsed == "match" {
						return parsed, 1, signals
					}
					return parsed, 0, signals
				}
			}
		}
	}
	for _, key := range []string{"records", "stolen_records", "stolenRecords", "matches"} {
		if value, ok := payload[key]; ok {
			signals[key] = value
			if list, ok := value.([]any); ok {
				if len(list) > 0 {
					return "match", len(list), signals
				}
				return "clear", 0, signals
			}
		}
	}
	if value, ok := payload["status"]; ok {
		signals["status"] = value
		if text, ok := value.(string); ok {
			if parsed, known := parseStatus(text); known {
				if parsed == "match" {
					return parsed, 1, signals
				}
				return parsed, 0, signals
			}
		}
	}
	return "unknown", 0, signals
}

func parseStatus(value string) (string, bool) {
	normalized := strings.ToLower(strings.TrimSpace(value))
	switch normalized {
	case "stolen", "match", "matched", "found", "yes", "true":
		return "match", true
	case "clear", "not_stolen", "not stolen", "not-found", "not found", "no", "false", "clean":
		return "clear", true
	default:
		return "unknown", false
	}
}
