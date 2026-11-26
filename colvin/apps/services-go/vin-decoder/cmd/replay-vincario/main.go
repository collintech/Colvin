package main

import (
	"encoding/json"
	"fmt"
	"os"

	"colvin/vin-decoder/internal/provider"
)

func main() {
	if len(os.Args) != 1 {
		fmt.Fprintln(os.Stderr, "Pass the saved JSON on standard input.")
		os.Exit(1)
	}
	result, err := provider.ReplayVincarioResponse(os.Stdin)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	summary := map[string]any{
		"make":                  result.Make,
		"model":                 result.Model,
		"modelYear":             result.ModelYear,
		"engineCode":            result.Attributes["engineCode"],
		"engineDisplacementCcm": result.Attributes["engineDisplacementCcm"],
		"trim":                  result.Attributes["trim"],
	}
	if err := json.NewEncoder(os.Stdout).Encode(summary); err != nil {
		os.Exit(1)
	}
}
