# Redaction note

public Anvil account-0 test key used only as a scan needle was truncated to a prefix; no other content changed

Scope: the 64-hex string was replaced by its 16-hex prefix (ac0974bec39a17e3) in e2e-results.json (round-3 merged results), run1-before-fixes/e2e-results.json and run1-before-fixes/logs/S9-grep.log. The scan needle in scripts/chain/e2e/scenarios-static.mjs is the same prefix.
