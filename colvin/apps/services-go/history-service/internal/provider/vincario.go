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
	"strings"
	"time"
)

const vincarioStolenCheckID = "stolen-check"

type VincarioStolenChecker struct {
	BaseURL   string
	APIKey    string
	SecretKey string
	Client    *http.Client
}

func NewVincarioStolenChecker(baseURL, apiKey, secretKey string, timeout time.Duration) *VincarioStolenChecker {
	if strings.TrimSpace(baseURL) == "" {
		baseURL = "https://api.vincario.com/3.2"
	}
	return &VincarioStolenChecker{
		BaseURL:   strings.TrimRight(baseURL, "/"),
		APIKey:    strings.TrimSpace(apiKey),
		SecretKey: strings.TrimSpace(secretKey),
		Client:    &http.Client{Timeout: timeout},
	}
}

func (c *VincarioStolenChecker) Name() string { return "vincario-stolen" }

func (c *VincarioStolenChecker) Check(ctx context.Context, rawVIN string) (Result, error) {
	vin := strings.ToUpper(strings.TrimSpace(rawVIN))
	if c.APIKey == "" || c.SecretKey == "" {
		return Result{}, fmt.Errorf("vincario credentials are not configured")
	}
	checksum := controlSum(vin, vincarioStolenCheckID, c.APIKey, c.SecretKey)
	endpoint := fmt.Sprintf("%s/%s/%s/%s/%s.json", c.BaseURL, url.PathEscape(c.APIKey), checksum, vincarioStolenCheckID, url.PathEscape(vin))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return Result{}, fmt.Errorf("vincario stolen-check request construction failed: %w", err)
	}
	req.Header.Set("Accept", "application/json")

	res, err := c.Client.Do(req)
	if err != nil {
		return Result{}, fmt.Errorf("vincario stolen-check request failed: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return Result{}, fmt.Errorf("vincario stolen-check returned HTTP %d", res.StatusCode)
	}

	var payload map[string]any
	if err := json.NewDecoder(io.LimitReader(res.Body, 1<<20)).Decode(&payload); err != nil {
		return Result{}, fmt.Errorf("vincario stolen-check response decode failed: %w", err)
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
	return result, nil
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
